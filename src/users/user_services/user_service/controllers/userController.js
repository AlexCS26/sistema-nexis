const User = require("../models/user.model");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

/**
 * 📌 Obtener todos los usuarios
 * ⚠️ La seguridad y roles se manejan en la ruta
 */
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, "-credenciales.passwordHash"); // Excluye el password
    return successResponse(
      res,
      200,
      "Lista de usuarios obtenida con éxito",
      users
    );
  } catch (error) {
    return errorResponse(res, 500, "Error al obtener los usuarios", error);
  }
};

/**
 * 📌 Obtener solo los usuarios con rol 'vendedor'
 */
const getAllVendedores = async (req, res) => {
  try {
    const vendedores = await User.find(
      { rol: "vendedor" },
      "-credenciales.passwordHash"
    );
    return successResponse(
      res,
      200,
      "Lista de vendedores obtenida con éxito",
      vendedores
    );
  } catch (error) {
    return errorResponse(res, 500, "Error al obtener los vendedores", error);
  }
};

/**
 * 📌 Obtener los datos del usuario autenticado
 */
const getAuthenticatedUser = async (req, res) => {
  try {
    const user = await User.findById(
      req.usuario.userId,
      "-credenciales.passwordHash"
    );

    if (!user) {
      return errorResponse(res, 404, "Usuario no encontrado");
    }

    return successResponse(res, 200, "Usuario autenticado con éxito", user);
  } catch (error) {
    return errorResponse(
      res,
      500,
      "Error al obtener los datos del usuario",
      error
    );
  }
};

module.exports = {
  getAuthenticatedUser,
  getAllUsers,
  getAllVendedores,
};
