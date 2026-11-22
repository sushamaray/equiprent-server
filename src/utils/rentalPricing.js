
const RENTAL_PERIOD_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const parseRentalDate = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error(
      "Rental dates must use YYYY-MM-DD format"
    );
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Invalid rental calendar date");
  }

  return date;
};

export const calculateRentalAmount = ({
  rentalType = "daily",
  rentalPrice,
  pricePerDay,
  startDate,
  endDate,
  quantity = 1,
}) => {
  const periodDays = RENTAL_PERIOD_DAYS[rentalType];

  if (!periodDays) {
    throw new Error("Invalid rental type");
  }

  if (
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    throw new Error(
      "Quantity must be a positive integer"
    );
  }

  const start = parseRentalDate(startDate);
  const end = parseRentalDate(endDate);

  if (end <= start) {
    throw new Error(
      "Rental end date must be after start date"
    );
  }

  const rentalDays =
    (end.getTime() - start.getTime()) /
    MILLISECONDS_PER_DAY;

  // New equipment uses rentalPrice.
  // Legacy equipment uses pricePerDay for daily rentals.
  const price =
    rentalPrice !== undefined
      ? rentalPrice
      : rentalType === "daily"
        ? pricePerDay
        : undefined;

  if (
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price <= 0
  ) {
    throw new Error(
      "A valid rental price is required"
    );
  }

  // Convert price to two decimal places before
  // calculating the total amount.
  const priceInMinorUnits = Math.round(price * 100);

  if (
    !Number.isSafeInteger(priceInMinorUnits) ||
    priceInMinorUnits <= 0
  ) {
    throw new Error(
      "Rental price is outside the supported range"
    );
  }

  // Perform proportional billing for actual rental days.
  const totalMinorUnits =
    (priceInMinorUnits * rentalDays * quantity) /
    periodDays;

  if (
    !Number.isFinite(totalMinorUnits) ||
    !Number.isSafeInteger(
      Math.ceil(totalMinorUnits)
    )
  ) {
    throw new Error(
      "Calculated rental amount is too large"
    );
  }

  // Round up to the next whole taka.
  const totalAmount = Math.ceil(
    totalMinorUnits / 100
  );

  return {
    rentalType,
    rentalDays,
    quantity,
    periodDays,
    rentalPrice: price,
    totalAmount,
  };
};