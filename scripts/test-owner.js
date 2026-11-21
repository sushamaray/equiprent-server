import "dotenv/config";

const baseURL = process.env.BETTER_AUTH_URL;
const email = process.env.TEST_OWNER_EMAIL;
const password = process.env.TEST_OWNER_PASSWORD;

if (!baseURL || !email || !password) {
  console.error("Missing Owner test configuration");
  process.exit(1);
}

try {
  // Step 1: Login as Owner
  const loginResponse = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.CLIENT_URL,
    },
    body: JSON.stringify({ email, password }),
  });

  console.log("Owner login status:", loginResponse.status);

  if (!loginResponse.ok) {
    throw new Error("Owner login failed");
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

  console.log("JWT status:", tokenResponse.status);

  if (!tokenResponse.ok) {
    throw new Error("JWT generation failed");
  }

  const tokenData = await tokenResponse.json();
  const token = tokenData.token;

  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new Error("Invalid JWT");
  }

  // Step 3: Access Owner-only API
  const ownerResponse = await fetch(`${baseURL}/api/owner/test`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Owner API status:", ownerResponse.status);

  const ownerData = await ownerResponse.json();

  if (
    ownerResponse.status === 200 &&
    ownerData.success === true &&
    ownerData.role === "owner" &&
    ownerData.userId === loginData.user.id
  ) {
    console.log("PASS: Owner successfully accessed Owner-only API");
  } else {
    console.error("FAIL: Owner authorization failed");
    console.error(
      "Response:",
      ownerResponse.status,
      ownerData.message || "Unexpected result",
    );
    process.exitCode = 1;
  }

  // Step 4: Owner must not access Admin-only API
  const adminResponse = await fetch(`${baseURL}/api/admin/test`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("Owner accessing Admin API status:", adminResponse.status);

  const adminData = await adminResponse.json();

  if (adminResponse.status === 403 && adminData.success === false) {
    console.log("PASS: Owner blocked from Admin-only API");
  } else {
    console.error("FAIL: Admin-only API access restriction failed");
    process.exitCode = 1;
  }

  // Step 5: Owner cannot create invalid equipment
  const invalidEquipmentResponse = await fetch(`${baseURL}/api/equipment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "",
      description: "Camera for rental testing",
      category: "Camera",
      pricePerDay: -500,
      location: "Dhaka",
      image: "https://example.com/camera.jpg",
    }),
  });

  console.log("Invalid equipment status:", invalidEquipmentResponse.status);

  const invalidEquipmentData = await invalidEquipmentResponse.json();

  if (
    invalidEquipmentResponse.status === 400 &&
    invalidEquipmentData.success === false
  ) {
    console.log("PASS: Invalid equipment data rejected");
  } else {
    console.error("FAIL: Equipment validation test failed");
    process.exitCode = 1;
  }

  // Step 6: Owner creates valid equipment
  // Disabled to avoid creating duplicate test equipment.
  //
  // const validEquipmentResponse = await fetch(`${baseURL}/api/equipment`, {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization: `Bearer ${token}`,
  //   },
  //   body: JSON.stringify({
  //     name: "Canon EOS R50 Camera - Test",
  //     description: "Camera for equipment rental testing",
  //     category: "Camera",
  //     pricePerDay: 800,
  //     location: "Dhaka",
  //     image: "https://example.com/camera.jpg",
  //     availability: true,
  //   }),
  // });
  //
  // console.log(
  //   "Valid equipment creation status:",
  //   validEquipmentResponse.status,
  // );
  //
  // const validEquipmentData = await validEquipmentResponse.json();
  //
  // if (
  //   validEquipmentResponse.status === 201 &&
  //   validEquipmentData.success === true &&
  //   validEquipmentData.equipment?._id &&
  //   validEquipmentData.equipment?.ownerId === loginData.user.id
  // ) {
  //   console.log("PASS: Owner successfully created equipment");
  //   console.log("PASS: Equipment owner ID matches authenticated Owner");
  // } else {
  //   console.error("FAIL: Valid equipment creation test failed");
  //   console.error("Response status:", validEquipmentResponse.status);
  //   console.error(
  //     "Response message:",
  //     validEquipmentData.message || "Unexpected result",
  //   );
  //   process.exitCode = 1;
  // }

  // Step 7: Owner cannot update equipment with invalid data
  const invalidUpdateResponse = await fetch(
    `${baseURL}/api/equipment/6b01bb4525ce461ff7cfe418`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        pricePerDay: -100,
      }),
    },
  );

  console.log("Invalid equipment update status:", invalidUpdateResponse.status);

  const invalidUpdateData = await invalidUpdateResponse.json();

  if (
    invalidUpdateResponse.status === 400 &&
    invalidUpdateData.success === false &&
    invalidUpdateData.message === "pricePerDay must be a positive number"
  ) {
    console.log("PASS: Invalid equipment update rejected");
  } else {
    console.error("FAIL: Equipment update validation failed");
    process.exitCode = 1;
  }

  // Step 8: Owner updates own equipment
  const equipmentId = "6b01bb4525ce461ff7cfe418";

  const validUpdateResponse = await fetch(
    `${baseURL}/api/equipment/${equipmentId}`,
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

  console.log("Valid equipment update status:", validUpdateResponse.status);

  const validUpdateData = await validUpdateResponse.json();

  if (validUpdateResponse.status !== 200 || validUpdateData.success !== true) {
    console.error("FAIL: Owner equipment update failed");
    process.exitCode = 1;
  } else {
    console.log("PASS: Owner successfully updated equipment");

    // Verify updated price using public Details API
    const detailsResponse = await fetch(
      `${baseURL}/api/equipment/${equipmentId}`,
    );

    const detailsData = await detailsResponse.json();

    if (
      detailsResponse.status === 200 &&
      detailsData.equipment?.pricePerDay === 1000
    ) {
      console.log("PASS: Updated equipment price verified");
    } else {
      console.error("FAIL: Updated equipment price mismatch");
      process.exitCode = 1;
    }
  }

  // Step 9: Owner A can view only their own equipment
  const myEquipmentResponse = await fetch(
    `${baseURL}/api/equipment/my?page=1&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  console.log("Owner A equipment listing status:", myEquipmentResponse.status);

  const myEquipmentData = await myEquipmentResponse.json();

  if (
    myEquipmentResponse.status !== 200 ||
    myEquipmentData.success !== true ||
    !Array.isArray(myEquipmentData.data)
  ) {
    throw new Error("Owner A equipment listing failed");
  }

  console.log("PASS: Owner A equipment listing works");

  // Verify that every returned equipment belongs to Owner A
  const allBelongToOwner = myEquipmentData.data.every(
    (item) => String(item.ownerId) === loginData.user.id,
  );

  if (!allBelongToOwner) {
    throw new Error("Another Owner's equipment appeared in the list");
  }

  console.log("PASS: All equipment belongs to Owner A");

  // Verify Owner A's existing camera appears
  const cameraFound = myEquipmentData.data.some(
    (item) => String(item._id) === equipmentId,
  );

  if (!cameraFound) {
    throw new Error("Owner A camera missing from equipment list");
  }

  console.log("PASS: Owner A camera found");

  // Verify Owner B's soft-deleted equipment is not exposed
  const ownerBEquipmentFound = myEquipmentData.data.some(
    (item) => String(item._id) === "6b01c1c1e00eae796cfa1e00",
  );

  if (ownerBEquipmentFound) {
    throw new Error("Owner B equipment exposed to Owner A");
  }

  console.log("PASS: Owner B equipment hidden from Owner A");

  // Verify pagination metadata
  const pagination = myEquipmentData.pagination;

  if (
    pagination?.page !== 1 ||
    pagination?.limit !== 50 ||
    !Number.isInteger(pagination.total) ||
    !Number.isInteger(pagination.totalPages)
  ) {
    throw new Error("Owner equipment pagination metadata invalid");
  }

  console.log("PASS: Owner equipment pagination metadata verified");

  // Step 10: Reject invalid Owner equipment pagination
  const invalidPaginationCases = [
    "?page=0&limit=10",
    "?page=1&limit=0",
    "?page=1&limit=100",
    "?page=abc&limit=10",
    "?page=1.5&limit=10",
  ];

  for (const query of invalidPaginationCases) {
    const response = await fetch(`${baseURL}/api/equipment/my${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    console.log(`Owner pagination ${query} status:`, response.status);

    if (response.status !== 400 || data.success !== false) {
      throw new Error(`Invalid pagination was accepted: ${query}`);
    }
  }

  console.log("PASS: All invalid Owner pagination parameters rejected");

  // Step 11: Verify valid Owner equipment pagination
  const firstPageResponse = await fetch(
    `${baseURL}/api/equipment/my?page=1&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const firstPageData = await firstPageResponse.json();

  console.log("Owner pagination page 1 status:", firstPageResponse.status);

  if (
    firstPageResponse.status !== 200 ||
    firstPageData.success !== true ||
    !Array.isArray(firstPageData.data) ||
    firstPageData.data.length > 1 ||
    firstPageData.pagination?.page !== 1 ||
    firstPageData.pagination?.limit !== 1
  ) {
    throw new Error("Owner pagination page 1 failed");
  }

  console.log("PASS: Owner pagination page 1 works");

  // Request a second page
  const secondPageResponse = await fetch(
    `${baseURL}/api/equipment/my?page=2&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const secondPageData = await secondPageResponse.json();

  console.log("Owner pagination page 2 status:", secondPageResponse.status);

  if (
    secondPageResponse.status !== 200 ||
    secondPageData.success !== true ||
    !Array.isArray(secondPageData.data) ||
    secondPageData.data.length > 1 ||
    secondPageData.pagination?.page !== 2 ||
    secondPageData.pagination?.limit !== 1
  ) {
    throw new Error("Owner pagination page 2 failed");
  }

  console.log("PASS: Owner pagination page 2 works");

  // Verify data isolation on both pages
  const paginatedEquipment = [...firstPageData.data, ...secondPageData.data];

  const onlyOwnerEquipment = paginatedEquipment.every(
    (item) => String(item.ownerId) === loginData.user.id && !item.deletedAt,
  );

  if (!onlyOwnerEquipment) {
    throw new Error("Invalid equipment in paginated results");
  }

  console.log("PASS: Paginated equipment ownership verified");
} catch (error) {
  console.error("Test failed:", error.message);
  process.exitCode = 1;
}