
import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const clientURL = process.env.CLIENT_URL;
const email = process.env.TEST_OWNER_EMAIL;
const password = process.env.TEST_OWNER_PASSWORD;

const bookingId = "6b01ea04ba0c9d99e0d5695d";

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

  console.log("Owner login status:", loginResponse.status);

  if (!loginResponse.ok) {
    throw new Error("Owner login failed");
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

  console.log("PASS: Owner authenticated");

  // Step 3: Confirm booking
  const confirmResponse = await fetch(
    `${baseURL}/api/bookings/${bookingId}/confirm`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const confirmData = await confirmResponse.json();

  console.log(
    "Booking confirmation status:",
    confirmResponse.status
  );

  if (
    confirmResponse.status !== 200 ||
    confirmData.success !== true ||
    confirmData.booking?.status !== "confirmed" ||
    confirmData.booking?.bookingId !== bookingId
  ) {
    throw new Error(
      confirmData.message ||
      "Booking confirmation failed"
    );
  }

  console.log("PASS: Owner confirmed booking");

  // Step 4: Verify booking through Owner Listing API
  const listingResponse = await fetch(
    `${baseURL}/api/bookings/owner?page=1&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!listingResponse.ok) {
    throw new Error("Failed to retrieve Owner bookings");
  }

  const listingData = await listingResponse.json();

  const updatedBooking = listingData.data?.find(
    (booking) => booking._id === bookingId
  );

  if (!updatedBooking) {
    throw new Error(
      "Confirmed booking missing from Owner listing"
    );
  }

  if (updatedBooking.status !== "confirmed") {
    throw new Error(
      "Booking status was not updated correctly"
    );
  }

  if (updatedBooking.paymentStatus !== "unpaid") {
    throw new Error(
      "Confirmation unexpectedly changed payment status"
    );
  }

  console.log("PASS: Booking status is confirmed");
  console.log("PASS: Payment status remains unpaid");

  console.log(
    "Owner Booking Confirmation Integration Test PASSED"
  );
} catch (error) {
  console.error(
    "Owner Booking Confirmation Integration Test FAILED:",
    error.message
  );

  process.exitCode = 1;
}