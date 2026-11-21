
import "dotenv/config";
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);

try {
  await client.connect();

  const db = client.db(process.env.DB_NAME);

  const owner = await db.collection("user").findOne({
    email: process.env.TEST_OWNER_2_EMAIL,
    role: "owner",
  });

  if (!owner) {
    throw new Error("Second Owner account not found");
  }

  const equipment = {
    name: "Temporary Soft Delete Test Equipment",
    description: "Equipment created only for testing soft delete",
    category: "Camera",
    pricePerDay: 500,
    location: "Dhaka",
    image: "https://example.com/test-camera.jpg",
    availability: true,
    ownerId: owner._id,
    createdAt: new Date(),
  };

  const result = await db
    .collection("equipment")
    .insertOne(equipment);

  console.log("Test equipment created successfully");
  console.log("Equipment ID:", result.insertedId.toString());
  console.log("Owner:", "Second Owner");
  console.log("Price:", equipment.pricePerDay);
  console.log("Availability:", equipment.availability);

} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}