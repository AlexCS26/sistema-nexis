const RecojoOptica = require("../models/recojos.model");
const Venta = require("../../../venta_service/venta_service/models/venta.model");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

/**
 * @desc    Crear un nuevo recogo o separación
 * @route   POST /api/recojos
 * @access  Private
 */
const crearRecojo = async (req, res) => {
  try {
    // Validar que el tipo sea correcto
    if (req.body.tipo && !["RECOJO", "SEPARACION"].includes(req.body.tipo)) {
      return errorResponse(res, 400, "El tipo debe ser RECOJO o SEPARACION");
    }

    // Validar que la tienda sea correcta
    if (
      req.body.tienda &&
      !["MIRIAM_BOLIVAR", "ZARA_HUARAL", "OTRA_TIENDA"].includes(
        req.body.tienda
      )
    ) {
      return errorResponse(res, 400, "Tienda no válida");
    }

    // Validar que haya items
    if (
      !req.body.items ||
      !Array.isArray(req.body.items) ||
      req.body.items.length === 0
    ) {
      return errorResponse(res, 400, "Debe agregar al menos un item");
    }

    // Calcular total si no viene
    if (!req.body.total) {
      req.body.total = req.body.items.reduce(
        (sum, item) => sum + (item.totalPrice || 0),
        0
      );
    }

    // Calcular saldo inicial
    req.body.saldo = req.body.total - (req.body.cuenta || 0);

    const nuevoRecojo = new RecojoOptica({
      ...req.body,
      // Establecer valores por defecto si no vienen en el request
      tipo: req.body.tipo || "RECOJO",
      tienda: req.body.tienda || "OTRA_TIENDA",
      estaEn: req.body.estaEn || "EN_TIENDA",
    });

    const recojosGuardado = await nuevoRecojo.save();

    successResponse(
      res,
      201,
      `${nuevoRecojo.getTipoDescripcion()} creado exitosamente`,
      recojosGuardado
    );
  } catch (error) {
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((el) => el.message);
      errorResponse(res, 400, "Error de validación", error, { errors });
    } else if (error.code === 11000) {
      errorResponse(res, 400, "El número de documento ya existe", error);
    } else {
      errorResponse(res, 500, "Error al crear el documento", error);
    }
  }
};

/**
 * @desc    Obtener todos los recojos/separaciones con filtros
 * @route   GET /api/recojos
 * @access  Private
 */
