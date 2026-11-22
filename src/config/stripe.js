
import Stripe from "stripe";

// Initialize Stripe only when it is actually needed.
// This allows the development server to start
// even when Stripe credentials are missing.

let stripeClient = null;

export const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is missing from environment variables"
    );
  }

  // EquipRent payment integration is currently
  // restricted to Stripe test mode.
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error(
      "Only Stripe test-mode secret keys are allowed"
    );
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      maxNetworkRetries: 2,
      timeout: 30000,
    });
  }

  return stripeClient;
};

// The webhook signing secret is different from
// the Stripe API secret key.
//
// We will configure it when implementing
// the Stripe webhook endpoint.
export const getStripeWebhookSecret = () => {
  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not configured"
    );
  }

  return webhookSecret;
};