const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const Luna = require("../models/luna.model");
const Movimiento = require("../models/movimiento.model");
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

// Obtener tipos de lunas disponibles
const obtenerTiposDeLunas = async (req, res) => {
  try {
    const tiposUnicos = await Luna.distinct("tipo");
    return successResponse(
      res,
      200,
      "Tipos de lunas obtenidos con éxito.",
      tiposUnicos
    );
  } catch (error) {
    return errorResponse(res, 500, "Error al obtener tipos de lunas.", error);
  }
};

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

// Función auxiliar para formatear dioptrías
function formatDioptria(value) {
  if (!value) return "0.00";
  const num = parseFloat(value);
  if (isNaN(num)) return "0.00";
  return num >= 0 ? `+${num.toFixed(2)}` : num.toFixed(2);
}

const registrarLuna = async (req, res) => {
  try {
    console.log("🔹 Iniciando registro de luna...");

    const ROLES_PERMITIDOS_REGISTRO = ["almacen", "admin"];
    if (!req.usuario || !ROLES_PERMITIDOS_REGISTRO.includes(req.usuario.rol)) {
      console.warn("❌ Usuario sin permisos para registrar lunas.");
      return errorResponse(
        res,
        403,
        "No tienes permisos para registrar lunas."
      );
    }

    const { esferico, cilindrico, tipo, stock, ot, zona } = req.body;
    const registradoPor = req.usuario.userId;

    console.log("📌 Datos recibidos:", {
      esferico,
      cilindrico,
      tipo,
      ot,
      stock,
      zona,
      registradoPor,
    });

    // Validaciones
    if (!esferico && !cilindrico) {
      console.warn("❌ Falta esférico o cilíndrico.");
      return errorResponse(
        res,
        400,
        "Debe proporcionar al menos un valor para esférico o cilíndrico."
      );
    }

    if (!zona) {
      console.warn("❌ Falta especificar la zona (Chancay o Huaral).");
      return errorResponse(
        res,
        400,
        "La zona (Chancay o Huaral) es obligatoria."
      );
    }

    if (!ot) {
      console.warn("❌ Falta número de OT.");
      return errorResponse(
        res,
        400,
        "La Orden de Trabajo (OT) es obligatoria."
      );
    }

    // Convertir y validar stock
    const cantidadNumerica = Number(stock);
    if (isNaN(cantidadNumerica)) {
      return errorResponse(res, 400, "La cantidad debe ser un número válido");
    }
    if (cantidadNumerica < 0) {
      return errorResponse(res, 400, "La cantidad no puede ser negativa");
    }

    // Verificar si la luna ya existe
    console.log("🔍 Buscando luna existente...");
    const lunaExistente = await Luna.findOne({
      esferico,
      cilindrico,
      tipo,
      ot,
      zona, // Ahora también consideramos la zona en la búsqueda
    });

    if (lunaExistente) {
      console.log("✅ Luna ya existente. Actualizando stock...");
      lunaExistente.stock += cantidadNumerica;
      lunaExistente.fechaActualizacion = Date.now();
      await lunaExistente.save();

      console.log("✅ Stock actualizado con éxito:", lunaExistente);

      // Registrar movimiento si hay stock positivo
      if (cantidadNumerica > 0) {
        console.log("📌 Registrando movimiento...");
        await Movimiento.create({
          tipo: "luna",
          referencia: lunaExistente._id,
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
        });
        console.log("✅ Movimiento registrado.");
      }

      // Estructura de respuesta consistente
      return res.status(200).json({
        success: true,
        statusCode: 200,
        message: "Stock de luna actualizado con éxito.",
        data: {
          items: [lunaExistente],
          pagination: null,
        },
      });
    }

    // Crear nueva luna
    console.log("✅ Registrando nueva luna...");
    const nuevaLuna = await Luna.create({
      esferico,
      cilindrico,
      tipo,
      stock: cantidadNumerica,
      ot,
      zona, // Incluimos la zona al crear la nueva luna
      registradoPor,
    });

    console.log("✅ Luna registrada con éxito:", nuevaLuna);

    // Registrar movimiento si hay stock positivo
    if (cantidadNumerica > 0) {
      console.log("📌 Registrando movimiento...");
      await Movimiento.create({
        tipo: "luna",
        referencia: nuevaLuna._id,
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
      });
      console.log("✅ Movimiento registrado.");
    }

    // Estructura de respuesta consistente
    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Luna registrada con éxito.",
      data: {
        items: [nuevaLuna],
        pagination: null,
      },
    });
  } catch (error) {
    console.error("❌ Error al registrar luna:", error);
    return errorResponse(res, 500, "Error al registrar luna.", error);
  }
};

