
import { ObjectId } from "mongodb";

import { getDB } from "../config/db.js";

import {
  createCheckoutReservation,
  CheckoutReservationError,
} from "../services/checkoutReservation.service.js";

import {
  createStripeCheckoutSession,
  StripeCheckoutError,
} from "../services/stripeCheckout.service.js";

import {
  RESERVATION_STATUSES,
} from "../models/checkoutReservation.model.js";

// Customer creates a Stripe Checkout Session.
export const createCheckoutSession = async (
  req,
  res
) => {
  if (
    req.auth?.role !== "customer" ||
    !ObjectId.isValid(req.auth?.userId)
  ) {
    return res.status(403).json({
      success: false,
      message:
        "Only authenticated Customers can initiate payments",
    });
  }

  let reservation = null;

  try {
    // Step 1: Create a temporary reservation.
    // Price and equipment information are
    // calculated using trusted backend data.
    reservation =
      await createCheckoutReservation({
        customerId: req.auth.userId,
        bookingData: req.body,
      });

    // Step 2: Create Stripe Checkout Session.
    const checkout =
      await createStripeCheckoutSession({
        reservationId:
          reservation._id.toHexString(),
        customerId: req.auth.userId,
      });

    // Step 3: Return Checkout URL.
    // Do not create a booking here.
    // Booking creation happens only after
    // verified successful Stripe payment.
    return res.status(201).json({
      success: true,
      message:
        "Stripe Checkout Session created successfully",

      checkout: {
        sessionId:
          checkout.checkoutSessionId,

        url: checkout.checkoutURL,

        expiresAt:
          checkout.expiresAt,

        amount:
          checkout.amount,

        currency:
          checkout.currency,
      },

      reservation: {
        reservationId:
          reservation._id.toHexString(),

        status:
          RESERVATION_STATUSES.CHECKOUT_OPEN,
      },
    });
  } catch (error) {
    // Release only reservations that have not
    // been associated with a Stripe Checkout Session.
    //
    // A reservation with an existing Stripe session
    // must be reconciled with Stripe, not blindly released.
    if (reservation?._id) {
      try {
        const db = getDB();

        await db
          .collection("checkoutReservations")
          .updateOne(
            {
              _id: reservation._id,

              customerId: new ObjectId(
                req.auth.userId
              ),

              status:
                RESERVATION_STATUSES.PREPARING,

              stripeCheckoutSessionId: null,
            },
            {
              $set: {
                status:
                  RESERVATION_STATUSES.CANCELLED,

                updatedAt: new Date(),
              },
            }
          );
      } catch (cleanupError) {
        console.error(
          "Checkout reservation cleanup failed:",
          cleanupError.message
        );
      }
    }

    if (
      error instanceof CheckoutReservationError ||
      error instanceof StripeCheckoutError
    ) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error(
      "Checkout Session creation failed:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to initiate payment. Please try again.",
    });
  }
};

// Only the authenticated Customer who opened the Checkout Session may inspect it.
export const getCheckoutStatus = async (req, res) => {
  const sessionId = req.params.sessionId;
  if (typeof sessionId !== "string" || !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) {
    return res.status(400).json({ success: false, message: "Invalid Checkout Session ID" });
  }
  try {
    const db = getDB();
    const customerId = new ObjectId(req.auth.userId);
    const reservation = await db.collection("checkoutReservations").findOne({
      stripeCheckoutSessionId: sessionId,
      customerId,
    });
    if (!reservation) return res.status(404).json({ success: false, message: "Payment session not found" });

    const payment = await db.collection("payments").findOne({ stripeCheckoutSessionId: sessionId, customerId });
    const booking = payment
      ? await db.collection("bookings").findOne({ _id: payment.bookingId, customerId })
      : null;
    return res.status(200).json({
      success: true,
      status: payment ? "paid" : reservation.status === RESERVATION_STATUSES.PAYMENT_REVIEW ? "review" : reservation.status,
      payment: payment ? { amount: payment.amount, currency: payment.currency, paidAt: payment.paidAt } : null,
      booking: booking ? {
        id: booking._id.toHexString(),
        equipmentId: booking.equipmentId.toHexString(),
        startDate: booking.startDate,
        endDate: booking.endDate,
        quantity: booking.quantity,
        totalPrice: booking.totalPrice,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      } : null,
    });
  } catch (error) {
    console.error("Checkout status lookup failed:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve payment status" });
  }
};
