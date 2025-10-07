/**
 * @file index.js
 * @description Configuración global de variables de entorno para el proyecto.
 */

require("dotenv").config();

module.exports = {
  reniecApiKey: process.env.RENIEC_API_KEY || "",
  allowedCategoryCodes: process.env.ALLOWED_CATEGORY_CODES
    ? process.env.ALLOWED_CATEGORY_CODES.split(",")
    : ["OTH"],

  /**
   * @desc Orígenes CORS permitidos
   * @type {string[]}
   */
  clientOrigins: process.env.CLIENT_ORIGINS
    ? process.env.CLIENT_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:5173"],
};
