
import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const clientURL = process.env.CLIENT_URL;

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

  console.log("PASS: Customer authentication successful");

  // Step 3: Confirm Customer role
  const roleResponse = await fetch(
    `${baseURL}/api/customer/test`,
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
    roleData.role !== "customer" ||
    roleData.userId !== loginData.user.id
  ) {
    throw new Error("Customer role verification failed");
  }

  console.log("PASS: Customer role verified");

  // Step 4: Get Customer bookings
  const bookingsResponse = await fetch(
    `${baseURL}/api/bookings/my?page=1&limit=10`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log(
    "Customer bookings API status:",
    bookingsResponse.status
  );

  const bookingsData = await bookingsResponse.json();

  if (
    bookingsResponse.status !== 200 ||
    bookingsData.success !== true ||
    !Array.isArray(bookingsData.data)
  ) {
    throw new Error(
      bookingsData.message ||
      "Customer booking listing failed"
    );
  }

  console.log("PASS: Customer booking listing works");

  // Step 5: Verify booking ownership
  const allBelongToCustomer = bookingsData.data.every(
    (booking) =>
      String(booking.customerId) === loginData.user.id
  );

  if (!allBelongToCustomer) {
    throw new Error(
      "Another Customer's booking appeared in the list"
    );
  }

  console.log("PASS: Booking ownership verified");

  // Step 6: Verify pagination
  const pagination = bookingsData.pagination;

  if (
    pagination?.page !== 1 ||
    pagination?.limit !== 10 ||
    !Number.isInteger(pagination.total) ||
    !Number.isInteger(pagination.totalPages) ||
    bookingsData.data.length > 10
  ) {
    throw new Error("Invalid booking pagination metadata");
  }

  console.log("PASS: Booking pagination verified");

  console.log(
    "Bookings returned:",
    bookingsData.data.length
  );

  console.log("Customer Booking List Test PASSED");
} catch (error) {
  console.error("Customer Booking List Test FAILED:", error.message);
  process.exitCode = 1;
}