import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

if (!baseURL || !email || !password) {
  console.error("Missing test configuration");
  process.exit(1);
}

try {
  // Step 1: Login
  const loginResponse = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.CLIENT_URL,
    },
    body: JSON.stringify({ email, password }),
  });

  console.log("Login status:", loginResponse.status);

  if (!loginResponse.ok) {
    throw new Error("Login failed");
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

  console.log("JWT endpoint status:", tokenResponse.status);

  if (!tokenResponse.ok) {
    throw new Error("JWT generation failed");
  }

  const tokenData = await tokenResponse.json();
  const token = tokenData.token;

  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new Error("Invalid JWT structure");
  }

  console.log("PASS: JWT generated successfully");

  // Step 3: Access protected API
  const protectedResponse = await fetch(`${baseURL}/api/protected`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Protected API status:", protectedResponse.status);

  const protectedData = await protectedResponse.json();

  // Step 4: Verify authenticated user
  if (
    protectedResponse.status === 200 &&
    protectedData.success === true &&
    protectedData.userId === loginData.user.id
  ) {
    console.log("PASS: Valid JWT accepted and user ID verified");
  } else {
    console.error("FAIL: Protected API authentication failed");
    process.exitCode = 1;
  }

  // Step 5: Test database-backed Customer RBAC
  const customerResponse = await fetch(`${baseURL}/api/customer/test`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Customer API status:", customerResponse.status);

  const customerData = await customerResponse.json();

  if (
    customerResponse.status === 200 &&
    customerData.success === true &&
    customerData.role === "customer" &&
    customerData.userId === loginData.user.id
  ) {
    console.log("PASS: Customer role verified from MongoDB");
  } else {
    console.error("FAIL: Customer RBAC verification failed");

    console.error("Response status:", customerResponse.status);

    console.error("Response message:", customerData.message || "Unknown error");
    process.exitCode = 1;
  }
  // Step 6: Customer must not access Owner-only API
  const ownerResponse = await fetch(`${baseURL}/api/owner/test`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Customer accessing Owner API status:", ownerResponse.status);

  const ownerData = await ownerResponse.json();

  if (ownerResponse.status === 403 && ownerData.success === false) {
    console.log("PASS: Customer blocked from Owner-only API");
  } else {
    console.error("FAIL: Owner-only API authorization failed");
    process.exitCode = 1;
  }

  // Step 7: Customer must not access Admin-only API
  const adminResponse = await fetch(`${baseURL}/api/admin/test`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Customer accessing Admin API status:", adminResponse.status);

  const adminData = await adminResponse.json();

  if (adminResponse.status === 403 && adminData.success === false) {
    console.log("PASS: Customer blocked from Admin-only API");
  } else {
    console.error("FAIL: Admin-only API authorization failed");
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Test failed:", error.message);
  process.exitCode = 1;
}