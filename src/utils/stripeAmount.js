
export const PAYMENT_CURRENCY = "bdt";

// Stripe accepts BDT in its minor unit (poisha).
// EquipRent calculates rental totals in whole taka.
export const convertTakaToStripeAmount = (totalTaka) => {
  if (
    typeof totalTaka !== "number" ||
    !Number.isSafeInteger(totalTaka) ||
    totalTaka <= 0
  ) {
    throw new Error(
      "Payment amount must be a positive whole number of taka"
    );
  }

  const amountInPoisha = totalTaka * 100;

  // Stripe's standard maximum for BDT charges
  // is an 8-digit amount in minor units.
  if (
    !Number.isSafeInteger(amountInPoisha) ||
    amountInPoisha > 99999999
  ) {
    throw new Error(
      "Payment amount exceeds the supported Stripe limit"
    );
  }

  return amountInPoisha;
};