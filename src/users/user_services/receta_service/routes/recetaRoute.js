const express = require("express");
const router = express.Router();
const recetaController = require("../controllers/recetaController");
const {
  verificarToken,
  verificarRol,
  validarObjectId,
} = require("../../../middlewares/protect");

// 📌 Proteger todas las rutas con JWT
router.post(
  "/",
  verificarToken,
  verificarRol(["admin"]),
  recetaController.crearReceta
);
router.get("/", verificarToken, recetaController.obtenerRecetas);
router.get(
  "/:id",
  verificarToken,
  validarObjectId,
  recetaController.obtenerRecetaPorId
);
router.put(
  "/:id",
  verificarToken,
  verificarRol(["admin"]),
  validarObjectId,
  recetaController.actualizarReceta
);
router.delete(
  "/:id",
  verificarToken,
  verificarRol(["admin"]),
  validarObjectId,
  recetaController.eliminarReceta
);

module.exports = router;
