const express = require("express");
const router = express.Router();
const monturaController = require("../controllers/monturaController");
const {
  verificarToken,
  validarObjectId,
} = require("../../../middlewares/protect");
const { verifyAdminRole } = require("../../../middlewares/verifyAdminRole");
const { check, validationResult } = require("express-validator");
const { errorResponse } = require("../../../utils/responseUtils");

// Validaciones para creación y actualización
const validarMontura = [
  check("codigo", "El código es requerido").not().isEmpty(),
  check("modelo", "El modelo es requerido").not().isEmpty(),
  check("material", "El material es requerido").not().isEmpty(),
  check("material", "Material no válido").isIn([
    "ACETATO",
    "METAL",
    "TITANIO",
    "FLEXIBLE",
  ]),
  check("precioBase", "El precio base es requerido").not().isEmpty(),
  check("precioBase", "El precio debe ser un número").isNumeric(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(
        res,
        400,
        "Error de validación",
        null,
        errors.array()
      );
    }
    next();
  },
];

const validarStock = [
  check("cantidad", "La cantidad es requerida").not().isEmpty(),
  check("cantidad", "La cantidad debe ser un número positivo").isFloat({
    min: 0,
  }),
  check("operacion", "La operación es requerida").not().isEmpty(),
  check("operacion", "Operación no válida").isIn(["incrementar", "disminuir"]),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(
        res,
        400,
        "Error de validación",
        null,
        errors.array()
      );
    }
    next();
  },
];

/**
 * @swagger
 * tags:
 *   name: Monturas
 *   description: Endpoints para gestión de monturas ópticas
 */

// Rutas públicas
router.get("/", monturaController.obtenerMonturas);
router.get("/:id", validarObjectId, monturaController.obtenerMontura);

// Rutas protegidas
router.post(
  "/",
  [verificarToken, verifyAdminRole, ...validarMontura],
  monturaController.crearMontura
);

router.put(
  "/:id",
  [verificarToken, verifyAdminRole, validarObjectId, ...validarMontura],
  monturaController.actualizarMontura
);

router.patch(
  "/:id/stock",
  [verificarToken, verifyAdminRole, validarObjectId, ...validarStock],
  monturaController.actualizarStock
);

router.delete(
  "/:id",
  [verificarToken, verifyAdminRole, validarObjectId],
  monturaController.eliminarMontura
);

module.exports = router;
