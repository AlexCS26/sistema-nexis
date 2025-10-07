const express = require("express");
const router = express.Router();
const VentaController = require("../controllers/ventaController");
const {
  verificarToken,
  verificarRol,
  validarObjectId,
} = require("../../../middlewares/protect");

// 🔐 Todas las rutas protegidas con token
router.use(verificarToken);

/**
 * @desc    Crear una nueva venta
 * @route   POST /api/ventas
 * @access  Private (admin, vendedor)
 */
router.post(
  "/",
  verificarRol(["admin", "vendedor"]),
  VentaController.crearVenta
);

/**
 * @desc    Obtener todas las ventas
 * @route   GET /api/ventas
 * @access  Private (admin, vendedor, optometrista, tecnico)
 */
router.get(
  "/",
  verificarRol(["admin", "vendedor", "optometrista", "tecnico"]),
  VentaController.obtenerVentas
);

/**
 * @desc    Obtener una venta por ID
 * @route   GET /api/ventas/:id
 * @access  Private (admin, vendedor, optometrista, tecnico)
 */
router.get(
  "/:id",
  validarObjectId,
  verificarRol(["admin", "vendedor", "optometrista", "tecnico"]),
  VentaController.obtenerVenta
);

/**
 * @desc    Actualizar una venta por ID
 * @route   PUT /api/ventas/:id
 * @access  Private (admin, vendedor)
 */
router.put(
  "/:id",
  validarObjectId,
  verificarRol(["admin", "vendedor"]),
  VentaController.actualizarVenta
);

/**
 * @desc    Eliminar una venta por ID
 * @route   DELETE /api/ventas/:id
 * @access  Private (admin)
 */
router.delete(
  "/:id",
  validarObjectId,
  verificarRol(["admin"]),
  VentaController.eliminarVenta
);

/**
 * @desc    Registrar un pago a una venta
 * @route   POST /api/ventas/:id/pagos
 * @access  Private (admin, cajero, vendedor)
 */
router.post(
  "/:id/pagos",
  validarObjectId,
  verificarRol(["admin", "cajero", "vendedor"]),
  VentaController.registrarPago
);

/**
 * @desc    Actualizar el estado de entrega de una venta
 * @route   PUT /api/ventas/:id/estado-entrega
 * @access  Private (admin, vendedor, tecnico)
 */
router.put(
  "/:id/estado-entrega",
  validarObjectId,
  verificarRol(["admin", "vendedor", "tecnico"]),
  VentaController.actualizarEstadoEntrega
);

/**
 * @desc    Obtener movimientos de una venta
 * @route   GET /api/ventas/:id/movements
 * @access  Private (admin, vendedor, inventario)
 */
router.get(
  "/:id/movements",
  validarObjectId,
  verificarRol(["admin", "vendedor", "inventario"]),
  VentaController.obtenerMovimientosVenta
);

/**
 * @desc    Reporte: Productos vendidos
 * @route   GET /api/ventas/reportes/productos-vendidos
 * @access  Private (admin, vendedor, inventario)
 */
router.get(
  "/reportes/productos-vendidos",
  verificarRol(["admin", "vendedor", "inventario"]),
  VentaController.obtenerProductosVendidos
);

/**
 * @desc    Reporte: Estado de ventas (logística)
 * @route   GET /api/ventas/reportes/estado-ventas
 * @access  Private (admin, vendedor, tecnico)
 */
router.get(
  "/reportes/estado-ventas",
  verificarRol(["admin", "vendedor", "tecnico"]),
  VentaController.obtenerEstadoVentas
);

/**
 * @desc    Reporte: Ventas por vendedora
 * @route   GET /api/ventas/reportes/vendedoras
 * @access  Private (admin, vendedor)
 */
router.get(
  "/reportes/vendedoras",
  verificarRol(["admin", "vendedor"]),
  VentaController.obtenerVentasPorVendedora
);

/**
 * @desc    Estadísticas generales de ventas
 * @route   GET /api/ventas/estadisticas/generales
 * @access  Private (admin, vendedor)
 */
router.get(
  "/estadisticas/generales",
  verificarRol(["admin", "vendedor"]),
  VentaController.obtenerEstadisticasGenerales
);
/**
 * @desc    Generar reporte de ventas en Excel profesional
 * @route   GET /api/ventas/reportes/excel
 * @access  Private (admin, gerente, vendedor)
 */
router.get(
  "/reportes/excel",
  verificarRol(["admin", "gerente", "vendedor"]),
  VentaController.generarReporteExcel
);
/**
 * @desc    Generar PDF de la venta
 * @route   GET /api/ventas/:id/pdf
 * @access  Private (admin, vendedor, optometrista, tecnico)
 */
router.get(
  "/:id/pdf",
  validarObjectId,
  verificarRol(["admin", "vendedor", "optometrista", "tecnico"]),
  VentaController.generarPDF
);

module.exports = router;
