
import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const clientURL = process.env.CLIENT_URL;

const equipmentId = "6b01bb4525ce461ff7cfe418";

const bookingData = {
  equipmentId,
  startDate: "2027-01-10",
  endDate: "2027-01-15",
  quantity: 1,
};

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

  // Step 3: Check that test dates are initially free
  const beforeResponse = await fetch(
    `${baseURL}/api/bookings/my?page=1&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!beforeResponse.ok) {
    throw new Error("Could not check existing bookings");
  }

  const beforeData = await beforeResponse.json();

  const existingTestBookings = beforeData.data.filter(
    (booking) =>
      String(booking.equipmentId) === equipmentId &&
      ["pending", "confirmed"].includes(booking.status) &&
      booking.startDate < bookingData.endDate &&
      booking.endDate > bookingData.startDate
  );

  if (existingTestBookings.length > 0) {
    throw new Error(
      "Test dates already have a Customer booking. Use unused dates."
    );
  }

  console.log("PASS: No existing Customer test booking");

  // Step 4: Prepare one booking request function
  const sendBookingRequest = async (requestName) => {
    const response = await fetch(
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

    const data = await response.json();

    return {
      requestName,
      status: response.status,
      data,
    };
  };

  // Step 5: Send both requests concurrently
  console.log("Sending two booking requests concurrently...");

  const results = await Promise.all([
    sendBookingRequest("Booking A"),
    sendBookingRequest("Booking B"),
  ]);

  // Step 6: Print HTTP statuses
  for (const result of results) {
    console.log(
      `${result.requestName} status:`,
      result.status
    );

    if (result.status !== 201) {
      console.log(
        `${result.requestName} message:`,
        result.data.message || "Unknown error"
      );
    }
  }

  // Step 7: Count success and conflict responses
  const successful = results.filter(
    (result) => result.status === 201
  );

  const conflicts = results.filter(
    (result) => result.status === 409
  );

  console.log(
    "Successful bookings:",
    successful.length
  );

  console.log(
    "Rejected bookings:",
    conflicts.length
  );

  if (
    successful.length !== 1 ||
    conflicts.length !== 1
  ) {
    throw new Error(
      "Expected exactly one 201 and one 409 response"
    );
  }

  console.log(
    "PASS: Concurrent booking requests respected stock limit"
  );

  // Step 8: Verify successful booking details
  const createdBooking = successful[0].data.booking;

  if (
    !createdBooking?._id ||
    createdBooking.rentalDays !== 5 ||
    createdBooking.quantity !== 1 ||
    createdBooking.pricePerDay !== 1000 ||
    createdBooking.totalPrice !== 5000 ||
    createdBooking.status !== "pending" ||
    createdBooking.paymentStatus !== "unpaid"
  ) {
    throw new Error(
      "Created booking has incorrect details"
    );
  }

  console.log("PASS: Booking data and price verified");

  // Step 9: Verify saved booking via Customer API
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

  const savedBooking = listData.data.find(
    (booking) =>
      String(booking._id) ===
      String(createdBooking._id)
  );

  if (!savedBooking) {
    throw new Error(
      "Successful booking not found in MongoDB-backed listing"
    );
  }

  console.log("PASS: Booking persisted in MongoDB");

  console.log(
    "Concurrent Booking Integration Test PASSED"
  );
} catch (error) {
  console.error(
    "Concurrent Booking Integration Test FAILED:",
    error.message
  );

  process.exitCode = 1;
}