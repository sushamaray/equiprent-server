
import "dotenv/config";

import { ObjectId } from "mongodb";

import {
  connectDB,
  getDB,
  closeDB,
} from "../src/config/db.js";

const baseURL = process.env.BETTER_AUTH_URL;
const clientURL = process.env.CLIENT_URL;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

const bookingId = "6b01ef10f8e331aa0b846273";
const equipmentId = "6b01bb4525ce461ff7cfe418";

const startDate = "2027-01-10";
const endDate = "2027-01-15";

if (!baseURL || !clientURL || !email || !password) {
  console.error("Missing Customer test configuration");
  process.exit(1);
}

let dbConnected = false;

try {
  // Step 1: Login as Customer
  const loginResponse = await fetch(
    `${baseURL}/api/auth/sign-in/email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: clientURL,
      },
      body: JSON.stringify({ email, password }),
    }
  );

  console.log(
    "Customer login status:",
    loginResponse.status
  );

  if (!loginResponse.ok) {
    throw new Error("Customer login failed");
  }

  const loginData = await loginResponse.json();

  const sessionCookie = loginResponse.headers
    .get("set-cookie")
    ?.split(";")[0];

  if (!sessionCookie) {
    throw new Error("Session cookie missing");
  }

  // Step 2: Generate JWT
  const tokenResponse = await fetch(
    `${baseURL}/api/auth/token`,
    {
      headers: {
        Cookie: sessionCookie,
        Origin: clientURL,
      },
    }
  );

  console.log("JWT status:", tokenResponse.status);

  if (!tokenResponse.ok) {
    throw new Error("JWT generation failed");
  }

  const tokenData = await tokenResponse.json();
  const token = tokenData.token;

  if (
    typeof token !== "string" ||
    token.split(".").length !== 3
  ) {
    throw new Error("Invalid JWT");
  }

  console.log("PASS: Customer authenticated");

  // Step 3: Connect to MongoDB
  await connectDB();
  dbConnected = true;

  const db = getDB();

  // Step 4: Check booking before cancellation
  const bookingBefore = await db
    .collection("bookings")
    .findOne({
      _id: new ObjectId(bookingId),
    });

  if (
    !bookingBefore ||
    bookingBefore.status !== "pending" ||
    bookingBefore.paymentStatus !== "unpaid" ||
    String(bookingBefore.customerId) !==
      loginData.user.id ||
    String(bookingBefore.equipmentId) !== equipmentId
  ) {
    throw new Error(
      "Test booking is not eligible or does not belong to Customer"
    );
  }

  console.log(
    "PASS: Pending unpaid Customer booking verified"
  );

  const cancelURL =
    `${baseURL}/api/bookings/${bookingId}/cancel`;

  // Step 5: First cancellation
  const firstResponse = await fetch(cancelURL, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const firstData = await firstResponse.json();

  console.log(
    "First cancellation status:",
    firstResponse.status
  );

  if (
    firstResponse.status !== 200 ||
    firstData.success !== true ||
    firstData.booking?.status !== "cancelled"
  ) {
    throw new Error(
      firstData.message || "First cancellation failed"
    );
  }

  console.log(
    "PASS: First cancellation successful"
  );

  // Step 6: Attempt to cancel the same booking again
  const secondResponse = await fetch(cancelURL, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const secondData = await secondResponse.json();

  console.log(
    "Second cancellation status:",
    secondResponse.status
  );

  if (
    secondResponse.status !== 409 ||
    secondData.success !== false
  ) {
    throw new Error(
      "Repeated cancellation was not rejected"
    );
  }

  console.log(
    "PASS: Repeated cancellation rejected"
  );

  // Step 7: Verify final MongoDB status
  const bookingAfter = await db
    .collection("bookings")
    .findOne({
      _id: new ObjectId(bookingId),
    });

  if (
    bookingAfter?.status !== "cancelled" ||
    bookingAfter?.paymentStatus !== "unpaid" ||
    !(bookingAfter.cancelledAt instanceof Date)
  ) {
    throw new Error(
      "Final booking status is incorrect"
    );
  }

  console.log(
    "PASS: Final MongoDB booking status verified"
  );

  // Step 8: Check remaining stock reservations
  const activeBookings = await db
    .collection("bookings")
    .find({
      equipmentId: new ObjectId(equipmentId),
      status: {
        $in: ["pending", "confirmed"],
      },
      startDate: {
        $lt: endDate,
      },
      endDate: {
        $gt: startDate,
      },
    })
    .project({
      quantity: 1,
    })
    .toArray();

  const reservedQuantity = activeBookings.reduce(
    (total, booking) =>
      total + (booking.quantity ?? 1),
    0
  );

  console.log(
    "Remaining reserved quantity:",
    reservedQuantity
  );

  if (reservedQuantity !== 0) {
    throw new Error(
      "Cancelled booking still reserves equipment"
    );
  }

  console.log(
    "PASS: Equipment stock released"
  );

  console.log(
    "Repeated Booking Cancellation Security Test PASSED"
  );
} catch (error) {
  console.error(
    "Repeated Booking Cancellation Security Test FAILED:",
    error.message
  );

  process.exitCode = 1;
} finally {
  if (dbConnected) {
    await closeDB();
  }
}