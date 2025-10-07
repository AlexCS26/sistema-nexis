const express = require("express");
const router = express.Router();
const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductsSummary, // 🔹 importar la función
} = require("../controllers/productController");

const {
  verificarToken,
  verificarRol,
  validarObjectId,
} = require("../../../middlewares/protect.js");

/**
 * @desc    Crear un nuevo producto
 * @route   POST /api/products
 * @access  Private (solo admin)
 */
router.post("/", verificarToken, verificarRol(["admin"]), createProduct);

/**
 * @desc    Obtener todos los productos
 * @route   GET /api/products
 * @access  Private
 */
router.get("/", verificarToken, getAllProducts);

/**
 * @desc    Obtener resumen de inventario
 * @route   GET /api/products/summary
 * @access  Private
 */
router.get("/summary", verificarToken, getProductsSummary);

/**
 * @desc    Obtener un producto por ID
 * @route   GET /api/products/:id
 * @access  Private
 */
router.get("/:id", verificarToken, validarObjectId, getProductById);

/**
 * @desc    Actualizar un producto existente
 * @route   PUT /api/products/:id
 * @access  Private (solo admin)
 */
router.put(
  "/:id",
  verificarToken,
  verificarRol(["admin"]),
  validarObjectId,
  updateProduct
);

/**
 * @desc    Eliminar (soft delete) un producto
 * @route   DELETE /api/products/:id
 * @access  Private (solo admin)
 */
router.delete(
  "/:id",
  verificarToken,
  verificarRol(["admin"]),
  validarObjectId,
  deleteProduct
);

module.exports = router;
