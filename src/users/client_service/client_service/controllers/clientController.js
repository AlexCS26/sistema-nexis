// controllers/clientController.js
const Client = require("../models/client.model");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

/**
 * @desc    Registrar un nuevo cliente
 * @route   POST /api/clients
 * @access  Private (admin, vendedor)
 */
const crearCliente = async (req, res) => {
  try {
    const { nombre, apellido, dni, correo, celular, direccion } = req.body;

    // Validación básica
    if (!nombre || !apellido || !dni) {
      return errorResponse(
        res,
        400,
        "Nombre, apellido y DNI son obligatorios."
      );
    }

    if (!/^\d{8}$/.test(dni)) {
      return errorResponse(
        res,
        400,
        "DNI inválido. Debe contener exactamente 8 dígitos."
      );
    }

    // Verificar si el cliente ya existe
    const clienteExistente = await Client.findOne({ dni });
    if (clienteExistente) {
      return errorResponse(
        res,
        409,
        "Ya existe un cliente registrado con este DNI."
      );
    }

    // Crear nuevo cliente
    const nuevoCliente = new Client({
      nombre,
      apellido,
      dni,
      correo,
      celular,
      direccion,
      registradoPor: req.usuario.userId, // usuario que lo registró
    });

    await nuevoCliente.save();

    return successResponse(
      res,
      201,
      "Cliente registrado exitosamente.",
      nuevoCliente
    );
  } catch (error) {
    console.error("❌ Error al registrar cliente:", error.message);
    return errorResponse(
      res,
      500,
      "Ocurrió un error al registrar el cliente.",
      error
    );
  }
};

/**
 * @desc    Obtener clientes con búsqueda, paginación y orden
 * @route   GET /api/clients
 * @access  Private (admin, vendedor)
 */
const obtenerClientes = async (req, res) => {
  try {
    const {
      search,
      page = 1,
      limit = 10,
      sortBy = "fechaRegistro",
      order = "desc",
    } = req.query;

    const filtro = search
      ? {
          $or: [
            { nombre: new RegExp(search, "i") },
            { apellido: new RegExp(search, "i") },
            { dni: new RegExp(search, "i") },
            { correo: new RegExp(search, "i") },
            { celular: new RegExp(search, "i") },
          ],
        }
      : {};

    const total = await Client.countDocuments(filtro);
    const totalPages = Math.ceil(total / limit);
    const clientes = await Client.find(filtro)
      .sort({ [sortBy]: order === "asc" ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate("registradoPor", "nombre apellido correo");

    return successResponse(
      res,
      200,
      "Clientes obtenidos correctamente.",
      clientes,
      {
        total,
        page: Number(page),
        totalPages,
        limit: Number(limit),
      }
    );
  } catch (error) {
    console.error("❌ Error al obtener clientes:", error.message);
    return errorResponse(
      res,
      500,
      "Ocurrió un error al obtener los clientes.",
      error
    );
  }
};

module.exports = { crearCliente, obtenerClientes };
