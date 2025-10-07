// services/deepseekService.js
const deepseek = require("../../config/deepseek");

/**
 * Consulta genérica a DeepSeek
 */
const askDeepseek = async (
  messages,
  { stream = false, model = "deepseek-chat" } = {}
) => {
  try {
    const completion = await deepseek.chat.completions.create({
      model,
      stream,
      messages,
    });

    if (stream) return completion;

    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Error en DeepSeek API:", error.message);
    throw error;
  }
};

/**
 * Analiza el stock de lunas y devuelve insights en JSON estructurado
 */
const analizarStockIA = async (lunas) => {
  const prompt = [
    {
      role: "system",
      content:
        "Eres un analista de inventario de óptica. Devuelve SIEMPRE JSON válido.",
    },
    {
      role: "user",
      content: `Analiza las siguientes lunas y devuelve en JSON un resumen con:
        - zonasCriticas: array con { zona, totalLunasBajas, detalles }
        - tiposCriticos: array con { tipo, medida, stock }
        - recomendaciones: lista de consejos.
        
        Considera stock bajo cuando es < 5 unidades.
        
        Datos:
        ${JSON.stringify(lunas.slice(0, 50))} 
        (solo se envían máximo 50 ejemplos para no saturar)`,
    },
  ];

  const respuesta = await askDeepseek(prompt);
  try {
    return JSON.parse(respuesta);
  } catch {
    return { recomendaciones: [respuesta] }; // fallback si no es JSON
  }
};

module.exports = {
  askDeepseek,
  analizarStockIA,
};
