const express = require("express");
const router = express.Router();
const {
  createMeasure,
  getAllMeasures,
  getMeasureById,
  updateMeasure,
  deleteMeasure,
} = require("../controllers/measureController.js");
const {
  verificarToken,
  verificarRol,
  validarObjectId,
} = require("../../../middlewares/protect.js");

/**
 * @desc    Crear una nueva medida (Measure)
 * @route   POST /api/measures
 * @access  Private (solo admin)
 */
router.post("/", verificarToken, verificarRol(["admin"]), createMeasure);

/**
 * @desc    Obtener todas las medidas (opcional filtrado por productId)
 * @route   GET /api/measures
 * @access  Private
 */
router.get("/", verificarToken, getAllMeasures);

/**
 * @desc    Obtener una medida por ID
 * @route   GET /api/measures/:id
 * @access  Private
 */
router.get("/:id", verificarToken, validarObjectId, getMeasureById);

/**
 * @desc    Actualizar una medida existente
 * @route   PUT /api/measures/:id
 * @access  Private (solo admin)
 */
router.put(
  "/:id",
  verificarToken,
  verificarRol(["admin"]),
  validarObjectId,
  updateMeasure
);

/**
 * @desc    Eliminar una medida
 * @route   DELETE /api/measures/:id
 * @access  Private (solo admin)
 */
router.delete(
  "/:id",
  verificarToken,
  verificarRol(["admin"]),
  validarObjectId,
  deleteMeasure
);

module.exports = router;
