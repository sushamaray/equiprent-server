import assert from "node:assert/strict";
import { calculateRentalAmount } from "../src/utils/rentalPricing.js";
import { convertTakaToStripeAmount } from "../src/utils/stripeAmount.js";

const total = (rentalType, rentalPrice, startDate, endDate, quantity = 1, extra = {}) =>
  calculateRentalAmount({ rentalType, rentalPrice, startDate, endDate, quantity, ...extra }).totalAmount;

assert.equal(total("daily", 1000, "2027-01-01", "2027-01-05"), 4000);
assert.equal(total("weekly", 5000, "2027-01-01", "2027-01-09"), 5715);
assert.equal(total("monthly", 15000, "2027-01-01", "2027-01-09"), 4000);
assert.equal(total("daily", 1000, "2027-01-01", "2027-01-03", 3), 6000);
assert.equal(total("weekly", 1, "2027-01-01", "2027-01-02"), 1);
assert.equal(total("daily", undefined, "2027-01-01", "2027-01-02", 1, { pricePerDay: 1000 }), 1000);
assert.throws(() => total("daily", 100, "2027-02-30", "2027-03-01"), /date/i);
assert.throws(() => total("daily", 0, "2027-01-01", "2027-01-02"), /price/i);
assert.equal(convertTakaToStripeAmount(1000), 100000);
assert.throws(() => convertTakaToStripeAmount(0), /whole number/i);

console.log("PASS: daily, weekly, monthly, quantity, ceiling, invalid date/price, legacy daily, BDT minor-unit conversion");
