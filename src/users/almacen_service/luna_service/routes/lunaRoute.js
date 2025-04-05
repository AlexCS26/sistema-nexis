const express = require("express");
const router = express.Router();
const {
  registrarLuna,
  obtenerLunas,
  obtenerTiposDeLunas,
  obtenerMedidasPorIdLuna,
  obtenerLunaPorId,
  actualizarStock,
  eliminarLuna,
  obtenerStockPorTipo,
  exportarLunasAExcel, // Agregar el nuevo controlador
} = require("../controllers/lunaController");

const {
  verificarToken,
  verificarRol,
  validarObjectId,
} = require("../../../middlewares/protect");

// 📌 Registrar una nueva luna (Solo "almacen" o "admin")
router.post(
  "/",
  verificarToken,
  verificarRol(["almacen", "admin"]),
  registrarLuna
);

// 📌 Obtener todas las lunas (Cualquier usuario autenticado)
router.get("/", verificarToken, obtenerLunas);

// 📌 Exportar lunas a Excel (Cualquier usuario autenticado con roles permitidos)
router.get(
  "/exportar/excel",
  verificarToken,
  verificarRol(["admin", "almacen", "supervisor"]), // Solo estos roles pueden exportar
  exportarLunasAExcel
);

// 📌 Obtener tipos de lunas (Cualquier usuario autenticado)
router.get("/tipos", verificarToken, obtenerTiposDeLunas);

// 📌 Obtener stock total por tipo de luna (Cualquier usuario autenticado)
router.get("/stock-por-tipo", verificarToken, obtenerStockPorTipo);

// 📌 Obtener medidas disponibles por ID de luna (Cualquier usuario autenticado)
router.get(
  "/medidas/:id",
  verificarToken,
  validarObjectId,
  obtenerMedidasPorIdLuna
);

// 📌 Obtener una luna por ID (Cualquier usuario autenticado)
router.get("/:id", verificarToken, validarObjectId, obtenerLunaPorId);

// 📌 Actualizar stock de una luna (Solo "almacen" o "admin")
router.patch(
  "/:id/stock",
  verificarToken,
  verificarRol(["almacen", "admin"]),
  validarObjectId,
  actualizarStock
);

// 📌 Eliminar una luna (Solo "admin")
router.delete(
  "/:id",
  verificarToken,
  verificarRol(["admin"]),
  validarObjectId,
  eliminarLuna
);

module.exports = router;
