import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

if (!baseURL || !email || !password) {
  console.error("Missing test configuration");
  process.exit(1);
}

try {
  // Step 1: Login
  const loginResponse = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.CLIENT_URL,
    },
    body: JSON.stringify({ email, password }),
  });

  console.log("Login status:", loginResponse.status);

  if (!loginResponse.ok) {
    throw new Error("Login failed");
  }

  const loginData = await loginResponse.json();

  const sessionCookie = loginResponse.headers.get("set-cookie")?.split(";")[0];

  if (!sessionCookie) {
    throw new Error("Session cookie missing");
  }

  // Step 2: Generate JWT
  const tokenResponse = await fetch(`${baseURL}/api/auth/token`, {
    headers: {
      Cookie: sessionCookie,
      Origin: process.env.CLIENT_URL,
    },
  });

  console.log("JWT endpoint status:", tokenResponse.status);

  if (!tokenResponse.ok) {
    throw new Error("JWT generation failed");
  }

  const tokenData = await tokenResponse.json();
  const token = tokenData.token;

  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new Error("Invalid JWT structure");
  }

  console.log("PASS: JWT generated successfully");

  // Step 3: Access protected API
  const protectedResponse = await fetch(`${baseURL}/api/protected`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Protected API status:", protectedResponse.status);

  const protectedData = await protectedResponse.json();

  // Step 4: Verify authenticated user
  if (
    protectedResponse.status === 200 &&
    protectedData.success === true &&
    protectedData.userId === loginData.user.id
  ) {
    console.log("PASS: Valid JWT accepted and user ID verified");
  } else {
    console.error("FAIL: Protected API authentication failed");
    process.exitCode = 1;
  }

  // Step 5: Test database-backed Customer RBAC
  const customerResponse = await fetch(`${baseURL}/api/customer/test`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Customer API status:", customerResponse.status);

  const customerData = await customerResponse.json();

  if (
    customerResponse.status === 200 &&
    customerData.success === true &&
    customerData.role === "customer" &&
    customerData.userId === loginData.user.id
  ) {
    console.log("PASS: Customer role verified from MongoDB");
  } else {
    console.error("FAIL: Customer RBAC verification failed");

    console.error("Response status:", customerResponse.status);

    console.error("Response message:", customerData.message || "Unknown error");
    process.exitCode = 1;
  }
  // Step 6: Customer must not access Owner-only API
  const ownerResponse = await fetch(`${baseURL}/api/owner/test`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Customer accessing Owner API status:", ownerResponse.status);

  const ownerData = await ownerResponse.json();

  if (ownerResponse.status === 403 && ownerData.success === false) {
    console.log("PASS: Customer blocked from Owner-only API");
  } else {
    console.error("FAIL: Owner-only API authorization failed");
    process.exitCode = 1;
  }

  // Step 7: Customer must not access Admin-only API
  const adminResponse = await fetch(`${baseURL}/api/admin/test`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Customer accessing Admin API status:", adminResponse.status);

  const adminData = await adminResponse.json();

  if (adminResponse.status === 403 && adminData.success === false) {
    console.log("PASS: Customer blocked from Admin-only API");
  } else {
    console.error("FAIL: Admin-only API authorization failed");
    process.exitCode = 1;
  }

  // Step 8: Customer cannot create equipment
  const equipmentResponse = await fetch(`${baseURL}/api/equipment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "Test Camera",
      description: "Camera for rental testing",
      category: "Camera",
      pricePerDay: 500,
      location: "Dhaka",
      image: "https://example.com/camera.jpg",
      availability: true,
    }),
  });

  console.log("Customer equipment creation status:", equipmentResponse.status);

  const equipmentData = await equipmentResponse.json();

  if (equipmentResponse.status === 403 && equipmentData.success === false) {
    console.log("PASS: Customer blocked from creating equipment");
  } else {
    console.error("FAIL: Customer equipment creation restriction failed");
    process.exitCode = 1;
  }

  // Step 9: Customer cannot update Owner equipment
  const updateResponse = await fetch(
    `${baseURL}/api/equipment/6b01bb4525ce461ff7cfe418`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        pricePerDay: 1000,
      }),
    },
  );

  console.log("Customer equipment update status:", updateResponse.status);

  const updateData = await updateResponse.json();

  if (updateResponse.status === 403 && updateData.success === false) {
    console.log("PASS: Customer blocked from updating equipment");
  } else {
    console.error("FAIL: Customer equipment update restriction failed");
    process.exitCode = 1;
  }
  // Step 10: Customer cannot delete Owner equipment
  const deleteResponse = await fetch(
    `${baseURL}/api/equipment/6b01bb4525ce461ff7cfe418`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  console.log("Customer equipment delete status:", deleteResponse.status);

  const deleteData = await deleteResponse.json();

  if (deleteResponse.status === 403 && deleteData.success === false) {
    console.log("PASS: Customer blocked from deleting equipment");
  } else {
    console.error("FAIL: Customer equipment delete restriction failed");
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Test failed:", error.message);
  process.exitCode = 1;
}