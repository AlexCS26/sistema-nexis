const Montura = require("../models/montura.model");
const { successResponse, errorResponse } = require("../../../utils/responseUtils");

/**
 * @desc    Obtener todas las monturas
 * @route   GET /api/monturas
 * @access  Public
 */
const obtenerMonturas = async (req, res) => {
  try {
    const { limite = 10, desde = 0 } = req.query;
    const query = { estado: true };

    const [total, monturas] = await Promise.all([
      Montura.countDocuments(query),
      Montura.find(query).skip(Number(desde)).limit(Number(limite)),
    ]);

    const meta = {
      total,
      limit: Number(limite),
      offset: Number(desde),
    };

    return successResponse(
      res,
      200,
      "Monturas obtenidas exitosamente",
      monturas,
      meta
    );
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

    return successResponse(res, 200, "Montura obtenida exitosamente", montura);
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
    const { codigo, modelo, material, marca, precioBase } = req.body;

    // Verificar si ya existe una montura con el mismo código
    const monturaExistente = await Montura.findOne({ codigo });
    if (monturaExistente) {
      return errorResponse(res, 409, "Ya existe una montura con este código");
    }

    const montura = new Montura({
      codigo,
      modelo,
      material,
      marca,
      precioBase,
    });

    await montura.save();

    return successResponse(res, 201, "Montura creada exitosamente", montura);
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

    // Verificar si el nuevo código ya existe en otra montura
    if (codigo) {
      const monturaConMismoCodigo = await Montura.findOne({
        codigo,
        _id: { $ne: id },
      });
      if (monturaConMismoCodigo) {
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

    return successResponse(
      res,
      200,
      "Montura actualizada exitosamente",
      montura
    );
  } catch (error) {
    console.error("Error al actualizar montura:", error);

    if (error.name === "ValidationError") {
      const details = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return errorResponse(
        res,
        400,
        "Error de validación al actualizar la montura",
        error,
        details
      );
    }

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
      return errorResponse(
        res,
        400,
        "Operación no válida. Use 'incrementar' o 'disminuir'"
      );
    }

    const montura = await Montura.findById(id);
    if (!montura) {
      return errorResponse(res, 404, "Montura no encontrada");
    }

    if (operacion === "disminuir" && montura.stock < cantidad) {
      return errorResponse(res, 400, "Stock insuficiente", null, {
        stockActual: montura.stock,
      });
    }

    const nuevoStock =
      operacion === "incrementar"
        ? montura.stock + cantidad
        : montura.stock - cantidad;

    const monturaActualizada = await Montura.findByIdAndUpdate(
      id,
      { stock: nuevoStock },
      { new: true }
    );

    return successResponse(
      res,
      200,
      "Stock actualizado exitosamente",
      monturaActualizada
    );
  } catch (error) {
    console.error("Error al actualizar stock:", error);
    return errorResponse(
      res,
      500,
      "Error interno del servidor al actualizar el stock",
      error
    );
  }
};

/**
 * @desc    Eliminar una montura (borrado lógico)
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

    if (!montura) {
      return errorResponse(res, 404, "Montura no encontrada");
    }

    return successResponse(res, 200, "Montura eliminada correctamente", {
      id: montura._id,
    });
  } catch (error) {
    console.error("Error al eliminar montura:", error);
    return errorResponse(
      res,
      500,
      "Error interno del servidor al eliminar la montura",
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
