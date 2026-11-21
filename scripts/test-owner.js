import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_OWNER_EMAIL;
const password = process.env.TEST_OWNER_PASSWORD;

if (!baseURL || !email || !password) {
  console.error("Missing Owner test configuration");
  process.exit(1);
}

try {
  // Step 1: Login as Owner
  const loginResponse = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.CLIENT_URL,
    },
    body: JSON.stringify({ email, password }),
  });

  console.log("Owner login status:", loginResponse.status);

  if (!loginResponse.ok) {
    throw new Error("Owner login failed");
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

  // Step 3: Access Owner-only API
  const ownerResponse = await fetch(`${baseURL}/api/owner/test`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Owner API status:", ownerResponse.status);

  const ownerData = await ownerResponse.json();

  if (
    ownerResponse.status === 200 &&
    ownerData.success === true &&
    ownerData.role === "owner" &&
    ownerData.userId === loginData.user.id
  ) {
    console.log("PASS: Owner successfully accessed Owner-only API");
  } else {
    console.error("FAIL: Owner authorization failed");
    console.error(
      "Response:",
      ownerResponse.status,
      ownerData.message || "Unexpected result",
    );
    process.exitCode = 1;
  }
  // Step 4: Owner must not access Admin-only API
  const adminResponse = await fetch(`${baseURL}/api/admin/test`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Owner accessing Admin API status:", adminResponse.status);

  const adminData = await adminResponse.json();

  if (adminResponse.status === 403 && adminData.success === false) {
    console.log("PASS: Owner blocked from Admin-only API");
  } else {
    console.error("FAIL: Admin-only API access restriction failed");
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Test failed:", error.message);
  process.exitCode = 1;
}