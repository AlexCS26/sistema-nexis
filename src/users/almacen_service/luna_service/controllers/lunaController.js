const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const Luna = require("../models/luna.model");
const Movimiento = require("../models/movimiento.model");
const {
  analizarStockIA,
} = require("../../../ia_service/services/deepseekService");
const {
  validarRangoYIncremento,
  determinarSerie,
} = require("../../../utils/lunaUtils");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

// Lista de roles permitidos
const ROLES_PERMITIDOS = [
  "admin",
  "optometrista",
  "vendedor",
  "almacen",
  "supervisor",
];

const obtenerMedidasPorIdLuna = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, "ID de luna no válido.");
    }

    const luna = await Luna.findById(id).lean();
    if (!luna) {
      return errorResponse(res, 404, "Luna no encontrada.");
    }

    // Obtener medidas únicas del mismo tipo
    const medidasUnicas = await Luna.aggregate([
      { $match: { tipo: luna.tipo } },
      {
        $group: {
          _id: {
            esferico: "$esferico",
            cilindrico: "$cilindrico",
          },
        },
      },
      {
        $project: {
          esferico: "$_id.esferico",
          cilindrico: "$_id.cilindrico",
          _id: 0,
        },
      },
      {
        $sort: {
          esferico: 1,
          cilindrico: 1,
        },
      },
    ]);

    // Formatear valores numéricos consistentemente
    const medidasFormateadas = medidasUnicas.map((medida) => ({
      esferico: formatDioptria(medida.esferico),
      cilindrico: formatDioptria(medida.cilindrico),
    }));

    // Usa successResponse con el formato correcto
    return successResponse(res, 200, "Medidas obtenidas exitosamente", {
      tipo: luna.tipo,
      medidas: medidasFormateadas,
    });
  } catch (error) {
    console.error("Error en obtenerMedidasPorIdLuna:", error);
    return errorResponse(res, 500, "Error al obtener medidas de lunas", error);
  }
};