const obtenerRecojos = async (req, res) => {
  try {
    // Validación y saneamiento de parámetros
    const {
      entregado,
      desde,
      hasta,
      page = 1,
      limit = 10,
      nombreApellido,
      ordenTrabajo,
      estaEn,
      tipo,
      tienda,
    } = req.query;

    // Validar parámetros de paginación
    const pagina = parseInt(page);
    const limite = parseInt(limit);

    if (isNaN(pagina) || pagina < 1) {
      return errorResponse(
        res,
        400,
        "El parámetro 'page' debe ser un número mayor a 0"
      );
    }

    if (isNaN(limite) || limite < 1 || limite > 100) {
      return errorResponse(
        res,
        400,
        "El parámetro 'limit' debe ser entre 1 y 100"
      );
    }

    // Construir query de filtrado
    const query = {};

    // Filtro por tipo (RECOJO/SEPARACION)
    if (tipo) {
      if (!["RECOJO", "SEPARACION"].includes(tipo.toUpperCase())) {
        return errorResponse(
          res,
          400,
          "El parámetro 'tipo' debe ser 'RECOJO' o 'SEPARACION'"
        );
      }
      query.tipo = tipo.toUpperCase();
    }

    // Filtro por tienda
    if (tienda) {
      const tiendasValidas = ["MIRIAM_BOLIVAR", "ZARA_HUARAL", "OTRA_TIENDA"];
      if (!tiendasValidas.includes(tienda.toUpperCase())) {
        return errorResponse(
          res,
          400,
          "Tienda no válida. Valores aceptados: MIRIAM_BOLIVAR, ZARA_HUARAL, OTRA_TIENDA"
        );
      }
      query.tienda = tienda.toUpperCase();
    }

    // Filtro por estado de entrega
    if (entregado !== undefined) {
      if (entregado !== "true" && entregado !== "false") {
        return errorResponse(
          res,
          400,
          "El parámetro 'entregado' debe ser 'true' o 'false'"
        );
      }
      query["entregado.fecha"] =
        entregado === "true" ? { $exists: true } : { $exists: false };
    }

    // Filtro por rango de fechas
    if (desde || hasta) {
      query.fechaCompra = {};

      try {
        if (desde) {
          const fechaDesde = new Date(desde);
          if (isNaN(fechaDesde.getTime())) {
            throw new Error("Fecha 'desde' no válida");
          }
          query.fechaCompra.$gte = fechaDesde;
        }

        if (hasta) {
          const fechaHasta = new Date(hasta);
          if (isNaN(fechaHasta.getTime())) {
            throw new Error("Fecha 'hasta' no válida");
          }
          query.fechaCompra.$lte = fechaHasta;
        }

        if (desde && hasta && query.fechaCompra.$gte > query.fechaCompra.$lte) {
          return errorResponse(
            res,
            400,
            "La fecha 'desde' no puede ser mayor que 'hasta'"
          );
        }
      } catch (error) {
        return errorResponse(res, 400, error.message);
      }
    }

    // Filtro por nombre y apellido (búsqueda parcial case insensitive)
    if (nombreApellido) {
      query.nombreApellido = { $regex: nombreApellido, $options: "i" };
    }

    // Filtro por orden de trabajo (búsqueda exacta)
    if (ordenTrabajo) {
      query.ordenTrabajo = ordenTrabajo;
    }

    // Filtro por ubicación actual
    if (estaEn) {
      const ubicacionesValidas = ["EN_TIENDA", "EN_LABORATORIO", "ENTREGADO"];
      if (!ubicacionesValidas.includes(estaEn.toUpperCase())) {
        return errorResponse(
          res,
          400,
          "El parámetro 'estaEn' debe ser uno de: EN_TIENDA, EN_LABORATORIO, ENTREGADO"
        );
      }
      query.estaEn = estaEn.toUpperCase();
    }

    // Opciones de paginación con populate para items
    const options = {
      page: pagina,
      limit: limite,
      sort: { fechaCompra: -1 },
      collation: { locale: "es" },
      select: "-__v",
      populate: [
        {
          path: "items.productId",
          select: "code name brand descripcion",
        },
        {
          path: "items.variantId",
          select: "code color size material",
        },
        {
          path: "items.measureId",
          select: "code sphere cylinder add serie",
        },
      ],
    };

    // Ejecutar consulta
    const recojos = await RecojoOptica.paginate(query, options);

    // Formatear respuesta
    const responseData = {
      data: recojos.docs,
      pagination: {
        total: recojos.totalDocs,
        limit: recojos.limit,
        page: recojos.page,
        pages: recojos.totalPages,
      },
    };

    const message =
      recojos.docs.length === 0
        ? "No se encontraron documentos con los criterios especificados"
        : "Documentos obtenidos exitosamente";

    return successResponse(res, 200, message, responseData);
  } catch (error) {
    console.error("Error inesperado en obtenerRecojos:", error);
    return errorResponse(res, 500, "Error interno del servidor", {
      error: error.message,
    });
  }
};

/**
 * @desc    Obtener un recogo/separación por ID
 * @route   GET /api/recojos/:id
 * @access  Private
 */
const obtenerRecojo = async (req, res) => {
  try {
    const documento = await RecojoOptica.findById(req.params.id)
      .populate({
        path: "items.productId",
        select: "code name brand descripcion",
      })
      .populate({
        path: "items.variantId",
        select: "code color size material",
      })
      .populate({
        path: "items.measureId",
        select: "code sphere cylinder add serie",
      });

    if (!documento) {
      return errorResponse(res, 404, "Documento no encontrado");
    }

    successResponse(res, 200, "Documento obtenido exitosamente", documento);
  } catch (error) {
    if (error.name === "CastError") {
      errorResponse(res, 400, "ID inválido", error);
    } else {
      errorResponse(res, 500, "Error al obtener el documento", error);
    }
  }
};

/**
 * @desc    Actualizar un recogo/separación
 * @route   PUT /api/recojos/:id
 * @access  Private
 */
