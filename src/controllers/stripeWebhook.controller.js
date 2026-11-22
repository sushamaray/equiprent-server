import { ObjectId } from "mongodb";
import { getDB, getMongoClient } from "../config/db.js";
import { getStripe, getStripeWebhookSecret } from "../config/stripe.js";
import { buildBookingDocument } from "../models/booking.model.js";
import { buildPaymentDocument } from "../models/payment.model.js";
import { RESERVATION_STATUSES as S } from "../models/checkoutReservation.model.js";
import { convertTakaToStripeAmount, PAYMENT_CURRENCY } from "../utils/stripeAmount.js";

const supportedEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

const objectIdFrom = (value) =>
  typeof value === "string" && /^[a-f\d]{24}$/i.test(value)
    ? new ObjectId(value)
    : null;

const eventDocument = (event) => ({
  stripeEventId: event.id,
  type: event.type,
  processedAt: new Date(),
});

async function recordPaymentReview(db, session, event, checkoutSession, reservation, reason) {
  const intent = typeof checkoutSession.payment_intent === "string"
    ? checkoutSession.payment_intent
    : checkoutSession.payment_intent?.id ?? null;
  await db.collection("paymentReviewCases").updateOne(
    { stripeCheckoutSessionId: checkoutSession.id },
    { $setOnInsert: {
      stripeCheckoutSessionId: checkoutSession.id,
      stripeEventId: event.id,
      stripePaymentIntentId: intent,
      reservationId: reservation?._id ?? null,
      customerId: reservation?.customerId ?? objectIdFrom(checkoutSession.metadata?.customerId),
      equipmentId: reservation?.equipmentId ?? objectIdFrom(checkoutSession.metadata?.equipmentId),
      ownerId: reservation?.ownerId ?? objectIdFrom(checkoutSession.metadata?.ownerId),
      amountInMinorUnit: checkoutSession.amount_total,
      currency: checkoutSession.currency,
      customerEmail: checkoutSession.customer_details?.email ?? checkoutSession.customer_email ?? "",
      status: "requires_manual_review",
      recommendedAction: "Verify Stripe payment and reservation; fulfill booking or issue a Stripe refund",
      reason,
      createdAt: new Date(),
      updatedAt: new Date(),
    } },
    { upsert: true, session },
  );
}

