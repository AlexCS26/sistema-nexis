const Inventario = require("../models/inventario.model");
const Luna = require("../../luna_service/models/luna.model");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");
const mongoose = require("mongoose");

// Roles permitidos para registrar movimientos
const ROLES_PERMITIDOS_MOVIMIENTO = ["almacen", "admin"];

// 📌 Función para obtener stock actual de una luna
const obtenerStockActual = async (lunaId) => {
  const [ingresos, salidas] = await Promise.all([
    Inventario.aggregate([
      {
        $match: {
          luna: new mongoose.Types.ObjectId(lunaId),
          tipoMovimiento: "ingreso",
        },
      },
      { $group: { _id: null, total: { $sum: "$cantidad" } } },
    ]),
    Inventario.aggregate([
      {
        $match: {
          luna: new mongoose.Types.ObjectId(lunaId),
          tipoMovimiento: "salida",
        },
      },
      { $group: { _id: null, total: { $sum: "$cantidad" } } },
    ]),
  ]);

  return (ingresos[0]?.total || 0) - (salidas[0]?.total || 0);
};

// 📌 Registrar un movimiento en el inventario
const registrarMovimiento = async (req, res) => {
  try {
    console.log("🔹 Registrando movimiento...");

    if (!ROLES_PERMITIDOS_MOVIMIENTO.includes(req.usuario.rol)) {
      return errorResponse(
        res,
        403,
        "No tienes permisos para registrar movimientos."
      );
    }

    const {
      lunaId,
      tipoMovimiento,
      cantidad,
      ot,
      tienda,
      observaciones,
      nombreCliente,
      dniCliente,
      telefonoCliente,
      emailCliente,
      doctor,
      receta,
      tipoPago,
      precioUnitario,
      proveedor,
    } = req.body;

    const usuario = req.usuario.userId;

    // Validaciones básicas
    if (!mongoose.Types.ObjectId.isValid(lunaId)) {
      return errorResponse(res, 400, "ID de luna inválido.");
    }

    const luna = await Luna.findById(lunaId);
    if (!luna) {
      return errorResponse(res, 404, "Luna no encontrada.");
    }

    if (tipoMovimiento === "salida") {
      const stockActual = await obtenerStockActual(lunaId);
      if (stockActual < cantidad) {
        return errorResponse(res, 400, "No hay suficiente stock disponible.");
      }
    }

    // Crear nuevo movimiento en el inventario
    const nuevoMovimiento = new Inventario({
      luna: lunaId,
      estadoLuna: "nuevo", // Se podría hacer dinámico si se maneja estados de lunas
      tipoMovimiento,
      cantidad,
      ot,
      tienda,
      usuario,
      observaciones,
      nombreCliente,
      dniCliente,
      telefonoCliente,
      emailCliente,
      doctor,
      receta,
      tipoPago,
      precioUnitario,
      total: cantidad * precioUnitario,
      proveedor,
    });

    await nuevoMovimiento.save();

    return successResponse(
      res,
      201,
      "Movimiento registrado con éxito.",
      nuevoMovimiento
    );
  } catch (error) {
    console.error("❌ Error al registrar movimiento:", error);
    return errorResponse(
      res,
      500,
      "Error al registrar movimiento.",
      error.message
    );
  }
};

// 📌 Obtener historial del inventario con filtros
const obtenerHistorial = async (req, res) => {
  try {
    console.log("🔹 Obteniendo historial de inventario...");

    const { dia, mes, anio, page = 1, limit = 10 } = req.query;
    let filtroFecha = {};

    if (dia) {
      const fechaInicio = new Date(dia);
      const fechaFin = new Date(dia);
      fechaFin.setHours(23, 59, 59, 999);
      filtroFecha.fechaMovimiento = { $gte: fechaInicio, $lte: fechaFin };
    } else if (mes && anio) {
      const fechaInicio = new Date(anio, mes - 1, 1);
      const fechaFin = new Date(anio, mes, 0);
      fechaFin.setHours(23, 59, 59, 999);
      filtroFecha.fechaMovimiento = { $gte: fechaInicio, $lte: fechaFin };
    } else if (anio) {
      const fechaInicio = new Date(anio, 0, 1);
      const fechaFin = new Date(anio, 11, 31);
      fechaFin.setHours(23, 59, 59, 999);
      filtroFecha.fechaMovimiento = { $gte: fechaInicio, $lte: fechaFin };
    }

    const historial = await Inventario.find(filtroFecha)
      .populate("luna", "medida tipo")
      .populate("usuario", "nombre apellido")
      .sort({ fechaMovimiento: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .select("+receta"); // ✅ Agregado para incluir receta en la respuesta

    return successResponse(
      res,
      200,
      "Historial obtenido con éxito.",
      historial
    );
  } catch (error) {
    console.error("❌ Error al obtener historial:", error);
    return errorResponse(
      res,
      500,
      "Error al obtener historial.",
      error.message
    );
  }
};

module.exports = {
  registrarMovimiento,
  obtenerHistorial,
};
