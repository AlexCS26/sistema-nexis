const bcrypt = require("bcryptjs");
const User = require("../../user_service/models/user.model");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

const {
  createSession,
  closeSession,
} = require("../../session_service/controllers/sessionController");

// ===============================
// 🔹 Registro de usuario
// ===============================
const register = async (req, res) => {
  try {
    const {
      nombre,
      apellido,
      dni,
      correo,
      celular,
      fechaNacimiento,
      direccion,
      rol,
      password,
    } = req.body;

    if (!nombre || !apellido || !dni || !correo || !password) {
      return errorResponse(
        res,
        400,
        "Todos los campos obligatorios deben ser completados."
      );
    }

    const userExists = await User.findOne({ dni });
    if (userExists) {
      return errorResponse(res, 400, "El DNI ya está registrado.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      nombre,
      apellido,
      dni,
      correo,
      celular,
      fechaNacimiento,
      direccion,
      rol,
      credenciales: { passwordHash: hashedPassword },
    });

    await newUser.save();
    return successResponse(res, 201, "Usuario registrado con éxito.", {
      userId: newUser._id,
    });
  } catch (error) {
    return errorResponse(res, 500, "Error al registrar usuario.", error);
  }
};
// ===============================
// 🔹 Inicio de sesión con logs
// ===============================
const login = async (req, res) => {
  try {
    console.log("📥 [LOGIN] Body recibido:", req.body);

    const { dni, password } = req.body;

    if (!dni || !password) {
      console.warn("⚠️ [LOGIN] Faltan credenciales");
      return errorResponse(res, 400, "DNI y contraseña son obligatorios.");
    }

    const user = await User.findOne({ dni });
    console.log(
      "🔎 [LOGIN] Usuario encontrado:",
      user ? user._id : "No encontrado"
    );

    if (!user || !user.credenciales || !user.credenciales.passwordHash) {
      console.warn("⚠️ [LOGIN] Usuario o contraseña no encontrados");
      return errorResponse(res, 400, "Credenciales incorrectas.");
    }

    const validPassword = await bcrypt.compare(
      password,
      user.credenciales.passwordHash
    );
    console.log("🔑 [LOGIN] Contraseña válida:", validPassword);

    if (!validPassword) {
      console.warn("⚠️ [LOGIN] Contraseña incorrecta para DNI:", dni);
      return errorResponse(res, 400, "Credenciales incorrectas.");
    }

    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
      console.error("❌ [LOGIN] JWT_SECRET o JWT_REFRESH_SECRET no definidos");
      return errorResponse(
        res,
        500,
        "Error interno del servidor (JWT_SECRET)."
      );
    }

    console.log("✅ [LOGIN] Creando sesión...");
    const { accessToken, refreshToken } = await createSession(user, req);
    console.log("🎟️ [LOGIN] Tokens generados correctamente");

    return successResponse(res, 200, "Inicio de sesión exitoso.", {
      accessToken,
      refreshToken,
      userId: user._id,
      nombre: user.nombre,
      rol: user.rol,
    });
  } catch (error) {
    console.error("💥 [LOGIN] Error inesperado:", error);
    return errorResponse(res, 500, "Error al iniciar sesión.", error);
  }
};
// ===============================
// 🔹 Cerrar sesión
// ===============================
const logout = async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      return errorResponse(res, 400, "Token no proporcionado.");
    }

    await closeSession(token);
    return successResponse(res, 200, "Sesión cerrada con éxito.");
  } catch (error) {
    return errorResponse(res, 500, "Error al cerrar sesión.", error);
  }
};

module.exports = { register, login, logout };
