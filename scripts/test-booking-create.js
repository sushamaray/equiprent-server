
import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const clientURL = process.env.CLIENT_URL;

const equipmentId = "6b01bb4525ce461ff7cfe418";

if (!baseURL || !email || !password || !clientURL) {
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
      body: JSON.stringify({ email, password }),
    }
  );

  console.log("Customer login status:", loginResponse.status);

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

  // Step 3: Create booking with test rental dates
  const bookingData = {
    equipmentId,
    startDate: "2026-12-01",
    endDate: "2026-12-05",
    quantity: 1,
  };

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

  console.log("PASS: Booking created successfully");

  const booking = createData.booking;

  // Step 4: Verify trusted booking details
  const checks = [
    [
      "Booking belongs to Customer",
      String(booking.customerId) === loginData.user.id,
    ],
    [
      "Correct equipment ID",
      String(booking.equipmentId) === equipmentId,
    ],
    [
      "Rental duration is 4 days",
      booking.rentalDays === 4,
    ],
    [
      "Daily rental price is 1000",
      booking.pricePerDay === 1000,
    ],
    [
      "Total price is 4000",
      booking.totalPrice === 4000,
    ],
    [
      "Booking status is pending",
      booking.status === "pending",
    ],
    [
      "Payment status is unpaid",
      booking.paymentStatus === "unpaid",
    ],
  ];

  for (const [label, passed] of checks) {
    if (!passed) {
      throw new Error(`FAIL: ${label}`);
    }

    console.log(`PASS: ${label}`);
  }

  // Step 5: Verify booking in Customer listing
  const listResponse = await fetch(
    `${baseURL}/api/bookings/my?page=1&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const listData = await listResponse.json();

  const savedBooking = listData.data?.find(
    (item) => String(item._id) === String(booking._id)
  );

  if (
    listResponse.status !== 200 ||
    !savedBooking
  ) {
    throw new Error(
      "Created booking not found in Customer listing"
    );
  }

  console.log("PASS: Booking saved in MongoDB");
  console.log("Booking Creation Integration Test PASSED");
} catch (error) {
  console.error(
    "Booking Creation Integration Test FAILED:",
    error.message
  );
  process.exitCode = 1;
}