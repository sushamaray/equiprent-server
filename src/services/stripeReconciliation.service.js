import { getDB } from "../config/db.js";
import { getStripe } from "../config/stripe.js";
import { RESERVATION_STATUSES as S } from "../models/checkoutReservation.model.js";
import { finalizePaidSession, handleTerminalSession } from "../controllers/stripeWebhook.controller.js";

let running = false;

// Reconcile missed webhook delivery without treating a local timeout as proof
// that a Checkout Session is safe to release.
export async function reconcileStripeReservations() {
  if (running) return;
  running = true;
  try {
    const db = getDB();
    const stripe = getStripe();
    await db.collection("checkoutReservations").updateMany(
      {
        status: S.PREPARING,
        expiresAt: { $lte: new Date() },
        stripeCheckoutSessionId: null,
      },
      { $set: { status: S.CANCELLED, updatedAt: new Date() } },
    );
    const candidates = await db.collection("checkoutReservations").find({
      status: { $in: [S.CHECKOUT_OPEN, S.PAYMENT_REVIEW] },
      expiresAt: { $lte: new Date() },
      stripeCheckoutSessionId: { $type: "string" },
    }).limit(50).toArray();

    for (const reservation of candidates) {
      try {
        const checkoutSession = await stripe.checkout.sessions.retrieve(reservation.stripeCheckoutSessionId);
        if (checkoutSession.status === "complete" && checkoutSession.payment_status === "paid") {
          await finalizePaidSession({ id: `reconcile:${checkoutSession.id}:paid`, type: "reconciliation.paid" }, checkoutSession);
        } else if (checkoutSession.status === "expired") {
          await handleTerminalSession({ id: `reconcile:${checkoutSession.id}:expired`, type: "checkout.session.expired" }, checkoutSession);
        }
        // Open or asynchronously processing sessions remain reserved.
      } catch (error) {
        console.error("Stripe reservation reconciliation failed:", error.message);
      }
    }
  } finally {
    running = false;
  }
}
