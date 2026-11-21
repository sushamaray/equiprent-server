import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;

if (!baseURL || !email || !password) {
  console.error("Missing Admin test configuration");
  process.exit(1);
}

try {
  // Step 1: Login as Admin
  const loginResponse = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.CLIENT_URL,
    },
    body: JSON.stringify({ email, password }),
  });

  console.log("Admin login status:", loginResponse.status);

  if (!loginResponse.ok) {
    throw new Error("Admin login failed");
  }

  const loginData = await loginResponse.json();

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

  const tokenData = await tokenResponse.json();
  const token = tokenData.token;

  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new Error("Invalid JWT");
  }

  // Step 3: Access Admin-only API
  const adminResponse = await fetch(`${baseURL}/api/admin/test`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Admin API status:", adminResponse.status);

  const adminData = await adminResponse.json();

  if (
    adminResponse.status === 200 &&
    adminData.success === true &&
    adminData.role === "admin" &&
    adminData.userId === loginData.user.id
  ) {
    console.log("PASS: Admin successfully accessed Admin-only API");
  } else {
    console.error("FAIL: Admin authorization failed");
    console.error(
      "Response:",
      adminResponse.status,
      adminData.message || "Unexpected result",
    );
    process.exitCode = 1;
  }
  // Step 4: Admin approves pending equipment
  const equipmentId = "6b01bb4525ce461ff7cfe418";

  const approveResponse = await fetch(
    `${baseURL}/api/equipment/${equipmentId}/approve`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  console.log("Admin equipment approval status:", approveResponse.status);

  const approveData = await approveResponse.json();

  if (
    approveResponse.status !== 200 ||
    approveData.success !== true ||
    approveData.status !== "approved"
  ) {
    throw new Error(
      `Equipment approval failed: ${
        approveData.message || "Unexpected response"
      }`,
    );
  }

  console.log("PASS: Admin approved equipment");

  // Step 5: Verify approved equipment is publicly visible
  const detailsResponse = await fetch(
    `${baseURL}/api/equipment/${equipmentId}`,
  );

  console.log("Approved equipment details status:", detailsResponse.status);

  const detailsData = await detailsResponse.json();

  if (
    detailsResponse.status !== 200 ||
    detailsData.success !== true ||
    detailsData.equipment?.pricePerDay !== 1000
  ) {
    throw new Error("Approved equipment public visibility verification failed");
  }

  console.log("PASS: Approved equipment visible in public API");
  console.log("PASS: Equipment rental price remains 1000");

  // Step 6: Admin rejects separate pending equipment
  const rejectionEquipmentId = "6b01d58d629daf2059f2e9fd";

  const rejectResponse = await fetch(
    `${baseURL}/api/equipment/${rejectionEquipmentId}/reject`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  console.log("Admin equipment rejection status:", rejectResponse.status);

  const rejectData = await rejectResponse.json();

  if (
    rejectResponse.status !== 200 ||
    rejectData.success !== true ||
    rejectData.status !== "rejected"
  ) {
    throw new Error(
      `Admin equipment rejection failed: ${
        rejectData.message || "Unexpected response"
      }`,
    );
  }

  console.log("PASS: Admin rejected equipment");

  // Step 7: Rejected equipment must be hidden from public
  const rejectedDetailsResponse = await fetch(
    `${baseURL}/api/equipment/${rejectionEquipmentId}`,
  );

  console.log(
    "Rejected equipment public details status:",
    rejectedDetailsResponse.status,
  );

  if (rejectedDetailsResponse.status !== 404) {
    throw new Error("Rejected equipment is incorrectly visible to public");
  }

  console.log("PASS: Rejected equipment hidden from public API");
} catch (error) {
  console.error("Test failed:", error.message);
  process.exitCode = 1;
}