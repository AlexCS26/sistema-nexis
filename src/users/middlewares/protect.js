const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Session = require("../user_services/session_service/models/sessionModel");
const User = require("../user_services/user_service/models/user.model");

// Middleware híbrido: verifica AccessToken y RefreshToken
const verificarToken = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader)
    return res
      .status(401)
      .json({ mensaje: "Autenticación requerida. No se proporcionó token." });

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  try {
    // 1️⃣ Intentar verificar como AccessToken
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // Traer usuario real desde DB
    const usuarioDB = await User.findById(decoded.id).lean();
    if (!usuarioDB)
      return res
        .status(401)
        .json({ mensaje: "Usuario no encontrado o inactivo." });

    req.usuario = {
      userId: usuarioDB._id,
      rol: usuarioDB.rol,
      nombre: usuarioDB.nombre,
    };
    return next();
  } catch (err) {
    // 2️⃣ Intentar con RefreshToken si AccessToken expiró
    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
      try {
        const session = await Session.findOne({
          refreshToken: token,
          estado: "activa",
        })
          .populate("user")
          .lean();
        if (!session)
          return res.status(401).json({
            mensaje:
              "Sesión no válida o cerrada. Por favor, inicia sesión nuevamente.",
          });

        const decodedRefresh = jwt.verify(
          token,
          process.env.JWT_REFRESH_SECRET
        );

        req.usuario = {
          userId: session.user._id,
          rol: session.user.rol,
          nombre: session.user.nombre,
        };

        // Actualizar última actividad de sesión
        await Session.updateOne(
          { _id: session._id },
          { ultimaActividad: new Date() }
        );

        return next();
      } catch (refreshErr) {
        console.error(
          "❌ Error al verificar refreshToken:",
          refreshErr.message
        );
        return res
          .status(401)
          .json({ mensaje: "Token inválido o expirado. Reautentícate." });
      }
    } else {
      console.error("❌ Error al verificar accessToken:", err.message);
      return res
        .status(401)
        .json({ mensaje: "Token inválido o expirado. Acceso denegado." });
    }
  }
};

// Middleware para verificar rol
const verificarRol = (rolesPermitidos) => (req, res, next) => {
  const rol = (req.usuario?.rol || "").toLowerCase();
  const rolesNormalizados = rolesPermitidos.map((r) => r.toLowerCase());

  if (!rol || !rolesNormalizados.includes(rol)) {
    return res.status(403).json({
      mensaje: "Acceso denegado. Tu rol no tiene permisos para esta acción.",
    });
  }
  next();
};

// Middleware para validar ObjectId
const validarObjectId = (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res
      .status(400)
      .json({ mensaje: "El ID proporcionado no es válido." });
  next();
};

module.exports = { verificarToken, verificarRol, validarObjectId };