const actualizarRecojo = async (req, res) => {
  try {
    // No permitir actualizar el número
    if (req.body.numero) {
      delete req.body.numero;
    }

    // Validar tipo si viene en el request
    if (req.body.tipo && !["RECOJO", "SEPARACION"].includes(req.body.tipo)) {
      return errorResponse(res, 400, "El tipo debe ser RECOJO o SEPARACION");
    }

    // Validar tienda si viene en el request
    if (
      req.body.tienda &&
      !["MIRIAM_BOLIVAR", "ZARA_HUARAL", "OTRA_TIENDA"].includes(
        req.body.tienda
      )
    ) {
      return errorResponse(res, 400, "Tienda no válida");
    }

    // Si se actualizan items, recalcular total y saldo
    if (req.body.items && Array.isArray(req.body.items)) {
      const nuevoTotal = req.body.items.reduce(
        (sum, item) => sum + (item.totalPrice || 0),
        0
      );
      req.body.total = nuevoTotal;

      // Mantener la cuenta actual si no se proporciona una nueva
      const documentoActual = await RecojoOptica.findById(req.params.id);
      const cuentaActual = documentoActual ? documentoActual.cuenta : 0;
      req.body.saldo = nuevoTotal - (req.body.cuenta || cuentaActual);
    }

    const documentoActualizado = await RecojoOptica.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate({
        path: "items.productId",
        select: "code name brand descripcion",
      })
      .populate({
        path: "items.variantId",
        select: "code color size material",
      })
      .populate({
        path: "items.measureId",
        select: "code sphere cylinder add serie",
      });

    if (!documentoActualizado) {
      return errorResponse(res, 404, "Documento no encontrado");
    }

    successResponse(
      res,
      200,
      "Documento actualizado exitosamente",
      documentoActualizado
    );
  } catch (error) {
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((el) => el.message);
      errorResponse(res, 400, "Error de validación", error, { errors });
    } else if (error.name === "CastError") {
      errorResponse(res, 400, "ID inválido", error);
    } else {
      errorResponse(res, 500, "Error al actualizar el documento", error);
    }
  }
};

/**
 * @desc    Eliminar un recogo/separación
 * @route   DELETE /api/recojos/:id
 * @access  Private
 */
const eliminarRecojo = async (req, res) => {
  try {
    const documentoEliminado = await RecojoOptica.findByIdAndDelete(
      req.params.id
    );

    if (!documentoEliminado) {
      return errorResponse(res, 404, "Documento no encontrado");
    }

    successResponse(res, 200, "Documento eliminado exitosamente", {
      id: req.params.id,
      tipo: documentoEliminado.tipo,
    });
  } catch (error) {
    if (error.name === "CastError") {
      errorResponse(res, 400, "ID inválido", error);
    } else {
      errorResponse(res, 500, "Error al eliminar el documento", error);
    }
  }
};

/**
 * @desc    Marcar recogo/separación como entregado
 * @route   PATCH /api/recojos/:id/entregar
 * @access  Private
 */
const marcarEntregado = async (req, res) => {
  try {
    const { recibidoPor = "MIRIAM", ordenTrabajo, encargada } = req.body;

    const documento = await RecojoOptica.findById(req.params.id);

    if (!documento) {
      return errorResponse(res, 404, "Documento no encontrado");
    }

    if (documento.entregado && documento.entregado.fecha) {
      return errorResponse(
        res,
        400,
        `La ${documento
          .getTipoDescripcion()
          .toLowerCase()} ya estaba marcada como entregada`
      );
    }

    documento.entregado = {
      fecha: new Date(),
      recibidoPor,
      ordenTrabajo: ordenTrabajo || documento.ordenTrabajo,
      encargada: encargada || "YANNINA",
    };

    documento.estaEn = "ENTREGADO";

    const documentoActualizado = await documento.save();

    successResponse(
      res,
      200,
      `${documento.getTipoDescripcion()} marcada como entregada exitosamente`,
      documentoActualizado
    );
  } catch (error) {
    if (error.name === "CastError") {
      errorResponse(res, 400, "ID inválido", error);
    } else {
      errorResponse(
        res,
        500,
        `Error al marcar el documento como entregado`,
        error
      );
    }
  }
};

/**
 * @desc    Registrar un pago/adelanto y sincronizar con la venta
 * @route   PATCH /api/recojos/:id/pagar
 * @access  Private
 */
