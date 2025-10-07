// routes/reniecRoutes.js
const express = require("express");
const router = express.Router();
const { obtenerDatosPorDni } = require("../controllers/reniecController");
const {
  verificarToken,
  verificarRol,
} = require("../../../middlewares/protect");

/**
 * @desc    Obtener datos de una persona por DNI desde RENIEC
 * @route   GET /api/reniec/dni?dni=XXXXXXXX
 * @access  Private (admin, vendedor)
 */
router.get(
  "/dni",
  verificarToken,
  verificarRol(["admin", "vendedor"]), // Solo usuarios con rol admin o vendedor
  obtenerDatosPorDni
);

module.exports = router;
