// utils/lunaUtils.js

/**
 * Valida que un valor esté dentro del rango permitido y en incrementos de 0.25
 * @param {string|number} valor
 * @param {boolean} esCilindrico
 * @returns {boolean}
 */
const validarRangoYIncremento = (valor, esCilindrico = false) => {
  if (valor === undefined || valor === null || valor.toString().trim() === "")
    return true;

  const valorNum = parseFloat(valor);
  if (isNaN(valorNum)) return false;

  if (!esCilindrico && (valorNum < -6.0 || valorNum > 6.0)) return false;
  if (esCilindrico && (valorNum < -6.0 || valorNum > 0.0)) return false;

  return Math.abs(valorNum * 100) % 25 === 0;
};

/**
 * Determina la serie automáticamente según el valor cilíndrico
 * @param {string|number} cilindrico
 * @returns {number|null} 1, 2, 3 o null si no aplica
 */
const determinarSerie = (cilindrico) => {
  if (
    cilindrico === undefined ||
    cilindrico === null ||
    cilindrico.toString().trim() === ""
  )
    return null;

  const valor = parseFloat(cilindrico);
  if (isNaN(valor)) return null;

  if (valor <= -0.25 && valor >= -2.0) return 1;
  if (valor < -2.0 && valor >= -4.0) return 2;
  if (valor < -4.0 && valor >= -6.0) return 3;

  return null;
};

module.exports = {
  validarRangoYIncremento,
  determinarSerie,
};
