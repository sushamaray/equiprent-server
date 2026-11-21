import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_OWNER_2_EMAIL;
const password = process.env.TEST_OWNER_2_PASSWORD;

const equipmentId = "6b01bb4525ce461ff7cfe418";
const originalPrice = 1000;

if (!baseURL || !email || !password) {
  console.error("Missing second Owner test configuration");
  process.exit(1);
}

try {
  // Step 1: Login as Owner B
  const loginResponse = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.CLIENT_URL,
    },
    body: JSON.stringify({ email, password }),
  });

  console.log("Owner B login status:", loginResponse.status);

  if (!loginResponse.ok) {
    throw new Error("Owner B login failed");
  }

  const sessionCookie = loginResponse.headers.get("set-cookie")?.split(";")[0];

  if (!sessionCookie) {
    throw new Error("Session cookie missing");
  }

  // Step 2: Generate JWT
  const tokenResponse = await fetch(`${baseURL}/api/auth/token`, {
    headers: {
      Cookie: sessionCookie,
      Origin: process.env.CLIENT_URL,
    },
  });

  console.log("JWT status:", tokenResponse.status);

  if (!tokenResponse.ok) {
    throw new Error("JWT generation failed");
  }

  const { token } = await tokenResponse.json();

  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new Error("Invalid JWT");
  }

  // Step 3: Verify original equipment price
  const beforeResponse = await fetch(`${baseURL}/api/equipment/${equipmentId}`);

  const beforeData = await beforeResponse.json();

  if (
    beforeResponse.status !== 200 ||
    beforeData.equipment?.pricePerDay !== originalPrice
  ) {
    throw new Error("Equipment initial state mismatch");
  }

  // Step 4: Owner B attempts to update Owner A's equipment
  const updateResponse = await fetch(
    `${baseURL}/api/equipment/${equipmentId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        pricePerDay: 9999,
      }),
    },
  );

  console.log("Cross-owner update status:", updateResponse.status);

  const updateData = await updateResponse.json();

  if (updateResponse.status !== 404 || updateData.success !== false) {
    throw new Error("Cross-owner update was not correctly denied");
  }

  console.log("PASS: Owner B blocked from updating Owner A equipment");

  // Step 5: Verify equipment price remains unchanged
  const afterResponse = await fetch(`${baseURL}/api/equipment/${equipmentId}`);

  const afterData = await afterResponse.json();

  if (
    afterResponse.status === 200 &&
    afterData.equipment?.pricePerDay === originalPrice
  ) {
    console.log("PASS: Equipment price remained unchanged");
  } else {
    throw new Error("Equipment data changed unexpectedly");
  }
  // Step 6: Owner B cannot delete Owner A equipment
  const deleteResponse = await fetch(
    `${baseURL}/api/equipment/${equipmentId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  console.log("Cross-owner delete status:", deleteResponse.status);

  const deleteData = await deleteResponse.json();

  if (deleteResponse.status !== 404 || deleteData.success !== false) {
    throw new Error("Cross-owner delete was not correctly denied");
  }

  console.log("PASS: Owner B blocked from deleting Owner A equipment");

  // Step 7: Confirm equipment still exists
  const verifyResponse = await fetch(`${baseURL}/api/equipment/${equipmentId}`);

  const verifyData = await verifyResponse.json();

  if (
    verifyResponse.status === 200 &&
    verifyData.equipment?.pricePerDay === originalPrice &&
    verifyData.equipment?.availability === true
  ) {
    console.log("PASS: Equipment remains available and unchanged");
  } else {
    throw new Error("Equipment changed after unauthorized delete attempt");
  }
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
}