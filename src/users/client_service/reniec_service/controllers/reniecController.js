// controllers/reniecController.js
const { consultarDni } = require("../services/reniecService"); // Ajusta la ruta según tu proyecto
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

/**
 * @desc    Obtener datos de una persona por DNI desde RENIEC
 * @route   GET /api/reniec/dni?dni=XXXXXXXX
 * @access  Private (admin, vendedor)
 */
const obtenerDatosPorDni = async (req, res) => {
  try {
    const { dni } = req.query; // Se puede usar req.body si prefieres POST

    // Validación básica del DNI
    if (!dni || !/^\d{8}$/.test(dni)) {
      return errorResponse(
        res,
        400,
        "DNI inválido. Debe contener exactamente 8 dígitos."
      );
    }

    // Consulta a la API de RENIEC
    const datos = await consultarDni(dni);

    // Verifica si la API devolvió información
    if (!datos) {
      return errorResponse(
        res,
        404,
        "No se encontraron datos para el DNI proporcionado."
      );
    }

    // Retorna los datos usando el formato estandarizado
    return successResponse(
      res,
      200,
      "Datos obtenidos correctamente desde RENIEC.",
      datos
    );
  } catch (error) {
    console.error("❌ Error al consultar RENIEC:", error.message);
    return errorResponse(
      res,
      500,
      "Ocurrió un error al consultar RENIEC. Intenta nuevamente más tarde.",
      error
    );
  }
};

module.exports = { obtenerDatosPorDni };
