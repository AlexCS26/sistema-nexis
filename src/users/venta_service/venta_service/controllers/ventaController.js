const mongoose = require("mongoose");
const Venta = require("../models/venta.model");
const Montura = require("../../../almacen_service/montura_service/models/montura.model");
const Luna = require("../../../almacen_service/luna_service/models/luna.model");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

class VentaController {
  /**
   * @desc    Crear una nueva venta
   * @route   POST /api/ventas
   * @access  Private
   */
  static crearVenta = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        ot,
        paciente,
        montura,
        luna,
        vendedora,
        optometra,
        totalVenta,
        tienda,
        pagos = [], // Asegurarse de recibir los pagos
        estadoEntrega = "EN_TIENDA", // Valor por defecto
      } = req.body;

      // Validar unicidad de OT
      const otExistente = await Venta.findOne({ ot }).session(session);
      if (otExistente) {
        await session.abortTransaction();
        return errorResponse(res, 400, "La orden de trabajo ya existe");
      }

      // Validar existencia de productos
      const [monturaExistente, lunaExistente] = await Promise.all([
        Montura.findById(montura).session(session),
        Luna.findById(luna).session(session),
      ]);

      if (!monturaExistente || !lunaExistente) {
        await session.abortTransaction();
        return errorResponse(res, 404, "Montura o luna no encontrada");
      }

      // Validar pagos
      const pagosValidados = pagos.map((pago) => ({
        monto: Number(pago.monto),
        tipo: pago.tipo,
        comprobante: pago.comprobante || undefined,
        fecha: pago.fecha || new Date(),
      }));

      // Crear la venta con TODOS los campos incluyendo pagos
      const nuevaVenta = new Venta({
        ot,
        paciente,
        montura,
        luna,
        vendedora,
        optometra,
        totalVenta: Number(totalVenta),
        tienda,
        estadoEntrega,
        pagos: pagosValidados,
      });

      await nuevaVenta.save({ session });
      await session.commitTransaction();

      // Poblar las referencias para la respuesta
      const ventaCreada = await Venta.findById(nuevaVenta._id)
        .populate("montura luna")
        .session(session);

      return successResponse(
        res,
        201,
        "Venta creada exitosamente",
        ventaCreada
      );
    } catch (error) {
      await session.abortTransaction();

      if (error.name === "ValidationError") {
        const errors = Object.values(error.errors).map((el) => el.message);
        return errorResponse(res, 400, "Error de validación", error, {
          errors,
        });
      }

      console.error("Error al crear venta:", error);
      return errorResponse(res, 500, "Error al crear la venta", error);
    } finally {
      session.endSession();
    }
  };

  /**
   * @desc    Obtener todas las ventas con filtros avanzados
   * @route   GET /api/ventas
   * @access  Private
   */
  static obtenerVentas = async (req, res) => {
    console.log("[VentaController] Iniciando obtención de ventas");

    try {
      const {
        tienda,
        vendedora,
        estadoEntrega,
        desde,
        hasta,
        search,
        page = 1,
        limit = 10,
      } = req.query;

      console.log("[VentaController] Parámetros recibidos:", {
        tienda,
        vendedora,
        estadoEntrega,
        desde,
        hasta,
        search,
        page,
        limit,
      });

      const filtro = {};

      // Construir filtros
      if (tienda) {
        filtro.tienda = tienda;
        console.log("[VentaController] Filtro por tienda:", tienda);
      }
      if (vendedora) {
        filtro.vendedora = vendedora;
        console.log("[VentaController] Filtro por vendedora:", vendedora);
      }
      if (estadoEntrega) {
        filtro.estadoEntrega = estadoEntrega;
        console.log(
          "[VentaController] Filtro por estadoEntrega:",
          estadoEntrega
        );
      }

      // Filtro por rango de fechas
      if (desde || hasta) {
        filtro.fechaVenta = {};
        if (desde) {
          const fechaDesde = new Date(desde);
          console.log("[VentaController] Fecha desde:", fechaDesde);
          filtro.fechaVenta.$gte = fechaDesde;
        }
        if (hasta) {
          const fechaHasta = new Date(hasta);
          console.log("[VentaController] Fecha hasta:", fechaHasta);
          filtro.fechaVenta.$lte = fechaHasta;
        }
      }

      // Búsqueda textual
      if (search) {
        console.log("[VentaController] Búsqueda textual:", search);
        filtro.$or = [
          { ot: { $regex: search, $options: "i" } },
          { "paciente.nombres": { $regex: search, $options: "i" } },
          { "paciente.apellidos": { $regex: search, $options: "i" } },
        ];
      }

      console.log(
        "[VentaController] Filtro construido:",
        JSON.stringify(filtro, null, 2)
      );

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { fechaVenta: -1 },
        populate: [
          { path: "montura", select: "codigo modelo marca precio" },
          { path: "luna", select: "codigo tipo material precio" },
          { path: "recojos", select: "tipo numero estado" },
        ],
      };

      console.log(
        "[VentaController] Opciones de consulta:",
        JSON.stringify(options, null, 2)
      );

      console.log("[VentaController] Ejecutando consulta paginada...");
      const ventas = await Venta.paginate(filtro, options);
      console.log(
        "[VentaController] Consulta completada. Resultados encontrados:",
        ventas.docs.length
      );

      return successResponse(res, 200, "Ventas obtenidas", ventas.docs, {
        pagination: {
          total: ventas.totalDocs,
          pages: ventas.totalPages,
          page: ventas.page,
          limit: ventas.limit,
        },
      });
    } catch (error) {
      console.error("[VentaController] Error al obtener ventas:", error);

      // Log adicional para errores de MongoDB
      if (error.name === "MongoError") {
        console.error("[VentaController] Detalles del error MongoDB:", {
          code: error.code,
          message: error.errmsg,
          stack: error.stack,
        });
      }

      // Log para errores de validación
      if (error.name === "ValidationError") {
        console.error("[VentaController] Errores de validación:", error.errors);
      }

      return errorResponse(res, 500, "Error al obtener ventas", error);
    }
  };

  /**
   * @desc    Obtener una venta por ID
   * @route   GET /api/ventas/:id
   * @access  Private
   */
  static obtenerVenta = async (req, res) => {
    try {
      const venta = await Venta.findById(req.params.id)
        .populate("montura")
        .populate("luna")
        .populate("recojos");

      if (!venta) {
        return errorResponse(res, 404, "Venta no encontrada");
      }

      return successResponse(res, 200, "Venta obtenida", venta);
    } catch (error) {
      if (error.name === "CastError") {
        return errorResponse(res, 400, "ID de venta inválido");
      }
      return errorResponse(res, 500, "Error al obtener la venta", error);
    }
  };

  /**
   * @desc    Actualizar información básica de una venta
   * @route   PUT /api/ventas/:id
   * @access  Private
   */
  static actualizarVenta = async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Campos que no se pueden actualizar
      delete updateData.ot;
      delete updateData.pagos;
      delete updateData.saldoPendiente;
      delete updateData.porcentajePagado;
      delete updateData.recojos;

      const ventaActualizada = await Venta.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      }).populate("montura luna recojos");

      if (!ventaActualizada) {
        return errorResponse(res, 404, "Venta no encontrada");
      }

      return successResponse(res, 200, "Venta actualizada", ventaActualizada);
    } catch (error) {
      if (error.name === "ValidationError") {
        const errors = Object.values(error.errors).map((el) => el.message);
        return errorResponse(res, 400, "Error de validación", error, {
          errors,
        });
      }
      return errorResponse(res, 500, "Error al actualizar la venta", error);
    }
  };

  /**
   * @desc    Registrar un pago en una venta
   * @route   POST /api/ventas/:id/pagos
   * @access  Private
   */

  static registrarPago = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;
      const { monto, tipo, comprobante } = req.body;

      // Validaciones más robustas
      if (!monto || isNaN(monto) || monto <= 0) {
        await session.abortTransaction();
        return errorResponse(res, 400, "Monto inválido");
      }

      if (!["INGRESO", "A_CUENTA", "SEPARACION"].includes(tipo)) {
        await session.abortTransaction();
        return errorResponse(res, 400, "Tipo de pago inválido");
      }

      const venta = await Venta.findById(id).session(session);
      if (!venta) {
        await session.abortTransaction();
        return errorResponse(res, 404, "Venta no encontrada");
      }

      // Registrar el pago con todos los campos
      venta.pagos.push({
        monto: Number(monto),
        tipo,
        comprobante: comprobante || undefined,
        fecha: new Date(),
      });

      await venta.save({ session });
      await session.commitTransaction();

      // Obtener la venta actualizada con todas las relaciones
      const ventaActualizada = await Venta.findById(id)
        .populate("montura luna recojos")
        .session(session);

      return successResponse(res, 200, "Pago registrado", ventaActualizada);
    } catch (error) {
      await session.abortTransaction();
      console.error("Error al registrar pago:", error);
      return errorResponse(res, 500, "Error al registrar pago", error);
    } finally {
      session.endSession();
    }
  };

  /**
   * @desc    Actualizar estado de entrega de una venta
   * @route   PUT /api/ventas/:id/estado-entrega
   * @access  Private
   */
  static actualizarEstadoEntrega = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;
      const { estadoEntrega, recibidoPor, encargada } = req.body;

      const venta = await Venta.findById(id).session(session);
      if (!venta) {
        await session.abortTransaction();
        return errorResponse(res, 404, "Venta no encontrada");
      }

      // Actualizar estado
      venta.estadoEntrega = estadoEntrega;

      // Si se marca como ENTREGADO, registrar detalles
      if (estadoEntrega === "ENTREGADO") {
        venta.detallesEntrega = {
          fecha: new Date(),
          recibidoPor,
          encargada,
        };
      }

      await venta.save({ session });
      await session.commitTransaction();

      return successResponse(res, 200, "Estado de entrega actualizado", venta);
    } catch (error) {
      await session.abortTransaction();
      return errorResponse(
        res,
        500,
        "Error al actualizar estado de entrega",
        error
      );
    } finally {
      session.endSession();
    }
  };

  /**
   * @desc    Obtener productos más vendidos (se mantiene en ventas)
   * @route   GET /api/ventas/reportes/productos-vendidos
   * @access  Private
   */
  static obtenerProductosVendidos = async (req, res) => {
    try {
      const { desde, hasta, tienda, limit = 10 } = req.query;
      const match = {};

      if (desde && hasta) {
        match.fechaVenta = {
          $gte: new Date(desde),
          $lte: new Date(hasta),
        };
      }

      if (tienda) match.tienda = tienda;

      const reporte = await Venta.aggregate([
        { $match: match },
        {
          $lookup: {
            from: "monturas",
            localField: "montura",
            foreignField: "_id",
            as: "montura",
          },
        },
        {
          $lookup: {
            from: "lunas",
            localField: "luna",
            foreignField: "_id",
            as: "luna",
          },
        },
        { $unwind: "$montura" },
        { $unwind: "$luna" },
        {
          $group: {
            _id: {
              montura: "$montura.codigo",
              luna: "$luna.codigo",
              descripcion: {
                $concat: [
                  "Montura: ",
                  "$montura.codigo",
                  " | Lunas: ",
                  "$luna.codigo",
                ],
              },
            },
            cantidad: { $sum: 1 },
            totalVendido: { $sum: "$totalVenta" },
          },
        },
        { $sort: { cantidad: -1 } },
        { $limit: parseInt(limit) },
        {
          $project: {
            _id: 0,
            producto: "$_id.descripcion",
            montura: "$_id.montura",
            luna: "$_id.luna",
            cantidad: 1,
            totalVendido: 1,
          },
        },
      ]);

      return successResponse(res, 200, "Reporte generado", reporte);
    } catch (error) {
      return errorResponse(res, 500, "Error al generar reporte", error);
    }
  };

  /**
   * @desc    Nuevo reporte: Estado de ventas (logística)
   * @route   GET /api/ventas/reportes/estado-ventas
   * @access  Private
   */
  static obtenerEstadoVentas = async (req, res) => {
    try {
      const { tienda } = req.query;
      const match = tienda ? { tienda } : {};

      const reporte = await Venta.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$estadoEntrega",
            count: { $sum: 1 },
            totalVenta: { $sum: "$totalVenta" },
          },
        },
        {
          $project: {
            estado: "$_id",
            _id: 0,
            cantidad: "$count",
            totalVenta: 1,
          },
        },
      ]);

      return successResponse(res, 200, "Estado de ventas", reporte);
    } catch (error) {
      return errorResponse(res, 500, "Error al generar reporte", error);
    }
  };
}

module.exports = VentaController;
