const jwt = require("jsonwebtoken");
const Session = require("../models/sessionModel");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

const ACCESS_TOKEN_EXPIRES_MIN = 15; // minutos
const REFRESH_TOKEN_EXPIRES_DAYS = 7; // días

// ===============================
// 🔹 Crear nueva sesión
// ===============================
const createSession = async (user, req) => {
  try {
    const accessToken = jwt.sign(
      { id: user._id, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: `${ACCESS_TOKEN_EXPIRES_MIN}m` }
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: `${REFRESH_TOKEN_EXPIRES_DAYS}d` }
    );

    const expiraEn = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000
    );

    const session = new Session({
      user: user._id,
      accessToken,
      tokens: [accessToken], // 🔹 guardar historial inicial
      refreshToken,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      expiraEn,
    });

    await session.save();
    console.log("✅ Sesión creada:", session._id);

    return { accessToken, refreshToken, session };
  } catch (err) {
    console.error("❌ Error creando sesión:", err);
    throw new Error("No se pudo crear la sesión");
  }
};

// ===============================
// 🔹 Verificar sesión y token
// ===============================
const verifySession = async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1]?.trim();
    if (!token) return errorResponse(res, 400, "Token requerido");

    const session = await Session.findOne({
      accessToken: token,
      estado: "activa",
    });

    if (!session)
      return errorResponse(res, 401, "Sesión no encontrada o inactiva");

    if (session.estaExpirada()) {
      session.estado = "expirada";
      await session.save();
      return errorResponse(res, 401, "Sesión expirada");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    session.ultimaActividad = new Date();
    await session.save();

    return successResponse(res, 200, "Sesión válida", {
      session,
      usuario: decoded,
    });
  } catch (err) {
    console.error("❌ Error verificando sesión:", err.message);
    return errorResponse(res, 401, "Token inválido o expirado", err);
  }
};

// ===============================
// 🔹 Refrescar sesión
// ===============================
const refreshSession = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return errorResponse(res, 400, "Refresh token requerido");

    const session = await Session.findOne({
      refreshToken: refreshToken.trim(),
      estado: "activa",
    });

    if (!session)
      return errorResponse(res, 401, "Refresh token inválido o inactivo");

    if (session.estaExpirada()) {
      session.estado = "expirada";
      await session.save();
      return errorResponse(res, 401, "Sesión expirada");
    }

    const payload = { id: session.user, rol: session.user.rol };
    const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: `${ACCESS_TOKEN_EXPIRES_MIN}m`,
    });

    // 🔹 Guardar historial de tokens y actualizar token activo
    session.tokens = [...session.tokens, newAccessToken];
    session.accessToken = newAccessToken;
    session.ultimaActividad = new Date();
    await session.save();

    console.log("🔹 Token renovado:", session._id);

    return successResponse(res, 200, "Token renovado", {
      accessToken: newAccessToken,
    });
  } catch (err) {
    console.error("❌ Error refrescando sesión:", err);
    return errorResponse(res, 500, "Error refrescando sesión", err);
  }
};

// ===============================
// 🔹 Cerrar sesión
// ===============================
const closeSession = async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1]?.trim();
    if (!token) return errorResponse(res, 400, "Token requerido");

    const session = await Session.findOneAndUpdate(
      { accessToken: token },
      { estado: "revocada", ultimaActividad: new Date() },
      { new: true }
    );

    if (!session) return errorResponse(res, 404, "Sesión no encontrada");

    console.log("🔹 Sesión cerrada:", session._id);
    return successResponse(res, 200, "Sesión cerrada correctamente");
  } catch (err) {
    console.error("❌ Error cerrando sesión:", err);
    return errorResponse(res, 500, "Error cerrando sesión", err);
  }
};

module.exports = {
  createSession,
  verifySession,
  refreshSession,
  closeSession,
};
