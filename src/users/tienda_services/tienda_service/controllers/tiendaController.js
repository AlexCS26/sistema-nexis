// controllers/tienda.controller.js
const Tienda = require("../models/tienda.model");
const AuditLog = require("../../../audit_service/audit_service/models/audit.model");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

// 📝 Helper para registrar en auditoría
const registrarAuditoria = async ({
  entityType,
  entityId,
  action,
  before,
  after,
  updatedFields = [],
  user,
  req,
  description = "",
}) => {
  try {
    await AuditLog.create({
      entityType,
      entityId,
      action,
      changes: { before, after, updatedFields },
      performedBy: user?.userId, // 🔑 ahora coincide con req.usuario
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      description,
    });
  } catch (err) {
    console.error("Error registrando auditoría:", err.message);
  }
};

/**
 * @desc    Crear una nueva tienda
 * @route   POST /api/tiendas
 * @access  Private (admin)
 */
const createTienda = async (req, res) => {
  try {
    const {
      code,
      name,
      description,
      address,
      contact,
      managersHistory,
      openingHours,
      taxInfo,
      settings,
    } = req.body;

    // Validar código único
    const existing = await Tienda.findOne({ code });
    if (existing) {
      return errorResponse(
        res,
        400,
        "El código de tienda ya está registrado / Store code already exists"
      );
    }

    if (!req.usuario || !req.usuario.userId) {
      return errorResponse(
        res,
        401,
        "Usuario no autenticado / Unauthorized user"
      );
    }

    const nuevaTienda = new Tienda({
      code,
      name,
      description,
      address,
      contact,
      managersHistory,
      openingHours,
      taxInfo,
      settings,
      creadoPor: req.usuario.userId, // 🔑 corregido
    });

    await nuevaTienda.save();

    // Auditoría
    await registrarAuditoria({
      entityType: "Tienda",
      entityId: nuevaTienda._id,
      action: "create",
      before: null,
      after: nuevaTienda.toObject(),
      user: req.usuario,
      req,
      description: `Tienda creada (${name})`,
    });

    return successResponse(
      res,
      201,
      "Tienda creada con éxito / Store successfully created",
      nuevaTienda
    );
  } catch (error) {
    return errorResponse(
      res,
      500,
      "Error al crear la tienda / Error creating store",
      error
    );
  }
};

/**
 * @desc    Actualizar tienda
 * @route   PUT /api/tiendas/:id
 * @access  Private (admin)
 */
const updateTienda = async (req, res) => {
  try {
    const { id } = req.params;
    const beforeUpdate = await Tienda.findById(id);

    if (!beforeUpdate) {
      return errorResponse(res, 404, "Tienda no encontrada / Store not found");
    }

    const tiendaActualizada = await Tienda.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    const updatedFields = Object.keys(req.body);

    // Auditoría
    await registrarAuditoria({
      entityType: "Tienda",
      entityId: id,
      action: "update",
      before: beforeUpdate.toObject(),
      after: tiendaActualizada.toObject(),
      updatedFields,
      user: req.usuario,
      req,
      description: `Tienda actualizada (${beforeUpdate.name})`,
    });

    return successResponse(
      res,
      200,
      "Tienda actualizada con éxito / Store successfully updated",
      tiendaActualizada
    );
  } catch (error) {
    return errorResponse(
      res,
      500,
      "Error al actualizar la tienda / Error updating store",
      error
    );
  }
};

/**
 * @desc    Eliminar (soft delete) tienda
 * @route   DELETE /api/tiendas/:id
 * @access  Private (admin)
 */
const deleteTienda = async (req, res) => {
  try {
    const { id } = req.params;
    const tienda = await Tienda.findById(id);

    if (!tienda) {
      return errorResponse(res, 404, "Tienda no encontrada / Store not found");
    }

    const beforeDelete = tienda.toObject();

    tienda.isActive = false;
    await tienda.save();

    // Auditoría
    await registrarAuditoria({
      entityType: "Tienda",
      entityId: id,
      action: "delete",
      before: beforeDelete,
      after: tienda.toObject(),
      user: req.usuario,
      req,
      description: `Tienda desactivada (${tienda.name})`,
    });

    return successResponse(
      res,
      200,
      "Tienda desactivada con éxito / Store successfully deactivated",
      tienda
    );
  } catch (error) {
    return errorResponse(
      res,
      500,
      "Error al eliminar la tienda / Error deleting store",
      error
    );
  }
};

/**
 * @desc    Listar todas las tiendas activas
 * @route   GET /api/tiendas
 * @access  Private (admin, supervisor)
 */
const getTiendas = async (req, res) => {
  try {
    const tiendas = await Tienda.find(
      { isActive: true },
      // Seleccionamos solo campos importantes
      "code name description address contact openingHours taxInfo isActive creadoPor fechaRegistro"
    ).populate("creadoPor", "nombre apellido correo rol");

    return successResponse(
      res,
      200,
      "Tiendas obtenidas con éxito / Stores retrieved successfully",
      tiendas
    );
  } catch (error) {
    return errorResponse(
      res,
      500,
      "Error al obtener tiendas / Error retrieving stores",
      error
    );
  }
};

module.exports = {
  createTienda,
  updateTienda,
  deleteTienda,
  getTiendas,
};
