
import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const clientURL = process.env.CLIENT_URL;

const email = process.env.TEST_OWNER_EMAIL;
const password = process.env.TEST_OWNER_PASSWORD;

if (!baseURL || !clientURL || !email || !password) {
  console.error("Missing Owner test configuration");
  process.exit(1);
}

let equipmentId = null;
let token = null;

const apiRequest = async (path, options = {}) => {
  const response = await fetch(`${baseURL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json();

  return {
    status: response.status,
    data,
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

try {
  // Step 1: Owner login
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

  assert(loginResponse.ok, "Owner login failed");

  const cookie = loginResponse.headers
    .get("set-cookie")
    ?.split(";")[0];

  assert(cookie, "Session cookie missing");

  // Step 2: Generate JWT
  const tokenResponse = await fetch(
    `${baseURL}/api/auth/token`,
    {
      headers: {
        Cookie: cookie,
        Origin: clientURL,
      },
    }
  );

  assert(tokenResponse.ok, "JWT generation failed");

  token = (await tokenResponse.json()).token;

  assert(
    typeof token === "string" &&
      token.split(".").length === 3,
    "Invalid JWT"
  );

  console.log("PASS: Owner authenticated");

  // Step 3: Create temporary Daily equipment
  const createResult = await apiRequest(
    "/api/equipment",
    {
      method: "POST",
      body: JSON.stringify({
        name: "Temporary Rental Pricing Test",
        description:
          "Temporary equipment for pricing compatibility testing",
        category: "Photography",
        location: "Dhaka",
        image: "https://example.com/pricing-test.jpg",
        rentalType: "daily",
        pricePerDay: 1000,
        availableQuantity: 1,
      }),
    }
  );

  assert(
    createResult.status === 201 &&
      createResult.data.success === true &&
      createResult.data.equipment?._id,
    "Temporary equipment creation failed"
  );

  equipmentId = String(
    createResult.data.equipment._id
  );

  console.log("PASS: Temporary equipment created");

  // Step 4: Reject Daily -> Weekly without a new price
  const invalidWeekly = await apiRequest(
    `/api/equipment/${equipmentId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        rentalType: "weekly",
      }),
    }
  );

  assert(
    invalidWeekly.status === 400 &&
      invalidWeekly.data.success === false,
    "Rental type changed without a new price"
  );

  console.log(
    "PASS: Daily to Weekly without price rejected"
  );

  // Step 5: Valid Daily -> Weekly update
  const validWeekly = await apiRequest(
    `/api/equipment/${equipmentId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        rentalType: "weekly",
        rentalPrice: 5000,
      }),
    }
  );

  assert(
    validWeekly.status === 200 &&
      validWeekly.data.success === true,
    "Valid Weekly pricing update failed"
  );

  console.log("PASS: Weekly pricing update accepted");

  // Step 6: Verify persisted Weekly price
  const weeklyListing = await apiRequest(
    "/api/equipment/my?page=1&limit=50"
  );

  assert(
    weeklyListing.status === 200,
    "Owner equipment listing failed"
  );

  const weeklyEquipment =
    weeklyListing.data.data?.find(
      (item) => String(item._id) === equipmentId
    );

  assert(
    weeklyEquipment?.rentalType === "weekly" &&
      weeklyEquipment.rentalPrice === 5000 &&
      weeklyEquipment.pricePerDay === undefined,
    "Weekly price was not stored correctly"
  );

  console.log(
    "PASS: Weekly price verified in MongoDB"
  );

  // Step 7: Reject Weekly -> Monthly without price
  const invalidMonthly = await apiRequest(
    `/api/equipment/${equipmentId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        rentalType: "monthly",
      }),
    }
  );

  assert(
    invalidMonthly.status === 400 &&
      invalidMonthly.data.success === false,
    "Monthly rental type changed without price"
  );

  console.log(
    "PASS: Weekly to Monthly without price rejected"
  );

  // Step 8: Valid Weekly -> Monthly
  const validMonthly = await apiRequest(
    `/api/equipment/${equipmentId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        rentalType: "monthly",
        rentalPrice: 15000,
      }),
    }
  );

  assert(
    validMonthly.status === 200 &&
      validMonthly.data.success === true,
    "Valid Monthly pricing update failed"
  );

  console.log(
    "PASS: Monthly pricing update accepted"
  );

  // Step 9: Verify persisted Monthly price
  const monthlyListing = await apiRequest(
    "/api/equipment/my?page=1&limit=50"
  );

  const monthlyEquipment =
    monthlyListing.data.data?.find(
      (item) => String(item._id) === equipmentId
    );

  assert(
    monthlyEquipment?.rentalType === "monthly" &&
      monthlyEquipment.rentalPrice === 15000 &&
      monthlyEquipment.pricePerDay === undefined,
    "Monthly price was not stored correctly"
  );

  console.log(
    "PASS: Monthly price verified in MongoDB"
  );

  console.log(
    "Equipment Pricing Update Integration Test PASSED"
  );
} catch (error) {
  console.error(
    "Equipment Pricing Update Integration Test FAILED:",
    error.message
  );

  process.exitCode = 1;
} finally {
  // Soft-delete only the equipment created by this script.
  if (equipmentId && token) {
    try {
      const cleanup = await apiRequest(
        `/api/equipment/${equipmentId}`,
        {
          method: "DELETE",
        }
      );

      if (
        cleanup.status === 200 &&
        cleanup.data.success === true
      ) {
        console.log(
          "PASS: Temporary equipment cleaned up"
        );
      } else {
        console.error(
          "WARNING: Temporary equipment cleanup failed"
        );
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(
        "WARNING: Cleanup error:",
        error.message
      );
      process.exitCode = 1;
    }
  }
}