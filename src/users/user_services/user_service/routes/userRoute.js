const express = require("express");
const {
  getAuthenticatedUser,
  getAllUsers,
  getAllVendedores,
} = require("../controllers/userController");
const { verificarToken } = require("../../../middlewares/protect");
const { verifyAdminRole } = require("../../../middlewares/verifyAdminRole");

const router = express.Router();

// 📌 Obtener el usuario autenticado
router.get("/me", verificarToken, getAuthenticatedUser);

// 📌 Obtener todos los usuarios (solo admin)
router.get("/all", verificarToken, verifyAdminRole, getAllUsers);

// 📌 Obtener solo los vendedores (solo admin)
router.get("/vendedores", verificarToken, verifyAdminRole, getAllVendedores);

module.exports = router;
