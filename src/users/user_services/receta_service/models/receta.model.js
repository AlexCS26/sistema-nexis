const mongoose = require("mongoose");

const RecetaSchema = new mongoose.Schema(
  {
    cliente: {
      nombre: { type: String, required: true, index: true },
      primeraVez: { type: Boolean, required: true },
      edad: { type: Number, required: true },
    },
    medidas: {
      ojoDerecho: {
        esfera: { type: String, required: true },
        cilindro: { type: String, required: true },
        eje: { type: Number, required: true },
      },
      ojoIzquierdo: {
        esfera: { type: String, required: true },
        cilindro: { type: String, required: true },
        eje: { type: Number, required: true },
      },
      adicion: { type: Number, default: 0 },
      distanciaPupilar: { type: Number, required: true },
    },
    tienda: {
      type: String,
      enum: [
        "MIRIAM SOLAR",
        "MIRIAM VIZQUERRA",
        "ANGELINA HUARAL",
        "MIRIMA BOLIVAR",
        "MIRIAM BOULEVAR",
        "ANGELINA CHANCAY",
        "ZARA HUARAL",
        "ZARA CHANCAY",
        "INNOVACION",
      ],
      required: true,
    },
    fechaEmision: { type: Date, default: Date.now, index: true },
  },
  { autoIndex: true }
);

module.exports = mongoose.model("Receta", RecetaSchema);
