const express = require("express");
const router = express.Router();
const recogoController = require("../controllers/recojosController");
const {
  verificarToken,
  verificarRol,
  validarObjectId,
} = require("../../../middlewares/protect");
const { verifyAdminRole } = require("../../../middlewares/verifyAdminRole");
const { check, validationResult } = require("express-validator"); // Añadido validationResult
const { errorResponse } = require("../../../utils/responseUtils");

// Validaciones personalizadas
const validarRecojo = [
  check("fechaCompra", "La fecha de compra es obligatoria").not().isEmpty(),
  check("ordenTrabajo", "La orden de trabajo es obligatoria").not().isEmpty(),
  check("nombreApellido", "El nombre y apellido son obligatorios")
    .not()
    .isEmpty(),
  check("monturaLunas", "La montura/lunas son obligatorias").not().isEmpty(),
  check("total", "El total debe ser un número válido").isNumeric(),
  check("cuenta", "La cuenta debe ser un número válido").optional().isNumeric(),
  check("estaEn", "La ubicación es obligatoria").not().isEmpty(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, "Error de validación", null, {
        errors: errors.array(),
      });
    }
    next();
  },
];

const validarPago = [
  check(
    "importe",
    "El importe es requerido y debe ser un número válido"
  ).isNumeric(),
  check("fecha", "La fecha es requerida").optional().isISO8601(),
  check("ordenTrabajo", "La orden de trabajo es requerida")
    .optional()
    .not()
    .isEmpty(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, "Error de validación", null, {
        errors: errors.array(),
      });
    }
    next();
  },
];

// Aplicar verificación de token a todas las rutas
router.use(verificarToken);

// Rutas básicas
router.post(
  "/",
  verificarRol(["admin", "optometrista", "vendedor"]),
  validarRecojo,
  recogoController.crearRecojo
);

router.get(
  "/",
  verificarRol(["admin", "optometrista", "vendedor", "tecnico"]),
  recogoController.obtenerRecojos
);

router.get(
  "/:id",
  validarObjectId,
  verificarRol(["admin", "optometrista", "vendedor", "tecnico"]),
  recogoController.obtenerRecojo
);

router.put(
  "/:id",
  validarObjectId,
  verificarRol(["admin", "optometrista"]),
  validarRecojo,
  recogoController.actualizarRecojo
);

router.delete(
  "/:id",
  validarObjectId,
  verifyAdminRole, // Solo admin puede eliminar
  recogoController.eliminarRecojo
);

// Rutas especializadas
router.patch(
  "/:id/entregar",
  validarObjectId,
  verificarRol(["admin", "vendedor"]),
  check("recibidoPor", "La persona que recibe es obligatoria").not().isEmpty(),
  recogoController.marcarEntregado
);

router.patch(
  "/:id/pagar",
  validarObjectId,
  verificarRol(["admin", "cajero"]),
  validarPago,
  recogoController.registrarPago
);

module.exports = router;
