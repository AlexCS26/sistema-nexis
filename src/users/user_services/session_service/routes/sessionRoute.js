const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/sessionController");

// ===============================
// 🔹 Rutas de sesión
// ===============================
router.get("/verify", sessionController.verifySession);
router.post("/refresh", sessionController.refreshSession);

module.exports = router;
