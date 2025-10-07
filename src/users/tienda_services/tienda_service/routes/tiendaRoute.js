// routes/tienda.routes.js
const express = require("express");
const router = express.Router();

const {
  createTienda,
  updateTienda,
  deleteTienda,
  getTiendas,
} = require("../controllers/tiendaController");

const {
  verificarToken,
  verificarRol,
  validarObjectId,
} = require("../../../middlewares/protect");

// 🔐 Todas las rutas de tienda protegidas con token
router.use(verificarToken);

/**
 * @desc    Crear una nueva tienda
 * @route   POST /api/tiendas
 * @access  Private (admin)
 */
router.post("/", verificarRol(["admin"]), createTienda);

/**
 * @desc    Actualizar tienda
 * @route   PUT /api/tiendas/:id
 * @access  Private (admin, supervisor)
 */
router.put(
  "/:id",
  validarObjectId,
  verificarRol(["admin", "supervisor"]),
  updateTienda
);

/**
 * @desc    Eliminar (soft delete) tienda
 * @route   DELETE /api/tiendas/:id
 * @access  Private (admin)
 */
router.delete("/:id", validarObjectId, verificarRol(["admin"]), deleteTienda);
/**
 * @desc    Obtener todas las tiendas
 * @route   GET /api/tiendas
 * @access  Private (admin, supervisor)
 */
router.get("/", verificarRol(["admin", "supervisor"]), getTiendas);

module.exports = router;
