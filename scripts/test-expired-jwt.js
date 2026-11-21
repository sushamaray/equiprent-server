
import {
  SignJWT,
  generateKeyPair,
  jwtVerify,
  errors,
} from "jose";

try {
  // Generate a temporary key pair for testing
  const { publicKey, privateKey } = await generateKeyPair(
    "RS256"
  );

  // Create a JWT that expired one hour ago
  const expiredToken = await new SignJWT({
    role: "customer",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("test-user")
    .setIssuedAt()
    .setExpirationTime("1 hour ago")
    .sign(privateKey);

  // Verify using the matching public key
  try {
    await jwtVerify(expiredToken, publicKey);

    console.error("FAIL: Expired JWT was accepted");
    process.exitCode = 1;
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      console.log("PASS: Expired JWT rejected");
      console.log("Reason: JWT expiration validation");
    } else {
      console.error(
        "FAIL: Unexpected verification error:",
        error.code || error.message
      );
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error("Test failed:", error.message);
  process.exitCode = 1;
}