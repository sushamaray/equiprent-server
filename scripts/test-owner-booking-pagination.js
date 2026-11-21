
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
      body: JSON.stringify({ email, password }),
    }
  );

  if (!loginResponse.ok) {
    throw new Error("Owner login failed");
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

  // Step 3: Invalid pagination cases
  const invalidCases = [
    "?page=0&limit=10",
    "?page=-1&limit=10",
    "?page=abc&limit=10",
    "?page=1.5&limit=10",
    "?page=1&limit=0",
    "?page=1&limit=51",
    "?page=1&limit=abc",
  ];

  for (const query of invalidCases) {
    const response = await fetch(
      `${baseURL}/api/bookings/owner${query}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    console.log(
      `Pagination ${query}:`,
      response.status
    );

    if (
      response.status !== 400 ||
      data.success !== false
    ) {
      throw new Error(
        `Invalid pagination accepted: ${query}`
      );
    }
  }

  console.log(
    "PASS: All invalid pagination parameters rejected"
  );

  console.log(
    "Owner Booking Pagination Security Test PASSED"
  );
} catch (error) {
  console.error(
    "Owner Booking Pagination Security Test FAILED:",
    error.message
  );

  process.exitCode = 1;
}