const registrarPago = async (req, res) => {
  try {
    const {
      importe,
      fecha = new Date(),
      ordenTrabajo,
      metodo = "EFECTIVO",
    } = req.body;

    console.log("[Pago] Iniciando registro de pago:", {
      importe,
      fecha,
      ordenTrabajo,
      metodo,
    });

    if (!importe || isNaN(importe)) {
      console.warn("[Pago] Importe inválido:", importe);
      return errorResponse(
        res,
        400,
        "El importe es requerido y debe ser un número válido"
      );
    }

    // Buscar recojo
    const documento = await RecojoOptica.findById(req.params.id);
    if (!documento) {
      console.warn("[Pago] Documento no encontrado:", req.params.id);
      return errorResponse(res, 404, "Documento no encontrado");
    }
    console.log(
      "[Pago] Documento encontrado:",
      documento._id,
      "Saldo actual:",
      documento.saldo
    );

    // --- SINCRONIZAR CON VENTA PRIMERO ---
    let totalPagado = documento.cuenta || 0;
    if (documento.venta) {
      console.log("[Pago] Sincronizando con venta:", documento.venta);
      const venta = await Venta.findById(documento.venta);
      if (venta) {
        // Agregar pago a la venta
        venta.pagos.push({
          monto: parseFloat(importe),
          metodo,
          fecha: new Date(fecha),
        });

        // Calcular total pagado y actualizar saldo/porcentaje
        totalPagado = venta.pagos.reduce((acc, p) => acc + (p.monto || 0), 0);
        venta.saldoPendiente = Math.max(
          0,
          (venta.totalVenta || 0) - totalPagado
        );
        venta.porcentajePagado = (
          (totalPagado / (venta.totalVenta || 1)) *
          100
        ).toFixed(2);

        if (venta.saldoPendiente <= 0 && !venta.fechaCancelacion) {
          venta.fechaCancelacion = new Date();
          console.log("[Pago] Venta cancelada automáticamente:", venta._id);
        }

        await venta.save();
        console.log("[Pago] Venta sincronizada correctamente:", venta._id);
      } else {
        console.warn("[Pago] Venta asociada no encontrada:", documento.venta);
      }
    } else {
      totalPagado += parseFloat(importe);
    }

    // --- ACTUALIZAR RECOJO ---
    // Crear nuevo adelanto con saldo actualizado según venta
    const nuevoAdelanto = {
      fecha: new Date(fecha),
      ordenTrabajo: ordenTrabajo || documento.ordenTrabajo,
      importe: parseFloat(importe),
      saldo: documento.total - totalPagado,
    };

    documento.adelantos = documento.adelantos || [];
    documento.adelantos.push(nuevoAdelanto);

    // Actualizar saldo y cuenta
    documento.saldo = Math.max(0, documento.total - totalPagado);
    documento.cuenta = totalPagado;

    // 🔹 Determinar tipo (RECOJO o SEPARACION) basado en porcentaje pagado
    const porcentajePagado = (totalPagado / (documento.total || 1)) * 100;

    if (porcentajePagado >= 50) {
      documento.tipo = "RECOJO";
    } else {
      documento.tipo = "SEPARACION";
    }

    console.log(
      `[Pago] Tipo actualizado automáticamente a: ${
        documento.tipo
      } (Pagado: ${porcentajePagado.toFixed(2)}%)`
    );

    // Marcar cancelado si el saldo llega a cero
    if (documento.saldo <= 0) {
      documento.cancelado = { fecha: new Date(), importe: documento.total };
      console.log("[Pago] Documento cancelado automáticamente:", documento._id);
    }

    const documentoActualizado = await documento.save();
    console.log(
      "[Pago] Documento recojo actualizado:",
      documentoActualizado._id,
      "Saldo:",
      documentoActualizado.saldo
    );

    successResponse(
      res,
      200,
      "Pago registrado y sincronizado exitosamente",
      documentoActualizado
    );
  } catch (error) {
    console.error("[Pago] Error al registrar el pago:", error);
    if (error.name === "CastError")
      errorResponse(res, 400, "ID inválido", error);
    else errorResponse(res, 500, "Error al registrar el pago", error);
  }
};

module.exports = {
  crearRecojo,
  obtenerRecojos,
  obtenerRecojo,
  actualizarRecojo,
  eliminarRecojo,
  marcarEntregado,
  registrarPago,
};
