
import "dotenv/config";

import { ObjectId } from "mongodb";

import {
  connectDB,
  getDB,
  closeDB,
} from "../src/config/db.js";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const clientURL = process.env.CLIENT_URL;

const bookingId = "6b01ecfbdff30767422b3e96";
const equipmentId = "6b01bb4525ce461ff7cfe418";

const startDate = "2027-01-10";
const endDate = "2027-01-15";

if (!baseURL || !email || !password || !clientURL) {
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
      body: JSON.stringify({
        email,
        password,
      }),
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

  // Step 4: Verify booking before cancellation
  const existingBooking = await db
    .collection("bookings")
    .findOne({
      _id: new ObjectId(bookingId),
    });

  if (!existingBooking) {
    throw new Error("Test booking not found");
  }

  if (
    existingBooking.status !== "pending" ||
    existingBooking.paymentStatus !== "unpaid" ||
    String(existingBooking.customerId) !==
      loginData.user.id ||
    String(existingBooking.equipmentId) !==
      equipmentId
  ) {
    throw new Error(
      "Test booking is not eligible for cancellation"
    );
  }

  console.log(
    "PASS: Booking is pending, unpaid, and belongs to Customer"
  );

  // Step 5: Cancel booking through protected API
  const cancelResponse = await fetch(
    `${baseURL}/api/bookings/${bookingId}/cancel`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log(
    "Booking cancellation status:",
    cancelResponse.status
  );

  const cancelData = await cancelResponse.json();

  if (
    cancelResponse.status !== 200 ||
    cancelData.success !== true ||
    cancelData.booking?.status !== "cancelled" ||
    cancelData.booking?.bookingId !== bookingId
  ) {
    throw new Error(
      cancelData.message ||
        "Booking cancellation failed"
    );
  }

  console.log(
    "PASS: Customer cancelled booking successfully"
  );

  // Step 6: Verify MongoDB booking status
  const updatedBooking = await db
    .collection("bookings")
    .findOne({
      _id: new ObjectId(bookingId),
    });

  if (
    updatedBooking?.status !== "cancelled" ||
    !(updatedBooking.cancelledAt instanceof Date)
  ) {
    throw new Error(
      "Cancelled booking status was not saved correctly"
    );
  }

  console.log(
    "PASS: MongoDB booking status is cancelled"
  );

  // Step 7: Verify cancelled booking no longer
  // contributes to active stock reservations
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
      "Equipment stock is still reserved for test dates"
    );
  }

  console.log(
    "PASS: Cancelled booking no longer reserves stock"
  );

  console.log(
    "Booking Cancellation Integration Test PASSED"
  );
} catch (error) {
  console.error(
    "Booking Cancellation Integration Test FAILED:",
    error.message
  );

  process.exitCode = 1;
} finally {
  if (dbConnected) {
    await closeDB();
  }
}