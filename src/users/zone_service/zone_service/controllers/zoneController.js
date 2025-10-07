const mongoose = require("mongoose");
const Zone = require("../models/zone.model.js");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils.js");

/**
 * @desc    Crear una nueva zona
 * @route   POST /api/zones
 * @access  Private
 */
const createZone = async (req, res) => {
  try {
    const { code, name, location, description, type } = req.body;

    if (!code) return errorResponse(res, 400, "Zone code is required");
    if (!name) return errorResponse(res, 400, "Zone name is required");
    if (!location || !location.city || !location.province)
      return errorResponse(
        res,
        400,
        "Location with city and province is required"
      );

    // Validar si el código ya existe
    const existingZone = await Zone.findOne({ code: code.toUpperCase() });
    if (existingZone)
      return errorResponse(res, 409, "Zone code already exists");

    const zone = new Zone({
      code,
      name,
      location,
      description,
      type,
      createdBy: req.usuario.userId,
    });

    const savedZone = await zone.save();

    return successResponse(res, 201, "Zone created successfully", savedZone);
  } catch (error) {
    console.error("Error creating zone:", error);
    return errorResponse(res, 500, "Error creating zone", error);
  }
};

/**
 * @desc    Obtener todas las zonas
 * @route   GET /api/zones
 * @access  Private
 */
const getAllZones = async (req, res) => {
  try {
    const zones = await Zone.find()
      .populate("createdBy", "nombre apellido correo")
      .sort({ createdAt: -1 });

    return successResponse(res, 200, "Zones fetched successfully", zones, {
      count: zones.length,
    });
  } catch (error) {
    console.error("Error fetching zones:", error);
    return errorResponse(res, 500, "Error fetching zones", error);
  }
};

/**
 * @desc    Obtener una zona por ID
 * @route   GET /api/zones/:id
 * @access  Private
 */
const getZoneById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return errorResponse(res, 400, "Invalid Zone ID");

    const zone = await Zone.findById(id).populate(
      "createdBy",
      "nombre apellido correo"
    );

    if (!zone) return errorResponse(res, 404, "Zone not found");

    return successResponse(res, 200, "Zone fetched successfully", zone);
  } catch (error) {
    console.error("Error fetching zone:", error);
    return errorResponse(res, 500, "Error fetching zone", error);
  }
};

/**
 * @desc    Actualizar una zona
 * @route   PUT /api/zones/:id
 * @access  Private
 */
const updateZone = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updatedAt: Date.now() };

    if (!mongoose.Types.ObjectId.isValid(id))
      return errorResponse(res, 400, "Invalid Zone ID");

    const zone = await Zone.findById(id);
    if (!zone) return errorResponse(res, 404, "Zone not found");

    if (updates.code && updates.code !== zone.code) {
      const conflict = await Zone.findOne({ code: updates.code.toUpperCase() });
      if (conflict)
        return errorResponse(res, 409, "Another zone with this code exists");
    }

    const updatedZone = await Zone.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    return successResponse(res, 200, "Zone updated successfully", updatedZone);
  } catch (error) {
    console.error("Error updating zone:", error);
    return errorResponse(res, 500, "Error updating zone", error);
  }
};

/**
 * @desc    Eliminar una zona
 * @route   DELETE /api/zones/:id
 * @access  Private
 */
const deleteZone = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return errorResponse(res, 400, "Invalid Zone ID");

    const zone = await Zone.findById(id);
    if (!zone) return errorResponse(res, 404, "Zone not found");

    await Zone.findByIdAndDelete(id);

    return successResponse(res, 200, "Zone deleted successfully", zone);
  } catch (error) {
    console.error("Error deleting zone:", error);
    return errorResponse(res, 500, "Error deleting zone", error);
  }
};

module.exports = {
  createZone,
  getAllZones,
  getZoneById,
  updateZone,
  deleteZone,
};
