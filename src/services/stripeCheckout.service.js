
import { ObjectId } from "mongodb";

import { getDB } from "../config/db.js";

import { getStripe } from "../config/stripe.js";

import {
  RESERVATION_STATUSES,
} from "../models/checkoutReservation.model.js";

import {
  convertTakaToStripeAmount,
  PAYMENT_CURRENCY,
} from "../utils/stripeAmount.js";

const CHECKOUT_DURATION_SECONDS = 30 * 60;

export class StripeCheckoutError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "StripeCheckoutError";
    this.statusCode = statusCode;
  }
}

const getFrontendOrigin = () => {
  const configuredURL = process.env.CLIENT_URL;

  if (!configuredURL) {
    throw new StripeCheckoutError(
      500,
      "CLIENT_URL is not configured"
    );
  }

  const parsedURL = new URL(configuredURL);

  if (
    !["http:", "https:"].includes(parsedURL.protocol) ||
    (parsedURL.protocol === "http:" &&
      parsedURL.hostname !== "localhost" &&
      parsedURL.hostname !== "127.0.0.1")
  ) {
    throw new StripeCheckoutError(
      500,
      "Invalid frontend URL configuration"
    );
  }

  return parsedURL.origin;
};

// Create a hosted Stripe Checkout Session
// for an existing temporary reservation.
export const createStripeCheckoutSession = async ({
  reservationId,
  customerId,
}) => {
  if (
    typeof reservationId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(reservationId) ||
    !ObjectId.isValid(reservationId)
  ) {
    throw new StripeCheckoutError(
      400,
      "Invalid reservation ID"
    );
  }

  if (
    typeof customerId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(customerId) ||
    !ObjectId.isValid(customerId)
  ) {
    throw new StripeCheckoutError(
      401,
      "Invalid authenticated Customer"
    );
  }

  const db = getDB();
  const stripe = getStripe();

  const reservationObjectId = new ObjectId(
    reservationId
  );

  const customerObjectId = new ObjectId(
    customerId
  );

  const now = new Date();

  // Step 1: Retrieve the authenticated Customer's
  // own active preparation reservation.
  const reservation = await db
    .collection("checkoutReservations")
    .findOne({
      _id: reservationObjectId,
      customerId: customerObjectId,
      status: RESERVATION_STATUSES.PREPARING,
      expiresAt: {
        $gt: now,
      },
      stripeCheckoutSessionId: null,
    });

  if (!reservation) {
    throw new StripeCheckoutError(
      409,
      "Checkout reservation not found, expired, or already processed"
    );
  }

  // Step 2: Retrieve equipment information.
  const equipment = await db
    .collection("equipment")
    .findOne({
      _id: reservation.equipmentId,
      ownerId: reservation.ownerId,
      status: "approved",
      availability: true,
      deletedAt: {
        $exists: false,
      },
    });

  if (!equipment) {
    await db
      .collection("checkoutReservations")
      .updateOne(
        {
          _id: reservationObjectId,
          status: RESERVATION_STATUSES.PREPARING,
        },
        {
          $set: {
            status: RESERVATION_STATUSES.CANCELLED,
            updatedAt: new Date(),
          },
        }
      );

    throw new StripeCheckoutError(
      409,
      "Equipment is no longer available"
    );
  }

  // Step 3: Verify the Customer's email.
  const customer = await db
    .collection("user")
    .findOne(
      {
        _id: customerObjectId,
      },
      {
        projection: {
          email: 1,
        },
      }
    );

  const customerEmail =
    typeof customer?.email === "string" &&
    customer.email.includes("@")
      ? customer.email
      : undefined;

  // Step 4: Convert backend-calculated BDT
  // amount into Stripe's smallest currency unit.
  const amountInMinorUnit =
    convertTakaToStripeAmount(
      reservation.totalAmount
    );

  const frontendOrigin = getFrontendOrigin();

  const successURL =
    `${frontendOrigin}/payment-success` +
    `?session_id={CHECKOUT_SESSION_ID}`;

  const cancelURL =
    `${frontendOrigin}/payment-cancelled` +
    `?reservation_id=${reservationId}`;

  const metadata = {
    reservationId,
    customerId: customerId,
    equipmentId:
      reservation.equipmentId.toHexString(),
    ownerId:
      reservation.ownerId.toHexString(),
  };

  const expiresAt =
    Math.floor(Date.now() / 1000) +
    CHECKOUT_DURATION_SECONDS;

  let checkoutSession;

  try {
    // Step 5: Create Stripe Checkout Session.
    checkoutSession =
      await stripe.checkout.sessions.create(
        {
          mode: "payment",

          line_items: [
            {
              price_data: {
                currency: PAYMENT_CURRENCY,

                unit_amount: amountInMinorUnit,

                product_data: {
                  name: equipment.name,

                  description:
                    `${reservation.rentalDays} rental days, ` +
                    `${reservation.quantity} unit(s), ` +
                    `${reservation.rentalType} rental`,
                },
              },

              // Total already includes requested quantity.
              quantity: 1,
            },
          ],

          customer_email: customerEmail,

          client_reference_id: reservationId,

          metadata,

          payment_intent_data: {
            metadata,
          },

          success_url: successURL,
          cancel_url: cancelURL,

          expires_at: expiresAt,
        },
        {
          idempotencyKey:
            `equiprent-checkout-${reservationId}`,
        }
      );
  } catch (error) {
    // A timeout can happen after Stripe accepted the create request.
    // Retain the hold for reconciliation because the outcome is ambiguous.
    await db
      .collection("checkoutReservations")
      .updateOne(
        {
          _id: reservationObjectId,
          customerId: customerObjectId,
          status: RESERVATION_STATUSES.PREPARING,
        },
        {
          $set: {
            status: RESERVATION_STATUSES.PAYMENT_REVIEW,
            paymentReviewReason: "Stripe Checkout creation outcome is unknown",
            updatedAt: new Date(),
          },
        }
      );

    throw new StripeCheckoutError(
      error.statusCode || 502,
      "Unable to create Stripe Checkout Session"
    );
  }

  // Step 6: Save the actual Stripe Session ID
  // and the expiration returned by Stripe.
  let updateResult;
  let reservationUpdateFailed = false;
  try {
    updateResult = await db.collection("checkoutReservations").updateOne(
      {
        _id: reservationObjectId,
        customerId: customerObjectId,
        status: RESERVATION_STATUSES.PREPARING,
        expiresAt: {
          $gt: new Date(),
        },
        stripeCheckoutSessionId: null,
      },
      {
        $set: {
          status:
            RESERVATION_STATUSES.CHECKOUT_OPEN,

          stripeCheckoutSessionId:
            checkoutSession.id,

          expiresAt: new Date(
            checkoutSession.expires_at * 1000
          ),

          updatedAt: new Date(),
        },
      }
    );
  } catch {
    reservationUpdateFailed = true;
  }

  if (reservationUpdateFailed || updateResult?.modifiedCount !== 1) {
    // The Stripe session exists, but its reservation
    // could not be updated. Try to expire it safely.
    try {
      await stripe.checkout.sessions.expire(
        checkoutSession.id
      );

      await db
        .collection("checkoutReservations")
        .updateOne(
          {
            _id: reservationObjectId,
            status: RESERVATION_STATUSES.PREPARING,
          },
          {
            $set: {
              status:
                RESERVATION_STATUSES.CANCELLED,
              updatedAt: new Date(),
            },
          }
        );
    } catch {
      // If Stripe expiration cannot be confirmed,
      // keep the reservation protected for reconciliation.
      await db
        .collection("checkoutReservations")
        .updateOne(
          {
            _id: reservationObjectId,
          },
          {
            $set: {
              status:
                RESERVATION_STATUSES.PAYMENT_REVIEW,

              stripeCheckoutSessionId:
                checkoutSession.id,

              expiresAt: new Date(
                checkoutSession.expires_at * 1000
              ),

              updatedAt: new Date(),
            },
          }
        );
    }

    throw new StripeCheckoutError(
      409,
      "Unable to finalize checkout reservation"
    );
  }

  if (!checkoutSession.url) {
    throw new StripeCheckoutError(
      502,
      "Stripe Checkout URL was not returned"
    );
  }

  // Step 7: Return the hosted Checkout URL.
  return {
    checkoutSessionId: checkoutSession.id,
    checkoutURL: checkoutSession.url,
    expiresAt: new Date(
      checkoutSession.expires_at * 1000
    ),
    amount: reservation.totalAmount,
    currency: PAYMENT_CURRENCY,
  };
};
