
import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const clientURL = process.env.CLIENT_URL;
const email = process.env.TEST_OWNER_EMAIL;
const password = process.env.TEST_OWNER_PASSWORD;

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

  const loginData = await loginResponse.json();

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
    roleData.role !== "owner" ||
    roleData.userId !== loginData.user.id
  ) {
    throw new Error("Owner role verification failed");
  }

  console.log("PASS: Owner role verified");

  // Step 4: Fetch Owner bookings
  const bookingsResponse = await fetch(
    `${baseURL}/api/bookings/owner?page=1&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log(
    "Owner bookings API status:",
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
      "Owner booking listing failed"
    );
  }

  console.log("PASS: Owner booking listing works");

  // Step 5: Verify Owner isolation
  const allBelongToOwner = bookingsData.data.every(
    (booking) =>
      String(booking.ownerId) === loginData.user.id
  );

  if (!allBelongToOwner) {
    throw new Error(
      "Another Owner's booking appeared in the list"
    );
  }

  console.log("PASS: All bookings belong to authenticated Owner");

  // Step 6: Verify pagination metadata
  const pagination = bookingsData.pagination;

  if (
    pagination?.page !== 1 ||
    pagination?.limit !== 50 ||
    !Number.isInteger(pagination.total) ||
    !Number.isInteger(pagination.totalPages) ||
    bookingsData.data.length > 50
  ) {
    throw new Error("Invalid Owner booking pagination");
  }

  console.log("PASS: Owner booking pagination verified");

  // Step 7: Verify known equipment bookings
  const expectedEquipmentId =
    "6b01bb4525ce461ff7cfe418";

  const knownEquipmentBookings =
    bookingsData.data.filter(
      (booking) =>
        String(booking.equipmentId) ===
        expectedEquipmentId
    );

  console.log(
    "Known equipment bookings:",
    knownEquipmentBookings.length
  );

  if (knownEquipmentBookings.length === 0) {
    throw new Error(
      "Expected equipment bookings missing"
    );
  }

  console.log(
    "PASS: Owner can view bookings for own equipment"
  );

  console.log(
    "Owner Booking Listing Integration Test PASSED"
  );
} catch (error) {
  console.error(
    "Owner Booking Listing Integration Test FAILED:",
    error.message
  );

  process.exitCode = 1;
}