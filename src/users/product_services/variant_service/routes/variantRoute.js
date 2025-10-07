const express = require("express");
const router = express.Router();
const variantController = require("../controllers/variantController.js");
const {
  verificarToken,
  verificarRol,
  validarObjectId,
} = require("../../../middlewares/protect.js");

/**
 * @desc    Crear una nueva variante
 * @route   POST /api/variants
 * @access  Private
 */
router.post(
  "/",
  verificarToken,
  verificarRol(["admin"]), // <- Aquí sí pasamos el rol
  variantController.createVariant
);

/**
 * @desc    Obtener todas las variantes
 * @route   GET /api/variants
 * @access  Private
 */
router.get("/", verificarToken, variantController.getAllVariants);

/**
 * @desc    Obtener una variante por ID
 * @route   GET /api/variants/:id
 * @access  Private
 */
router.get(
  "/:id",
  verificarToken,
  validarObjectId,
  variantController.getVariantById
);

/**
 * @desc    Actualizar una variante existente
 * @route   PUT /api/variants/:id
 * @access  Private
 */
router.put(
  "/:id",
  verificarToken,
  verificarRol(["admin"]), // <- Rol correcto
  validarObjectId,
  variantController.updateVariant
);

/**
 * @desc    Eliminar (soft delete) una variante
 * @route   DELETE /api/variants/:id
 * @access  Private
 */
router.delete(
  "/:id",
  verificarToken,
  verificarRol(["admin"]), // <- Rol correcto
  validarObjectId,
  variantController.deleteVariant
);

module.exports = router;
