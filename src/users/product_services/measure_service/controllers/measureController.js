const mongoose = require("mongoose");
const Measure = require("../models/measure.model.js");
const Product = require("../../product_service/models/product.model.js");
const Zone = require("../../../zone_service/zone_service/models/zone.model.js");
const { updateProductStock } = require("../../../utils/updateProductStock");
const MovementHelper = require("../../../utils/movementHelper.js"); // 🔹 AGREGAR IMPORT
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils.js");

/**
 * @desc    Calcular serie basada en el valor absoluto del cilindro
 */
const calculateSerie = (cylinder) => {
  const cilAbs = Math.abs(cylinder);
  if (cilAbs <= 2.0) return "Serie 1";
  if (cilAbs <= 4.0) return "Serie 2";
  if (cilAbs <= 6.0) return "Serie 3";
  return "Serie 4";
};

/**
 * @desc    Crear una nueva medida (Measure)
 * @route   POST /api/measures
 * @access  Private
 */
const createMeasure = async (req, res) => {
  try {
    const { productId, sphere, cylinder, add, stockByZone } = req.body;

    // Validaciones
    if (!productId) {
      return errorResponse(res, 400, "Product ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return errorResponse(res, 400, "Product ID is not valid");
    }

    if (sphere === undefined || sphere === null) {
      return errorResponse(res, 400, "Sphere value is required");
    }

    if (cylinder === undefined || cylinder === null) {
      return errorResponse(res, 400, "Cylinder value is required");
    }

    if (!Array.isArray(stockByZone) || stockByZone.length === 0) {
      return errorResponse(
        res,
        400,
        "stockByZone is required and must be a non-empty array"
      );
    }

    // Validar zonas de forma más eficiente
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

    // Validar medida duplicada
    const existingMeasure = await Measure.findOne({
      productId,
      sphere,
      cylinder,
      add: add || null,
    });

    if (existingMeasure) {
      return errorResponse(
        res,
        409,
        "A measure with the same sphere, cylinder and add already exists for this product"
      );
    }

    // Generar código de medida
    let measureCode = `${product.code}-S${sphere}-C${cylinder}`;
    if (add !== undefined && add !== null) measureCode += `-A${add}`;

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

    // Crear medida
    const measure = new Measure({
      productId,
      categoryId: product.categoryId,
      sphere,
      cylinder,
      add: add || null,
      serie: calculateSerie(cylinder),
      code: measureCode,
      stockByZone: stockWithZoneData,
      createdBy: req.usuario.userId,
    });

    const savedMeasure = await measure.save();

    // 🔹 NUEVO: Crear movimientos para medida
    for (const zoneStock of stockWithZoneData) {
      if (zoneStock.stock > 0) {
        await MovementHelper.createInitialStockMovementForMeasure(
          savedMeasure,
          zoneStock,
          req.usuario
        );
      }
    }

    // Actualizar stock del producto
    await updateProductStock(productId);

    return successResponse(
      res,
      201,
      "Measure created successfully",
      savedMeasure
    );
  } catch (error) {
    console.error("Error creating measure:", error);
    return errorResponse(
      res,
      500,
      error.message || "Error creating measure",
      error
    );
  }
};

/**
 * @desc    Actualizar una medida existente
 * @route   PUT /api/measures/:id
 * @access  Private
 */
const updateMeasure = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updatedAt: Date.now() };

    if (!id) {
      return errorResponse(res, 400, "Measure ID is required");
    }

    const measure = await Measure.findById(id);
    if (!measure) {
      return errorResponse(res, 404, "Measure not found");
    }

    // Validar duplicados de medidas
    if (
      (updates.sphere !== undefined && updates.sphere !== measure.sphere) ||
      (updates.cylinder !== undefined &&
        updates.cylinder !== measure.cylinder) ||
      (updates.add !== undefined && updates.add !== measure.add)
    ) {
      const conflict = await Measure.findOne({
        productId: measure.productId,
        sphere: updates.sphere ?? measure.sphere,
        cylinder: updates.cylinder ?? measure.cylinder,
        add: updates.add ?? measure.add,
        _id: { $ne: id },
      });

      if (conflict) {
        return errorResponse(
          res,
          409,
          "Another measure with the same sphere, cylinder and add exists for this product"
        );
      }
    }

    const oldStockByZone = measure.stockByZone || [];

    // Procesar stockByZone si se proporciona
    if (updates.stockByZone) {
      if (!Array.isArray(updates.stockByZone)) {
        return errorResponse(res, 400, "stockByZone must be an array");
      }

      // Validar zonas eficientemente
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

    // Actualizar serie si cambia el cilindro
    if (updates.cylinder !== undefined) {
      updates.serie = calculateSerie(updates.cylinder);
    }

    const updatedMeasure = await Measure.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    // Actualizar stock del producto
    await updateProductStock(measure.productId);

    // 🔹 NUEVO: Procesar movimientos de ajuste para medida
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
          await MovementHelper.createStockAdjustmentMovementForMeasure(
            measure,
            newZone,
            oldStock,
            newStock,
            req.usuario
          );
        }
      }
    }

    return successResponse(
      res,
      200,
      "Measure updated successfully",
      updatedMeasure
    );
  } catch (error) {
    console.error("Error updating measure:", error);
    return errorResponse(
      res,
      500,
      error.message || "Error updating measure",
      error
    );
  }
};

