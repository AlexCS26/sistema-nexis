const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const Venta = require("../models/venta.model");
const RecojoOptica = require("../../../almacen_service/recojos_service/models/recojos.model");
const Product = require("../../../product_services/product_service/models/product.model");
const Measure = require("../../../product_services/measure_service/models/measure.model");
const Variant = require("../../../product_services/variant_service/models/variant.model");
const Tienda = require("../../../tienda_services/tienda_service/models/tienda.model");
const MovementHelper = require("../../../utils/movementHelper");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");
const VentaService = require("../services/ventaService");
const { updateProductStock } = require("../../../utils/updateProductStock");
const nubefactService = require("../../../services/nubefact-service");
const {
  generarComprobantePDF,
  obtenerPDFComprobanteExistente,
} = require("../../../utils/pdfGenerator");

class VentaController {
  /**
   * @desc    Crear una nueva venta con OT automática
   * @route   POST /api/ventas
   * @access  Private
   */
  static crearVenta = async (req, res) => {
    try {
      const ventaData = req.body;
      const usuario = req.usuario;

      const ventaCreada = await VentaService.crearVenta(ventaData, usuario);

      return successResponse(
        res,
        201,
        "Venta creada exitosamente",
        ventaCreada
      );
    } catch (error) {
      console.error("💥 Error en controlador al crear venta:", error);

      const statusCode =
        error.message.includes("no válido") ||
        error.message.includes("no encontrado") ||
        error.message.includes("Faltan datos")
          ? 400
          : 500;

      return errorResponse(res, statusCode, error.message);
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
      }).populate(
        "items.productId items.variantId items.measureId recojos paciente vendedora"
      );

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
        .populate(
          "items.productId items.variantId items.measureId recojos paciente vendedora"
        )
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
          { "paciente.nombre": { $regex: search, $options: "i" } },
          { "paciente.apellido": { $regex: search, $options: "i" } },
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
        select:
          "ot paciente items totalVenta tienda pagos saldoPendiente porcentajePagado recojos estadoEntrega fechaVenta vendedora", // 👈 solo lo que usa el cliente
        populate: [
          { path: "paciente", select: "nombre apellido celular dni" },
          {
            path: "items.productId",
            select: "name categoryId brand unitPrice",
            populate: { path: "categoryId", select: "name" },
          },
          {
            path: "items.variantId",
            select: "color size material",
          },
          {
            path: "items.measureId",
            select: "sphere cylinder add serie",
          },
          { path: "recojos", select: "tipo numero" },
          {
            path: "vendedora",
            select: "nombre apellido correo celular avatarUrl rol",
          },
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
      return errorResponse(res, 500, "Error al obtener ventas", error);
    }
  };
  /**
   * @desc    Obtener una venta por ID (solo datos necesarios para frontend)
   * @route   GET /api/ventas/:id
   * @access  Private
   */
  static obtenerVenta = async (req, res) => {
    try {
      const venta = await Venta.findById(req.params.id)
        .select(
          "ot paciente items vendedora totalVenta tienda estadoEntrega fechaVenta saldoPendiente porcentajePagado pagos recojos"
        )
        .populate("paciente", "nombre apellido dni celular")
        .populate({
          path: "items.productId",
          select: "name code categoryId",
          populate: { path: "categoryId", select: "name" },
        })
        .populate("items.variantId", "color size material")
        .populate("items.measureId", "sphere cylinder add serie")
        .populate({
          path: "recojos",
          select:
            "numero tipo fechaCompra ordenTrabajo total cuenta saldo estaEn",
        })
        .populate({
          path: "vendedora",
          select: "nombre apellido correo celular avatarUrl rol",
        })
        // ✅ Aquí hacemos populate de tienda para que traiga su nombre en vez de solo el ID
        .populate({
          path: "tienda",
          select: "name code ",
        });

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
   * @desc    Generar y descargar comprobante PDF de una venta
   * @route   GET /api/ventas/:id/pdf
   * @access  Private
   */
  static generarPDF = async (req, res) => {
    try {
      const { id } = req.params;
      const { download } = req.query;

      // Buscar la venta con relaciones necesarias
      const venta = await Venta.findById(id)
        .select(
          "ot paciente items vendedora recojos totalVenta pagos saldoPendiente fechaVenta serie numero nubefactResponse"
        )
        .populate("paciente")
        .populate("items.productId")
        .populate("items.variantId")
        .populate("items.measureId")
        .populate("recojos")
        .populate("vendedora", "nombre apellido email");

      if (!venta) {
        return errorResponse(res, 404, "Venta no encontrada");
      }

      // 🔹 Validar OT y crear nombre de archivo seguro
      const ot = venta.ot?.toString().trim();
      const nombreArchivo = ot
        ? `Venta_${ot}.pdf`
        : `Venta_${venta._id.toString().slice(-6)}.pdf`;

      let pdfBuffer;

      // 🔹 ESTRATEGIA MEJORADA: Primero verificar si ya existe
      try {
        // 1. Si ya tenemos la respuesta de Nubefact guardada
        if (venta.nubefactResponse) {
          console.log("📄 Obteniendo PDF existente de Nubefact...");
          pdfBuffer = await obtenerPDFComprobanteExistente(
            venta.nubefactResponse
          );
        }
        // 2. Si no tenemos respuesta guardada, PRIMERO consultar si existe
        else {
          console.log(
            "🔍 Verificando si el comprobante ya existe en Nubefact..."
          );

          const serie = venta.serie || "BBB1";
          const numero = venta.numero || venta.ot;

          try {
            // Intentar consultar el comprobante existente
            const comprobanteExistente =
              await nubefactService.consultarComprobante(2, serie, numero);
            console.log(
              "✅ Comprobante encontrado en Nubefact, obteniendo PDF..."
            );
            pdfBuffer = await obtenerPDFComprobanteExistente(
              comprobanteExistente
            );

            // 🔹 Guardar la respuesta para futuras consultas
            await Venta.findByIdAndUpdate(id, {
              nubefactResponse: comprobanteExistente,
            });
          } catch (consultaError) {
            // Si no existe (error 404), generar nuevo comprobante
            if (
              consultaError.message.includes("no existe") ||
              consultaError.message.includes("404")
            ) {
              console.log(
                "🔄 Comprobante no existe, generando nuevo en Nubefact..."
              );
              const resultado = await generarComprobantePDF(
                venta,
                "BOLETA DE VENTA ELECTRÓNICA"
              );
              pdfBuffer = resultado.pdf;

              // 🔹 Guardar la respuesta para futuras consultas
              await Venta.findByIdAndUpdate(id, {
                nubefactResponse: resultado.comprobante,
              });
            } else {
              // Si es otro error, relanzarlo
              throw consultaError;
            }
          }
        }
      } catch (error) {
        console.error("❌ Error en el proceso de PDF:", error.message);
        throw error;
      }

      // 🔹 Configurar headers ANTES de enviar
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `${
          download === "true" ? "attachment" : "inline"
        }; filename="${nombreArchivo}"`
      );
      res.setHeader("Content-Length", pdfBuffer.length);
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

      // 🔹 IMPORTANTE: Para datos binarios usar res.end() con el Buffer
      return res.end(pdfBuffer);
    } catch (error) {
      console.error("❌ Error al generar PDF:", error);
      return errorResponse(res, 500, "Error al generar PDF", error.message);
    }
  };
  /**
   * @desc    Obtener movimientos de una venta
   * @route   GET /api/ventas/:id/movements
   * @access  Private
   */
  static obtenerMovimientosVenta = async (req, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;

      if (!id) return errorResponse(res, 400, "Venta ID is required");

      const venta = await Venta.findById(id);
      if (!venta) return errorResponse(res, 404, "Venta not found");

      const options = {};
      if (startDate || endDate) {
        options.dateRange = {
          start: startDate ? new Date(startDate) : new Date("2000-01-01"),
          end: endDate ? new Date(endDate) : new Date(),
        };
      }

      const movements = await MovementHelper.getMovementsByReference(
        "Sale",
        id,
        options
      );

      return successResponse(
        res,
        200,
        "Venta movements fetched successfully",
        movements,
        { count: movements.length }
      );
    } catch (error) {
      console.error("Error fetching venta movements:", error);
      return errorResponse(
        res,
        500,
        error.message || "Error fetching venta movements",
        error
      );
    }
  };

  /**
   * @desc    Eliminar una venta (solo admin)
   * @route   DELETE /api/ventas/:id
   * @access  Private/Admin
   */
  static eliminarVenta = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;

      const venta = await Venta.findById(id).session(session);
      if (!venta) {
        await session.abortTransaction();
        return errorResponse(res, 404, "Venta no encontrada");
      }

      // 🔹 Revertir stock de los items vendidos
      for (const item of venta.items) {
        if (item.measureId) {
          const measure = await Measure.findById(item.measureId).session(
            session
          );
          if (measure) {
            const zoneStock = measure.stockByZone.find(
              (sz) => sz.zoneId.toString() === item.zoneId.toString()
            );
            if (zoneStock) {
              zoneStock.stock += item.quantity;
              await measure.save({ session });
            }
          }
        } else if (item.variantId) {
          const variant = await Variant.findById(item.variantId).session(
            session
          );
          if (variant) {
            const zoneStock = variant.stockByZone.find(
              (sz) => sz.zoneId.toString() === item.zoneId.toString()
            );
            if (zoneStock) {
              zoneStock.stock += item.quantity;
              await variant.save({ session });
            }
          }
        } else {
          const product = await Product.findById(item.productId).session(
            session
          );
          if (product) {
            product.stockGeneral += item.quantity;
            await product.save({ session });
          }
        }

        // 🔹 Actualizar stock general unificado
        await updateProductStock(item.productId);
      }

      // 🔹 Eliminar recojos asociados
      await RecojoOptica.deleteMany({ venta: id }).session(session);

      // 🔹 Eliminar movimientos asociados
      await MovementHelper.deleteMovementsByReference("Sale", id);

      // 🔹 Eliminar la venta
      await Venta.findByIdAndDelete(id).session(session);

      await session.commitTransaction();

      return successResponse(res, 200, "Venta eliminada exitosamente");
    } catch (error) {
      await session.abortTransaction();
      console.error("Error al eliminar venta:", error);
      return errorResponse(
        res,
        500,
        "Error al eliminar la venta",
        error.message
      );
    } finally {
      session.endSession();
    }
  };

  /**
   * @desc    Reporte: Productos vendidos
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
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.productId",
            foreignField: "_id",
            as: "productoInfo",
          },
        },
        { $unwind: "$productoInfo" },
        {
          $group: {
            _id: {
              productId: "$items.productId",
              productName: "$productoInfo.name",
              productCode: "$productoInfo.code",
            },
            cantidadVendida: { $sum: "$items.quantity" },
            totalVendido: { $sum: "$items.totalPrice" },
          },
        },
        { $sort: { cantidadVendida: -1 } },
        { $limit: parseInt(limit) },
        {
          $project: {
            _id: 0,
            productId: "$_id.productId",
            producto: "$_id.productName",
            codigo: "$_id.productCode",
            cantidadVendida: 1,
            totalVendido: 1,
          },
        },
      ]);

      return successResponse(
        res,
        200,
        "Reporte de productos vendidos",
        reporte
      );
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

  /**
   * @desc    Obtener reporte de ventas por vendedora
   * @route   GET /api/ventas/reportes/vendedoras
   * @access  Private
   */
  static obtenerVentasPorVendedora = async (req, res) => {
    try {
      const { desde, hasta, tienda } = req.query;
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
            from: "users",
            localField: "vendedora",
            foreignField: "_id",
            as: "vendedoraInfo",
          },
        },
        { $unwind: "$vendedoraInfo" },
        {
          $group: {
            _id: "$vendedora",
            vendedora: {
              $first: {
                $concat: [
                  "$vendedoraInfo.nombre",
                  " ",
                  "$vendedoraInfo.apellido",
                ],
              },
            },
            cantidadVentas: { $sum: 1 },
            totalVendido: { $sum: "$totalVenta" },
            promedioVenta: { $avg: "$totalVenta" },
          },
        },
        { $sort: { totalVendido: -1 } },
        {
          $project: {
            _id: 0,
            vendedoraId: "$_id",
            vendedora: 1,
            cantidadVentas: 1,
            totalVendido: 1,
            promedioVenta: { $round: ["$promedioVenta", 2] },
          },
        },
      ]);

      return successResponse(res, 200, "Reporte de vendedoras", reporte);
    } catch (error) {
      return errorResponse(res, 500, "Error al generar reporte", error);
    }
  };

  /**
   * @desc    Obtener estadísticas generales de ventas
   * @route   GET /api/ventas/estadisticas/generales
   * @access  Private
   */
  static obtenerEstadisticasGenerales = async (req, res) => {
    try {
      const { desde, hasta, tienda } = req.query;
      const match = {};

      if (desde && hasta) {
        match.fechaVenta = {
          $gte: new Date(desde),
          $lte: new Date(hasta),
        };
      }

      if (tienda) match.tienda = tienda;

      const estadisticas = await Venta.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalVentas: { $sum: 1 },
            totalIngresos: { $sum: "$totalVenta" },
            promedioVenta: { $avg: "$totalVenta" },
            ventaMaxima: { $max: "$totalVenta" },
            ventaMinima: { $min: "$totalVenta" },
          },
        },
        {
          $project: {
            _id: 0,
            totalVentas: 1,
            totalIngresos: 1,
            promedioVenta: { $round: ["$promedioVenta", 2] },
            ventaMaxima: 1,
            ventaMinima: 1,
          },
        },
      ]);

      const ventasPorEstado = await Venta.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$estadoEntrega",
            cantidad: { $sum: 1 },
          },
        },
        {
          $project: {
            estado: "$_id",
            cantidad: 1,
            _id: 0,
          },
        },
      ]);

      const resultado = {
        ...(estadisticas[0] || {
          totalVentas: 0,
          totalIngresos: 0,
          promedioVenta: 0,
          ventaMaxima: 0,
          ventaMinima: 0,
        }),
        ventasPorEstado,
      };

      return successResponse(res, 200, "Estadísticas generales", resultado);
    } catch (error) {
      return errorResponse(res, 500, "Error al obtener estadísticas", error);
    }
  };

  /**
   * @desc    Generar reporte de ventas en Excel profesional por tienda
   * @route   GET /api/ventas/reportes/excel
   * @access  Private
   */
  static generarReporteExcel = async (req, res) => {
    try {
      const {
        desde,
        hasta,
        tienda,
        vendedora,
        estadoEntrega,
        tipoReporte = "DETALLADO", // DETALLADO, RESUMIDO, POR_PRODUCTOS, POR_VENDEDORA
      } = req.query;

      // Construir filtro base - ALTERNATIVA MÁS ROBUSTA
      const filtro = {};

      if (desde && hasta) {
        // CORRECCIÓN: Crear fechas explícitamente en UTC
        const fechaDesde = new Date(
          Date.UTC(
            parseInt(desde.split("-")[0]),
            parseInt(desde.split("-")[1]) - 1, // Mes es 0-based
            parseInt(desde.split("-")[2]),
            0,
            0,
            0,
            0
          )
        );

        const fechaHasta = new Date(
          Date.UTC(
            parseInt(hasta.split("-")[0]),
            parseInt(hasta.split("-")[1]) - 1, // Mes es 0-based
            parseInt(hasta.split("-")[2]),
            23,
            59,
            59,
            999
          )
        );

        filtro.fechaVenta = {
          $gte: fechaDesde,
          $lte: fechaHasta,
        };

        console.log("Filtro de fechas UTC:", {
          desde: fechaDesde.toISOString(),
          hasta: fechaHasta.toISOString(),
        });
      }

      if (tienda) filtro.tienda = tienda;
      if (vendedora) filtro.vendedora = vendedora;
      if (estadoEntrega) filtro.estadoEntrega = estadoEntrega;

      // Crear workbook profesional
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistema Óptica";
      workbook.lastModifiedBy = "Sistema Óptica";
      workbook.created = new Date();
      workbook.modified = new Date();

      // Obtener información de tiendas para el reporte - CORREGIDO
      const tiendas = await Tienda.find(tienda ? { _id: tienda } : {}).select(
        "name address contact" // CORREGIDO: usar 'name' en lugar de 'nombre'
      );
      const tiendaMap = new Map(tiendas.map((t) => [t._id.toString(), t]));

      switch (tipoReporte.toUpperCase()) {
        case "DETALLADO":
          await this.generarReporteDetallado(
            workbook,
            filtro,
            tiendaMap,
            desde,
            hasta
          );
          break;
        case "RESUMIDO":
          await this.generarReporteResumido(
            workbook,
            filtro,
            tiendaMap,
            desde,
            hasta
          );
          break;
        case "POR_PRODUCTOS":
          await this.generarReporteProductos(
            workbook,
            filtro,
            tiendaMap,
            desde,
            hasta
          );
          break;
        case "POR_VENDEDORA":
          await this.generarReporteVendedoras(
            workbook,
            filtro,
            tiendaMap,
            desde,
            hasta
          );
          break;
        default:
          await this.generarReporteDetallado(
            workbook,
            filtro,
            tiendaMap,
            desde,
            hasta
          );
      }

      // Configurar respuesta
      const fechaReporte = new Date().toISOString().split("T")[0];
      const filename = `reporte_ventas_${fechaReporte}.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Error al generar reporte Excel:", error);
      return errorResponse(res, 500, "Error al generar reporte Excel", error);
    }
  };

  /**
   * @desc    Generar reporte detallado de ventas por tienda
   */
  static async generarReporteDetallado(
    workbook,
    filtro,
    tiendaMap,
    desde,
    hasta
  ) {
    const worksheet = workbook.addWorksheet("VENTAS DETALLADAS");

    // Estilos profesionales
    const headerStyle = {
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2F75B5" },
      },
      font: {
        color: { argb: "FFFFFFFF" },
        bold: true,
        size: 12,
      },
      border: {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      },
      alignment: { vertical: "middle", horizontal: "center" },
    };

    const titleStyle = {
      font: { bold: true, size: 16 },
      alignment: { horizontal: "center" },
    };

    const dataStyle = {
      border: {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      },
      alignment: { vertical: "middle" },
    };

    // Título del reporte
    worksheet.mergeCells("A1:L1");
    worksheet.getCell("A1").value = "REPORTE DETALLADO DE VENTAS";
    worksheet.getCell("A1").style = titleStyle;

    // Período del reporte
    worksheet.mergeCells("A2:L2");
    const periodo =
      desde && hasta
        ? `Período: ${new Date(desde).toLocaleDateString()} - ${new Date(
            hasta
          ).toLocaleDateString()}`
        : "Período: Todo";
    worksheet.getCell("A2").value = periodo;
    worksheet.getCell("A2").style = { alignment: { horizontal: "center" } };

    // Encabezados
    const headers = [
      "OT",
      "Fecha",
      "Tienda",
      "Paciente",
      "DNI",
      "Celular",
      "Productos",
      "Cantidad",
      "P.Unitario",
      "Total Venta",
      "Estado",
      "Vendedora",
    ];

    headers.forEach((header, index) => {
      worksheet.getCell(4, index + 1).value = header;
      worksheet.getCell(4, index + 1).style = headerStyle;
    });

    // Obtener datos de ventas con populate CORREGIDO
    const ventas = await Venta.find(filtro)
      .populate("paciente", "nombre apellido dni celular")
      .populate("items.productId", "name code")
      .populate("items.variantId", "code color")
      .populate("items.measureId", "sphere cylinder add")
      .populate("vendedora", "nombre apellido")
      .populate("tienda", "name") // CORREGIDO: usar 'name' en lugar de 'nombre'
      .sort({ fechaVenta: -1 });

    let row = 5;
    let totalGeneral = 0;

    // DEBUG: Verificar datos
    console.log(`Encontradas ${ventas.length} ventas con el filtro:`);
    console.log("Filtro:", JSON.stringify(filtro, null, 2));

    ventas.forEach((venta) => {
      console.log("Procesando venta:", venta.ot);
      console.log("Tienda ID:", venta.tienda);
      console.log("Tienda populated:", venta.tienda?.name); // CORREGIDO: .name

      // CORRECCIÓN: Manejar correctamente el acceso a tienda
      let tiendaNombre = "N/A";
      if (venta.tienda) {
        if (typeof venta.tienda === "object" && venta.tienda._id) {
          // Si está populado como objeto - CORREGIDO
          tiendaNombre = venta.tienda.name || "N/A"; // CORREGIDO: .name
          const tiendaInfo = tiendaMap.get(venta.tienda._id.toString());
          if (tiendaInfo) {
            tiendaNombre = tiendaInfo.name; // CORREGIDO: .name
          }
        } else if (typeof venta.tienda === "string") {
          // Si es solo el ID string
          const tiendaInfo = tiendaMap.get(venta.tienda);
          tiendaNombre = tiendaInfo ? tiendaInfo.name : "N/A"; // CORREGIDO: .name
        }
      }
      // Para cada item en la venta - ESTRUCTURA PROFESIONAL
      venta.items.forEach((item, index) => {
        const producto = item.productId;
        let descripcionProducto = "Producto no encontrado";

        // Construir descripción del producto (mantén tu código actual)
        if (producto && typeof producto === "object") {
          descripcionProducto =
            producto.name || producto.code || "Producto sin nombre";

          if (item.variantId && typeof item.variantId === "object") {
            descripcionProducto += ` - ${
              item.variantId.color || item.variantId.code || ""
            }`;
          }

          if (item.measureId && typeof item.measureId === "object") {
            const medida = [];
            if (item.measureId.sphere)
              medida.push(`ESF:${item.measureId.sphere}`);
            if (item.measureId.cylinder)
              medida.push(`CIL:${item.measureId.cylinder}`);
            if (item.measureId.add) medida.push(`ADD:${item.measureId.add}`);
            if (medida.length > 0) {
              descripcionProducto += ` (${medida.join("/")})`;
            }
          }
        }

        // LLENAR LA FILA EN EXCEL - FORMATO PROFESIONAL ESTÁNDAR
        worksheet.getCell(row, 1).value = venta.ot || "N/A"; // OT (SIEMPRE)
        worksheet.getCell(row, 2).value = new Date(
          venta.fechaVenta
        ).toLocaleDateString(); // Fecha (SIEMPRE)
        worksheet.getCell(row, 3).value = tiendaNombre; // Tienda (SIEMPRE)

        // ✅ ESTRUCTURA PROFESIONAL: Datos de paciente SOLO en primer item
        if (index === 0) {
          if (venta.paciente && typeof venta.paciente === "object") {
            worksheet.getCell(row, 4).value = `${venta.paciente.nombre || ""} ${
              venta.paciente.apellido || ""
            }`.trim();
            worksheet.getCell(row, 5).value = venta.paciente.dni || "";
            worksheet.getCell(row, 6).value = venta.paciente.celular || "";
          } else if (venta.paciente) {
            worksheet.getCell(row, 4).value = `Paciente ID: ${venta.paciente}`;
          }
        } else {
          // ✅ FORMATO PROFESIONAL: Items subsiguientes - CELDAS VACÍAS
          worksheet.getCell(row, 4).value = ""; // Paciente vacío
          worksheet.getCell(row, 5).value = ""; // DNI vacío
          worksheet.getCell(row, 6).value = ""; // Celular vacío
        }

        // Producto específico (SIEMPRE mostrar)
        worksheet.getCell(row, 7).value = descripcionProducto;
        worksheet.getCell(row, 8).value = item.quantity;
        worksheet.getCell(row, 9).value = item.unitPrice;
        worksheet.getCell(row, 10).value = item.totalPrice;
        worksheet.getCell(row, 11).value = venta.estadoEntrega || "N/A";

        // ✅ ESTRUCTURA PROFESIONAL: Vendedora SOLO en primer item
        if (index === 0) {
          if (venta.vendedora && typeof venta.vendedora === "object") {
            worksheet.getCell(row, 12).value = `${
              venta.vendedora.nombre || ""
            } ${venta.vendedora.apellido || ""}`.trim();
          } else if (venta.vendedora) {
            worksheet.getCell(
              row,
              12
            ).value = `Vendedora ID: ${venta.vendedora}`;
          }
        } else {
          // ✅ FORMATO PROFESIONAL: Vendedora vacía en items subsiguientes
          worksheet.getCell(row, 12).value = "";
        }

        // Aplicar estilos a toda la fila
        for (let col = 1; col <= headers.length; col++) {
          worksheet.getCell(row, col).style = dataStyle;
        }

        // Formato de moneda para columnas de precio
        worksheet.getCell(row, 9).numFmt = "#,##0.00";
        worksheet.getCell(row, 10).numFmt = "#,##0.00";

        // Sumar al total general - cada item contribuye
        totalGeneral += item.totalPrice || 0;

        row++;
      }); // Línea separadora entre ventas (opcional)
      // worksheet.getCell(row, 1).value = "";
      // row++;
    });

    // Totales
    if (row > 5) {
      worksheet.mergeCells(`A${row}:I${row}`);
      worksheet.getCell(row, 1).value = "TOTAL GENERAL:";
      worksheet.getCell(row, 1).style = {
        font: { bold: true },
        alignment: { horizontal: "right" },
      };
      worksheet.getCell(row, 10).value = totalGeneral;
      worksheet.getCell(row, 10).style = {
        font: { bold: true },
        numFmt: "#,##0.00",
      };
      worksheet.getCell(row, 10).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF2F2F2" },
      };
    }

    // Ajustar anchos de columnas
    worksheet.columns = [
      { width: 10 },
      { width: 12 },
      { width: 20 },
      { width: 25 },
      { width: 12 },
      { width: 15 },
      { width: 35 },
      { width: 10 },
      { width: 12 },
      { width: 12 },
      { width: 15 },
      { width: 20 },
    ];
  }

  /**
   * @desc    Generar reporte resumido por tienda
   */
  static async generarReporteResumido(
    workbook,
    filtro,
    tiendaMap,
    desde,
    hasta
  ) {
    const worksheet = workbook.addWorksheet("VENTAS RESUMIDAS");

    // Estilos (similar al detallado)
    const headerStyle = {
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2F75B5" },
      },
      font: { color: { argb: "FFFFFFFF" }, bold: true, size: 12 },
      border: {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      },
      alignment: { vertical: "middle", horizontal: "center" },
    };

    // Título
    worksheet.mergeCells("A1:F1");
    worksheet.getCell("A1").value = "REPORTE RESUMIDO DE VENTAS POR TIENDA";
    worksheet.getCell("A1").style = {
      font: { bold: true, size: 16 },
      alignment: { horizontal: "center" },
    };

    // Período
    worksheet.mergeCells("A2:F2");
    const periodo =
      desde && hasta
        ? `Período: ${new Date(desde).toLocaleDateString()} - ${new Date(
            hasta
          ).toLocaleDateString()}`
        : "Período: Todo";
    worksheet.getCell("A2").value = periodo;
    worksheet.getCell("A2").style = { alignment: { horizontal: "center" } };

    // Encabezados
    const headers = [
      "Tienda",
      "Total Ventas",
      "Ingresos Totales",
      "Venta Promedio",
      "Clientes Atendidos",
      "Estado Más Común",
    ];
    headers.forEach((header, index) => {
      worksheet.getCell(4, index + 1).value = header;
      worksheet.getCell(4, index + 1).style = headerStyle;
    });

    // Agregación para resumen por tienda CORREGIDO
    const resumenPorTienda = await Venta.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: "$tienda",
          totalVentas: { $sum: 1 },
          ingresosTotales: { $sum: "$totalVenta" },
          ventaPromedio: { $avg: "$totalVenta" },
          clientesUnicos: { $addToSet: "$paciente" },
          estados: { $push: "$estadoEntrega" },
        },
      },
      { $sort: { ingresosTotales: -1 } },
    ]);

    let row = 5;
    let granTotal = 0;
    let totalVentas = 0;

    // DEBUG
    console.log("Resumen por tienda encontrado:", resumenPorTienda.length);

    for (const resumen of resumenPorTienda) {
      const tiendaId = resumen._id ? resumen._id.toString() : "sin-tienda";
      const tiendaInfo = tiendaMap.get(tiendaId);
      const tiendaNombre = tiendaInfo
        ? tiendaInfo.nombre
        : `Tienda ID: ${tiendaId}`;

      // Calcular estado más común
      let estadoMasComun = "N/A";
      if (resumen.estados && resumen.estados.length > 0) {
        const estadoCount = resumen.estados.reduce((acc, estado) => {
          acc[estado] = (acc[estado] || 0) + 1;
          return acc;
        }, {});
        estadoMasComun = Object.keys(estadoCount).reduce((a, b) =>
          estadoCount[a] > estadoCount[b] ? a : b
        );
      }

      worksheet.getCell(row, 1).value = tiendaNombre;
      worksheet.getCell(row, 2).value = resumen.totalVentas;
      worksheet.getCell(row, 3).value = resumen.ingresosTotales;
      worksheet.getCell(row, 4).value = resumen.ventaPromedio;
      worksheet.getCell(row, 5).value = resumen.clientesUnicos.length;
      worksheet.getCell(row, 6).value = estadoMasComun;

      // Formato de moneda
      worksheet.getCell(row, 3).numFmt = "#,##0.00";
      worksheet.getCell(row, 4).numFmt = "#,##0.00";

      granTotal += resumen.ingresosTotales;
      totalVentas += resumen.totalVentas;
      row++;
    }

    // Total general
    if (row > 5) {
      worksheet.mergeCells(`A${row}:B${row}`);
      worksheet.getCell(row, 1).value = "TOTAL GENERAL:";
      worksheet.getCell(row, 1).style = {
        font: { bold: true },
        alignment: { horizontal: "right" },
      };
      worksheet.getCell(row, 2).value = totalVentas;
      worksheet.getCell(row, 3).value = granTotal;
      worksheet.getCell(row, 3).style = {
        font: { bold: true },
        numFmt: "#,##0.00",
      };
      worksheet.getCell(row, 4).value = granTotal / totalVentas;
      worksheet.getCell(row, 4).style = {
        font: { bold: true },
        numFmt: "#,##0.00",
      };
    }

    // Ajustar anchos
    worksheet.columns = [
      { width: 25 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 18 },
      { width: 20 },
    ];
  }

  /**
   * @desc    Generar reporte de productos más vendidos por tienda
   */
  static async generarReporteProductos(
    workbook,
    filtro,
    tiendaMap,
    desde,
    hasta
  ) {
    const worksheet = workbook.addWorksheet("PRODUCTOS VENDIDOS");

    // Estilos
    const headerStyle = {
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2F75B5" },
      },
      font: { color: { argb: "FFFFFFFF" }, bold: true, size: 12 },
      border: {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      },
      alignment: { vertical: "middle", horizontal: "center" },
    };

    // Título
    worksheet.mergeCells("A1:E1");
    worksheet.getCell("A1").value = "PRODUCTOS MÁS VENDIDOS POR TIENDA";
    worksheet.getCell("A1").style = {
      font: { bold: true, size: 16 },
      alignment: { horizontal: "center" },
    };

    // Período
    worksheet.mergeCells("A2:E2");
    const periodo =
      desde && hasta
        ? `Período: ${new Date(desde).toLocaleDateString()} - ${new Date(
            hasta
          ).toLocaleDateString()}`
        : "Período: Todo";
    worksheet.getCell("A2").value = periodo;
    worksheet.getCell("A2").style = { alignment: { horizontal: "center" } };

    // Encabezados
    const headers = [
      "Tienda",
      "Producto",
      "Código",
      "Cantidad Vendida",
      "Total Vendido",
    ];
    headers.forEach((header, index) => {
      worksheet.getCell(4, index + 1).value = header;
      worksheet.getCell(4, index + 1).style = headerStyle;
    });

    // Agregación para productos vendidos CORREGIDO
    const productosVendidos = await Venta.aggregate([
      { $match: filtro },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "productoInfo",
        },
      },
      { $unwind: { path: "$productoInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            tienda: "$tienda",
            producto: "$items.productId",
          },
          productoNombre: { $first: "$productoInfo.name" },
          productoCodigo: { $first: "$productoInfo.code" },
          cantidadVendida: { $sum: "$items.quantity" },
          totalVendido: { $sum: "$items.totalPrice" },
        },
      },
      { $sort: { totalVendido: -1 } },
    ]);

    let row = 5;

    // DEBUG
    console.log("Productos vendidos encontrados:", productosVendidos.length);

    productosVendidos.forEach((item) => {
      const tiendaId = item._id.tienda
        ? item._id.tienda.toString()
        : "sin-tienda";
      const tiendaInfo = tiendaMap.get(tiendaId);
      const tiendaNombre = tiendaInfo
        ? tiendaInfo.nombre
        : `Tienda ID: ${tiendaId}`;

      worksheet.getCell(row, 1).value = tiendaNombre;
      worksheet.getCell(row, 2).value =
        item.productoNombre || "Producto no encontrado";
      worksheet.getCell(row, 3).value = item.productoCodigo || "N/A";
      worksheet.getCell(row, 4).value = item.cantidadVendida;
      worksheet.getCell(row, 5).value = item.totalVendido;

      worksheet.getCell(row, 5).numFmt = "#,##0.00";
      row++;
    });

    // Ajustar anchos
    worksheet.columns = [
      { width: 25 },
      { width: 30 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];
  }
}

module.exports = VentaController;
