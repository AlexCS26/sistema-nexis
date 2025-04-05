const express = require("express");
const router = express.Router();
const VentaController = require("../controllers/ventaController");
const {
  verificarToken,
  verificarRol,
  validarObjectId,
} = require("../../../middlewares/protect");
const { check, validationResult } = require("express-validator");
const { errorResponse } = require("../../../utils/responseUtils");

// Validaciones personalizadas
const validarCreacionVenta = [
  check("ot", "La orden de trabajo es obligatoria y única").notEmpty(),
  check(
    "paciente.nombres",
    "Los nombres del paciente son obligatorios"
  ).notEmpty(),
  check(
    "paciente.apellidos",
    "Los apellidos del paciente son obligatorios"
  ).notEmpty(),
  check("montura", "La montura es obligatoria").isMongoId(),
  check("luna", "La luna es obligatoria").isMongoId(),
  check("vendedora", "La vendedora es obligatoria").notEmpty(),
  check("totalVenta", "El total debe ser un número positivo").isFloat({
    gt: 0,
  }),
  check("tienda", "La tienda es obligatoria").isIn([
    "MIRIAM_BOLIVAR",
    "ZARA_HUARAL",
    "OTRA_TIENDA",
  ]),
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
  check("monto", "El monto es requerido y debe ser positivo").isFloat({
    gt: 0,
  }),
  check("tipo", "El tipo de pago es obligatorio").isIn([
    "INGRESO",
    "A_CUENTA",
    "SEPARACION",
  ]),
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

const validarEstadoEntrega = [
  check("estadoEntrega", "Estado no válido").isIn([
    "EN_TIENDA",
    "EN_LABORATORIO",
    "ENTREGADO",
  ]),
  check("recibidoPor", "Persona que recibe es requerida para entregas")
    .if((req) => req.body.estadoEntrega === "ENTREGADO")
    .notEmpty(),
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

// Rutas CRUD básicas para ventas
router.post(
  "/",
  verificarRol(["admin", "vendedor"]),
  validarCreacionVenta,
  VentaController.crearVenta
);

router.get(
  "/",
  verificarRol(["admin", "vendedor", "optometrista", "tecnico"]),
  VentaController.obtenerVentas
);

router.get(
  "/:id",
  validarObjectId,
  verificarRol(["admin", "vendedor", "optometrista", "tecnico"]),
  VentaController.obtenerVenta
);

router.put(
  "/:id",
  validarObjectId,
  verificarRol(["admin", "vendedor"]),
  VentaController.actualizarVenta
);

// Rutas para operaciones específicas
router.post(
  "/:id/pagos",
  validarObjectId,
  verificarRol(["admin", "cajero", "vendedor"]),
  validarPago,
  VentaController.registrarPago
);

router.put(
  "/:id/estado-entrega",
  validarObjectId,
  verificarRol(["admin", "vendedor", "tecnico"]),
  validarEstadoEntrega,
  VentaController.actualizarEstadoEntrega
);

// Rutas para reportes comerciales
router.get(
  "/reportes/productos-vendidos",
  verificarRol(["admin", "vendedor", "inventario"]),
  VentaController.obtenerProductosVendidos
);

router.get(
  "/reportes/estado-ventas",
  verificarRol(["admin", "vendedor", "tecnico"]),
  VentaController.obtenerEstadoVentas
);

module.exports = router;
