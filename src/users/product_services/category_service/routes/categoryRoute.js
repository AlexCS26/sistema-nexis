const express = require("express");
const router = express.Router();
const {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController.js");
const {
  verificarToken,
  verificarRol,
  validarObjectId,
} = require("../../../middlewares/protect.js");

/**
 * @desc    Crear una nueva categoría
 * @route   POST /api/categories
 * @access  Private
 */
router.post("/", verificarToken, verificarRol(["admin"]), createCategory);

/**
 * @desc    Obtener todas las categorías (opcional filtrado por code o type)
 * @route   GET /api/categories
 * @access  Private
 */
router.get("/", verificarToken, getAllCategories);

/**
 * @desc    Obtener categoría por ID
 * @route   GET /api/categories/:id
 * @access  Private
 */
router.get("/:id", verificarToken, validarObjectId, getCategoryById);

/**
 * @desc    Actualizar una categoría existente
 * @route   PUT /api/categories/:id
 * @access  Private
 */
router.put(
  "/:id",
  verificarToken,
  verificarRol(["admin"]),
  validarObjectId,
  updateCategory
);

/**
 * @desc    Eliminar (soft delete) una categoría
 * @route   DELETE /api/categories/:id
 * @access  Private
 */
router.delete(
  "/:id",
  verificarToken,
  verificarRol(["admin"]),
  validarObjectId,
  deleteCategory
);

module.exports = router;
