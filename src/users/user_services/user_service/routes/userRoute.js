const express = require("express");
const {
  getAuthenticatedUser,
  getAllUsers,
  getAllVendedores,
} = require("../controllers/userController");
const {
  verificarToken,
  verificarRol,
} = require("../../../middlewares/protect");

const router = express.Router();

router.get(
  "/me",
  verificarToken,
  verificarRol(["admin", "vendedor", "inventario"]),
  getAuthenticatedUser
);

router.get(
  "/all",
  verificarToken,
  verificarRol(["admin", "vendedor", "inventario"]),
  getAllUsers
);

router.get(
  "/vendedores",
  verificarToken,
  verificarRol(["admin", "vendedor", "inventario"]),
  getAllVendedores
);

module.exports = router;
