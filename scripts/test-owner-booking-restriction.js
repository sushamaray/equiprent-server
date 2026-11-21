
import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const clientURL = process.env.CLIENT_URL;
const email = process.env.TEST_OWNER_EMAIL;
const password = process.env.TEST_OWNER_PASSWORD;

const bookingId = "6b01ef10f8e331aa0b846273";

if (!baseURL || !clientURL || !email || !password) {
  console.error("Missing Owner test configuration");
  process.exit(1);
}

try {
  // Step 1: Login as Owner
  const loginResponse = await fetch(
    `${baseURL}/api/auth/sign-in/email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: clientURL,
      },
      body: JSON.stringify({
        email,
        password,
      }),
    }
  );

  console.log(
    "Owner login status:",
    loginResponse.status
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

  // Step 2: Generate Owner JWT
  const tokenResponse = await fetch(
    `${baseURL}/api/auth/token`,
    {
      headers: {
        Cookie: sessionCookie,
        Origin: clientURL,
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

  console.log("PASS: Owner authenticated");

  // Step 3: Verify Owner role
  const roleResponse = await fetch(
    `${baseURL}/api/owner/test`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const roleData = await roleResponse.json();

  if (
    roleResponse.status !== 200 ||
    roleData.success !== true ||
    roleData.role !== "owner"
  ) {
    throw new Error("Owner role verification failed");
  }

  console.log("PASS: Owner role verified");

  // Step 4: Attempt to cancel Customer booking
  const cancelResponse = await fetch(
    `${baseURL}/api/bookings/${bookingId}/cancel`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log(
    "Owner cancellation attempt status:",
    cancelResponse.status
  );

  const cancelData = await cancelResponse.json();

  if (
    cancelResponse.status !== 403 ||
    cancelData.success !== false
  ) {
    throw new Error(
      "Owner booking cancellation restriction failed"
    );
  }

  console.log(
    "PASS: Owner blocked from cancelling Customer booking"
  );

  console.log(
    "Owner Booking Cancellation Security Test PASSED"
  );
} catch (error) {
  console.error(
    "Owner Booking Cancellation Security Test FAILED:",
    error.message
  );

  process.exitCode = 1;
}