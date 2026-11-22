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
  const login = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: clientURL },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error("Customer login failed");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Session cookie missing");
  const tokenResponse = await fetch(`${baseURL}/api/auth/token`, {
    headers: { Cookie: cookie, Origin: clientURL },
  });
  const { token } = await tokenResponse.json();
  if (!tokenResponse.ok || typeof token !== "string") throw new Error("Customer JWT retrieval failed");

  const response = await fetch(`${baseURL}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ equipmentId: "6b01bb4525ce461ff7cfe418", startDate: "2027-01-10", endDate: "2027-01-14", quantity: 1 }),
  });
  const result = await response.json();
  if (response.status !== 410 || result.success !== false) {
    throw new Error("Legacy direct booking endpoint did not reject the unpaid bypass");
  }
  console.log("PASS: Direct unpaid booking creation returns 410; use Stripe Checkout");
} catch (error) {
  console.error("Direct Booking Bypass Test FAILED:", error.message);
  process.exitCode = 1;
}