export async function finalizePaidSession(event, checkoutSession) {
  const db = getDB();
  const client = getMongoClient();
  const stripe = getStripe();
  const sessionId = checkoutSession.id;
  const metadata = checkoutSession.metadata ?? {};
  const reservationId = objectIdFrom(metadata.reservationId);
  const session = client.startSession();

  try {
    await session.withTransaction(async () => {
      await db.collection("stripeWebhookEvents").insertOne(eventDocument(event), { session });

      const reservation = await db.collection("checkoutReservations").findOne(
        {
          $or: [
            { stripeCheckoutSessionId: sessionId },
            ...(reservationId ? [{ _id: reservationId }] : []),
          ],
        },
        { session },
      );

      if (!reservation) {
        // Keep evidence of a verified, paid but unmapped session for manual recovery.
        await recordPaymentReview(db, session, event, checkoutSession, null, "Paid Checkout Session has no matching reservation");
        await db.collection("stripeWebhookEvents").updateOne(
          { stripeEventId: event.id },
          { $set: { processingStatus: "unmatched_paid_session", stripeCheckoutSessionId: sessionId } },
          { session },
        );
        return;
      }

      const expectedMinor = convertTakaToStripeAmount(reservation.totalAmount);
      const intentId = typeof checkoutSession.payment_intent === "string"
        ? checkoutSession.payment_intent
        : checkoutSession.payment_intent?.id;
      const paymentValid =
        checkoutSession.mode === "payment" &&
        checkoutSession.status === "complete" &&
        checkoutSession.payment_status === "paid" &&
        checkoutSession.currency?.toLowerCase() === PAYMENT_CURRENCY &&
        checkoutSession.amount_total === expectedMinor &&
        reservation.stripeCheckoutSessionId === sessionId &&
        metadata.reservationId === reservation._id.toHexString() &&
        metadata.customerId === reservation.customerId.toHexString() &&
        metadata.equipmentId === reservation.equipmentId.toHexString() &&
        metadata.ownerId === reservation.ownerId.toHexString() &&
        checkoutSession.client_reference_id === reservation._id.toHexString() &&
        Boolean(intentId);

      if (!paymentValid) {
        // Money may have moved. Never release stock or discard the session.
        await recordPaymentReview(db, session, event, checkoutSession, reservation, "Paid Checkout Session did not match reservation");
        await db.collection("checkoutReservations").updateOne(
          { _id: reservation._id },
          { $set: { status: S.PAYMENT_REVIEW, paymentReviewReason: "Paid Checkout Session did not match reservation", stripeCheckoutSessionId: sessionId, updatedAt: new Date() } },
          { session },
        );
        await db.collection("stripeWebhookEvents").updateOne(
          { stripeEventId: event.id },
          { $set: { processingStatus: "payment_review", stripeCheckoutSessionId: sessionId } },
          { session },
        );
        return;
      }

      const existingPayment = await db.collection("payments").findOne(
        { $or: [{ stripeCheckoutSessionId: sessionId }, { stripePaymentIntentId: intentId }, { transactionId: intentId }] },
        { session },
      );
      if (existingPayment) {
        await db.collection("checkoutReservations").updateOne(
          { _id: reservation._id },
          { $set: { status: S.COMPLETED, updatedAt: new Date() } },
          { session },
        );
        return;
      }

      // If availability changed after checkout, keep the payment for review rather than lose funds.
      const equipment = await db.collection("equipment").findOne(
        { _id: reservation.equipmentId, ownerId: reservation.ownerId },
        { session, projection: { _id: 1, availableQuantity: 1 } },
      );
      const occupied = await db.collection("bookings").find(
        {
          equipmentId: reservation.equipmentId,
          status: { $in: ["pending", "confirmed"] },
          startDate: { $lt: reservation.endDate },
          endDate: { $gt: reservation.startDate },
        },
        { session },
      ).project({ quantity: 1 }).toArray();
      const overlappingOtherReservations = await db.collection("checkoutReservations").find(
        {
          _id: { $ne: reservation._id },
          equipmentId: reservation.equipmentId,
          status: { $in: [S.CHECKOUT_OPEN, S.PAYMENT_REVIEW] },
          startDate: { $lt: reservation.endDate },
          endDate: { $gt: reservation.startDate },
        },
        { session },
      ).project({ quantity: 1 }).toArray();
      const reservedQty = [...occupied, ...overlappingOtherReservations]
        .reduce((total, item) => total + (item.quantity ?? 1), 0);
      if (!equipment || reservedQty + reservation.quantity > (equipment.availableQuantity ?? 1)) {
        await recordPaymentReview(db, session, event, checkoutSession, reservation, "Paid rental conflicts with current equipment availability");
        await db.collection("checkoutReservations").updateOne(
          { _id: reservation._id },
          { $set: { status: S.PAYMENT_REVIEW, paymentReviewReason: "Paid rental conflicts with current equipment availability", updatedAt: new Date() } },
          { session },
        );
        await db.collection("stripeWebhookEvents").updateOne(
          { stripeEventId: event.id },
          { $set: { processingStatus: "payment_review", stripeCheckoutSessionId: sessionId } },
          { session },
        );
        return;
      }

      const paidAt = checkoutSession.created
        ? new Date(checkoutSession.created * 1000)
        : new Date();
      const booking = buildBookingDocument({
        equipmentId: reservation.equipmentId.toHexString(),
        customerId: reservation.customerId.toHexString(),
        ownerId: reservation.ownerId.toHexString(),
        startDate: reservation.startDate,
        endDate: reservation.endDate,
        quantity: reservation.quantity,
        rentalDays: reservation.rentalDays,
        rentalType: reservation.rentalType,
        rentalPrice: reservation.rentalPrice,
        totalPrice: reservation.totalAmount,
        contactNumber: reservation.contactNumber,
        deliveryAddress: reservation.deliveryAddress,
        additionalNotes: reservation.additionalNotes,
        paymentStatus: "paid",
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: intentId,
      });
      booking.paidAt = paidAt;
      const bookingResult = await db.collection("bookings").insertOne(booking, { session });
      const payment = buildPaymentDocument({
        bookingId: bookingResult.insertedId.toHexString(),
        reservationId: reservation._id.toHexString(),
        customerId: reservation.customerId.toHexString(),
        ownerId: reservation.ownerId.toHexString(),
        equipmentId: reservation.equipmentId.toHexString(),
        amount: reservation.totalAmount,
        amountInMinorUnit: checkoutSession.amount_total,
        currency: checkoutSession.currency.toLowerCase(),
        transactionId: intentId,
        stripeCheckoutSessionId: sessionId,
        customerEmail: checkoutSession.customer_details?.email ?? checkoutSession.customer_email ?? "",
        paidAt,
      });
      await db.collection("payments").insertOne(payment, { session });
      await db.collection("checkoutReservations").updateOne(
        { _id: reservation._id, stripeCheckoutSessionId: sessionId },
        { $set: { status: S.COMPLETED, bookingId: bookingResult.insertedId, updatedAt: new Date() } },
        { session },
      );
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally {
    await session.endSession();
  }
}

export async function handleTerminalSession(event, checkoutSession) {
  const stripe = getStripe();
  const db = getDB();
  const actual = await stripe.checkout.sessions.retrieve(checkoutSession.id);
  const canRelease = event.type === "checkout.session.expired"
    ? actual.status === "expired"
    : actual.status === "complete" && actual.payment_status === "unpaid";
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection("stripeWebhookEvents").insertOne(eventDocument(event), { session });
      const update = canRelease
        ? { status: event.type === "checkout.session.expired" ? S.EXPIRED : S.CANCELLED, updatedAt: new Date() }
        : { status: S.PAYMENT_REVIEW, paymentReviewReason: "Terminal Stripe event did not confirm an unpaid/expired session", updatedAt: new Date() };
      await db.collection("checkoutReservations").updateOne(
        { stripeCheckoutSessionId: actual.id, status: { $in: [S.CHECKOUT_OPEN, S.PAYMENT_REVIEW] } },
        { $set: update },
        { session },
      );
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally {
    await session.endSession();
  }
}

export const handleStripeWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string" || !signature) {
    return res.status(400).json({ success: false, message: "Missing Stripe signature" });
  }
  let event;
  try {
    const stripe = getStripe();
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ success: false, message: "Stripe webhook requires raw request body" });
    event = stripe.webhooks.constructEvent(req.body, signature, getStripeWebhookSecret());
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error.message);
    return res.status(400).json({ success: false, message: "Invalid Stripe webhook signature" });
  }
  if (!supportedEvents.has(event.type)) return res.status(200).json({ received: true });

  try {
    const existing = await getDB().collection("stripeWebhookEvents").findOne({ stripeEventId: event.id });
    if (existing) return res.status(200).json({ received: true, duplicate: true });
    const stripe = getStripe();
    const eventSession = event.data.object;
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const current = await stripe.checkout.sessions.retrieve(eventSession.id);
      if (current.status === "complete" && current.payment_status === "paid") {
        await finalizePaidSession(event, current);
      } else if (event.type === "checkout.session.completed") {
        // Delayed payment methods may complete before funds settle. Await success/failure event.
        await getDB().collection("stripeWebhookEvents").insertOne({ ...eventDocument(event), processingStatus: "awaiting_async_payment", stripeCheckoutSessionId: current.id });
      } else {
        throw new Error("Stripe reported async success without a paid Checkout Session");
      }
    } else {
      await handleTerminalSession(event, eventSession);
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    if (error?.code === 11000) {
      const persisted = await getDB().collection("stripeWebhookEvents").findOne({ stripeEventId: event.id }).catch(() => null);
      if (persisted) return res.status(200).json({ received: true, duplicate: true });
    }
    console.error("Stripe webhook processing failed:", error.message);
    return res.status(503).json({ success: false, message: "Webhook processing failed; Stripe may retry" });
  }
};
