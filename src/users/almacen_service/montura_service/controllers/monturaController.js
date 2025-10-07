const Montura = require("../models/montura.model");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

/**
 * @desc    Obtener todas las monturas con estructura estándar (similar a lunas)
 * @route   GET /api/monturas
 * @access  Public
 */
const obtenerMonturas = async (req, res) => {
  try {
    const { limite = 10, desde = 0, page = 1, sort = "-createdAt" } = req.query;
    const query = { estado: true };

    // Total de documentos
    const totalItems = await Montura.countDocuments(query);

    // Paginación
    const currentPage = Number(page);
    const itemsPerPage = Number(limite);
    const skip = (currentPage - 1) * itemsPerPage;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    // Query con paginación y orden
    const items = await Montura.find(query)
      .skip(skip)
      .limit(itemsPerPage)
      .sort(sort);

    // Meta de paginación
    const pagination = {
      totalItems,
      itemsPerPage,
      currentPage,
      totalPages,
      itemCount: items.length,
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages,
    };

    // Links (usando la URL base actual)
    const baseUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}${
      req.path
    }`;
    const queryBase = `?page=${currentPage}&limit=${itemsPerPage}`;

    const links = {
      first: `${baseUrl}?page=1&limit=${itemsPerPage}`,
      last: `${baseUrl}?page=${totalPages}&limit=${itemsPerPage}`,
      prev:
        currentPage > 1
          ? `${baseUrl}?page=${currentPage - 1}&limit=${itemsPerPage}`
          : null,
      next:
        currentPage < totalPages
          ? `${baseUrl}?page=${currentPage + 1}&limit=${itemsPerPage}`
          : null,
      self: `${baseUrl}${queryBase}`,
    };

    const data = {
      items,
      pagination,
      links,
      filters: {}, // puedes extenderlo según tus filtros
      sort: { createdAt: -1 }, // default
      fields: "all",
    };

    return res.status(200).json({
      success: true,
      message: "Lista de monturas obtenida exitosamente",
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error al obtener monturas:", error);
    return errorResponse(
      res,
      500,
      "Error interno del servidor al obtener monturas",
      error
    );
  }
};

/**
 * @desc    Obtener una montura por ID
 * @route   GET /api/monturas/:id
 * @access  Public
 */
const obtenerMontura = async (req, res) => {
  try {
    const { id } = req.params;
    const montura = await Montura.findById(id);

    if (!montura) {
      return errorResponse(res, 404, "Montura no encontrada");
    }

    return res.status(200).json({
      success: true,
      message: "Montura obtenida exitosamente",
      data: montura,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error al obtener montura:", error);
    return errorResponse(
      res,
      500,
      "Error interno del servidor al obtener la montura",
      error
    );
  }
};

/**
 * @desc    Crear una nueva montura
 * @route   POST /api/monturas
 * @access  Private (Admin, Almacén)
 */
const crearMontura = async (req, res) => {
  try {
    const { codigo } = req.body;

    // Verificar si ya existe
    const monturaExistente = await Montura.findOne({ codigo });
    if (monturaExistente) {
      return errorResponse(res, 409, "Ya existe una montura con este código");
    }

    const montura = new Montura(req.body);
    await montura.save();

    return res.status(201).json({
      success: true,
      message: "Montura creada exitosamente",
      data: montura,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error al crear montura:", error);

    if (error.name === "ValidationError") {
      const details = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return errorResponse(
        res,
        400,
        "Error de validación al crear la montura",
        error,
        details
      );
    }

    return errorResponse(
      res,
      500,
      "Error interno del servidor al crear la montura",
      error
    );
  }
};

/**
 * @desc    Actualizar una montura
 * @route   PUT /api/monturas/:id
 * @access  Private (Admin, Almacén)
 */
const actualizarMontura = async (req, res) => {
  try {
    const { id } = req.params;
    const { _id, codigo, ...resto } = req.body;

    if (codigo) {
      const existente = await Montura.findOne({ codigo, _id: { $ne: id } });
      if (existente) {
        return errorResponse(
          res,
          409,
          "Ya existe otra montura con este código"
        );
      }
    }

    const montura = await Montura.findByIdAndUpdate(id, resto, {
      new: true,
      runValidators: true,
    });

    if (!montura) {
      return errorResponse(res, 404, "Montura no encontrada");
    }

    return res.status(200).json({
      success: true,
      message: "Montura actualizada exitosamente",
      data: montura,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error al actualizar montura:", error);

    return errorResponse(
      res,
      500,
      "Error interno del servidor al actualizar la montura",
      error
    );
  }
};

/**
 * @desc    Actualizar stock de una montura
 * @route   PATCH /api/monturas/:id/stock
 * @access  Private (Admin, Almacén)
 */
const actualizarStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { cantidad, operacion } = req.body;

    if (!["incrementar", "disminuir"].includes(operacion)) {
      return errorResponse(res, 400, "Operación no válida");
    }

    const montura = await Montura.findById(id);
    if (!montura) return errorResponse(res, 404, "Montura no encontrada");

    if (operacion === "disminuir" && montura.stock < cantidad) {
      return errorResponse(res, 400, "Stock insuficiente", null, {
        stockActual: montura.stock,
      });
    }

    montura.stock =
      operacion === "incrementar"
        ? montura.stock + cantidad
        : montura.stock - cantidad;

    await montura.save();

    return res.status(200).json({
      success: true,
      message: "Stock actualizado exitosamente",
      data: montura,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error al actualizar stock:", error);
    return errorResponse(
      res,
      500,
      "Error interno del servidor al actualizar stock",
      error
    );
  }
};

/**
 * @desc    Eliminar montura (borrado lógico)
 * @route   DELETE /api/monturas/:id
 * @access  Private (Admin)
 */
const eliminarMontura = async (req, res) => {
  try {
    const { id } = req.params;
    const montura = await Montura.findByIdAndUpdate(
      id,
      { estado: false },
      { new: true }
    );

    if (!montura) return errorResponse(res, 404, "Montura no encontrada");

    return res.status(200).json({
      success: true,
      message: "Montura eliminada correctamente",
      data: { id: montura._id },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error al eliminar montura:", error);
    return errorResponse(
      res,
      500,
      "Error interno del servidor al eliminar montura",
      error
    );
  }
};

module.exports = {
  obtenerMonturas,
  obtenerMontura,
  crearMontura,
  actualizarMontura,
  actualizarStock,
  eliminarMontura,
};
