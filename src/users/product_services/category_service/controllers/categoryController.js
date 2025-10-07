const Category = require("../models/category.model.js");
const AuditLog = require("../../../audit_service/audit_service/models/audit.model.js"); // Nuevo modelo de auditoría
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils.js");
const { allowedCategoryCodes } = require("../../../config/index.js");

// Función auxiliar para registrar auditorías
const registrarAuditoria = async (auditData) => {
  try {
    const auditLog = new AuditLog({
      ...auditData,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get("User-Agent"),
    });
    await auditLog.save();
    return auditLog;
  } catch (error) {
    console.error("Error registrando auditoría:", error);
    // No lanzar error para no interrumpir el flujo principal
  }
};

/**
 * @desc    Crear una nueva categoría
 * @route   POST /api/categories
 * @access  Private
 */
const createCategory = async (req, res) => {
  try {
    const { code, name, description, type, icon, colorTag } = req.body;

    // Validar código usando config
    const categoryCode =
      code && allowedCategoryCodes.includes(code.toUpperCase())
        ? code.toUpperCase()
        : "OTH";

    // Validar nombre obligatorio
    if (!name || !name.trim()) {
      return errorResponse(res, 400, "Category name is required");
    }

    const category = new Category({
      code: categoryCode,
      name,
      description,
      type,
      icon,
      colorTag,
      createdBy: req.usuario.userId,
    });

    const savedCategory = await category.save();

    // REGISTRAR AUDITORÍA DE CREACIÓN
    await registrarAuditoria({
      entityType: "Category",
      entityId: savedCategory._id,
      action: "create",
      changes: {
        before: null,
        after: savedCategory.toObject(),
        updatedFields: Object.keys(savedCategory.toObject()),
      },
      performedBy: req.usuario.userId,
      description: `Categoría "${savedCategory.name}" creada`,
      relatedDocument: `CAT-${savedCategory.code}`,
    });

    return successResponse(
      res,
      201,
      "Category created successfully",
      savedCategory
    );
  } catch (error) {
    return errorResponse(res, 500, "Error creating category", error);
  }
};

/**
 * @desc    Obtener todas las categorías
 * @route   GET /api/categories
 * @access  Private
 */
const getAllCategories = async (req, res) => {
  try {
    const { code, type } = req.query;
    let query = {};

    if (code && allowedCategoryCodes.includes(code.toUpperCase()))
      query.code = code.toUpperCase();
    if (type) query.type = type;

    const categories = await Category.find(query).populate(
      "createdBy",
      "nombre apellido correo"
    );
    return successResponse(
      res,
      200,
      "Categories fetched successfully",
      categories,
      {
        count: categories.length,
      }
    );
  } catch (error) {
    return errorResponse(res, 500, "Error fetching categories", error);
  }
};

/**
 * @desc    Obtener categoría por ID
 * @route   GET /api/categories/:id
 * @access  Private
 */
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id)
      return successResponse(res, 200, "Category fetched successfully", []);

    const category = await Category.findById(id).populate(
      "createdBy",
      "nombre apellido correo"
    );
    return successResponse(
      res,
      200,
      "Category fetched successfully",
      category ? [category] : []
    );
  } catch (error) {
    return errorResponse(res, 500, "Error fetching category", error);
  }
};

/**
 * @desc    Actualizar una categoría existente
 * @route   PUT /api/categories/:id
 * @access  Private
 */
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener categoría actual antes de la actualización
    const categoriaActual = await Category.findById(id);
    if (!categoriaActual) {
      return errorResponse(res, 404, "Category not found");
    }

    const updates = { ...req.body, updatedAt: Date.now() };

    if (
      updates.code &&
      !allowedCategoryCodes.includes(updates.code.toUpperCase())
    ) {
      updates.code = "OTH";
    }

    const categoriaActualizada = await Category.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    // REGISTRAR AUDITORÍA DE ACTUALIZACIÓN
    const camposModificados = Object.keys(updates).filter(
      (key) =>
        JSON.stringify(categoriaActual[key]) !==
        JSON.stringify(categoriaActualizada[key])
    );

    if (camposModificados.length > 0) {
      await registrarAuditoria({
        entityType: "Category",
        entityId: categoriaActualizada._id,
        action: "update",
        changes: {
          before: categoriaActual.toObject(),
          after: categoriaActualizada.toObject(),
          updatedFields: camposModificados,
        },
        performedBy: req.usuario.userId,
        description: `Categoría "${
          categoriaActualizada.name
        }" actualizada - Campos modificados: ${camposModificados.join(", ")}`,
        relatedDocument: `CAT-${categoriaActualizada.code}`,
      });
    }

    return successResponse(
      res,
      200,
      "Category updated successfully",
      categoriaActualizada || []
    );
  } catch (error) {
    return errorResponse(res, 500, "Error updating category", error);
  }
};

/**
 * @desc    Eliminar (soft delete) una categoría
 * @route   DELETE /api/categories/:id
 * @access  Private
 */
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener categoría antes de eliminar
    const categoriaActual = await Category.findById(id);
    if (!categoriaActual) {
      return errorResponse(res, 404, "Category not found");
    }

    const category = await Category.findByIdAndUpdate(
      id,
      { isActive: false, updatedAt: Date.now() },
      { new: true }
    );

    // REGISTRAR AUDITORÍA DE ELIMINACIÓN
    await registrarAuditoria({
      entityType: "Category",
      entityId: category._id,
      action: "delete",
      changes: {
        before: categoriaActual.toObject(),
        after: category.toObject(),
        updatedFields: ["isActive"],
      },
      performedBy: req.usuario.userId,
      description: `Categoría "${category.name}" desactivada (soft delete)`,
      relatedDocument: `CAT-${category.code}`,
    });

    return successResponse(
      res,
      200,
      "Category deleted (soft delete) successfully",
      category || []
    );
  } catch (error) {
    return errorResponse(res, 500, "Error deleting category", error);
  }
};

/**
 * @desc    Obtener logs de auditoría de una categoría
 * @route   GET /api/categories/:id/audit-logs
 * @access  Private
 */
const getCategoryAuditLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const logs = await AuditLog.find({
      entityType: "Category",
      entityId: id,
    })
      .populate("performedBy", "nombre apellido correo")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AuditLog.countDocuments({
      entityType: "Category",
      entityId: id,
    });

    return successResponse(res, 200, "Audit logs fetched successfully", {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return errorResponse(res, 500, "Error fetching audit logs", error);
  }
};

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getCategoryAuditLogs, // Nuevo endpoint para auditorías
};
