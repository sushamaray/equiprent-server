
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const getLastSixMonths = () => {
  const now = new Date();

  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1),
  );

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth() + index,
        1,
      ),
    );

    return {
      key: date.toISOString().slice(0, 7),
      month: date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
    };
  });

  return { start, months };
};

const getMonthlyValues = (months, rows, field) => {
  const values = new Map(
    rows.map((row) => [row._id, Number(row.value || 0)]),
  );

  return months.map((month) => ({
    month: month.month,
    value: values.get(month.key) || 0,
  }));
};

const getMonthlyBookings = async (db, start) => {
  return db.collection("bookings").aggregate([
    {
      $match: {
        createdAt: { $gte: start },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m",
            date: "$createdAt",
            timezone: "UTC",
          },
        },
        value: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray();
};

const getMonthlyEarnings = async (db, ownerId, start) => {
  return db.collection("payments").aggregate([
    {
      $match: {
        ownerId,
        paymentStatus: "paid",
        currency: "bdt",
        paidAt: { $gte: start },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m",
            date: "$paidAt",
            timezone: "UTC",
          },
        },
        value: { $sum: "$amount" },
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray();
};

// ADMIN ANALYTICS
export const getAdminAnalytics = async (req, res) => {
  try {
    if (req.auth?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const db = getDB();

    const [
      totalUsers,
      totalEquipment,
      totalBookings,
      pendingApprovals,
      completedRentals,
      revenueResult,
    ] = await Promise.all([
      db.collection("user").countDocuments(),

      db.collection("equipment").countDocuments({
        deletedAt: { $exists: false },
      }),

      db.collection("bookings").countDocuments(),

      db.collection("equipment").countDocuments({
        status: "pending",
        deletedAt: { $exists: false },
      }),

      db.collection("bookings").countDocuments({
        status: "completed",
      }),

      db.collection("payments").aggregate([
        {
          $match: {
            paymentStatus: "paid",
            currency: "bdt",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]).toArray(),
    ]);

    const { start, months } = getLastSixMonths();

    const monthlyRows = await getMonthlyBookings(db, start);

    const monthlyBookings = getMonthlyValues(
      months,
      monthlyRows,
      "value",
    );

    const totalRevenue = Number(
      revenueResult[0]?.total || 0,
    );

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalEquipment,
        totalBookings,
        pendingApprovals,
        completedRentals,
        totalRevenue,
        monthlyBookings,
      },
    });
  } catch (error) {
    console.error("Admin analytics failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve admin analytics",
    });
  }
};

// OWNER ANALYTICS
export const getOwnerAnalytics = async (req, res) => {
  try {
    if (
      req.auth?.role !== "owner" ||
      !ObjectId.isValid(req.auth?.userId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Owner access required",
      });
    }

    const db = getDB();
    const ownerId = new ObjectId(req.auth.userId);

    const [
      totalListedEquipment,
      completedRentals,
      earningsResult,
    ] = await Promise.all([
      db.collection("equipment").countDocuments({
        ownerId,
        deletedAt: { $exists: false },
      }),

      db.collection("bookings").countDocuments({
        ownerId,
        status: "completed",
      }),

      db.collection("payments").aggregate([
        {
          $match: {
            ownerId,
            paymentStatus: "paid",
            currency: "bdt",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]).toArray(),
    ]);

    const { start, months } = getLastSixMonths();

    const monthlyRows = await getMonthlyEarnings(
      db,
      ownerId,
      start,
    );

    const monthlyEarnings = getMonthlyValues(
      months,
      monthlyRows,
      "value",
    );

    const totalEarnings = Number(
      earningsResult[0]?.total || 0,
    );

    return res.status(200).json({
      success: true,
      data: {
        totalListedEquipment,
        completedRentals,
        totalEarnings,
        monthlyEarnings,
      },
    });
  } catch (error) {
    console.error("Owner analytics failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve owner analytics",
    });
  }
};