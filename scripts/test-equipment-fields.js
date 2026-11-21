
import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_OWNER_EMAIL;
const password = process.env.TEST_OWNER_PASSWORD;
const clientURL = process.env.CLIENT_URL;

if (!baseURL || !email || !password || !clientURL) {
  console.error("Missing Owner test configuration");
  process.exit(1);
}

let token = null;
let createdEquipmentId = null;
let hasFailed = false;

const check = (condition, message) => {
  if (condition) {
    console.log(`PASS: ${message}`);
  } else {
    console.error(`FAIL: ${message}`);
    hasFailed = true;
  }
};

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
  token = tokenData.token;

  if (
    typeof token !== "string" ||
    token.split(".").length !== 3
  ) {
    throw new Error("Invalid JWT");
  }

  console.log("PASS: Owner authentication successful");

  // Step 3: Prepare complete equipment data
  const equipmentData = {
    name: "Sony Alpha A7 IV - Fields Test",
    description:
      "Test camera for verifying equipment rental fields",
    category: "Camera",
    location: "Dhaka",
    pricePerDay: 1500,
    rentalType: "daily",
    availableQuantity: 3,
    brand: "Sony",
    model: "Alpha A7 IV",
    condition: "excellent",
    rentalTerms: "Valid ID required before rental",
    image: "https://example.com/sony-camera.jpg",
    availability: true,
  };

  // Step 4: Create equipment
  const createResponse = await fetch(
    `${baseURL}/api/equipment`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(equipmentData),
    }
  );

  console.log(
    "Equipment creation status:",
    createResponse.status
  );

  const createData = await createResponse.json();

  if (
    createResponse.status !== 201 ||
    createData.success !== true ||
    !createData.equipment?._id
  ) {
    throw new Error(
      `Equipment creation failed: ${
        createData.message || "Unexpected response"
      }`
    );
  }

  createdEquipmentId = createData.equipment._id;

  console.log("PASS: Equipment created successfully");

  check(
    createData.equipment.status === "pending",
    "New equipment status is pending"
  );

  check(
    String(createData.equipment.ownerId) ===
      loginData.user.id,
    "Equipment belongs to authenticated Owner"
  );

  // Step 5: Verify stored equipment through Owner API
  const myEquipmentResponse = await fetch(
    `${baseURL}/api/equipment/my?page=1&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!myEquipmentResponse.ok) {
    throw new Error("Owner equipment listing failed");
  }

  const myEquipmentData =
    await myEquipmentResponse.json();

  const storedEquipment = myEquipmentData.data?.find(
    (item) =>
      String(item._id) === String(createdEquipmentId)
  );

  if (!storedEquipment) {
    throw new Error(
      "New equipment not found in MongoDB-backed Owner API"
    );
  }

  console.log(
    "PASS: Equipment found in Owner listing"
  );

  // Step 6: Verify all new equipment fields
  const fieldsToVerify = [
    "name",
    "description",
    "category",
    "location",
    "pricePerDay",
    "rentalType",
    "availableQuantity",
    "brand",
    "model",
    "condition",
    "rentalTerms",
    "image",
    "availability",
  ];

  for (const field of fieldsToVerify) {
    check(
      storedEquipment[field] === equipmentData[field],
      `${field} saved correctly`
    );
  }

  check(
    storedEquipment.status === "pending",
    "Stored equipment remains pending"
  );

  // Step 7: Verify pending equipment is not public
  const publicDetailsResponse = await fetch(
    `${baseURL}/api/equipment/${createdEquipmentId}`
  );

  check(
    publicDetailsResponse.status === 404,
    "Pending equipment hidden from public details API"
  );

  console.log(
    "Public details status:",
    publicDetailsResponse.status
  );

} catch (error) {
  console.error("Test failed:", error.message);
  hasFailed = true;
} finally {
  // Step 8: Clean up created test equipment
  if (createdEquipmentId && token) {
    try {
      const deleteResponse = await fetch(
        `${baseURL}/api/equipment/${createdEquipmentId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      check(
        deleteResponse.status === 200,
        "Test equipment soft-deleted successfully"
      );
    } catch (error) {
      console.error(
        "Test equipment cleanup failed:",
        error.message
      );
      hasFailed = true;
    }
  }

  if (hasFailed) {
    console.error("Equipment fields test FAILED");
    process.exitCode = 1;
  } else {
    console.log("Equipment fields test PASSED");
  }
}