// Obtener todas las lunas con paginación profesional
// Obtener todas las lunas con paginación profesional
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
      zona, // Nuevo filtro por zona
      page = 1,
      limit = 10,
      sort = "createdAt:-1",
      fields = "",
      q = "", // Búsqueda general
    } = req.query;

    // Construir filtros avanzados
    const filtros = {};

    // Filtros específicos
    if (tipo) filtros.tipo = tipo;
    if (esferico) filtros.esferico = parseFloat(esferico);
    if (cilindrico) filtros.cilindrico = parseFloat(cilindrico);
    if (ot) filtros.ot = { $regex: ot, $options: "i" }; // Búsqueda insensible a mayúsculas/minúsculas
    if (zona) filtros.zona = zona; // Nuevo filtro por zona

    // Filtros de stock
    if (stockMinimo || stockMaximo) {
      filtros.stock = {};
      if (stockMinimo) filtros.stock.$gte = parseInt(stockMinimo);
      if (stockMaximo) filtros.stock.$lte = parseInt(stockMaximo);
    }

    // Filtros de fecha
    if (fechaDesde || fechaHasta) {
      filtros.createdAt = {};
      if (fechaDesde) filtros.createdAt.$gte = new Date(fechaDesde);
      if (fechaHasta) filtros.createdAt.$lte = new Date(fechaHasta);
    }

    // Búsqueda general (si se proporciona)
    if (q) {
      filtros.$or = [
        { tipo: { $regex: q, $options: "i" } },
        { ot: { $regex: q, $options: "i" } },
        { zona: { $regex: q, $options: "i" } }, // Incluir zona en la búsqueda general
        // Puedes agregar más campos según sea necesario
      ];
    }

    // Parsear el parámetro de ordenamiento (ahora soporta múltiples campos)
    const sortOptions = {};
    if (sort) {
      sort.split(",").forEach((sortItem) => {
        const [field, direction] = sortItem.split(":");
        sortOptions[field] = direction === "desc" ? -1 : 1;
      });
    } else {
      sortOptions.createdAt = -1; // Orden por defecto
    }

    // Configuración de paginación profesional
    const opciones = {
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100), // Límite máximo de 100
      sort: sortOptions,
      select: fields ? fields.replace(/,/g, " ") : "",
      populate: {
        path: "registradoPor",
        select: "nombre apellido email",
      },
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
    };

    // Ejecutar consulta paginada
    const resultado = await Luna.paginate(filtros, opciones);

    // Construir enlaces HATEOAS para navegación
    const baseUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}${
      req.path
    }`;
    const queryParams = new URLSearchParams({ ...req.query, page: "" });

    const links = {
      first: `${baseUrl}?${queryParams.toString()}1`,
      last: `${baseUrl}?${queryParams.toString()}${resultado.totalPages}`,
      prev: resultado.hasPrevious
        ? `${baseUrl}?${queryParams.toString()}${resultado.prevPage}`
        : null,
      next: resultado.hasNext
        ? `${baseUrl}?${queryParams.toString()}${resultado.nextPage}`
        : null,
      self: `${baseUrl}?${queryParams.toString()}${resultado.currentPage}`,
    };

    // Estructura de respuesta profesional
    const response = {
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
        links,
        filters: {
          ...(tipo && { tipo }),
          ...(esferico && { esferico }),
          ...(cilindrico && { cilindrico }),
          ...(stockMinimo && { stockMinimo }),
          ...(stockMaximo && { stockMaximo }),
          ...(fechaDesde && { fechaDesde }),
          ...(fechaHasta && { fechaHasta }),
          ...(ot && { ot }),
          ...(zona && { zona }), // Incluir zona en los filtros aplicados
          ...(q && { searchQuery: q }),
        },
        sort: sortOptions,
        fields: fields ? fields.split(",") : "all",
      },
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json(response);
  } catch (error) {
    return errorResponse(res, 500, "Error al obtener lunas.", error);
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
    console.log("🔹 Iniciando actualización de stock...");

    const ROLES_PERMITIDOS_STOCK = ["almacen", "admin"];
    if (!req.usuario || !ROLES_PERMITIDOS_STOCK.includes(req.usuario.rol)) {
      console.warn("❌ Usuario sin permisos para actualizar stock.");
      return errorResponse(
        res,
        403,
        "No tienes permisos para actualizar stock."
      );
    }

    const { id: lunaId } = req.params;
    const {
      cantidad,
      tipoMovimiento,
      motivo,
      ubicacionOrigen,
      ubicacionDestino,
    } = req.body;

    console.log("📌 Datos recibidos:", {
      lunaId,
      cantidad,
      tipoMovimiento,
      motivo,
      ubicacionOrigen,
      ubicacionDestino,
    });

    // Validar tipo de movimiento
    if (!["ingreso", "salida"].includes(tipoMovimiento)) {
      console.warn("❌ Tipo de movimiento inválido:", tipoMovimiento);
      return errorResponse(res, 400, "Tipo de movimiento inválido.");
    }

    // Convertir y validar cantidad
    const cantidadNumerica = Number(cantidad);
    if (isNaN(cantidadNumerica)) {
      console.warn("❌ Cantidad no es un número válido:", cantidad);
      return errorResponse(res, 400, "La cantidad debe ser un número válido");
    }
    if (cantidadNumerica <= 0) {
      console.warn("❌ Cantidad debe ser mayor a cero:", cantidadNumerica);
      return errorResponse(res, 400, "La cantidad debe ser mayor a cero");
    }

    // Obtener y validar luna
    console.log("🔍 Buscando luna con ID:", lunaId);
    const luna = await Luna.findById(lunaId);
    if (!luna) {
      console.warn("❌ Luna no encontrada con ID:", lunaId);
      return errorResponse(res, 404, "Luna no encontrada.");
    }

    // Calcular nuevo stock
    let nuevoStock =
      tipoMovimiento === "ingreso"
        ? luna.stock + cantidadNumerica
        : luna.stock - cantidadNumerica;

    if (nuevoStock < 0) {
      console.warn(
        "❌ Stock insuficiente. Stock actual:",
        luna.stock,
        "Cantidad a retirar:",
        cantidadNumerica
      );
      return errorResponse(res, 400, "Stock insuficiente.");
    }

    // Actualizar luna
    luna.stock = nuevoStock;
    luna.fechaActualizacion = Date.now();
    await luna.save();
    console.log("✅ Stock actualizado. Nuevo stock:", luna.stock);

    // Determinar subtipo basado en motivo
    let subtipo;
    if (tipoMovimiento === "ingreso") {
      subtipo = motivo === "devolucion" ? "devolucion" : "compra";
    } else {
      subtipo =
        motivo === "venta"
          ? "venta"
          : motivo === "consumo"
          ? "consumo"
          : motivo === "perdida"
          ? "perdida"
          : motivo === "rotura"
          ? "rotura"
          : motivo === "traslado"
          ? "traslado"
          : null;
    }

    // Registrar movimiento completo
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
      registradoPor: req.usuario.userId,
      estado: "completado",
      notas: motivo || `Actualización de stock ${tipoMovimiento}`,
    };

    // Añadir ubicaciones si existen
    if (ubicacionOrigen) movimientoData.ubicacionOrigen = ubicacionOrigen;
    if (ubicacionDestino) movimientoData.ubicacionDestino = ubicacionDestino;

    const movimientoCreado = await Movimiento.create(movimientoData);
    console.log("📌 Movimiento registrado:", movimientoCreado._id);

    // Estructura de respuesta consistente
    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Stock actualizado con éxito.",
      data: {
        items: [
          {
            luna: luna,
            movimiento: movimientoCreado,
          },
        ],
        pagination: null,
      },
    });
  } catch (error) {
    console.error("❌ Error en actualizarStock:", error);
    return errorResponse(
      res,
      500,
      "Error al actualizar stock.",
      process.env.NODE_ENV === "development" ? error : undefined
    );
  }
};
// Obtener stock total por tipo de luna
const obtenerStockPorTipo = async (req, res) => {
  try {
    const stockPorTipo = await Luna.obtenerStockPorTipo();
    return successResponse(
      res,
      200,
      "Stock por tipo obtenido con éxito.",
      stockPorTipo
    );
  } catch (error) {
    return errorResponse(res, 500, "Error al obtener stock por tipo.", error);
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
    const { fechaDesde, fechaHasta, tipoLuna, ot, zona } = req.query;

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

    // ========== ESTILOS MEJORADOS ==========
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
      decimal: {
        font: { size: 10 },
        border: {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        },
        numFmt: "0.00",
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
    if (tipoLuna) filtros.tipo = tipoLuna;
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

    // Función para calcular stock post movimiento
    const getStockPost = (mov, luna) => {
      if (!luna) return "N/A";

      const movsLuna = movimientos
        .filter(
          (m) =>
            m.referencia.equals(luna._id) &&
            new Date(m.fechaMovimiento) <= new Date(mov.fechaMovimiento)
        )
        .sort(
          (a, b) => new Date(a.fechaMovimiento) - new Date(b.fechaMovimiento)
        );

      return movsLuna.reduce(
        (stock, m) =>
          m.tipoMovimiento === "ingreso"
            ? stock + m.cantidad
            : stock - m.cantidad,
        luna.stock || 0
      );
    };

    // ========== CONFIGURAR LIBRO EXCEL ==========
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sistema Óptico";
    workbook.lastModifiedBy = "Sistema Óptico";
    workbook.created = new Date();
    workbook.modified = new Date();

    // ========== HOJA RESUMEN ==========
    const crearHojaResumen = () => {
      const sheet = workbook.addWorksheet("Resumen");

      // Títulos
      sheet.mergeCells("A1:K1");
      sheet.getCell(
        "A1"
      ).value = `REPORTE DE INVENTARIO DE LUNAS - ${new Date().toLocaleDateString(
        "es-PE",
        {
          year: "numeric",
          month: "long",
          day: "numeric",
        }
      )}`;
      sheet.getCell("A1").style = styles.title;

      const filtrosText = [
        fechaDesde && `Desde: ${formatDate(fechaDesde)}`,
        fechaHasta && `Hasta: ${formatDate(fechaHasta)}`,
        tipoLuna && `Tipo: ${tipoLuna}`,
        ot && `OT: ${ot}`,
        zona && `Zona: ${zona}`,
      ]
        .filter(Boolean)
        .join(" | ");

      sheet.mergeCells("A2:K2");
      sheet.getCell("A2").value = filtrosText || "Todos los registros";
      sheet.getCell("A2").style = {
        font: { italic: true, size: 11 },
        alignment: { horizontal: "center" },
      };

      // Sección de resumen por zona
      sheet.mergeCells("A3:K3");
      sheet.getCell("A3").value = "RESUMEN POR ZONA";
      sheet.getCell("A3").style = styles.subtitle;

      // Configurar columnas para resumen por zona
      sheet.columns = [
        { header: "Zona", key: "zona", width: 15 },
        { header: "Tipo de Luna", key: "tipo", width: 25 },
        { header: "OT", key: "ot", width: 15 },
        { header: "Medidas Únicas", key: "medidas", width: 15 },
        { header: "Stock Actual", key: "stock", width: 15 },
        { header: "Últ. Movimiento", key: "ultimoMovimiento", width: 20 },
        { header: "Tipo Mov.", key: "tipoUltimoMovimiento", width: 12 },
        { header: "Subtipo", key: "subtipo", width: 15 },
        { header: "Últ. Ingreso", key: "ultimoIngreso", width: 20 },
        { header: "Últ. Salida", key: "ultimaSalida", width: 20 },
        { header: "Registros", key: "registros", width: 15 },
      ];

      sheet.getRow(5).values = sheet.columns.map((c) => c.header);
      sheet.getRow(5).eachCell((cell) => {
        if (cell.value) {
          cell.style = styles.header;
        }
      });

      // Procesar datos por zona
      const zonas = [...new Set(lunas.map((l) => l.zona))].sort();
      const resumenPorZona = zonas
        .map((zona) => {
          const lunasZona = lunas.filter((l) => l.zona === zona);
          const tiposLuna = [...new Set(lunasZona.map((l) => l.tipo))];

          return tiposLuna.map((tipo) => {
            const lunasTipo = lunasZona.filter((l) => l.tipo === tipo);
            const movsTipo = movimientos.filter((m) =>
              lunasTipo.some((l) => l._id.equals(m.referencia))
            );
            const movsOrdenados = [...movsTipo].sort(
              (a, b) =>
                new Date(b.fechaMovimiento) - new Date(a.fechaMovimiento)
            );

            return {
              zona,
              tipo,
              ot: lunasTipo[0]?.ot || "N/A",
              medidas: new Set(
                lunasTipo.map((l) => `${l.esferico}/${l.cilindrico}`)
              ).size,
              stock: lunasTipo.reduce((sum, l) => sum + (l.stock || 0), 0),
              ultimoMovimiento: movsOrdenados[0]?.fechaMovimiento,
              tipoUltimoMovimiento: movsOrdenados[0]
                ? movsOrdenados[0].tipoMovimiento === "ingreso"
                  ? "Ingreso"
                  : "Salida"
                : "N/A",
              subtipo: movsOrdenados[0]?.subtipo || "N/A",
              ultimoIngreso: movsOrdenados.find(
                (m) => m.tipoMovimiento === "ingreso"
              )?.fechaMovimiento,
              ultimaSalida: movsOrdenados.find(
                (m) => m.tipoMovimiento === "salida"
              )?.fechaMovimiento,
              registros: lunasTipo.length,
            };
          });
        })
        .flat();

      // Agregar datos por zona
      resumenPorZona.forEach((item, index) => {
        const row = sheet.addRow([
          item.zona,
          item.tipo,
          item.ot,
          item.medidas,
          item.stock,
          formatDate(item.ultimoMovimiento),
          item.tipoUltimoMovimiento,
          item.subtipo,
          formatDate(item.ultimoIngreso),
          formatDate(item.ultimaSalida),
          item.registros,
        ]);

        row.eachCell((cell, colNumber) => {
          if (!cell.style) cell.style = {};

          // Aplicar estilos base
          Object.assign(
            cell.style,
            colNumber === 5 || colNumber === 11
              ? styles.number
              : colNumber === 6 || colNumber === 9 || colNumber === 10
              ? styles.date
              : styles.data
          );

          // Resaltar stock bajo
          if (colNumber === 5) {
            if (item.stock <= 5) {
              Object.assign(cell.style, styles.warningText);
            }
            if (item.stock === 0) {
              Object.assign(cell.style, styles.errorText);
            }
          }

          // Resaltar tipo de movimiento
          if (colNumber === 7) {
            cell.style.font = {
              color: {
                argb:
                  item.tipoUltimoMovimiento === "Ingreso"
                    ? "FF00B050"
                    : "FFC00000",
              },
              bold: true,
            };
          }

          // Filas alternadas
          if (index % 2 === 0) {
            Object.assign(cell.style, styles.evenRow);
          }
        });
      });

      // Totales por zona
      const totalRow = sheet.addRow([
        "TOTAL GENERAL",
        "N/A",
        "N/A",
        resumenPorZona.reduce((sum, item) => sum + item.medidas, 0),
        resumenPorZona.reduce((sum, item) => sum + item.stock, 0),
        "N/A",
        "N/A",
        "N/A",
        "N/A",
        "N/A",
        resumenPorZona.reduce((sum, item) => sum + item.registros, 0),
      ]);

      totalRow.eachCell((cell, colNumber) => {
        if (!cell.style) cell.style = {};

        if (colNumber === 1) {
          Object.assign(cell.style, styles.total);
          cell.style.alignment = { horizontal: "right" };
          if (styles.total.font) {
            cell.style.font = { ...styles.total.font, size: 12 };
          }
        } else if (colNumber === 5 || colNumber === 11) {
          Object.assign(cell.style, styles.number, styles.total);
          if (styles.total.font) {
            cell.style.font = { ...styles.total.font, size: 12 };
          }
        } else {
          Object.assign(cell.style, styles.data, styles.total);
          if (styles.total.font) {
            cell.style.font = { ...styles.total.font, size: 12 };
          }
        }
      });
    };

    // ========== HOJA INVENTARIO ==========
    const crearHojaInventario = () => {
      const sheet = workbook.addWorksheet("Inventario");

      // Títulos
      sheet.mergeCells("A1:K1");
      sheet.getCell("A1").value = "DETALLE DE INVENTARIO DE LUNAS";
      sheet.getCell("A1").style = styles.title;

      const filtrosText = [
        fechaDesde && `Desde: ${formatDate(fechaDesde)}`,
        fechaHasta && `Hasta: ${formatDate(fechaHasta)}`,
        tipoLuna && `Tipo: ${tipoLuna}`,
        ot && `OT: ${ot}`,
        zona && `Zona: ${zona}`,
      ]
        .filter(Boolean)
        .join(" | ");

      sheet.mergeCells("A2:K2");
      sheet.getCell("A2").value = filtrosText || "Todos los registros";
      sheet.getCell("A2").style = {
        font: { italic: true, size: 11 },
        alignment: { horizontal: "center" },
      };

      // Configurar columnas (sin el campo eje)
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
        if (cell.value) {
          cell.style = styles.header;
        }
      });

      // Agregar datos
      lunas.forEach((luna, index) => {
        const row = sheet.addRow({
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

        row.eachCell((cell, colNumber) => {
          if (!cell.style) cell.style = {};

          // Aplicar estilos base
          Object.assign(
            cell.style,
            colNumber === 7
              ? styles.number
              : colNumber === 8
              ? styles.date
              : styles.data
          );

          // Resaltar estado
          if (colNumber === 10) {
            cell.style.font = {
              color: { argb: luna.stock > 0 ? "FF00B050" : "FFC00000" },
              bold: true,
            };
          }

          // Resaltar stock bajo
          if (colNumber === 7) {
            if (luna.stock <= 5) {
              Object.assign(cell.style, styles.warningText);
            }
            if (luna.stock === 0) {
              Object.assign(cell.style, styles.errorText);
            }
          }

          // Filas alternadas
          if (index % 2 === 0) {
            Object.assign(cell.style, styles.evenRow);
          }
        });
      });

      // Totales por zona
      const zonas = [...new Set(lunas.map((l) => l.zona))].sort();
      zonas.forEach((zona) => {
        const total = lunas
          .filter((l) => l.zona === zona)
          .reduce((sum, l) => sum + (l.stock || 0), 0);
        const row = sheet.addRow({
          zona: `TOTAL ZONA ${zona}`,
          stock: total,
        });

        row.getCell(1).style = {
          ...styles.total,
          alignment: { horizontal: "right" },
        };
        row.getCell(7).style = {
          ...styles.number,
          ...styles.total,
        };
        sheet.mergeCells(`A${row.number}:F${row.number}`);
      });

      // Total general
      const totalGeneral = lunas.reduce((sum, l) => sum + (l.stock || 0), 0);
      const totalRow = sheet.addRow({
        zona: "TOTAL GENERAL DEL INVENTARIO",
        stock: totalGeneral,
      });

      totalRow.getCell(1).style = {
        ...styles.total,
        font: { ...styles.total.font, size: 12 },
        alignment: { horizontal: "right" },
      };
      totalRow.getCell(7).style = {
        ...styles.number,
        ...styles.total,
        font: { ...styles.total.font, size: 12 },
      };
      sheet.mergeCells(`A${totalRow.number}:F${totalRow.number}`);
    };

    // ========== HOJA MOVIMIENTOS ==========
    const crearHojaMovimientos = () => {
      const sheet = workbook.addWorksheet("Movimientos");

      // Títulos
      sheet.mergeCells("A1:L1");
      sheet.getCell("A1").value = "HISTORIAL DE MOVIMIENTOS";
      sheet.getCell("A1").style = styles.title;

      const filtrosText = [
        fechaDesde && `Desde: ${formatDate(fechaDesde)}`,
        fechaHasta && `Hasta: ${formatDate(fechaHasta)}`,
        tipoLuna && `Tipo: ${tipoLuna}`,
        ot && `OT: ${ot}`,
        zona && `Zona: ${zona}`,
      ]
        .filter(Boolean)
        .join(" | ");

      sheet.mergeCells("A2:L2");
      sheet.getCell("A2").value = filtrosText || "Todos los movimientos";
      sheet.getCell("A2").style = {
        font: { italic: true, size: 11 },
        alignment: { horizontal: "center" },
      };

      // Configurar columnas (con zona y sin eje)
      sheet.columns = [
        { header: "Correlativo", key: "correlativo", width: 15 },
        { header: "Fecha Movimiento", key: "fecha", width: 18 },
        { header: "Tipo", key: "tipo", width: 12 },
        { header: "Subtipo", key: "subtipo", width: 15 },
        { header: "Zona", key: "zona", width: 15 },
        { header: "OT", key: "ot", width: 15 },
        { header: "Tipo Luna", key: "tipoLuna", width: 20 },
        { header: "Esférico", key: "esferico", width: 12 },
        { header: "Cilíndrico", key: "cilindrico", width: 12 },
        { header: "Cantidad", key: "cantidad", width: 12 },
        { header: "Registrado Por", key: "registradoPor", width: 25 },
        { header: "Stock Post", key: "stockPost", width: 12 },
      ];

      sheet.getRow(4).values = sheet.columns.map((c) => c.header);
      sheet.getRow(4).eachCell((cell) => {
        if (cell.value) {
          cell.style = styles.header;
        }
      });

      // Agregar datos
      movimientos.forEach((mov, index) => {
        const luna = lunas.find((l) => l._id.equals(mov.referencia));
        const stockPost = luna ? getStockPost(mov, luna) : "N/A";

        const row = sheet.addRow({
          correlativo: mov.correlativo || "N/A",
          fecha: formatDate(mov.fechaMovimiento || mov.createdAt),
          tipo: mov.tipoMovimiento === "ingreso" ? "Ingreso" : "Salida",
          subtipo: mov.subtipo || "N/A",
          zona: luna?.zona || "N/A",
          ot: mov.documentoRelacionado?.referencia || luna?.ot || "N/A",
          tipoLuna: luna?.tipo || "N/A",
          esferico: luna?.esferico || "N/A",
          cilindrico: luna?.cilindrico || "N/A",
          cantidad: mov.cantidad,
          registradoPor: formatUser(mov.registradoPor),
          stockPost: stockPost,
        });

        row.eachCell((cell, colNumber) => {
          if (!cell.style) cell.style = {};

          // Aplicar estilos base
          Object.assign(
            cell.style,
            colNumber === 2
              ? styles.date
              : colNumber === 10 || colNumber === 12
              ? styles.number
              : styles.data
          );

          // Resaltar tipo de movimiento
          if (colNumber === 3) {
            cell.style.font = {
              color: {
                argb:
                  mov.tipoMovimiento === "ingreso" ? "FF00B050" : "FFC00000",
              },
              bold: true,
            };
          }

          // Resaltar stock bajo
          if (colNumber === 12 && stockPost !== "N/A") {
            if (stockPost <= 5) {
              Object.assign(cell.style, styles.warningText);
            }
            if (stockPost === 0) {
              Object.assign(cell.style, styles.errorText);
            }
          }

          // Filas alternadas
          if (index % 2 === 0) {
            Object.assign(cell.style, styles.evenRow);
          }
        });
      });

      // Totales por zona
      const zonas = [
        ...new Set(
          movimientos
            .map((m) => {
              const luna = lunas.find((l) => l._id.equals(m.referencia));
              return luna?.zona;
            })
            .filter(Boolean)
        ),
      ].sort();

      zonas.forEach((zona) => {
        const movsZona = movimientos.filter((m) => {
          const luna = lunas.find((l) => l._id.equals(m.referencia));
          return luna?.zona === zona;
        });

        const totalIngresos = movsZona
          .filter((m) => m.tipoMovimiento === "ingreso")
          .reduce((sum, m) => sum + (m.cantidad || 0), 0);

        const totalSalidas = movsZona
          .filter((m) => m.tipoMovimiento === "salida")
          .reduce((sum, m) => sum + (m.cantidad || 0), 0);

        const totalRow = sheet.addRow({
          zona: `TOTAL ZONA ${zona}`,
          cantidad: totalIngresos - totalSalidas,
        });

        totalRow.getCell(1).value = `TOTAL ZONA ${zona}`;
        totalRow.getCell(1).style = {
          ...styles.total,
          alignment: { horizontal: "right" },
        };
        totalRow.getCell(10).style = {
          ...styles.number,
          ...styles.total,
        };
        sheet.mergeCells(`A${totalRow.number}:I${totalRow.number}`);
      });

      // Total general
      const totalIngresos = movimientos
        .filter((m) => m.tipoMovimiento === "ingreso")
        .reduce((sum, m) => sum + (m.cantidad || 0), 0);

      const totalSalidas = movimientos
        .filter((m) => m.tipoMovimiento === "salida")
        .reduce((sum, m) => sum + (m.cantidad || 0), 0);

      const totalRow = sheet.addRow({
        zona: "TOTAL NETO",
        cantidad: totalIngresos - totalSalidas,
      });

      totalRow.getCell(1).value = "TOTAL NETO";
      totalRow.getCell(1).style = {
        ...styles.total,
        alignment: { horizontal: "right" },
        font: { ...styles.total.font, size: 12 },
      };
      totalRow.getCell(10).style = {
        ...styles.number,
        ...styles.total,
        font: { ...styles.total.font, size: 12 },
      };
      sheet.mergeCells(`A${totalRow.number}:I${totalRow.number}`);
    };

    // ========== CREAR HOJAS ==========
    crearHojaResumen();
    crearHojaInventario();
    if (movimientos.length > 0) {
      crearHojaMovimientos();
    }

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
  obtenerTiposDeLunas,
  obtenerMedidasPorIdLuna,
  obtenerLunas,
  obtenerLunaPorId,
  actualizarStock,
  obtenerStockPorTipo,
  eliminarLuna,
  exportarLunasAExcel,
};
