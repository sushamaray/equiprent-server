
export const uploadEquipmentImage = async (req, res) => {
  try {
    const apiKey = process.env.IMGBB_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: "Image upload service is not configured",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "An image file is required",
      });
    }

    const endpoint = new URL(
      "https://api.imgbb.com/1/upload"
    );

    endpoint.searchParams.set("key", apiKey);

    const formData = new URLSearchParams({
      image: req.file.buffer.toString("base64"),
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
      signal: AbortSignal.timeout(20000),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.success) {
      console.error(
        "ImgBB upload rejected:",
        result?.error?.message || response.status
      );

      return res.status(502).json({
        success: false,
        message: "Image hosting service rejected the upload",
      });
    }

    const imageUrl =
      result.data?.display_url || result.data?.url;

    if (
      typeof imageUrl !== "string" ||
      !imageUrl.startsWith("https://")
    ) {
      return res.status(502).json({
        success: false,
        message: "Image hosting returned an invalid URL",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Equipment image uploaded successfully",
      image: {
        url: imageUrl,
        deleteUrl: undefined,
      },
    });
  } catch (error) {
    console.error(
      "Equipment image upload failed:",
      error.name === "TimeoutError"
        ? "ImgBB request timed out"
        : error.message
    );

    return res.status(502).json({
      success: false,
      message:
        error.name === "TimeoutError"
          ? "Image upload timed out. Please try again."
          : "Failed to upload equipment image",
    });
  }
};