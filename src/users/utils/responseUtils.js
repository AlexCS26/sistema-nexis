/**
 * Envía una respuesta de éxito con formato estandarizado.
 *
 * @param {Response} res - Objeto de respuesta de Express.
 * @param {number} statusCode - Código de estado HTTP.
 * @param {string} message - Mensaje de éxito.
 * @param {Object|null} [data=null] - Datos opcionales de la respuesta.
 * @param {Object|null} [meta=null] - Metadatos opcionales (paginación, etc.).
 */
const successResponse = (
  res,
  statusCode,
  message,
  data = null,
  meta = null
) => {
  return res.status(statusCode).json({
    success: true,
    statusCode,
    message,
    data: data || undefined, // Evita incluir 'null' en la respuesta
    meta: meta || undefined,
  });
};

/**
 * Envía una respuesta de error con formato estandarizado.
 *
 * @param {Response} res - Objeto de respuesta de Express.
 * @param {number} statusCode - Código de estado HTTP.
 * @param {string} message - Mensaje de error para el usuario.
 * @param {Error|null} [error=null] - Objeto de error opcional (no se expone en producción).
 * @param {Object|null} [details=null] - Información adicional opcional (ej. errores de validación).
 */
const errorResponse = (
  res,
  statusCode,
  message,
  error = null,
  details = null
) => {
  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    error:
      process.env.NODE_ENV === "development" && error
        ? error.toString()
        : undefined, // Evita exponer errores en producción
    details: details || undefined, // Información adicional opcional
  });
};

module.exports = { successResponse, errorResponse };
