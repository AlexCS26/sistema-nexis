const express = require("express");
const router = express.Router();
const zoneController = require("../controllers/zoneController.js");
const {
  verificarToken,
  verificarRol,
  validarObjectId,
} = require("../../../middlewares/protect.js");

/**
 * @desc    Crear una nueva zona
 * @route   POST /api/zones
 * @access  Private (solo admin)
 */
router.post(
  "/",
  verificarToken,
  verificarRol(["admin"]),
  zoneController.createZone
);

/**
 * @desc    Obtener todas las zonas
 * @route   GET /api/zones
 * @access  Private
 */
router.get("/", verificarToken, zoneController.getAllZones);

/**
 * @desc    Obtener una zona por ID
 * @route   GET /api/zones/:id
 * @access  Private
 */
router.get("/:id", verificarToken, validarObjectId, zoneController.getZoneById);

/**
 * @desc    Actualizar una zona existente
 * @route   PUT /api/zones/:id
 * @access  Private (solo admin)
 */
router.put(
  "/:id",
  verificarToken,
  verificarRol(["admin"]),
  validarObjectId,
  zoneController.updateZone
);

/**
 * @desc    Eliminar una zona
 * @route   DELETE /api/zones/:id
 * @access  Private (solo admin)
 */
router.delete(
  "/:id",
  verificarToken,
  verificarRol(["admin"]),
  validarObjectId,
  zoneController.deleteZone
);

module.exports = router;
