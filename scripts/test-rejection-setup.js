
import "dotenv/config";

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;
const ownerEmail = process.env.TEST_OWNER_2_EMAIL;

if (!uri || !dbName || !ownerEmail) {
  console.error("Missing test configuration");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();

  const db = client.db(dbName);

  // Find the second Owner
  const owner = await db.collection("user").findOne({
    email: ownerEmail,
    role: "owner",
  });

  if (!owner) {
    throw new Error("Second Owner account not found");
  }

  // Create a separate pending equipment for rejection testing
  const now = new Date();

  const equipment = {
    name: "Temporary Admin Rejection Test Equipment",
    description: "Test equipment for Admin rejection verification",
    category: "Camera",
    pricePerDay: 500,
    location: "Dhaka",
    image: "https://example.com/rejection-test.jpg",
    availability: true,
    status: "pending",
    ownerId: owner._id,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db
    .collection("equipment")
    .insertOne(equipment);

  console.log("PASS: Rejection test equipment created");
  console.log("Equipment ID:", result.insertedId.toString());
  console.log("Status:", equipment.status);
  console.log("Owner role:", owner.role);
  console.log("Price:", equipment.pricePerDay);
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}