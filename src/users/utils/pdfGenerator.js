// server/src/utils/pdf-generator.js
const nubefactService = require("../services/nubefact-service");

const generarComprobantePDF = async (venta, tipo = "FACTURA ELECTRÓNICA") => {
  try {
    console.log("🔄 Generando comprobante con PDF desde Nubefact...");

    // Usar el servicio de Nubefact que ya tienes implementado
    const resultado = await nubefactService.generarComprobanteConPDF(
      venta,
      tipo
    );

    console.log("✅ PDF generado exitosamente por Nubefact");
    return resultado.pdf;
  } catch (error) {
    console.error("❌ Error generando PDF:", error.message);
    throw new Error(`Error al generar PDF: ${error.message}`);
  }
};

// Función alternativa si solo quieres el PDF de un comprobante ya generado
const obtenerPDFComprobanteExistente = async (comprobanteResponse) => {
  try {
    console.log("🔄 Obteniendo PDF de comprobante existente...");

    const pdfBuffer = await nubefactService.obtenerPDFComprobante(
      comprobanteResponse
    );

    console.log("✅ PDF obtenido exitosamente");
    return pdfBuffer;
  } catch (error) {
    console.error("❌ Error obteniendo PDF:", error.message);
    throw new Error(`Error al obtener PDF: ${error.message}`);
  }
};

module.exports = {
  generarComprobantePDF,
  obtenerPDFComprobanteExistente,
};
