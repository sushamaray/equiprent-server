
import "dotenv/config";
import { MongoClient } from "mongodb";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_OWNER_EMAIL;
const password = process.env.TEST_OWNER_PASSWORD;

if (!baseURL || !email || !password) {
  console.error("Missing Owner test configuration");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);

let userId;
let roleChanged = false;

try {
  await client.connect();

  const db = client.db(process.env.DB_NAME);
  const users = db.collection("user");

  // Find the dedicated Owner test account
  const user = await users.findOne(
    { email },
    { projection: { _id: 1, role: 1 } }
  );

  if (!user || user.role !== "owner") {
    throw new Error("Owner test account is not ready");
  }

  userId = user._id;

  // Step 1: Login
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

  if (!loginResponse.ok) {
    throw new Error("Owner login failed");
  }

  const sessionCookie = loginResponse.headers
    .get("set-cookie")
    ?.split(";")[0];

  if (!sessionCookie) {
    throw new Error("Session cookie missing");
  }

  // Step 2: Generate JWT once
  const tokenResponse = await fetch(
    `${baseURL}/api/auth/token`,
    {
      headers: {
        Cookie: sessionCookie,
        Origin: process.env.CLIENT_URL,
      },
    }
  );

  if (!tokenResponse.ok) {
    throw new Error("JWT generation failed");
  }

  const { token } = await tokenResponse.json();

  if (typeof token !== "string") {
    throw new Error("JWT missing");
  }

  // Helper: Test Owner API using the same JWT
  const checkOwnerAccess = async () => {
    const response = await fetch(
      `${baseURL}/api/owner/test`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.status;
  };

  // Step 3: Owner should have access initially
  const beforeStatus = await checkOwnerAccess();

  console.log("Before role change:", beforeStatus);

  if (beforeStatus !== 200) {
    throw new Error("Initial Owner access failed");
  }

  // Step 4: Temporarily downgrade Owner to Customer
  const downgrade = await users.updateOne(
    { _id: userId, role: "owner" },
    { $set: { role: "customer" } }
  );

  if (downgrade.modifiedCount !== 1) {
    throw new Error("Could not change test role");
  }

  roleChanged = true;

  // Step 5: Same JWT must no longer grant Owner access
  const afterStatus = await checkOwnerAccess();

  console.log("After role change:", afterStatus);

  if (afterStatus !== 403) {
    throw new Error("Old JWT retained Owner access");
  }

  console.log(
    "PASS: Owner access revoked after database role change"
  );
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  try {
    if (roleChanged && userId) {
      const restore = await client
        .db(process.env.DB_NAME)
        .collection("user")
        .updateOne(
          { _id: userId, role: "customer" },
          { $set: { role: "owner" } }
        );

      console.log(
        "Owner role restored:",
        restore.modifiedCount === 1
      );

      if (restore.modifiedCount !== 1) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error("Role restoration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}