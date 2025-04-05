const RecojoOptica = require("../models/recojos.model");
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

    const nuevoRecojo = new RecojoOptica({
      ...req.body,
      // Establecer valores por defecto si no vienen en el request
      tipo: req.body.tipo || "RECOJO",
      tienda: req.body.tienda || "OTRA_TIENDA",
      estaEn: req.body.estaEn || "TIENDA",
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
      tipo, // Nuevo parámetro para filtrar por tipo (RECOJO/SEPARACION)
      tienda, // Nuevo parámetro para filtrar por tienda
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
      const ubicacionesValidas = ["TIENDA", "LABORATORIO", "ENTREGADO"];
      if (!ubicacionesValidas.includes(estaEn.toUpperCase())) {
        return errorResponse(
          res,
          400,
          "El parámetro 'estaEn' debe ser uno de: TIENDA, LABORATORIO, ENTREGADO"
        );
      }
      query.estaEn = estaEn.toUpperCase();
    }

    // Opciones de paginación
    const options = {
      page: pagina,
      limit: limite,
      sort: { fechaCompra: -1 }, // Ordenar por fecha de compra descendente
      collation: { locale: "es" },
      select: "-__v", // Excluir el campo __v
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
    const documento = await RecojoOptica.findById(req.params.id);

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

    const documentoActualizado = await RecojoOptica.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

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
 * @desc    Registrar un pago/adelanto
 * @route   PATCH /api/recojos/:id/pagar
 * @access  Private
 */
const registrarPago = async (req, res) => {
  try {
    const { importe, fecha = new Date(), ordenTrabajo } = req.body;

    if (!importe || isNaN(importe)) {
      return errorResponse(
        res,
        400,
        "El importe es requerido y debe ser un número válido"
      );
    }

    const documento = await RecojoOptica.findById(req.params.id);

    if (!documento) {
      return errorResponse(res, 404, "Documento no encontrado");
    }

    // Crear nuevo adelanto
    const nuevoAdelanto = {
      fecha: new Date(fecha),
      ordenTrabajo: ordenTrabajo || documento.ordenTrabajo,
      importe: parseFloat(importe),
      saldo: (documento.saldo || documento.total) - parseFloat(importe),
    };

    // Agregar al array de adelantos
    if (!documento.adelantos) {
      documento.adelantos = [];
    }
    documento.adelantos.push(nuevoAdelanto);

    // Actualizar saldo
    documento.saldo = Math.max(
      0,
      (documento.saldo || documento.total) - parseFloat(importe)
    );

    // Si el saldo llega a cero, marcar como cancelado
    if (documento.saldo <= 0) {
      documento.cancelado = {
        fecha: new Date(),
        importe: documento.total,
      };
    }

    const documentoActualizado = await documento.save();

    successResponse(
      res,
      200,
      "Pago registrado exitosamente",
      documentoActualizado
    );
  } catch (error) {
    if (error.name === "CastError") {
      errorResponse(res, 400, "ID inválido", error);
    } else {
      errorResponse(res, 500, "Error al registrar el pago", error);
    }
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
