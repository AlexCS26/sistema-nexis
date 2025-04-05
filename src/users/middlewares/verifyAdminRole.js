const errorResponse = require("../utils/responseUtils").errorResponse;

// Middleware para verificar si el usuario es admin
const verifyAdminRole = (req, res, next) => {
  if (req.usuario.rol !== "admin") {
    return errorResponse(
      res,
      403,
      "Acceso denegado. Se requiere rol de administrador."
    );
  }
  next();
};

module.exports = { verifyAdminRole };