const obtenerInsightsIA = async (req, res) => {
  const startTime = Date.now();

  try {
    let { items, filtros } = req.body;

    // ================= 1️⃣ Obtener items si no vienen en body =================
    if ((!items || !Array.isArray(items) || items.length === 0) && filtros) {
      items = await Luna.find(filtros).lean();
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return errorResponse(res, 400, "No hay datos suficientes para analizar.");
    }

    // ================= 2️⃣ Validación avanzada =================
    items = items.filter(
      (it) => it.tipo && it.zona && typeof it.stock === "number"
    );

    if (items.length === 0) {
      return errorResponse(
        res,
        400,
        "Los items no cumplen con la estructura mínima requerida."
      );
    }

    // ================= 3️⃣ Preprocesar items por tipo + medida + zona =================
    const processedItems = [];
    const itemsByClave = {};

    items.forEach((item) => {
      let medidas = [];

      // 3a. Si ya tiene medidas explícitas
      if (Array.isArray(item.medidas) && item.medidas.length > 0) {
        medidas = item.medidas.map((m) => ({
          valor: m.valor || m,
          stock: m.stock || item.stock,
        }));
      }
      // 3b. Si tiene ESF y/o CIL
      else if (item.esferico || item.cilindrico) {
        const esfValues = Array.isArray(item.esferico)
          ? item.esferico.map(Number)
          : [item.esferico ? parseFloat(item.esferico) : 0.0];

        const cilValues = Array.isArray(item.cilindrico)
          ? item.cilindrico.map(Number)
          : [item.cilindrico ? parseFloat(item.cilindrico) : 0.0];

        esfValues.forEach((esf) => {
          cilValues.forEach((cil) => {
            medidas.push({
              valor: `ESF:${esf} CIL:${cil}`,
              stock: item.stock,
            });
          });
        });
      }
      // 3c. Caso sin medidas
      else {
        medidas = [{ valor: "GENERICA", stock: item.stock }];
      }

      // ================= 3d. Acumular por clave única (tipo+medida+zona) =================
      medidas.forEach((m) => {
        const clave = `${item.tipo}|${m.valor}|${item.zona}`;
        if (!itemsByClave[clave]) {
          itemsByClave[clave] = {
            tipo: item.tipo,
            medida: m.valor,
            stock: 0,
            zona: item.zona,
          };
        }
        itemsByClave[clave].stock += m.stock;
      });
    });

    // ================= 3e. Convertir a array plano =================
    const processedItemsArray = Object.values(itemsByClave);

    // ================= 4️⃣ Llamada a la IA =================
    const insightsRaw = await analizarStockIA(processedItemsArray);

    // ================= 5️⃣ Parseo seguro =================
    let summary = "El análisis fue exitoso.";
    let zonasCriticas = [];
    let tiposCriticos = [];
    let recomendaciones = [];

    try {
      let parsed;
      if (typeof insightsRaw === "string") {
        const cleaned = insightsRaw
          .replace(/```json|```/g, "")
          .replace(/\\n/g, "")
          .replace(/\\"/g, '"')
          .trim();

        try {
          parsed = JSON.parse(cleaned);
        } catch (e) {
          console.warn("No se pudo parsear insightsRaw, fallback a string:", e);
          parsed = {};
        }
      } else {
        parsed = insightsRaw;
      }

      summary = parsed.summary || summary;
      zonasCriticas = parsed.zonasCriticas || [];
      tiposCriticos = parsed.tiposCriticos || [];
      recomendaciones = parsed.recomendaciones || [];

      // Extraer JSON de recomendación si la IA devuelve todo dentro de ella
      if (
        recomendaciones.length === 1 &&
        typeof recomendaciones[0] === "string" &&
        recomendaciones[0].includes("{")
      ) {
        try {
          const jsonStr = recomendaciones[0].replace(/```json|```/g, "").trim();
          const parsedFromRecom = JSON.parse(jsonStr);
          zonasCriticas = parsedFromRecom.zonasCriticas || zonasCriticas;
          tiposCriticos = parsedFromRecom.tiposCriticos || tiposCriticos;
          recomendaciones = parsedFromRecom.recomendaciones || recomendaciones;
        } catch (e) {
          console.warn("No se pudo extraer JSON de la recomendación:", e);
        }
      }
    } catch (e) {
      console.warn("⚠️ Error parseando insights, usando fallback.", e);
    }

    // ================= 6️⃣ Enriquecimiento automático =================
    const recomendacionesLimpias = recomendaciones.map((r) => {
      const match = r.match(/stock:\s*(\d+)/);
      if (!match) return r;
      const stock = parseInt(match[1]);
      if (stock <= 2) return `🔥 CRÍTICO: ${r}`;
      if (stock <= 5) return `⚠️ Bajo: ${r}`;
      return r;
    });

    // ================= 7️⃣ Metadata extendida =================
    const endTime = Date.now();
    const metadata = {
      totalItems: processedItemsArray.length,
      totalZonas: zonasCriticas.length,
      totalTipos: tiposCriticos.length,
      totalRecomendaciones: recomendacionesLimpias.length,
      generadoEn: new Date().toISOString(),
      duracionMs: endTime - startTime,
      modeloIA: "DeepSeek v1.5",
      insightId: crypto.randomUUID(),
    };

    // ================= 8️⃣ Respuesta final =================
    const respuesta = {
      summary,
      zonasCriticas,
      tiposCriticos,
      recomendaciones: recomendacionesLimpias,
      metadata,
    };

    return res.status(200).json({
      success: true,
      message: "Insights de inventario generados exitosamente",
      data: respuesta,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error en obtenerInsightsIA:", error.message, error);
    return errorResponse(res, 500, "Error al generar insights con IA.", error);
  }
};

// Función auxiliar para formatear dioptrías
function formatDioptria(value) {
  if (!value) return "0.00";
  const num = parseFloat(value);
  if (isNaN(num)) return "0.00";
  return num >= 0 ? `+${num.toFixed(2)}` : num.toFixed(2);
}

// Registrar una nueva luna o actualizar stock si ya existe
const registrarLuna = async (req, res) => {
  try {
    const { esferico, cilindrico, tipo, stock, precioUnitario, ot, zona } =
      req.body;
    const registradoPor = req.usuario?.userId || "sistema";

    // 🔹 Validaciones obligatorias
    if (!esferico && !cilindrico) {
      return errorResponse(
        res,
        400,
        "Debe proporcionar al menos un valor para esférico o cilíndrico."
      );
    }

    if (!zona) {
      return errorResponse(
        res,
        400,
        "La zona (Chancay o Huaral) es obligatoria."
      );
    }

    if (!ot) {
      return errorResponse(
        res,
        400,
        "La Orden de Trabajo (OT) es obligatoria."
      );
    }

    if (
      precioUnitario === undefined ||
      precioUnitario === null ||
      isNaN(Number(precioUnitario))
    ) {
      return errorResponse(
        res,
        400,
        "El precio unitario es obligatorio y debe ser un número válido."
      );
    }
    if (Number(precioUnitario) < 0) {
      return errorResponse(
        res,
        400,
        "El precio unitario no puede ser negativo."
      );
    }

    // 🔹 Validar esférico y cilíndrico usando utils
    if (!validarRangoYIncremento(esferico, false)) {
      return errorResponse(
        res,
        400,
        "Valor esférico inválido (debe estar entre -6.00 y +6.00 en incrementos de 0.25)."
      );
    }
    if (!validarRangoYIncremento(cilindrico, true)) {
      return errorResponse(
        res,
        400,
        "Valor cilíndrico inválido (debe estar entre -6.00 y 0.00 en incrementos de 0.25)."
      );
    }

    // 🔹 Validar y convertir stock
    const cantidadNumerica = Number(stock);
    if (!Number.isFinite(cantidadNumerica)) {
      return errorResponse(res, 400, "La cantidad debe ser un número válido.");
    }
    if (cantidadNumerica < 0) {
      return errorResponse(res, 400, "La cantidad no puede ser negativa.");
    }

    // 🔹 Verificar si ya existe la luna
    let luna = await Luna.findOne({ esferico, cilindrico, tipo, ot, zona });

    if (luna) {
      luna.stock += cantidadNumerica;
      luna.precioUnitario = Number(precioUnitario); // actualizar precio unitario
      luna.serie = determinarSerie(cilindrico); // calcular serie automáticamente
      await luna.save();

      if (cantidadNumerica > 0) {
        await Movimiento.create({
          tipo: "luna",
          referencia: luna._id,
          tipoMovimiento: "ingreso",
          subtipo: "compra",
          cantidad: cantidadNumerica,
          documentoRelacionado: {
            tipo: "ot",
            referencia: ot,
            fecha: new Date(),
          },
          registradoPor,
          estado: "completado",
          zona,
        });
      }

      return res.status(200).json({
        success: true,
        statusCode: 200,
        message: "Stock de luna actualizado con éxito.",
        data: { items: [luna], pagination: null },
        timestamp: new Date().toISOString(),
      });
    }

    // 🔹 Crear nueva luna
    const nuevaLuna = await Luna.create({
      esferico,
      cilindrico,
      tipo,
      stock: cantidadNumerica,
      precioUnitario: Number(precioUnitario), // incluir precio unitario
      serie: determinarSerie(cilindrico),
      ot,
      zona,
      registradoPor,
    });

    if (cantidadNumerica > 0) {
      await Movimiento.create({
        tipo: "luna",
        referencia: nuevaLuna._id,
        tipoMovimiento: "ingreso",
        subtipo: "compra",
        cantidad: cantidadNumerica,
        documentoRelacionado: { tipo: "ot", referencia: ot, fecha: new Date() },
        registradoPor,
        estado: "completado",
        zona,
      });
    }

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Luna registrada con éxito.",
      data: { items: [nuevaLuna], pagination: null },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(
      res,
      500,
      "Error al registrar luna.",
      process.env.NODE_ENV === "development" ? error : undefined
    );
  }
};

// Obtener todas las lunas con paginación (sin IA)
const obtenerLunas = async (req, res) => {
  try {
    const {
      tipo,
      esferico,
      cilindrico,
      stockMinimo,
      stockMaximo,
      fechaDesde,
      fechaHasta,
      ot,
      zona,
      page = 1,
      limit = 10,
      sort = "createdAt:desc",
      fields = "",
      q = "",
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);

    const filtros = {};
    if (tipo) filtros.tipo = String(tipo).trim();
    if (!isNaN(parseFloat(esferico))) filtros.esferico = parseFloat(esferico);
    if (!isNaN(parseFloat(cilindrico)))
      filtros.cilindrico = parseFloat(cilindrico);
    if (ot) filtros.ot = { $regex: String(ot).trim(), $options: "i" };
    if (zona) filtros.zona = String(zona).trim();

    if (stockMinimo || stockMaximo) {
      filtros.stock = {};
      if (!isNaN(parseInt(stockMinimo)))
        filtros.stock.$gte = parseInt(stockMinimo, 10);
      if (!isNaN(parseInt(stockMaximo)))
        filtros.stock.$lte = parseInt(stockMaximo, 10);
    }

    if (fechaDesde || fechaHasta) {
      filtros.createdAt = {};
      if (fechaDesde && !isNaN(Date.parse(fechaDesde)))
        filtros.createdAt.$gte = new Date(fechaDesde);
      if (fechaHasta && !isNaN(Date.parse(fechaHasta)))
        filtros.createdAt.$lte = new Date(fechaHasta);
    }

    if (q && String(q).trim()) {
      filtros.$or = [
        { tipo: { $regex: q, $options: "i" } },
        { ot: { $regex: q, $options: "i" } },
        { zona: { $regex: q, $options: "i" } },
      ];
    }

    // Sort
    const sortOptions = {};
    if (sort) {
      try {
        sort.split(",").forEach((s) => {
          const [field, dir = "asc"] = s.split(":");
          if (field) sortOptions[field] = dir === "desc" ? -1 : 1;
        });
      } catch {
        sortOptions.createdAt = -1;
      }
    }

    // Paginación
    const resultado = await Luna.paginate(filtros, {
      page: parsedPage,
      limit: parsedLimit,
      sort: sortOptions,
      select: fields ? fields.replace(/,/g, " ") : "",
      populate: { path: "registradoPor", select: "nombre apellido email" },
      lean: true,
      leanWithId: false,
      customLabels: {
        totalDocs: "totalItems",
        docs: "items",
        limit: "itemsPerPage",
        page: "currentPage",
        nextPage: "next",
        prevPage: "prev",
        totalPages: "totalPages",
        pagingCounter: "itemCount",
        hasPrevPage: "hasPrevious",
        hasNextPage: "hasNext",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Lista de lunas obtenida exitosamente",
      data: {
        items: resultado.items,
        pagination: {
          totalItems: resultado.totalItems,
          itemsPerPage: resultado.itemsPerPage,
          currentPage: resultado.currentPage,
          totalPages: resultado.totalPages,
          itemCount: resultado.itemCount,
          hasPrevious: resultado.hasPrevious,
          hasNext: resultado.hasNext,
        },
        sort: sortOptions,
        fields: fields ? fields.split(",") : "all",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(res, 500, "Error interno al obtener lunas.", error);
  }
};

// Obtener una luna por ID
const obtenerLunaPorId = async (req, res) => {
  try {
    const luna = await Luna.findById(req.params.id).populate(
      "registradoPor",
      "nombre apellido"
    );

    if (!luna) return errorResponse(res, 404, "Luna no encontrada.");
    return successResponse(res, 200, "Luna encontrada.", luna);
  } catch (error) {
    return errorResponse(res, 500, "Error al obtener la luna.", error);
  }
};

const actualizarStock = async (req, res) => {
  try {
    // ✅ Extraer parámetros y body con defaults seguros
    const { id: lunaId } = req.params;
    const {
      cantidad = 0,
      tipoMovimiento,
      motivo = "",
      ubicacionOrigen,
      ubicacionDestino,
      zona,
    } = req.body;

    if (!lunaId) {
      return errorResponse(res, 400, "Debe proporcionar un ID de luna válido.");
    }

    // ✅ Validar tipoMovimiento
    if (!["ingreso", "salida"].includes(tipoMovimiento)) {
      return errorResponse(res, 400, "Tipo de movimiento inválido.");
    }

    // ✅ Validar cantidad
    const cantidadNumerica = Number(cantidad);
    if (!Number.isFinite(cantidadNumerica) || cantidadNumerica <= 0) {
      return errorResponse(
        res,
        400,
        "La cantidad debe ser un número mayor a 0."
      );
    }

    // ✅ Obtener luna y validar existencia
    const luna = await Luna.findById(lunaId);
    if (!luna) {
      return errorResponse(res, 404, "Luna no encontrada.");
    }

    // ✅ Validar zona
    if (!luna.zona && !zona) {
      return errorResponse(res, 400, "Debe asignar una zona a la luna.");
    }
    if (zona) {
      luna.zona = zona;
    }

    // ✅ Calcular stock nuevo
    const nuevoStock =
      tipoMovimiento === "ingreso"
        ? luna.stock + cantidadNumerica
        : luna.stock - cantidadNumerica;

    if (nuevoStock < 0) {
      return errorResponse(res, 400, "Stock insuficiente.");
    }

    // ✅ Guardar cambios en luna
    luna.stock = nuevoStock;
    luna.fechaActualizacion = Date.now();
    await luna.save();

    // ✅ Determinar subtipo del movimiento
    let subtipo = null;
    if (tipoMovimiento === "ingreso") {
      subtipo = motivo === "devolucion" ? "devolucion" : "compra";
    } else {
      const subtiposValidos = [
        "venta",
        "consumo",
        "perdida",
        "rotura",
        "traslado",
      ];
      subtipo = subtiposValidos.includes(motivo) ? motivo : "salida";
    }

    // ✅ Registrar movimiento
    const movimientoData = {
      tipo: "luna",
      referencia: luna._id,
      tipoMovimiento,
      subtipo,
      cantidad: cantidadNumerica,
      documentoRelacionado: {
        tipo: "ot",
        referencia: luna.ot || "N/A",
        fecha: new Date(),
      },
      registradoPor: req.usuario?.userId || "sistema",
      estado: "completado",
      notas: motivo || `Actualización de stock (${tipoMovimiento})`,
      zona: luna.zona,
      ...(ubicacionOrigen && { ubicacionOrigen }),
      ...(ubicacionDestino && { ubicacionDestino }),
    };

    const movimientoCreado = await Movimiento.create(movimientoData);

    // ✅ Respuesta consistente
    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Stock actualizado con éxito.",
      data: {
        items: [
          {
            luna: {
              id: luna._id,
              tipo: luna.tipo,
              stock: luna.stock,
              zona: luna.zona,
            },
            movimiento: movimientoCreado,
          },
        ],
        pagination: null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(
      res,
      500,
      "Error al actualizar stock.",
      process.env.NODE_ENV === "development" ? error : undefined
    );
  }
};

// 📌 Reporte unificado de stock (zona | tipo_zona | tipo | tipos)
const obtenerReporteStock = async (req, res) => {
  try {
    const { filtro } = req.query; // zona | tipo_zona | tipo | tipos
    let reporte;

    if (filtro === "zona") {
      // --- Reporte por zona con sus tipos
      const zonas = await Luna.aggregate([
        {
          $group: {
            _id: { zona: "$zona", tipo: "$tipo" },
            stockTotal: { $sum: "$stock" },
            cantidadModelos: { $sum: 1 },
            disponibles: { $sum: { $cond: [{ $gt: ["$stock", 0] }, 1, 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            zona: "$_id.zona",
            tipo: "$_id.tipo",
            stockTotal: 1,
            cantidadModelos: 1,
            disponibles: 1,
            agotados: { $subtract: ["$cantidadModelos", "$disponibles"] },
          },
        },
        {
          $group: {
            _id: "$zona",
            stockTotal: { $sum: "$stockTotal" },
            cantidadModelos: { $sum: "$cantidadModelos" },
            disponibles: { $sum: "$disponibles" },
            agotados: { $sum: "$agotados" },
            tipos: {
              $push: {
                tipo: "$tipo",
                stockTotal: "$stockTotal",
                cantidadModelos: "$cantidadModelos",
                disponibles: "$disponibles",
                agotados: "$agotados",
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            zona: "$_id",
            stockTotal: 1,
            cantidadModelos: 1,
            disponibles: 1,
            agotados: 1,
            tipos: 1,
          },
        },
        { $sort: { zona: 1 } },
      ]);

      // --- Reporte global por tipo (sumando todas las zonas)
      const tiposGlobales = await Luna.aggregate([
        {
          $group: {
            _id: "$tipo",
            stockTotal: { $sum: "$stock" },
            cantidadModelos: { $sum: 1 },
            disponibles: { $sum: { $cond: [{ $gt: ["$stock", 0] }, 1, 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            tipo: "$_id",
            stockTotal: 1,
            cantidadModelos: 1,
            disponibles: 1,
            agotados: { $subtract: ["$cantidadModelos", "$disponibles"] },
          },
        },
        { $sort: { tipo: 1 } },
      ]);

      reporte = { zonas, tiposGlobales };
    } else if (filtro === "tipo_zona") {
      reporte = await Luna.aggregate([
        {
          $group: {
            _id: { tipo: "$tipo", zona: "$zona" },
            stockTotal: { $sum: "$stock" },
            cantidadModelos: { $sum: 1 },
            disponibles: { $sum: { $cond: [{ $gt: ["$stock", 0] }, 1, 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            tipo: "$_id.tipo",
            zona: "$_id.zona",
            stockTotal: 1,
            cantidadModelos: 1,
            disponibles: 1,
            agotados: { $subtract: ["$cantidadModelos", "$disponibles"] },
          },
        },
        { $sort: { tipo: 1, zona: 1 } },
      ]);
    } else if (filtro === "tipo") {
      reporte = await Luna.aggregate([
        {
          $group: {
            _id: "$tipo",
            stockTotal: { $sum: "$stock" },
            cantidadModelos: { $sum: 1 },
            disponibles: { $sum: { $cond: [{ $gt: ["$stock", 0] }, 1, 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            tipo: "$_id",
            stockTotal: 1,
            cantidadModelos: 1,
            disponibles: 1,
            agotados: { $subtract: ["$cantidadModelos", "$disponibles"] },
          },
        },
        { $sort: { tipo: 1 } },
      ]);
    } else if (filtro === "tipos") {
      reporte = await Luna.distinct("tipo");
    } else {
      return errorResponse(
        res,
        400,
        "Filtro inválido. Usa: zona | tipo_zona | tipo | tipos"
      );
    }

    return successResponse(
      res,
      200,
      `Reporte de stock (${filtro}) obtenido con éxito.`,
      reporte
    );
  } catch (error) {
    return errorResponse(res, 500, "Error al obtener reporte de stock.", error);
  }
};

// Eliminar una luna
const eliminarLuna = async (req, res) => {
  try {
    if (!ROLES_PERMITIDOS.includes(req.usuario.rol)) {
      return errorResponse(res, 403, "No tienes permisos para eliminar lunas.");
    }

    const luna = await Luna.findByIdAndDelete(req.params.id);
    if (!luna) return errorResponse(res, 404, "Luna no encontrada.");

    return successResponse(res, 200, "Luna eliminada con éxito.");
  } catch (error) {
    return errorResponse(res, 500, "Error al eliminar luna.", error);
  }
};

const exportarLunasAExcel = async (req, res) => {
  console.log("Iniciando exportación a Excel mejorada...");

  try {
    const { fechaDesde, fechaHasta, tipo, ot, zona } = req.query;

    // ========== FUNCIONES AUXILIARES ==========
    const parseDate = (dateString) =>
      dateString ? new Date(dateString) : null;

    const formatDate = (date) => {
      if (!date) return "N/A";
      const d = new Date(date);
      return isNaN(d.getTime())
        ? "N/A"
        : d.toLocaleString("es-PE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
    };

    const formatUser = (user) =>
      user
        ? `${user.nombre || ""} ${user.apellido || ""}`.trim() || "Sistema"
        : "Sistema";

    // ========== ESTILOS ==========
    const styles = {
      header: {
        font: { bold: true, color: { argb: "FFFFFFFF" }, size: 11 },
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF4472C4" },
        },
        border: {
          top: { style: "thin", color: { argb: "FFD9D9D9" } },
          bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
          left: { style: "thin", color: { argb: "FFD9D9D9" } },
          right: { style: "thin", color: { argb: "FFD9D9D9" } },
        },
        alignment: { vertical: "middle", horizontal: "center", wrapText: true },
      },
      data: {
        font: { size: 10, color: { argb: "FF000000" } },
        border: {
          top: { style: "thin", color: { argb: "FFD9D9D9" } },
          bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
          left: { style: "thin", color: { argb: "FFD9D9D9" } },
          right: { style: "thin", color: { argb: "FFD9D9D9" } },
        },
        alignment: { vertical: "middle" },
      },
      number: {
        font: { size: 10 },
        border: {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        },
        numFmt: "#,##0",
        alignment: { vertical: "middle", horizontal: "right" },
      },
      date: {
        font: { size: 10 },
        border: {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        },
        numFmt: "dd/mm/yyyy hh:mm",
        alignment: { vertical: "middle", horizontal: "center" },
      },
      title: {
        font: { bold: true, size: 16, color: { argb: "FF2F5597" } },
        alignment: { horizontal: "center" },
      },
      subtitle: {
        font: { bold: true, size: 12, color: { argb: "FF2F5597" } },
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFEFF3F9" },
        },
      },
      total: {
        font: { bold: true, color: { argb: "FFFFFFFF" } },
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2F5597" },
        },
        border: {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        },
      },
      evenRow: {
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF9F9F9" },
        },
      },
      successText: { font: { color: { argb: "FF00B050" }, bold: true } },
      warningText: { font: { color: { argb: "FFFFC000" }, bold: true } },
      errorText: { font: { color: { argb: "FFC00000" }, bold: true } },
    };

    // ========== OBTENER DATOS ==========
    const filtros = {};
    if (fechaDesde || fechaHasta) {
      filtros.createdAt = {};
      const desde = parseDate(fechaDesde);
      if (desde) filtros.createdAt.$gte = desde;

      const hasta = parseDate(fechaHasta);
      if (hasta) {
        hasta.setHours(23, 59, 59, 999);
        filtros.createdAt.$lte = hasta;
      }
    }
    if (tipo) filtros.tipo = tipo;
    if (ot) filtros.ot = { $regex: ot, $options: "i" };
    if (zona) filtros.zona = zona;

    const lunas = await Luna.find(filtros)
      .populate("registradoPor", "nombre apellido")
      .sort({ tipo: 1, zona: 1, esferico: 1, cilindrico: 1 });

    if (!lunas.length) {
      return errorResponse(
        res,
        404,
        "No se encontraron lunas con los filtros especificados"
      );
    }

    const lunaIds = lunas.map((l) => l._id);
    const movimientos = await Movimiento.find({
      tipo: "luna",
      referencia: { $in: lunaIds },
      ...(fechaDesde || fechaHasta
        ? {
            fechaMovimiento: {
              ...(fechaDesde ? { $gte: parseDate(fechaDesde) } : {}),
              ...(fechaHasta ? { $lte: parseDate(fechaHasta) } : {}),
            },
          }
        : {}),
    })
      .populate("registradoPor", "nombre apellido")
      .populate("ubicacionOrigen ubicacionDestino", "nombre")
      .sort({ fechaMovimiento: 1 });

    // ========== CONFIGURAR LIBRO EXCEL ==========
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sistema Óptico";
    workbook.lastModifiedBy = "Sistema Óptico";
    workbook.created = new Date();
    workbook.modified = new Date();

    // ========== HOJA RESUMEN ==========
    const crearHojaResumen = () => {
      const sheet = workbook.addWorksheet("Resumen");

      sheet.mergeCells("A1:G1");
      sheet.getCell(
        "A1"
      ).value = `REPORTE DE INVENTARIO DE LUNAS - ${new Date().toLocaleDateString(
        "es-PE",
        { year: "numeric", month: "long", day: "numeric" }
      )}`;
      sheet.getCell("A1").style = styles.title;

      const filtrosText = [
        fechaDesde && `Desde: ${formatDate(fechaDesde)}`,
        fechaHasta && `Hasta: ${formatDate(fechaHasta)}`,
        tipo && `Tipo: ${tipo}`,
        ot && `OT: ${ot}`,
        zona && `Zona: ${zona}`,
      ]
        .filter(Boolean)
        .join(" | ");

      sheet.mergeCells("A2:G2");
      sheet.getCell("A2").value = filtrosText || "Todos los registros";
      sheet.getCell("A2").style = {
        font: { italic: true, size: 11 },
        alignment: { horizontal: "center" },
      };

      sheet.mergeCells("A3:G3");
      sheet.getCell("A3").value = "RESUMEN POR ZONA";
      sheet.getCell("A3").style = styles.subtitle;

      sheet.columns = [
        { header: "Zona", key: "zona", width: 15 },
        { header: "Tipo de Luna", key: "tipo", width: 25 },
        { header: "OT", key: "ot", width: 15 },
        { header: "Stock Actual", key: "stock", width: 15 },
        { header: "Últ. Movimiento", key: "ultimoMovimiento", width: 20 },
        { header: "Tipo Mov.", key: "tipoUltimoMovimiento", width: 12 },
        { header: "Registros", key: "registros", width: 15 },
      ];

      sheet.getRow(5).values = sheet.columns.map((c) => c.header);
      sheet.getRow(5).eachCell((cell) => {
        if (cell.value) cell.style = styles.header;
      });

      const zonas = [...new Set(lunas.map((l) => l.zona))].sort();
      zonas.forEach((zona) => {
        const lunasZona = lunas.filter((l) => l.zona === zona);
        const tiposLuna = [...new Set(lunasZona.map((l) => l.tipo))];

        tiposLuna.forEach((tipo) => {
          const lunasTipo = lunasZona.filter((l) => l.tipo === tipo);
          const movsTipo = movimientos.filter((m) =>
            lunasTipo.some((l) => l._id.equals(m.referencia))
          );
          const movsOrdenados = [...movsTipo].sort(
            (a, b) => new Date(b.fechaMovimiento) - new Date(a.fechaMovimiento)
          );

          const row = sheet.addRow([
            zona,
            tipo,
            lunasTipo[0]?.ot || "N/A",
            lunasTipo.reduce((sum, l) => sum + (l.stock || 0), 0),
            formatDate(movsOrdenados[0]?.fechaMovimiento),
            movsOrdenados[0]
              ? movsOrdenados[0].tipoMovimiento === "ingreso"
                ? "Ingreso"
                : "Salida"
              : "N/A",
            lunasTipo.length,
          ]);

          row.eachCell((cell, colNumber) => {
            if (!cell.style) cell.style = {};
            Object.assign(
              cell.style,
              colNumber === 4 || colNumber === 7
                ? styles.number
                : colNumber === 5
                ? styles.date
                : styles.data
            );

            if (
              colNumber === 4 &&
              lunasTipo.reduce((sum, l) => sum + (l.stock || 0), 0) <= 5
            )
              Object.assign(cell.style, styles.warningText);
            if (
              colNumber === 4 &&
              lunasTipo.reduce((sum, l) => sum + (l.stock || 0), 0) === 0
            )
              Object.assign(cell.style, styles.errorText);
          });
        });
      });

      const totalRow = sheet.addRow([
        "TOTAL GENERAL",
        "N/A",
        "N/A",
        lunas.reduce((sum, l) => sum + (l.stock || 0), 0),
        "N/A",
        "N/A",
        lunas.length,
      ]);

      totalRow.eachCell((cell, colNumber) => {
        Object.assign(
          cell.style,
          colNumber === 4 || colNumber === 7 ? styles.number : styles.total
        );
      });
    };

    // ========== HOJA INVENTARIO ==========
    const crearHojaInventario = () => {
      const sheet = workbook.addWorksheet("Inventario");
      sheet.mergeCells("A1:J1");
      sheet.getCell("A1").value = "DETALLE DE INVENTARIO DE LUNAS";
      sheet.getCell("A1").style = styles.title;

      const filtrosText = [
        fechaDesde && `Desde: ${formatDate(fechaDesde)}`,
        fechaHasta && `Hasta: ${formatDate(fechaHasta)}`,
        tipo && `Tipo: ${tipo}`,
        ot && `OT: ${ot}`,
        zona && `Zona: ${zona}`,
      ]
        .filter(Boolean)
        .join(" | ");

      sheet.mergeCells("A2:J2");
      sheet.getCell("A2").value = filtrosText || "Todos los registros";
      sheet.getCell("A2").style = {
        font: { italic: true, size: 11 },
        alignment: { horizontal: "center" },
      };

      sheet.columns = [
        { header: "Código", key: "codigo", width: 15 },
        { header: "Zona", key: "zona", width: 15 },
        { header: "Tipo", key: "tipo", width: 20 },
        { header: "OT", key: "ot", width: 15 },
        { header: "Esférico", key: "esferico", width: 12 },
        { header: "Cilíndrico", key: "cilindrico", width: 12 },
        { header: "Stock", key: "stock", width: 12 },
        { header: "Últ. Actualización", key: "actualizacion", width: 18 },
        { header: "Registrado Por", key: "registradoPor", width: 25 },
        { header: "Estado", key: "estado", width: 15 },
      ];

      sheet.getRow(4).values = sheet.columns.map((c) => c.header);
      sheet.getRow(4).eachCell((cell) => {
        if (cell.value) cell.style = styles.header;
      });

      lunas.forEach((luna) => {
        sheet.addRow({
          codigo: luna.codigo || luna._id.toString().substring(18, 24),
          zona: luna.zona || "N/A",
          tipo: luna.tipo,
          ot: luna.ot || "N/A",
          esferico: luna.esferico,
          cilindrico: luna.cilindrico,
          stock: luna.stock,
          actualizacion: formatDate(luna.updatedAt || luna.createdAt),
          registradoPor: formatUser(luna.registradoPor),
          estado: luna.stock > 0 ? "Disponible" : "Agotado",
        });
      });
    };

    // ========== CREAR HOJAS ==========
    crearHojaResumen();
    crearHojaInventario();

    // ========== ENVIAR ARCHIVO ==========
    const fileName = `Reporte_Lunas_${
      new Date().toISOString().split("T")[0]
    }.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
    console.log("Reporte Excel generado con éxito");
  } catch (error) {
    console.error("Error al generar reporte Excel:", error);
    if (!res.headersSent) {
      return errorResponse(res, 500, "Error al generar reporte Excel", {
        error: error.message,
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }
};

module.exports = {
  registrarLuna,
  obtenerMedidasPorIdLuna,
  obtenerLunas,
  obtenerLunaPorId,
  actualizarStock,
  obtenerReporteStock,
  eliminarLuna,
  exportarLunasAExcel,
  obtenerInsightsIA,
};
