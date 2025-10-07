const mongoose = require("mongoose");
const Variant = require("../models/variant.model.js");
const Product = require("../../product_service/models/product.model.js");
const Zone = require("../../../zone_service/zone_service/models/zone.model.js");
const { updateProductStock } = require("../../../utils/updateProductStock");
const MovementHelper = require("../../../utils/movementHelper.js");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils.js");

/**
 * @desc    Crear una nueva variante
 * @route   POST /api/variants
 * @access  Private
 */
const createVariant = async (req, res) => {
  // ❌ ELIMINAR TRANSACCIÓN - Usar operaciones individuales
  try {
    const { productId, code, color, size, material, stockByZone } = req.body;

    // Validaciones
    if (!productId) {
      return errorResponse(res, 400, "Product ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return errorResponse(res, 400, "Product ID is not valid");
    }

    if (!code?.trim()) {
      return errorResponse(res, 400, "Variant code is required");
    }

    if (!Array.isArray(stockByZone) || stockByZone.length === 0) {
      return errorResponse(
        res,
        400,
        "stockByZone is required and must be a non-empty array"
      );
    }

    // Validar zonas
    const zoneIds = stockByZone.map((sz) => sz.zoneId).filter(Boolean);
    const existingZones = await Zone.find(
      { _id: { $in: zoneIds } },
      { _id: 1, code: 1, name: 1 }
    );
    const existingZoneIds = existingZones.map((zone) => zone._id.toString());

    const invalidZones = zoneIds.filter(
      (zoneId) => !existingZoneIds.includes(zoneId.toString())
    );
    if (invalidZones.length > 0) {
      return errorResponse(
        res,
        400,
        `Invalid zones: ${invalidZones.join(", ")}`
      );
    }

    // Crear mapa de zonas
    const zoneMap = new Map();
    existingZones.forEach((zone) => {
      zoneMap.set(zone._id.toString(), zone);
    });

    // Validar precios
    const invalidPrices = stockByZone.filter(
      (sz) => sz.price === undefined || sz.price === null || sz.price < 0
    );
    if (invalidPrices.length > 0) {
      return errorResponse(res, 400, "Valid price is required for each zone");
    }

    // Obtener producto
    const product = await Product.findById(productId);
    if (!product) {
      return errorResponse(res, 404, "Product not found");
    }

    // Validar código duplicado
    const existingVariant = await Variant.findOne({
      productId,
      code: code.trim(),
    });

    if (existingVariant) {
      return errorResponse(
        res,
        409,
        "Variant with the same code already exists for this product"
      );
    }

    // Preparar stockByZone
    const stockWithZoneData = stockByZone.map((sz) => {
      const zone = zoneMap.get(sz.zoneId.toString());
      return {
        zoneId: sz.zoneId,
        zoneCode: zone.code.trim(),
        zoneName: zone.name.trim(),
        stock: Math.max(0, sz.stock ?? 0),
        price: Math.max(0, sz.price),
      };
    });

    // Crear variante
    const variant = new Variant({
      productId,
      categoryId: product.categoryId,
      code: code.trim(),
      color: color?.trim(),
      size: size?.trim(),
      material: material?.trim(),
      stockByZone: stockWithZoneData,
    });

    const savedVariant = await variant.save();

    // Actualizar producto
    await Product.findByIdAndUpdate(productId, {
      $push: { variants: savedVariant._id },
      updatedAt: Date.now(),
    });

    // 🔹 Crear movimientos EN SERIE (no en paralelo)
    for (const zoneStock of stockWithZoneData) {
      if (zoneStock.stock > 0) {
        await MovementHelper.createInitialStockMovement(
          savedVariant,
          zoneStock,
          req.usuario
          // ❌ Sin session
        );
      }
    }

    // Actualizar stock del producto
    await updateProductStock(productId);

    return successResponse(
      res,
      201,
      "Variant created successfully",
      savedVariant
    );
  } catch (error) {
    console.error("Error creating variant:", error);
    return errorResponse(
      res,
      500,
      error.message || "Error creating variant",
      error
    );
  }
};

/**
 * @desc    Actualizar una variante existente
 * @route   PUT /api/variants/:id
 * @access  Private
 */
const updateVariant = async (req, res) => {
  // ❌ ELIMINAR TRANSACCIÓN
  try {
    const { id } = req.params;
    const updates = { ...req.body, updatedAt: Date.now() };

    if (!id) {
      return errorResponse(res, 400, "Variant ID is required");
    }

    const variant = await Variant.findById(id);
    if (!variant) {
      return errorResponse(res, 404, "Variant not found");
    }

    // Validar código duplicado
    if (updates.code && updates.code.trim() !== variant.code) {
      const conflict = await Variant.findOne({
        productId: variant.productId,
        code: updates.code.trim(),
        _id: { $ne: id },
      });

      if (conflict) {
        return errorResponse(
          res,
          409,
          "Another variant with the same code exists for this product"
        );
      }
      updates.code = updates.code.trim();
    }

    const oldStockByZone = variant.stockByZone || [];

    // Procesar stockByZone si se proporciona
    if (updates.stockByZone) {
      if (!Array.isArray(updates.stockByZone)) {
        return errorResponse(res, 400, "stockByZone must be an array");
      }

      // Validar zonas
      const zoneIds = updates.stockByZone
        .map((sz) => sz.zoneId)
        .filter(Boolean);
      const existingZones = await Zone.find(
        { _id: { $in: zoneIds } },
        { _id: 1, code: 1, name: 1 }
      );
      const existingZoneIds = existingZones.map((zone) => zone._id.toString());

      const invalidZones = zoneIds.filter(
        (zoneId) => !existingZoneIds.includes(zoneId.toString())
      );
      if (invalidZones.length > 0) {
        return errorResponse(
          res,
          400,
          `Invalid zones: ${invalidZones.join(", ")}`
        );
      }

      const zoneMap = new Map();
      existingZones.forEach((zone) => {
        zoneMap.set(zone._id.toString(), zone);
      });

      // Validar precios
      const invalidPrices = updates.stockByZone.filter(
        (sz) => sz.price === undefined || sz.price === null || sz.price < 0
      );
      if (invalidPrices.length > 0) {
        return errorResponse(res, 400, "Valid price is required for each zone");
      }

      updates.stockByZone = updates.stockByZone.map((sz) => {
        const zone = zoneMap.get(sz.zoneId.toString());
        return {
          zoneId: sz.zoneId,
          zoneCode: zone.code.trim(),
          zoneName: zone.name.trim(),
          stock: Math.max(0, sz.stock ?? 0),
          price: Math.max(0, sz.price),
        };
      });
    }

    const updatedVariant = await Variant.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    await updateProductStock(variant.productId);

    // 🔹 Procesar movimientos de ajuste EN SERIE
    if (updates.stockByZone) {
      const newStockByZone = updates.stockByZone;

      for (const newZone of newStockByZone) {
        const oldZone = oldStockByZone.find(
          (z) => z.zoneId.toString() === newZone.zoneId.toString()
        );

        const oldStock = oldZone ? oldZone.stock : 0;
        const newStock = newZone.stock || 0;
        const difference = newStock - oldStock;

        if (difference !== 0) {
          await MovementHelper.createStockAdjustmentMovement(
            variant,
            newZone,
            oldStock,
            newStock,
            req.usuario
            // ❌ Sin session
          );
        }
      }
    }

    return successResponse(
      res,
      200,
      "Variant updated successfully",
      updatedVariant
    );
  } catch (error) {
    console.error("Error updating variant:", error);
    return errorResponse(
      res,
      500,
      error.message || "Error updating variant",
      error
    );
  }
};

/**
 * @desc    Eliminar una variante
 * @route   DELETE /api/variants/:id
 * @access  Private
 */
const deleteVariant = async (req, res) => {
  // ❌ ELIMINAR TRANSACCIÓN
  try {
    const { id } = req.params;
    if (!id) return errorResponse(res, 400, "Variant ID is required");

    const variant = await Variant.findById(id);
    if (!variant) return errorResponse(res, 404, "Variant not found");

    // 🔹 Crear movimientos de eliminación EN SERIE
    if (variant.stockByZone && variant.stockByZone.length > 0) {
      for (const zoneStock of variant.stockByZone) {
        if (zoneStock.stock > 0) {
          await MovementHelper.createDeletionMovement(
            variant,
            zoneStock,
            req.usuario
            // ❌ Sin session
          );
        }
      }
    }

    // Eliminar variante
    await Variant.findByIdAndDelete(id);

    // Actualizar producto
    await Product.findByIdAndUpdate(variant.productId, {
      $pull: { variants: variant._id },
      updatedAt: Date.now(),
    });

    // Actualizar stock del producto
    await updateProductStock(variant.productId);

    return successResponse(res, 200, "Variant deleted successfully", variant);
  } catch (error) {
    console.error("Error deleting variant:", error);
    return errorResponse(
      res,
      500,
      error.message || "Error deleting variant",
      error
    );
  }
};

/**
 * @desc    Obtener todas las variantes
 * @route   GET /api/variants
 * @access  Private
 */
const getAllVariants = async (req, res) => {
  try {
    const { productId, categoryId, withStock } = req.query;
    const query = {};

    if (productId) query.productId = productId;
    if (categoryId) query.categoryId = categoryId;
    if (withStock === "true") {
      query["stockByZone.stock"] = { $gt: 0 };
    }

    const variants = await Variant.find(query)
      .populate("categoryId", "code name")
      .populate("productId", "code name")
      .sort({ createdAt: -1 });

    return successResponse(
      res,
      200,
      "Variants fetched successfully",
      variants,
      { count: variants.length }
    );
  } catch (error) {
    console.error("Error fetching variants:", error);
    return errorResponse(
      res,
      500,
      error.message || "Error fetching variants",
      error
    );
  }
};

/**
 * @desc    Obtener una variante por ID
 * @route   GET /api/variants/:id
 * @access  Private
 */
const getVariantById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return errorResponse(res, 400, "Variant ID is required");

    const variant = await Variant.findById(id)
      .populate("categoryId", "code name")
      .populate("productId", "code name");

    if (!variant) return errorResponse(res, 404, "Variant not found");

    return successResponse(res, 200, "Variant fetched successfully", variant);
  } catch (error) {
    console.error("Error fetching variant:", error);
    return errorResponse(
      res,
      500,
      error.message || "Error fetching variant",
      error
    );
  }
};

/**
 * @desc    Obtener movimientos de una variante
 * @route   GET /api/variants/:id/movements
 * @access  Private
 */
const getVariantMovements = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    if (!id) return errorResponse(res, 400, "Variant ID is required");

    const variant = await Variant.findById(id);
    if (!variant) return errorResponse(res, 404, "Variant not found");

    const options = {};
    if (startDate || endDate) {
      options.dateRange = {
        start: startDate ? new Date(startDate) : new Date("2000-01-01"),
        end: endDate ? new Date(endDate) : new Date(),
      };
    }

    const movements = await MovementHelper.getMovementsByReference(
      "Variant",
      id,
      options
    );

    return successResponse(
      res,
      200,
      "Variant movements fetched successfully",
      movements,
      { count: movements.length }
    );
  } catch (error) {
    console.error("Error fetching variant movements:", error);
    return errorResponse(
      res,
      500,
      error.message || "Error fetching variant movements",
      error
    );
  }
};

module.exports = {
  createVariant,
  getAllVariants,
  getVariantById,
  updateVariant,
  deleteVariant,
  getVariantMovements,
};
