const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../../user_service/models/user.model");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

// Registro de usuario
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

    // Validar datos obligatorios
    if (!nombre || !apellido || !dni || !correo || !password) {
      return errorResponse(
        res,
        400,
        "Todos los campos obligatorios deben ser completados."
      );
    }

    // Verificar si el usuario ya existe
    const userExists = await User.findOne({ dni });
    if (userExists) {
      return errorResponse(res, 400, "El DNI ya está registrado.");
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear el usuario
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

// Inicio de sesión por DNI
const login = async (req, res) => {
  try {
    const { dni, password } = req.body;

    // Validar datos
    if (!dni || !password) {
      return errorResponse(res, 400, "DNI y contraseña son obligatorios.");
    }

    // Buscar usuario por DNI
    const user = await User.findOne({ dni });
    if (!user || !user.credenciales || !user.credenciales.passwordHash) {
      return errorResponse(res, 400, "Credenciales incorrectas.");
    }

    // Comparar contraseñas
    const validPassword = await bcrypt.compare(
      password,
      user.credenciales.passwordHash
    );
    if (!validPassword) {
      return errorResponse(res, 400, "Credenciales incorrectas.");
    }

    // Verificar si `JWT_SECRET` está definido
    if (!process.env.JWT_SECRET) {
      return errorResponse(res, 500, "Error interno del servidor.");
    }

    // Generar token JWT
    const token = jwt.sign(
      { id: user._id, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return successResponse(res, 200, "Inicio de sesión exitoso.", {
      token,
      userId: user._id,
    });
  } catch (error) {
    return errorResponse(res, 500, "Error al iniciar sesión.", error);
  }
};

module.exports = { register, login };
