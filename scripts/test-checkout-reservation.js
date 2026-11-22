
import "dotenv/config";

import { ObjectId } from "mongodb";

import {
  connectDB,
  getDB,
  closeDB,
} from "../src/config/db.js";

import {
  createCheckoutReservation,
  CheckoutReservationError,
} from "../src/services/checkoutReservation.service.js";

let dbConnected = false;
let equipmentId = null;

try {
  // Step 1: Connect to MongoDB
  await connectDB();
  dbConnected = true;

  const db = getDB();

  console.log("PASS: MongoDB connected");

  // Step 2: Find test Customer and Owner
  const customer = await db.collection("user").findOne(
    { email: process.env.TEST_USER_EMAIL },
    { projection: { _id: 1, role: 1 } }
  );

  const owner = await db.collection("user").findOne(
    { email: process.env.TEST_OWNER_EMAIL },
    { projection: { _id: 1, role: 1 } }
  );

  if (
    !customer ||
    !owner ||
    customer.role !== "customer" ||
    owner.role !== "owner"
  ) {
    throw new Error(
      "Valid test Customer and Owner accounts not found"
    );
  }

  console.log("PASS: Test Customer and Owner found");

  // Step 3: Create isolated temporary equipment
  const equipment = {
    name: "Temporary Checkout Reservation Test",
    description: "Temporary reservation concurrency test",
    category: "Photography",
    location: "Dhaka",
    image: "https://example.com/reservation-test.jpg",

    rentalType: "weekly",
    rentalPrice: 5000,

    availableQuantity: 1,
    availability: true,
    status: "approved",

    ownerId: new ObjectId(owner._id),

    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const equipmentResult = await db
    .collection("equipment")
    .insertOne(equipment);

  equipmentId = equipmentResult.insertedId;

  console.log("PASS: Temporary equipment created");

  // Step 4: Prepare checkout request
  const bookingData = {
    equipmentId: equipmentId.toHexString(),

    startDate: "2027-04-10",
    endDate: "2027-04-18",

    quantity: 1,

    contactNumber: "01712345678",
    deliveryAddress: "House 10, Road 5, Dhaka",
    additionalNotes: "Reservation concurrency test",
  };

  // Step 5: Send two concurrent reservation requests
  console.log("Sending two reservation requests concurrently...");

  const results = await Promise.allSettled([
    createCheckoutReservation({
      customerId: customer._id.toHexString(),
      bookingData,
    }),

    createCheckoutReservation({
      customerId: customer._id.toHexString(),
      bookingData,
    }),
  ]);

  const successful = results.filter(
    (result) => result.status === "fulfilled"
  );

  const rejected = results.filter(
    (result) => result.status === "rejected"
  );

  console.log("Successful reservations:", successful.length);
  console.log("Rejected reservations:", rejected.length);

  // Step 6: Verify exactly one reservation succeeded
  if (
    successful.length !== 1 ||
    rejected.length !== 1
  ) {
    throw new Error(
      "Stock limit was not respected"
    );
  }

  const rejectionError = rejected[0].reason;

  if (
    !(
      rejectionError instanceof CheckoutReservationError
    ) ||
    rejectionError.statusCode !== 409
  ) {
    throw new Error(
      "Second reservation was rejected for an unexpected reason"
    );
  }

  console.log(
    "PASS: Only one concurrent reservation accepted"
  );

  console.log(
    "PASS: Second reservation rejected with 409"
  );

  // Step 7: Verify actual MongoDB reservation count
  const reservations = await db
    .collection("checkoutReservations")
    .find({
      equipmentId,
      status: "preparing",
    })
    .toArray();

  const reservedQuantity = reservations.reduce(
    (total, reservation) =>
      total + reservation.quantity,
    0
  );

  console.log(
    "Reserved quantity:",
    reservedQuantity
  );

  if (
    reservations.length !== 1 ||
    reservedQuantity !== 1
  ) {
    throw new Error(
      "MongoDB reservation quantity is incorrect"
    );
  }

  console.log(
    "PASS: MongoDB reservation verified"
  );

  console.log(
    "Checkout Reservation Integration Test PASSED"
  );
} catch (error) {
  console.error(
    "Checkout Reservation Integration Test FAILED:",
    error.message
  );

  process.exitCode = 1;
} finally {
  // Cleanup only the isolated test equipment and reservations.
  if (dbConnected && equipmentId) {
    try {
      const db = getDB();

      await db
        .collection("checkoutReservations")
        .deleteMany({ equipmentId });

      await db
        .collection("equipment")
        .deleteOne({ _id: equipmentId });

      console.log(
        "PASS: Temporary test data cleaned up"
      );
    } catch (cleanupError) {
      console.error(
        "WARNING: Test cleanup failed:",
        cleanupError.message
      );

      process.exitCode = 1;
    }
  }

  if (dbConnected) {
    await closeDB();
  }
}