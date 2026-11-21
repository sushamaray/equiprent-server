
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
        Origin: process.env.CLIENT_URL,
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

  // Step 3: Access Admin-only API
  const adminResponse = await fetch(
    `${baseURL}/api/admin/test`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log("Admin API status:", adminResponse.status);

  const adminData = await adminResponse.json();

  if (
    adminResponse.status === 200 &&
    adminData.success === true &&
    adminData.role === "admin" &&
    adminData.userId === loginData.user.id
  ) {
    console.log(
      "PASS: Admin successfully accessed Admin-only API"
    );
  } else {
    console.error("FAIL: Admin authorization failed");
    console.error(
      "Response:",
      adminResponse.status,
      adminData.message || "Unexpected result"
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Test failed:", error.message);
  process.exitCode = 1;
}