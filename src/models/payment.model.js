
import { ObjectId } from "mongodb";

const isValidObjectId = (value) => {
  const id = String(value ?? "");

  return (
    /^[a-fA-F0-9]{24}$/.test(id) &&
    ObjectId.isValid(id)
  );
};

const isNonEmptyString = (value) => {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
};

// Build a payment record only from trusted,
// server-verified Stripe payment information.
export const buildPaymentDocument = ({
  bookingId,
  reservationId,
  customerId,
  ownerId,
  equipmentId,
  amount,
  amountInMinorUnit,
  currency,
  transactionId,
  stripeCheckoutSessionId,
  customerEmail,
  paidAt,
}) => {
  const identities = [
    bookingId,
    reservationId,
    customerId,
    ownerId,
    equipmentId,
  ];

  if (!identities.every(isValidObjectId)) {
    throw new Error("Invalid payment identity");
  }

  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    throw new Error("Invalid payment amount");
  }

  if (
    !Number.isSafeInteger(amountInMinorUnit) ||
    amountInMinorUnit !== amount * 100
  ) {
    throw new Error(
      "Invalid Stripe payment amount"
    );
  }

  if (currency !== "bdt") {
    throw new Error(
      "Only BDT payments are supported"
    );
  }

  if (!isNonEmptyString(transactionId)) {
    throw new Error(
      "Stripe PaymentIntent ID is required"
    );
  }

  if (
    !transactionId.startsWith("pi_") ||
    !isNonEmptyString(stripeCheckoutSessionId) ||
    !stripeCheckoutSessionId.startsWith("cs_")
  ) {
    throw new Error(
      "Invalid Stripe transaction identifiers"
    );
  }

  if (
    customerEmail !== undefined &&
    customerEmail !== null &&
    typeof customerEmail !== "string"
  ) {
    throw new Error("Invalid customer email");
  }

  const paymentDate =
    paidAt instanceof Date
      ? paidAt
      : new Date(paidAt);

  if (!Number.isFinite(paymentDate.getTime())) {
    throw new Error("Invalid payment date");
  }

  const now = new Date();

  return {
    bookingId: new ObjectId(bookingId),
    reservationId: new ObjectId(reservationId),
    customerId: new ObjectId(customerId),
    ownerId: new ObjectId(ownerId),
    equipmentId: new ObjectId(equipmentId),

    amount,
    amountInMinorUnit,
    currency,

    transactionId,
    stripePaymentIntentId: transactionId,
    stripeCheckoutSessionId,

    customerEmail: customerEmail?.trim() ?? "",

    paymentStatus: "paid",

    paidAt: paymentDate,
    createdAt: now,
    updatedAt: now,
  };
};