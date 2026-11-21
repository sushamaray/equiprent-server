const requiredTextFields = ["name", "description", "category", "location"];

export const validateEquipment = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      valid: false,
      message: "Invalid equipment data",
    };
  }

  for (const field of requiredTextFields) {
    if (typeof data[field] !== "string" || !data[field].trim()) {
      return {
        valid: false,
        message: `${field} is required`,
      };
    }
  }

  if (
    typeof data.pricePerDay !== "number" ||
    !Number.isFinite(data.pricePerDay) ||
    data.pricePerDay <= 0
  ) {
    return {
      valid: false,
      message: "pricePerDay must be a positive number",
    };
  }

  if (typeof data.image !== "string") {
    return {
      valid: false,
      message: "A valid image URL is required",
    };
  }

  try {
    const imageURL = new URL(data.image);

    if (!["http:", "https:"].includes(imageURL.protocol)) {
      throw new Error("Unsupported image protocol");
    }
  } catch {
    return {
      valid: false,
      message: "A valid image URL is required",
    };
  }

  if (
    data.availability !== undefined &&
    typeof data.availability !== "boolean"
  ) {
    return {
      valid: false,
      message: "availability must be a boolean",
    };
  }

  return {
    valid: true,
    message: "Equipment data is valid",
  };
};

export const buildEquipmentDocument = (data, ownerId) => {
  const now = new Date();

  return {
    name: data.name.trim(),
    description: data.description.trim(),
    category: data.category.trim(),
    pricePerDay: data.pricePerDay,
    location: data.location.trim(),
    image: data.image.trim(),
    availability: data.availability ?? true,
    ownerId,
    createdAt: now,
    updatedAt: now,
  };
};

const editableEquipmentFields = [
  "name",
  "description",
  "category",
  "pricePerDay",
  "location",
  "image",
  "availability",
];

export const validateEquipmentUpdate = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      valid: false,
      message: "Invalid equipment update data",
    };
  }

  const fields = Object.keys(data);

  if (fields.length === 0) {
    return {
      valid: false,
      message: "At least one field is required",
    };
  }

  for (const field of fields) {
    if (!editableEquipmentFields.includes(field)) {
      return {
        valid: false,
        message: `Field ${field} cannot be updated`,
      };
    }
  }

  for (const field of requiredTextFields) {
    if (
      field in data &&
      (typeof data[field] !== "string" || !data[field].trim())
    ) {
      return {
        valid: false,
        message: `${field} must be a non-empty string`,
      };
    }
  }

  if (
    "pricePerDay" in data &&
    (typeof data.pricePerDay !== "number" ||
      !Number.isFinite(data.pricePerDay) ||
      data.pricePerDay <= 0)
  ) {
    return {
      valid: false,
      message: "pricePerDay must be a positive number",
    };
  }

  if ("image" in data) {
    if (typeof data.image !== "string") {
      return {
        valid: false,
        message: "A valid image URL is required",
      };
    }

    try {
      const imageURL = new URL(data.image);

      if (!["http:", "https:"].includes(imageURL.protocol)) {
        throw new Error("Unsupported image protocol");
      }
    } catch {
      return {
        valid: false,
        message: "A valid image URL is required",
      };
    }
  }

  if ("availability" in data && typeof data.availability !== "boolean") {
    return {
      valid: false,
      message: "availability must be a boolean",
    };
  }

  return {
    valid: true,
    message: "Equipment update data is valid",
  };
};

export const buildEquipmentUpdate = (data) => {
  const update = {};

  for (const field of editableEquipmentFields) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      update[field] =
        typeof data[field] === "string" ? data[field].trim() : data[field];
    }
  }

  update.updatedAt = new Date();

  return update;
};