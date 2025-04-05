const Asistencia = require("../models/assistance.model");
const User = require("../../user_service/models/user.model");
const moment = require("moment-timezone");
const publicIp = require("public-ip");
const axios = require("axios");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

// Función para obtener ubicación basada en la IP pública del servidor
const obtenerUbicacionServidor = async () => {
  try {
    const ip = await publicIp(); // ✅ Cambiado de `publicIp.v4()` a `publicIp()`
    const response = await axios.get(`https://ipapi.co/${ip}/json/`);

    if (response.data && response.data.latitude && response.data.longitude) {
      return {
        latitud: response.data.latitude,
        longitud: response.data.longitude,
        ciudad: response.data.city,
        region: response.data.region,
        pais: response.data.country_name,
      };
    }
    return null;
  } catch (error) {
    console.error("Error obteniendo la ubicación del servidor:", error);
    return null;
  }
};
// Registrar asistencia con DNI
const registrarAsistencia = async (req, res) => {
  try {
    const { dni } = req.body; // ❌ Se eliminó `ubicacion` de la solicitud

    // Buscar usuario por DNI
    const usuario = await User.findOne({ dni });
    if (!usuario) {
      return errorResponse(res, 404, "Usuario no encontrado");
    }

    // Obtener la ubicación del servidor
    const ubicacion = await obtenerUbicacionServidor();

    // Obtener fecha actual en zona horaria específica
    const hoyInicio = moment().tz("America/Lima").startOf("day").toDate();
    const hoyFin = moment().tz("America/Lima").endOf("day").toDate();

    // Verificar si ya marcó asistencia hoy sin salida registrada
    const asistenciaExistente = await Asistencia.findOne({
      dni,
      fecha: { $gte: hoyInicio, $lte: hoyFin },
      horaSalida: { $exists: false },
    });

    if (asistenciaExistente) {
      return errorResponse(
        res,
        400,
        "El usuario ya tiene una asistencia abierta hoy"
      );
    }

    // Determinar estado de puntualidad
    const horaActual = moment().tz("America/Lima").format("HH:mm:ss");
    const estado = horaActual <= "08:00:00" ? "Puntual" : "Tardanza";

    // Crear el registro de asistencia
    const nuevaAsistencia = new Asistencia({
      usuario: usuario._id,
      dni,
      fecha: new Date(),
      horaEntrada: horaActual,
      estado,
      tipoJornada: "Completa",
      ubicacion,
    });

    await nuevaAsistencia.save();

    return successResponse(
      res,
      201,
      "Asistencia registrada exitosamente",
      nuevaAsistencia
    );
  } catch (error) {
    return errorResponse(res, 500, "Error registrando asistencia", error);
  }
};

// Obtener todas las asistencias (middleware ya maneja la verificación de admin)
const obtenerAsistencias = async (req, res) => {
  try {
    const asistencias = await Asistencia.find().populate(
      "usuario",
      "nombre apellido dni"
    );
    return successResponse(
      res,
      200,
      "Asistencias obtenidas exitosamente",
      asistencias
    );
  } catch (error) {
    return errorResponse(res, 500, "Error obteniendo asistencias", error);
  }
};

// ✅ Exportar funciones correctamente en CommonJS
module.exports = {
  registrarAsistencia,
  obtenerAsistencias,
};
