
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const equipmentProjection = {
  name: 1,
  description: 1,
  category: 1,
  pricePerDay: 1,
  rentalPrice: 1,
  rentalType: 1,
  availableQuantity: 1,
  brand: 1,
  model: 1,
  condition: 1,
  rentalTerms: 1,
  location: 1,
  image: 1,
  availability: 1,
  ownerId: 1,
  createdAt: 1,
};

export async function getEquipmentDetails(req, res) {
  try {
    const { id } = req.params;

    if (
      typeof id !== "string" ||
      !/^[a-fA-F0-9]{24}$/.test(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID",
      });
    }

    const db = getDB();

    const equipment = await db
      .collection("equipment")
      .findOne(
        {
          _id: new ObjectId(id),
          availability: true,
          status: "approved",
          deletedAt: { $exists: false },
        },
        {
          projection: equipmentProjection,
        },
      );

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found",
      });
    }

    let ownerName = null;

    if (equipment.ownerId) {
      let ownerId = equipment.ownerId;

      if (
        typeof ownerId === "string" &&
        /^[a-fA-F0-9]{24}$/.test(ownerId)
      ) {
        ownerId = new ObjectId(ownerId);
      }

      if (ownerId instanceof ObjectId) {
        const owner = await db
          .collection("user")
          .findOne(
            { _id: ownerId },
            {
              projection: {
                name: 1,
              },
            },
          );

        ownerName =
          typeof owner?.name === "string" &&
          owner.name.trim()
            ? owner.name.trim()
            : null;
      }
    }

    return res.status(200).json({
      success: true,
      equipment: {
        ...equipment,
        ownerName,
      },
    });
  } catch (error) {
    console.error(
      "Equipment details failed:",
      error.message,
    );

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve equipment",
    });
  }
}