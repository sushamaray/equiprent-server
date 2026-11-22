
import { ObjectId } from "mongodb";

// Parse a valid YYYY-MM-DD calendar date.
const parseDate = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return date;
};

const isValidObjectId = (value) => {
  return (
    typeof value === "string" &&
    /^[a-fA-F0-9]{24}$/.test(value) &&
    ObjectId.isValid(value)
  );
};

// Shared validation for rental dates and quantity.
// This also preserves compatibility with legacy bookings.
export const validateBooking = (data) => {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return {
      valid: false,
      message: "Invalid booking data",
    };
  }

  if (!isValidObjectId(data.equipmentId)) {
    return {
      valid: false,
      message: "A valid equipmentId is required",
    };
  }

  const startDate = parseDate(data.startDate);
  const endDate = parseDate(data.endDate);

  if (!startDate || !endDate) {
    return {
      valid: false,
      message:
        "Valid startDate and endDate are required (YYYY-MM-DD)",
    };
  }

  const today = new Date();

  const todayUTC = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );

  if (startDate.getTime() < todayUTC) {
    return {
      valid: false,
      message: "Booking start date cannot be in the past",
    };
  }

  if (endDate <= startDate) {
    return {
      valid: false,
      message: "endDate must be after startDate",
    };
  }

  const quantity = data.quantity ?? 1;

  if (
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    return {
      valid: false,
      message: "quantity must be a positive integer",
    };
  }

  return {
    valid: true,
    message: "Booking data is valid",
  };
};

// Additional validation specifically for Stripe Checkout.
// Existing booking validation remains backwards-compatible.
export const validateCheckoutBooking = (data) => {
  const bookingValidation = validateBooking(data);

  if (!bookingValidation.valid) {
    return bookingValidation;
  }

  if (
    typeof data.contactNumber !== "string" ||
    data.contactNumber.trim().length < 6 ||
    data.contactNumber.trim().length > 30
  ) {
    return {
      valid: false,
      message:
        "A valid contactNumber is required (6-30 characters)",
    };
  }

  if (
    typeof data.deliveryAddress !== "string" ||
    data.deliveryAddress.trim().length < 5 ||
    data.deliveryAddress.trim().length > 500
  ) {
    return {
      valid: false,
      message:
        "A valid deliveryAddress is required (5-500 characters)",
    };
  }

  if (
    data.additionalNotes !== undefined &&
    (
      typeof data.additionalNotes !== "string" ||
      data.additionalNotes.length > 1000
    )
  ) {
    return {
      valid: false,
      message:
        "additionalNotes must be text of at most 1000 characters",
    };
  }

  return {
    valid: true,
    message: "Checkout booking data is valid",
  };
};

// Calculate rental duration.
// The rental date interval is [startDate, endDate).
export const calculateRentalDays = (
  startDate,
  endDate
) => {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (!start || !end || end <= start) {
    throw new Error("Invalid booking date range");
  }

  const millisecondsPerDay =
    24 * 60 * 60 * 1000;

  return (
    (end.getTime() - start.getTime()) /
    millisecondsPerDay
  );
};

// Create a booking document using trusted server values.
//
// Legacy booking calls continue to use:
//   pricePerDay
//   totalPrice
//   paymentStatus = "unpaid"
//
// Stripe webhook processing will explicitly provide:
//   rentalType
//   rentalPrice
//   paymentStatus = "paid"
//   stripeCheckoutSessionId
//   stripePaymentIntentId
export const buildBookingDocument = ({
  equipmentId,
  customerId,
  ownerId,
  startDate,
  endDate,
  quantity,
  rentalDays,
  pricePerDay,
  rentalType,
  rentalPrice,
  totalPrice,
  contactNumber,
  deliveryAddress,
  additionalNotes,
  paymentStatus = "unpaid",
  stripeCheckoutSessionId,
  stripePaymentIntentId,
}) => {
  if (
    !isValidObjectId(equipmentId) ||
    !isValidObjectId(customerId) ||
    !isValidObjectId(ownerId)
  ) {
    throw new Error("Invalid booking identity");
  }

  if (
    paymentStatus !== "unpaid" &&
    paymentStatus !== "paid"
  ) {
    throw new Error("Invalid payment status");
  }

  if (
    typeof totalPrice !== "number" ||
    !Number.isFinite(totalPrice) ||
    totalPrice <= 0
  ) {
    throw new Error("Invalid booking total price");
  }

  const now = new Date();

  const booking = {
    equipmentId: new ObjectId(equipmentId),
    customerId: new ObjectId(customerId),
    ownerId: new ObjectId(ownerId),

    startDate,
    endDate,
    quantity,
    rentalDays,

    totalPrice,

    status: "pending",
    paymentStatus,

    createdAt: now,
    updatedAt: now,
  };

  // Preserve existing daily booking structure.
  if (pricePerDay !== undefined) {
    booking.pricePerDay = pricePerDay;
  }

  // New rental pricing information.
  if (rentalType !== undefined) {
    booking.rentalType = rentalType;
  }

  if (rentalPrice !== undefined) {
    booking.rentalPrice = rentalPrice;
  }

  // Customer delivery information.
  if (contactNumber !== undefined) {
    booking.contactNumber = contactNumber.trim();
  }

  if (deliveryAddress !== undefined) {
    booking.deliveryAddress =
      deliveryAddress.trim();
  }

  if (additionalNotes !== undefined) {
    booking.additionalNotes =
      additionalNotes.trim();
  }

  // Payment identifiers are provided only by
  // trusted backend Stripe webhook processing.
  if (stripeCheckoutSessionId !== undefined) {
    booking.stripeCheckoutSessionId =
      stripeCheckoutSessionId;
  }

  if (stripePaymentIntentId !== undefined) {
    booking.stripePaymentIntentId =
      stripePaymentIntentId;
  }

  if (paymentStatus === "paid") {
    booking.paidAt = now;
  }

  return booking;
};