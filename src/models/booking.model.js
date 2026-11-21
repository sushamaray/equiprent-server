
import { ObjectId } from "mongodb";

// Check valid YYYY-MM-DD calendar date
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

// Validate new booking request
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

  // Equipment ID must be a MongoDB ObjectId
  if (
    typeof data.equipmentId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(data.equipmentId) ||
    !ObjectId.isValid(data.equipmentId)
  ) {
    return {
      valid: false,
      message: "A valid equipmentId is required",
    };
  }

  // Validate rental dates
  const startDate = parseDate(data.startDate);
  const endDate = parseDate(data.endDate);

  if (!startDate || !endDate) {
    return {
      valid: false,
      message: "Valid startDate and endDate are required (YYYY-MM-DD)",
    };
  }

  // Do not allow bookings in the past
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

  // End date must be after start date
  if (endDate <= startDate) {
    return {
      valid: false,
      message: "endDate must be after startDate",
    };
  }

  // Validate requested equipment quantity
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

// Calculate rental duration in whole days
export const calculateRentalDays = (
  startDate,
  endDate
) => {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (!start || !end || end <= start) {
    throw new Error("Invalid booking date range");
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return (
    (end.getTime() - start.getTime()) /
    millisecondsPerDay
  );
};

// Build booking document for MongoDB
// All trusted values must come from the server.
export const buildBookingDocument = ({
  equipmentId,
  customerId,
  ownerId,
  startDate,
  endDate,
  quantity,
  rentalDays,
  pricePerDay,
  totalPrice,
}) => {
  const now = new Date();

  return {
    equipmentId: new ObjectId(equipmentId),
    customerId: new ObjectId(customerId),
    ownerId: new ObjectId(ownerId),

    startDate,
    endDate,
    quantity,
    rentalDays,

    pricePerDay,
    totalPrice,

    status: "pending",
    paymentStatus: "unpaid",

    createdAt: now,
    updatedAt: now,
  };
};