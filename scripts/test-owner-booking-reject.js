
import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const clientURL = process.env.CLIENT_URL;
const email = process.env.TEST_OWNER_EMAIL;
const password = process.env.TEST_OWNER_PASSWORD;

const bookingId = "6b01faec364ddf5dd3f99a16";

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

  // Step 3: Reject pending booking
  const rejectResponse = await fetch(
    `${baseURL}/api/bookings/${bookingId}/reject`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const rejectData = await rejectResponse.json();

  console.log(
    "Booking rejection status:",
    rejectResponse.status
  );

  if (
    rejectResponse.status !== 200 ||
    rejectData.success !== true ||
    rejectData.booking?.status !== "rejected" ||
    rejectData.booking?.bookingId !== bookingId
  ) {
    throw new Error(
      rejectData.message || "Booking rejection failed"
    );
  }

  console.log("PASS: Owner rejected booking");

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
    (booking) => String(booking._id) === bookingId
  );

  if (!updatedBooking) {
    throw new Error(
      "Rejected booking missing from Owner listing"
    );
  }

  if (updatedBooking.status !== "rejected") {
    throw new Error(
      "Booking status was not updated correctly"
    );
  }

  if (updatedBooking.paymentStatus !== "unpaid") {
    throw new Error(
      "Rejection unexpectedly changed payment status"
    );
  }

  if (!updatedBooking.rejectedAt) {
    throw new Error(
      "Rejection timestamp was not saved"
    );
  }

  console.log("PASS: Booking status is rejected");
  console.log("PASS: Payment status remains unpaid");
  console.log("PASS: Rejection timestamp saved");

  console.log(
    "Owner Booking Rejection Integration Test PASSED"
  );
} catch (error) {
  console.error(
    "Owner Booking Rejection Integration Test FAILED:",
    error.message
  );

  process.exitCode = 1;
}