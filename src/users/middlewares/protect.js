const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

// 📌 Middleware para verificar JWT y extraer usuario (solo datos esenciales)
const verificarToken = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) {
    return res
      .status(401)
      .json({ mensaje: "Acceso denegado. Token no proporcionado." });
  }

  try {
    const secreto = process.env.JWT_SECRET || "clave_secreta"; // Usa variable de entorno
    const decoded = jwt.verify(token.replace("Bearer ", ""), secreto);

    // Extraer solo información necesaria
    req.usuario = {
      userId: decoded.id, // ✅ Usar "id" en lugar de "userId"
      rol: decoded.rol,
      nombre: decoded.nombre,
    };

    console.log("Usuario autenticado:", req.usuario); // 👀 DEBUG

    next();
  } catch (error) {
    res.status(401).json({ mensaje: "Token inválido o expirado." });
  }
};

// 📌 Middleware para verificar si el usuario tiene un rol específico
const verificarRol = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return res
        .status(403)
        .json({ mensaje: "Acceso denegado. No tienes permisos." });
    }
    next();
  };
};

// 📌 Middleware para validar ObjectId en MongoDB
const validarObjectId = (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ mensaje: "ID no válido." });
  }
  next();
};

module.exports = {
  verificarToken,
  verificarRol,
  validarObjectId,
};
