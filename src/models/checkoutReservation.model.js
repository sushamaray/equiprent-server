
import { ObjectId } from "mongodb";

export const RESERVATION_STATUSES = Object.freeze({
  PREPARING: "preparing",
  CHECKOUT_OPEN: "checkout_open",
  COMPLETED: "completed",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  PAYMENT_REVIEW: "payment_review",
});

const isValidObjectId = (value) => {
  return (
    typeof value === "string" &&
    /^[a-fA-F0-9]{24}$/.test(value) &&
    ObjectId.isValid(value)
  );
};

const isValidAmount = (value) => {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isSafeInteger(Math.round(value * 100)) &&
    value > 0
  );
};

// Build a temporary reservation from trusted
// server-validated information.
//
// This function does not insert any documents,
// charge a customer, or lock equipment stock.
export const buildCheckoutReservationDocument = ({
  equipmentId,
  customerId,
  ownerId,
  startDate,
  endDate,
  quantity,
  rentalDays,
  rentalType,
  rentalPrice,
  totalAmount,
  contactNumber,
  deliveryAddress,
  additionalNotes = "",
}) => {
  if (
    !isValidObjectId(equipmentId) ||
    !isValidObjectId(customerId) ||
    !isValidObjectId(ownerId)
  ) {
    throw new Error("Invalid reservation identity");
  }

  if (
    typeof startDate !== "string" ||
    typeof endDate !== "string" ||
    startDate >= endDate
  ) {
    throw new Error("Invalid reservation date range");
  }

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    !Number.isInteger(rentalDays) ||
    rentalDays < 1
  ) {
    throw new Error("Invalid rental quantity or duration");
  }

  if (
    !["daily", "weekly", "monthly"].includes(
      rentalType
    )
  ) {
    throw new Error("Invalid rental type");
  }

  if (
    !isValidAmount(rentalPrice) ||
    !isValidAmount(totalAmount)
  ) {
    throw new Error("Invalid reservation price");
  }

  if (
    typeof contactNumber !== "string" ||
    contactNumber.trim().length < 6 ||
    contactNumber.trim().length > 30
  ) {
    throw new Error("Invalid contact number");
  }

  if (
    typeof deliveryAddress !== "string" ||
    deliveryAddress.trim().length < 5 ||
    deliveryAddress.trim().length > 500
  ) {
    throw new Error("Invalid delivery address");
  }

  if (
    typeof additionalNotes !== "string" ||
    additionalNotes.length > 1000
  ) {
    throw new Error("Invalid additional notes");
  }

  const now = new Date();

  return {
    equipmentId: new ObjectId(equipmentId),
    customerId: new ObjectId(customerId),
    ownerId: new ObjectId(ownerId),

    startDate,
    endDate,
    quantity,
    rentalDays,

    rentalType,
    rentalPrice,
    totalAmount,

    contactNumber: contactNumber.trim(),
    deliveryAddress: deliveryAddress.trim(),
    additionalNotes: additionalNotes.trim(),

    status: RESERVATION_STATUSES.PREPARING,

    stripeCheckoutSessionId: null,
    currency: "bdt",
    expiresAt: null,

    createdAt: now,
    updatedAt: now,
  };
};
