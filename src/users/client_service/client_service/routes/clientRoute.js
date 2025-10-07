// routes/clientRoutes.js
const express = require("express");
const router = express.Router();
const {
  crearCliente,
  obtenerClientes,
} = require("../controllers/clientController");
const {
  verificarToken,
  verificarRol,
} = require("../../../middlewares/protect");

/**
 * @desc    Registrar un nuevo cliente
 * @route   POST /api/clients
 * @access  Private (admin, vendedor)
 */
router.post(
  "/",
  verificarToken,
  verificarRol(["admin", "vendedor"]),
  crearCliente
);

/**
 * @desc    Obtener clientes con búsqueda, paginación y orden
 * @route   GET /api/clients
 * @access  Private (admin, vendedor)
 * @query   search, page, limit, sortBy, order
 */
router.get(
  "/",
  verificarToken,
  verificarRol(["admin", "vendedor"]),
  obtenerClientes
);

module.exports = router;
