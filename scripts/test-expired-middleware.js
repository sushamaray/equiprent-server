
import "dotenv/config";
import express from "express";

import {
  SignJWT,
  generateKeyPair,
  exportJWK,
} from "jose";

// Create temporary test signing keys
const { publicKey, privateKey } =
  await generateKeyPair("RS256");

const publicJWK = await exportJWK(publicKey);

publicJWK.kid = "test-expired-key";
publicJWK.alg = "RS256";
publicJWK.use = "sig";

const app = express();

// Serve the temporary public signing key
app.get("/api/auth/jwks", (req, res) => {
  res.json({
    keys: [publicJWK],
  });
});

// Start test server on an available port
const server = app.listen(0);

try {
  await new Promise((resolve, reject) => {
    if (server.listening) {
      resolve();
    } else {
      server.once("listening", resolve);
      server.once("error", reject);
    }
  });

  const port = server.address().port;
  const testURL = `http://127.0.0.1:${port}`;

  // Configure middleware BEFORE importing it
  process.env.BETTER_AUTH_URL = testURL;

  const { verifyToken } = await import(
    "../src/middleware/verifyToken.js"
  );

  // Protected route using the actual middleware
  app.get("/api/protected", verifyToken, (req, res) => {
    res.json({
      success: true,
      userId: req.auth.userId,
    });
  });

  // Sign a token using the matching private key
  const expiredToken = await new SignJWT({})
    .setProtectedHeader({
      alg: "RS256",
      kid: "test-expired-key",
    })
    .setSubject("test-user")
    .setIssuer(testURL)
    .setAudience(testURL)
    .setIssuedAt()
    .setExpirationTime("1 hour ago")
    .sign(privateKey);

  // First verify that the signature is valid
  // and expiration is the ONLY failing condition
  const { jwtVerify, errors } = await import("jose");

  try {
    await jwtVerify(expiredToken, publicKey, {
      issuer: testURL,
      audience: testURL,
    });

    throw new Error("Expired JWT unexpectedly accepted");
  } catch (error) {
    if (!(error instanceof errors.JWTExpired)) {
      throw error;
    }

    console.log(
      "PASS: Token signature valid; expiration rejected"
    );
  }

  // Test the actual Express middleware
  const response = await fetch(
    `${testURL}/api/protected`,
    {
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
    }
  );

  console.log(
    "Expired JWT response:",
    response.status
  );

  if (response.status === 401) {
    console.log(
      "PASS: Express middleware rejected expired JWT"
    );
  } else {
    console.error(
      "FAIL: Expired JWT was not rejected"
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Test failed:", error.message);
  process.exitCode = 1;
} finally {
  server.close();
}