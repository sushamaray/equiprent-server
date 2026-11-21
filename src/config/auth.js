
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";

import { getDB, getMongoClient } from "./db.js";

export const createAuth = () => {
  const db = getDB();
  const client = getMongoClient();

  return betterAuth({
    database: mongodbAdapter(db, {
      client,
    }),

    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,

    trustedOrigins: [
      process.env.BETTER_AUTH_TRUSTED_ORIGINS,
    ],

    emailAndPassword: {
      enabled: true,
    },

    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "customer",
          input: false,
        },
      },
    },

    plugins: [
      jwt(),
    ],
  });
};
