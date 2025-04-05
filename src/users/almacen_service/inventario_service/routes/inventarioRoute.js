const express = require("express");
const router = express.Router();
const {
  registrarMovimiento,
  obtenerHistorial,
} = require("../controllers/inventarioController");

const {
  verificarToken,
  verificarRol,
} = require("../../../middlewares/protect");

// 📌 Registrar un movimiento en el inventario (Solo "almacen" o "admin")
router.post(
  "/",
  verificarToken,
  verificarRol(["almacen", "admin"]),
  registrarMovimiento
);

// 📌 Obtener historial de inventario (Debe estar autenticado)
router.get("/", verificarToken, obtenerHistorial);

module.exports = router;
