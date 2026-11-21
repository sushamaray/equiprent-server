import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const clientURL = process.env.CLIENT_URL;

const bookingId = "6b01ef10f8e331aa0b846273";

if (!baseURL || !email || !password || !clientURL) {
  console.error("Missing Customer test configuration");
  process.exit(1);
}

try {
  // Step 1: Authenticate Customer
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

  console.log("Customer login status:", loginResponse.status);

  if (!loginResponse.ok) {
    throw new Error("Customer login failed");
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

  console.log("PASS: Customer authenticated");

  // Step 3: Reject malformed Booking ID
  const invalidIdResponse = await fetch(
    `${baseURL}/api/bookings/invalid-id/cancel`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log(
    "Invalid Booking ID status:",
    invalidIdResponse.status
  );

  const invalidIdData = await invalidIdResponse.json();

  if (
    invalidIdResponse.status !== 400 ||
    invalidIdData.success !== false
  ) {
    throw new Error(
      "Invalid Booking ID was not rejected"
    );
  }

  console.log(
    "PASS: Invalid Booking ID rejected"
  );

  // Step 4: Reject non-existent Booking ID
  const missingResponse = await fetch(
    `${baseURL}/api/bookings/507f1f77bcf86cd799439011/cancel`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log(
    "Non-existent Booking ID status:",
    missingResponse.status
  );

  const missingData = await missingResponse.json();

  if (
    missingResponse.status !== 404 ||
    missingData.success !== false
  ) {
    throw new Error(
      "Non-existent Booking ID was not rejected"
    );
  }

  console.log(
    "PASS: Non-existent Booking ID rejected"
  );

  // Step 5: Verify existing booking still exists
  const listResponse = await fetch(
    `${baseURL}/api/bookings/my?page=1&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!listResponse.ok) {
    throw new Error("Customer booking listing failed");
  }

  const listData = await listResponse.json();

  const existingBooking = listData.data?.find(
    (booking) =>
      String(booking._id) === bookingId
  );

  if (
    !existingBooking ||
    existingBooking.status !== "pending"
  ) {
    throw new Error(
      "Existing test booking was unexpectedly changed"
    );
  }

  console.log(
    "PASS: Existing pending booking remains unchanged"
  );

  console.log(
    "Booking Cancellation Security Test PASSED"
  );
} catch (error) {
  console.error(
    "Booking Cancellation Security Test FAILED:",
    error.message
  );

  process.exitCode = 1;
}