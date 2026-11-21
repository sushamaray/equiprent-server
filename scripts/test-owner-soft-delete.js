
import "dotenv/config";

import { ObjectId, MongoClient } from "mongodb";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_OWNER_2_EMAIL;
const password = process.env.TEST_OWNER_2_PASSWORD;

const equipmentId = "6b01c1c1e00eae796cfa1e00";

if (
  !baseURL ||
  !email ||
  !password ||
  !process.env.MONGODB_URI ||
  !process.env.DB_NAME
) {
  throw new Error("Required test environment variables missing");
}

const client = new MongoClient(process.env.MONGODB_URI);

try {
  // Step 1: Login as Owner B
  const loginResponse = await fetch(
    `${baseURL}/api/auth/sign-in/email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: process.env.CLIENT_URL,
      },
      body: JSON.stringify({ email, password }),
    }
  );

  console.log("Owner B login status:", loginResponse.status);

  if (!loginResponse.ok) {
    throw new Error("Owner B login failed");
  }

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
        Origin: process.env.CLIENT_URL,
      },
    }
  );

  console.log("JWT status:", tokenResponse.status);

  if (!tokenResponse.ok) {
    throw new Error("JWT generation failed");
  }

  const { token } = await tokenResponse.json();

  if (!token) {
    throw new Error("JWT missing");
  }

  // Step 3: Verify test equipment before deletion
  await client.connect();

  const db = client.db(process.env.DB_NAME);
  const collection = db.collection("equipment");

  const owner = await db.collection("user").findOne({
    email,
    role: "owner",
  });

  if (!owner) {
    throw new Error("Owner B account not found");
  }

  const equipment = await collection.findOne({
    _id: new ObjectId(equipmentId),
    ownerId: owner._id,
    availability: true,
    deletedAt: { $exists: false },
  });

  if (!equipment) {
    throw new Error("Active test equipment not found");
  }

  console.log("PASS: Active test equipment verified");

  // Step 4: Delete using Owner B's JWT
  const deleteResponse = await fetch(
    `${baseURL}/api/equipment/${equipmentId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log("Owner delete status:", deleteResponse.status);

  const deleteData = await deleteResponse.json();

  if (
    deleteResponse.status !== 200 ||
    deleteData.success !== true
  ) {
    throw new Error("Owner soft delete failed");
  }

  console.log("PASS: Owner deleted own equipment");

  // Step 5: Verify soft delete in MongoDB
  const deletedEquipment = await collection.findOne({
    _id: new ObjectId(equipmentId),
  });

  if (
    !deletedEquipment ||
    deletedEquipment.availability !== false ||
    !(deletedEquipment.deletedAt instanceof Date)
  ) {
    throw new Error("MongoDB soft delete verification failed");
  }

  console.log("PASS: Equipment retained in MongoDB");
  console.log("PASS: Availability changed to false");
  console.log("PASS: deletedAt timestamp saved");

  // Step 6: Verify public details endpoint hides it
  const detailsResponse = await fetch(
    `${baseURL}/api/equipment/${equipmentId}`
  );

  console.log(
    "Deleted equipment public details status:",
    detailsResponse.status
  );

  if (detailsResponse.status !== 404) {
    throw new Error("Deleted equipment is publicly accessible");
  }

  console.log("PASS: Deleted equipment hidden from public");

  // Step 7: Verify Owner cannot update deleted equipment
  const updateResponse = await fetch(
    `${baseURL}/api/equipment/${equipmentId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        availability: true,
      }),
    }
  );

  console.log(
    "Deleted equipment update status:",
    updateResponse.status
  );

  if (updateResponse.status !== 404) {
    throw new Error("Deleted equipment update was not blocked");
  }

  console.log("PASS: Deleted equipment cannot be updated");

} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}