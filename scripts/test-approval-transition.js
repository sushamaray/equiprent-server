
import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;

const equipmentId = "6b01bb4525ce461ff7cfe418";

if (!baseURL || !email || !password) {
  console.error("Missing Admin test configuration");
  process.exit(1);
}

try {
  // Step 1: Login as Admin
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

  console.log("Admin login status:", loginResponse.status);

  if (!loginResponse.ok) {
    throw new Error("Admin login failed");
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

  if (
    typeof token !== "string" ||
    token.split(".").length !== 3
  ) {
    throw new Error("Invalid JWT");
  }

  // Step 3: Attempt to approve already approved equipment
  const approveResponse = await fetch(
    `${baseURL}/api/equipment/${equipmentId}/approve`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log(
    "Repeated approval status:",
    approveResponse.status
  );

  const approveData = await approveResponse.json();

  if (
    approveResponse.status !== 404 ||
    approveData.success !== false
  ) {
    throw new Error(
      "Repeated approval was not correctly blocked"
    );
  }

  console.log(
    "PASS: Already approved equipment cannot be approved again"
  );

  // Step 4: Verify equipment remains publicly available
  const detailsResponse = await fetch(
    `${baseURL}/api/equipment/${equipmentId}`
  );

  const detailsData = await detailsResponse.json();

  if (
    detailsResponse.status !== 200 ||
    detailsData.equipment?.pricePerDay !== 1000
  ) {
    throw new Error(
      "Approved equipment is no longer publicly available"
    );
  }

  console.log(
    "PASS: Approved equipment remains publicly available"
  );

  // Step 5: Rejected equipment cannot be approved
  const rejectedEquipmentId = "6b01d58d629daf2059f2e9fd";

  const rejectedApprovalResponse = await fetch(
    `${baseURL}/api/equipment/${rejectedEquipmentId}/approve`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log(
    "Rejected equipment approval attempt status:",
    rejectedApprovalResponse.status
  );

  const rejectedApprovalData =
    await rejectedApprovalResponse.json();

  if (
    rejectedApprovalResponse.status !== 404 ||
    rejectedApprovalData.success !== false
  ) {
    throw new Error(
      "Rejected equipment was incorrectly allowed to be approved"
    );
  }

  console.log(
    "PASS: Rejected equipment cannot be approved"
  );

  // Step 6: Rejected equipment remains hidden from public
  const rejectedDetailsResponse = await fetch(
    `${baseURL}/api/equipment/${rejectedEquipmentId}`
  );

  console.log(
    "Rejected equipment public details status:",
    rejectedDetailsResponse.status
  );

  if (rejectedDetailsResponse.status !== 404) {
    throw new Error(
      "Rejected equipment became publicly visible"
    );
  }

  console.log(
    "PASS: Rejected equipment remains hidden from public"
  );
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
}