/**
 * @desc    Eliminar una medida
 * @route   DELETE /api/measures/:id
 * @access  Private
 */
const deleteMeasure = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return errorResponse(res, 400, "Measure ID is required");
    }

    const measure = await Measure.findById(id);
    if (!measure) {
      return errorResponse(res, 404, "Measure not found");
    }

    // 🔹 NUEVO: Crear movimientos de eliminación para medida
    if (measure.stockByZone && measure.stockByZone.length > 0) {
      for (const zoneStock of measure.stockByZone) {
        if (zoneStock.stock > 0) {
          await MovementHelper.createDeletionMovementForMeasure(
            measure,
            zoneStock,
            req.usuario
          );
        }
      }
    }

    // Eliminar medida
    await Measure.findByIdAndDelete(id);

    // Actualizar stock del producto
    await updateProductStock(measure.productId);

    return successResponse(res, 200, "Measure deleted successfully", measure);
  } catch (error) {
    console.error("Error deleting measure:", error);
    return errorResponse(
      res,
      500,
      error.message || "Error deleting measure",
      error
    );
  }
};

/**
 * @desc    Obtener todas las medidas
 * @route   GET /api/measures
 * @access  Private
 */
const getAllMeasures = async (req, res) => {
  try {
    const { productId, categoryId, withStock } = req.query;
    const query = {};

    if (productId) query.productId = productId;
    if (categoryId) query.categoryId = categoryId;
    if (withStock === "true") {
      query["stockByZone.stock"] = { $gt: 0 };
    }

    const measures = await Measure.find(query)
      .populate("categoryId", "code name")
      .populate("productId", "code name")
      .populate("createdBy", "nombre apellido correo")
      .populate("stockByZone.zoneId", "name code")
      .sort({ createdAt: -1 });

    return successResponse(
      res,
      200,
      "Measures fetched successfully",
      measures,
      { count: measures.length }
    );
  } catch (error) {
    console.error("Error fetching measures:", error);
    return errorResponse(
      res,
      500,
      error.message || "Error fetching measures",
      error
    );
  }
};

/**
 * @desc    Obtener una medida por ID
 * @route   GET /api/measures/:id
 * @access  Private
 */
const getMeasureById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return errorResponse(res, 400, "Measure ID is required");

    const measure = await Measure.findById(id)
      .populate("categoryId", "code name")
      .populate("productId", "code name")
      .populate("createdBy", "nombre apellido correo")
      .populate("stockByZone.zoneId", "name code");

    if (!measure) return errorResponse(res, 404, "Measure not found");

    return successResponse(res, 200, "Measure fetched successfully", measure);
  } catch (error) {
    console.error("Error fetching measure:", error);
    return errorResponse(
      res,
      500,
      error.message || "Error fetching measure",
      error
    );
  }
};

/**
 * @desc    Obtener movimientos de una medida
 * @route   GET /api/measures/:id/movements
 * @access  Private
 */
const getMeasureMovements = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    if (!id) return errorResponse(res, 400, "Measure ID is required");

    const measure = await Measure.findById(id);
    if (!measure) return errorResponse(res, 404, "Measure not found");

    const options = {};
    if (startDate || endDate) {
      options.dateRange = {
        start: startDate ? new Date(startDate) : new Date("2000-01-01"),
        end: endDate ? new Date(endDate) : new Date(),
      };
    }

    const movements = await MovementHelper.getMovementsByReference(
      "Measure",
      id,
      options
    );

    return successResponse(
      res,
      200,
      "Measure movements fetched successfully",
      movements,
      { count: movements.length }
    );
  } catch (error) {
    console.error("Error fetching measure movements:", error);
    return errorResponse(
      res,
      500,
      error.message || "Error fetching measure movements",
      error
    );
  }
};

module.exports = {
  createMeasure,
  updateMeasure,
  deleteMeasure,
  getAllMeasures,
  getMeasureById,
  getMeasureMovements, // 🔹 NUEVO método
};
