
const requiredTextFields = [
  "name",
  "description",
  "category",
  "location",
];

const optionalTextFields = [
  "brand",
  "model",
  "rentalTerms",
];

const allowedRentalTypes = [
  "daily",
  "weekly",
  "monthly",
];

const allowedConditions = [
  "new",
  "excellent",
  "good",
  "fair",
];

const isValidRentalType = (value) => {
  return (
    typeof value === "string" &&
    allowedRentalTypes.includes(value)
  );
};

const isValidCondition = (value) => {
  return (
    typeof value === "string" &&
    allowedConditions.includes(value)
  );
};

const isValidImageURL = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const imageURL = new URL(value.trim());

    return ["http:", "https:"].includes(
      imageURL.protocol
    );
  } catch {
    return false;
  }
};

const isValidQuantity = (value) => {
  return (
    Number.isInteger(value) &&
    value >= 0
  );
};

const isNonEmptyText = (value) => {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
};

// Validate new equipment
export const validateEquipment = (data) => {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return {
      valid: false,
      message: "Invalid equipment data",
    };
  }

  for (const field of requiredTextFields) {
    if (!isNonEmptyText(data[field])) {
      return {
        valid: false,
        message: `${field} is required`,
      };
    }
  }

  for (const field of optionalTextFields) {
    if (
      data[field] !== undefined &&
      !isNonEmptyText(data[field])
    ) {
      return {
        valid: false,
        message: `${field} must be a non-empty string`,
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

  if (!isValidImageURL(data.image)) {
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

  if (
    data.rentalType !== undefined &&
    !isValidRentalType(data.rentalType)
  ) {
    return {
      valid: false,
      message: "rentalType must be daily, weekly, or monthly",
    };
  }

  if (
    data.availableQuantity !== undefined &&
    !isValidQuantity(data.availableQuantity)
  ) {
    return {
      valid: false,
      message: "availableQuantity must be a non-negative integer",
    };
  }

  if (
    data.condition !== undefined &&
    !isValidCondition(data.condition)
  ) {
    return {
      valid: false,
      message: "condition must be new, excellent, good, or fair",
    };
  }

  return {
    valid: true,
    message: "Equipment data is valid",
  };
};

// Build MongoDB equipment document
export const buildEquipmentDocument = (
  data,
  ownerId
) => {
  const now = new Date();

  return {
    name: data.name.trim(),
    description: data.description.trim(),
    category: data.category.trim(),

    pricePerDay: data.pricePerDay,
    rentalType: data.rentalType ?? "daily",
    availableQuantity:
      data.availableQuantity ?? 1,

    brand: data.brand?.trim() ?? "",
    model: data.model?.trim() ?? "",
    condition: data.condition ?? "good",
    rentalTerms: data.rentalTerms?.trim() ?? "",

    location: data.location.trim(),
    image: data.image.trim(),
    availability: data.availability ?? true,

    // New equipment requires Admin approval
    status: "pending",

    ownerId,
    createdAt: now,
    updatedAt: now,
  };
};

// Fields that equipment owners can update
const editableEquipmentFields = [
  "name",
  "description",
  "category",
  "pricePerDay",
  "rentalType",
  "availableQuantity",
  "brand",
  "model",
  "condition",
  "rentalTerms",
  "location",
  "image",
  "availability",
];

// Validate equipment updates
export const validateEquipmentUpdate = (
  data
) => {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
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
    if (
      !editableEquipmentFields.includes(
        field
      )
    ) {
      return {
        valid: false,
        message: `Field ${field} cannot be updated`,
      };
    }
  }

  for (const field of requiredTextFields) {
    if (
      field in data &&
      !isNonEmptyText(data[field])
    ) {
      return {
        valid: false,
        message: `${field} must be a non-empty string`,
      };
    }
  }

  for (const field of optionalTextFields) {
    if (
      field in data &&
      !isNonEmptyText(data[field])
    ) {
      return {
        valid: false,
        message: `${field} must be a non-empty string`,
      };
    }
  }

  if (
    "pricePerDay" in data &&
    (
      typeof data.pricePerDay !== "number" ||
      !Number.isFinite(data.pricePerDay) ||
      data.pricePerDay <= 0
    )
  ) {
    return {
      valid: false,
      message: "pricePerDay must be a positive number",
    };
  }

  if (
    "image" in data &&
    !isValidImageURL(data.image)
  ) {
    return {
      valid: false,
      message: "A valid image URL is required",
    };
  }

  if (
    "availability" in data &&
    typeof data.availability !== "boolean"
  ) {
    return {
      valid: false,
      message: "availability must be a boolean",
    };
  }

  if (
    "rentalType" in data &&
    !isValidRentalType(data.rentalType)
  ) {
    return {
      valid: false,
      message: "rentalType must be daily, weekly, or monthly",
    };
  }

  if (
    "availableQuantity" in data &&
    !isValidQuantity(data.availableQuantity)
  ) {
    return {
      valid: false,
      message: "availableQuantity must be a non-negative integer",
    };
  }

  if (
    "condition" in data &&
    !isValidCondition(data.condition)
  ) {
    return {
      valid: false,
      message: "condition must be new, excellent, good, or fair",
    };
  }

  return {
    valid: true,
    message: "Equipment update data is valid",
  };
};

// Build safe MongoDB update object
export const buildEquipmentUpdate = (
  data
) => {
  const update = {};

  for (const field of editableEquipmentFields) {
    if (
      Object.prototype.hasOwnProperty.call(
        data,
        field
      )
    ) {
      update[field] =
        typeof data[field] === "string"
          ? data[field].trim()
          : data[field];
    }
  }

  update.updatedAt = new Date();

  return update;
};