
import { ObjectId } from "mongodb";

import {
  getDB,
  getMongoClient,
} from "../config/db.js";

import {
  validateCheckoutBooking,
} from "../models/booking.model.js";

import {
  buildCheckoutReservationDocument,
  RESERVATION_STATUSES,
} from "../models/checkoutReservation.model.js";

import {
  calculateRentalAmount,
} from "../utils/rentalPricing.js";

const ACTIVE_BOOKING_STATUSES = [
  "pending",
  "confirmed",
];

// A reservation being prepared has a short-lived hold.
// Checkout-open reservations require Stripe verification
// before they can be released.
const PREPARATION_HOLD_MINUTES = 10;

export class CheckoutReservationError extends Error {
  constructor(statusCode, message) {
    super(message);

    this.name = "CheckoutReservationError";
    this.statusCode = statusCode;
  }
}

const isValidObjectId = (value) => {
  const id = String(value ?? "");

  return (
    /^[a-fA-F0-9]{24}$/.test(id) &&
    ObjectId.isValid(id)
  );
};

// Create a temporary reservation without creating
// a final booking or charging the customer.
export const createCheckoutReservation = async ({
  customerId,
  bookingData,
}) => {
  const validation =
    validateCheckoutBooking(bookingData);

  if (!validation.valid) {
    throw new CheckoutReservationError(
      400,
      validation.message
    );
  }

  if (!isValidObjectId(customerId)) {
    throw new CheckoutReservationError(
      401,
      "Invalid authenticated customer"
    );
  }

  const db = getDB();
  const client = getMongoClient();

  const equipmentId = new ObjectId(
    bookingData.equipmentId
  );

  const customerObjectId = new ObjectId(
    customerId
  );

  const quantity = bookingData.quantity ?? 1;

  const {
    startDate,
    endDate,
    contactNumber,
    deliveryAddress,
    additionalNotes = "",
  } = bookingData;

  const session = client.startSession();

  try {
    const reservation =
      await session.withTransaction(
        async () => {
          // Step 1: Verify equipment.
          const equipment = await db
            .collection("equipment")
            .findOne(
              {
                _id: equipmentId,
                status: "approved",
                availability: true,
                deletedAt: {
                  $exists: false,
                },
              },
              { session }
            );

          if (!equipment) {
            throw new CheckoutReservationError(
              404,
              "Equipment not found or unavailable"
            );
          }

          if (
            !isValidObjectId(equipment.ownerId)
          ) {
            throw new CheckoutReservationError(
              500,
              "Equipment Owner information is invalid"
            );
          }

          const ownerId = new ObjectId(
            equipment.ownerId
          );

          if (ownerId.equals(customerObjectId)) {
            throw new CheckoutReservationError(
              403,
              "You cannot rent your own equipment"
            );
          }

          const availableQuantity =
            equipment.availableQuantity ?? 1;

          if (
            !Number.isInteger(
              availableQuantity
            ) ||
            availableQuantity < 0
          ) {
            throw new CheckoutReservationError(
              400,
              "Equipment stock information is invalid"
            );
          }

          if (quantity > availableQuantity) {
            throw new CheckoutReservationError(
              409,
              "Requested quantity exceeds available stock"
            );
          }

          // Step 2: Calculate price on the server.
          let pricing;

          try {
            pricing = calculateRentalAmount({
              rentalType:
                equipment.rentalType ?? "daily",
              rentalPrice:
                equipment.rentalPrice,
              pricePerDay:
                equipment.pricePerDay,
              startDate,
              endDate,
              quantity,
            });
          } catch (error) {
            throw new CheckoutReservationError(
              400,
              error.message
            );
          }

          // Step 3: Serialize competing changes
          // to the same equipment using a
          // MongoDB transactional write.
          const lock = await db
            .collection("equipment")
            .updateOne(
              {
                _id: equipmentId,
                status: "approved",
                availability: true,
                deletedAt: {
                  $exists: false,
                },
              },
              {
                $inc: {
                  bookingRevision: 1,
                },
              },
              { session }
            );

          if (lock.matchedCount !== 1) {
            throw new CheckoutReservationError(
              409,
              "Equipment availability changed"
            );
          }

          // Rental intervals are:
          // [startDate, endDate)
          const dateOverlap = {
            startDate: {
              $lt: endDate,
            },
            endDate: {
              $gt: startDate,
            },
          };

          // Step 4: Count existing bookings.
          const bookings = await db
            .collection("bookings")
            .find(
              {
                equipmentId,
                status: {
                  $in: ACTIVE_BOOKING_STATUSES,
                },
                ...dateOverlap,
              },
              { session }
            )
            .project({
              quantity: 1,
            })
            .toArray();

          const bookedQuantity =
            bookings.reduce(
              (sum, booking) =>
                sum + (booking.quantity ?? 1),
              0
            );

          // Step 5: Count active reservations.
          //
          // Expired PREPARING holds can be
          // disregarded, because they have not
          // opened Stripe Checkout.
          //
          // CHECKOUT_OPEN and PAYMENT_REVIEW
          // remain reserved until a separate
          // Stripe reconciliation process safely
          // resolves their payment status.
          const now = new Date();

          const reservations = await db
            .collection(
              "checkoutReservations"
            )
            .find(
              {
                equipmentId,
                ...dateOverlap,
                $or: [
                  {
                    status:
                      RESERVATION_STATUSES
                        .PREPARING,
                    expiresAt: {
                      $gt: now,
                    },
                  },
                  {
                    status:
                      RESERVATION_STATUSES
                        .CHECKOUT_OPEN,
                  },
                  {
                    status:
                      RESERVATION_STATUSES
                        .PAYMENT_REVIEW,
                  },
                ],
              },
              { session }
            )
            .project({
              quantity: 1,
            })
            .toArray();

          const heldQuantity =
            reservations.reduce(
              (sum, reservation) =>
                sum +
                (reservation.quantity ?? 1),
              0
            );

          if (
            bookedQuantity +
              heldQuantity +
              quantity >
            availableQuantity
          ) {
            throw new CheckoutReservationError(
              409,
              "Not enough equipment available for the selected dates"
            );
          }

          // Step 6: Prepare reservation document.
          const document =
            buildCheckoutReservationDocument({
              equipmentId:
                equipmentId.toHexString(),
              customerId:
                customerObjectId.toHexString(),
              ownerId:
                ownerId.toHexString(),
              startDate,
              endDate,
              quantity,
              rentalDays:
                pricing.rentalDays,
              rentalType:
                pricing.rentalType,
              rentalPrice:
                pricing.rentalPrice,
              totalAmount:
                pricing.totalAmount,
              contactNumber,
              deliveryAddress,
              additionalNotes,
            });

          // This is a preparation timeout,
          // NOT a confirmed Stripe expiration.
          document.expiresAt = new Date(
            now.getTime() +
              PREPARATION_HOLD_MINUTES *
                60 *
                1000
          );

          // Step 7: Save temporary reservation.
          const result = await db
            .collection(
              "checkoutReservations"
            )
            .insertOne(
              document,
              { session }
            );

          return {
            ...document,
            _id: result.insertedId,
          };
        },
        {
          readConcern: {
            level: "snapshot",
          },
          writeConcern: {
            w: "majority",
          },
        }
      );

    return reservation;
  } catch (error) {
    if (
      error instanceof
      CheckoutReservationError
    ) {
      throw error;
    }

    if (
      typeof error.hasErrorLabel ===
        "function" &&
      error.hasErrorLabel(
        "TransientTransactionError"
      )
    ) {
      throw new CheckoutReservationError(
        409,
        "Reservation conflict detected. Please try again."
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
};