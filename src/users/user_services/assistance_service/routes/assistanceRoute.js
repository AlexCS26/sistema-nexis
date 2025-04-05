const express = require("express");
const {
  registrarAsistencia,
  obtenerAsistencias,
} = require("../controllers/assistanceController");
const { verifyAdminRole } = require("../../../middlewares/verifyAdminRole");
const { verificarToken } = require("../../../middlewares/protect");

const router = express.Router();

router.post("/registrar", registrarAsistencia);
router.get("/", verificarToken, verifyAdminRole, obtenerAsistencias);

module.exports = router; // ✅ Exportación correcta con require
