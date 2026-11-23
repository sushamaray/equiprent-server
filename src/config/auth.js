
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";

import { getDB, getMongoClient } from "./db.js";

export const createAuth = () => {
  const db = getDB();
  const client = getMongoClient();

  const googleConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET,
  );

  return betterAuth({
    database: mongodbAdapter(db, {
      client,
    }),

    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,

    trustedOrigins: [
      process.env.BETTER_AUTH_TRUSTED_ORIGINS,
      process.env.CLIENT_URL,
    ].filter(Boolean),

    // Allow secure cookies across Vercel and Render domains.
    // Keep CSRF and origin verification enabled.
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
        path: "/",
      },
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },

    ...(googleConfigured
      ? {
          socialProviders: {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              prompt: "select_account",
            },
          },
        }
      : {}),

    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "customer",
          input: false,
        },
      },
    },

    plugins: [jwt()],
  });
};