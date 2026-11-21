
import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const clientURL = process.env.CLIENT_URL;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

const equipmentId = "6b01bb4525ce461ff7cfe418";

const bookingData = {
  equipmentId,
  startDate: "2027-01-10",
  endDate: "2027-01-15",
  quantity: 1,
};

if (!baseURL || !clientURL || !email || !password) {
  console.error("Missing Customer test configuration");
  process.exit(1);
}

try {
  // Step 1: Login as Customer
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
    "Customer login status:",
    loginResponse.status
  );

  if (!loginResponse.ok) {
    throw new Error("Customer login failed");
  }

  const loginData = await loginResponse.json();

  const sessionCookie = loginResponse.headers
    .get("set-cookie")
    ?.split(";")[0];

  if (!sessionCookie) {
    throw new Error("Session cookie missing");
  }

  // Step 2: Generate Customer JWT
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

  // Step 3: Create pending booking
  const createResponse = await fetch(
    `${baseURL}/api/bookings`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(bookingData),
    }
  );

  console.log(
    "Booking creation status:",
    createResponse.status
  );

  const createData = await createResponse.json();

  if (
    createResponse.status !== 201 ||
    createData.success !== true ||
    !createData.booking?._id
  ) {
    throw new Error(
      createData.message || "Booking creation failed"
    );
  }

  const booking = createData.booking;

  console.log("PASS: Booking created successfully");

  // Step 4: Verify booking information
  const checks = [
    [
      "Correct Customer",
      String(booking.customerId) === loginData.user.id,
    ],
    [
      "Correct equipment",
      String(booking.equipmentId) === equipmentId,
    ],
    [
      "Rental duration is 5 days",
      booking.rentalDays === 5,
    ],
    [
      "Total price is 5000",
      booking.totalPrice === 5000,
    ],
    [
      "Booking is pending",
      booking.status === "pending",
    ],
    [
      "Payment remains unpaid",
      booking.paymentStatus === "unpaid",
    ],
  ];

  for (const [label, passed] of checks) {
    if (!passed) {
      throw new Error(`FAIL: ${label}`);
    }

    console.log(`PASS: ${label}`);
  }

  // Step 5: Verify booking through Customer listing
  const listingResponse = await fetch(
    `${baseURL}/api/bookings/my?page=1&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!listingResponse.ok) {
    throw new Error("Customer listing failed");
  }

  const listingData = await listingResponse.json();

  const savedBooking = listingData.data?.find(
    (item) => String(item._id) === String(booking._id)
  );

  if (!savedBooking) {
    throw new Error(
      "Created booking missing from Customer listing"
    );
  }

  console.log("PASS: Booking saved in MongoDB");

  // Print only the booking ID, never authentication details
  console.log("NEW_BOOKING_ID:", String(booking._id));

  console.log(
    "Booking Creation for Rejection Test PASSED"
  );
} catch (error) {
  console.error(
    "Booking Creation for Rejection Test FAILED:",
    error.message
  );

  process.exitCode = 1;
}