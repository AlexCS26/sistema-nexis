const express = require("express");
const router = express.Router();
const {
  registrarLuna,
  obtenerLunas,
  obtenerMedidasPorIdLuna,
  obtenerLunaPorId,
  actualizarStock,
  eliminarLuna,
  exportarLunasAExcel,
  obtenerInsightsIA,
  obtenerReporteStock,
} = require("../controllers/lunaController");

const {
  verificarToken,
  verificarRol,
  validarObjectId,
} = require("../../../middlewares/protect");

/**
 * @desc    Registrar una nueva luna
 * @route   POST /api/lunas
 * @access  Private (almacen, admin)
 */
router.post(
  "/",
  verificarToken,
  verificarRol(["almacen", "admin"]),
  registrarLuna
);

/**
 * @desc    Obtener todas las lunas
 * @route   GET /api/lunas
 * @access  Private
 */
router.get("/", verificarToken, obtenerLunas);

/**
 * @desc    Exportar lunas a Excel
 * @route   GET /api/lunas/exportar/excel
 * @access  Private (admin, almacen)
 */
router.get(
  "/exportar/excel",
  verificarToken,
  verificarRol(["admin", "almacen"]),
  exportarLunasAExcel
);

/**
 * @desc    Obtener insights de IA sobre stock
 * @route   POST /api/lunas/insights
 * @access  Private (admin, almacen)
 */
router.post(
  "/insights",
  verificarToken,
  verificarRol(["admin", "almacen"]),
  obtenerInsightsIA
);

/**
 * @desc    Reporte unificado de stock
 * @route   GET /api/lunas/reporte-stock
 * @access  Private (admin, almacen)
 */
router.get(
  "/reporte-stock",
  verificarToken,
  verificarRol(["admin", "almacen"]),
  obtenerReporteStock
);

/**
 * @desc    Obtener medidas disponibles por ID de luna
 * @route   GET /api/lunas/medidas/:id
 * @access  Private
 */
router.get(
  "/medidas/:id",
  verificarToken,
  validarObjectId,
  obtenerMedidasPorIdLuna
);

/**
 * @desc    Obtener una luna por ID
 * @route   GET /api/lunas/:id
 * @access  Private
 */
router.get("/:id", verificarToken, validarObjectId, obtenerLunaPorId);

/**
 * @desc    Actualizar stock de una luna
 * @route   PATCH /api/lunas/:id/stock
 * @access  Private (almacen, admin)
 */
router.patch(
  "/:id/stock",
  verificarToken,
  verificarRol(["almacen", "admin"]),
  validarObjectId,
  actualizarStock
);

/**
 * @desc    Eliminar una luna
 * @route   DELETE /api/lunas/:id
 * @access  Private (admin)
 */
router.delete(
  "/:id",
  verificarToken,
  verificarRol(["admin"]),
  validarObjectId,
  eliminarLuna
);

module.exports = router;
