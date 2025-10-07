const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

/**
 * Schema principal RecojoOptica (genérico para cualquier producto)
 */
const recojosOpticaSchema = new mongoose.Schema({
  tipo: {
    type: String,
    required: true,
    enum: ["RECOJO", "SEPARACION"],
    default: "RECOJO",
  },
  numero: { type: Number, unique: true },
  fechaCompra: { type: Date, required: true },
  ordenTrabajo: { type: String, required: true },
  nombreApellido: { type: String, required: true },

  // 🔹 Items del recojo (cualquier producto, variante o medida)
  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Variant" },
      measureId: { type: mongoose.Schema.Types.ObjectId, ref: "Measure" },
      quantity: { type: Number, default: 1 },
      unitPrice: { type: Number, required: true },
      totalPrice: { type: Number, required: true },
    },
  ],

  total: { type: Number, required: true },
  cuenta: { type: Number },
  saldo: { type: Number },
  adelantos: [
    { fecha: Date, ordenTrabajo: String, importe: Number, saldo: Number },
  ],
  cancelado: { fecha: Date, importe: Number },

  estaEn: {
    type: String,
    enum: ["EN_TIENDA", "EN_LABORATORIO", "ENTREGADO"],
    default: "EN_TIENDA",
  },
  venta: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Venta",
  },

  entregado: {
    ordenTrabajo: String,
    fecha: Date,
    recibidoPor: String,
    encargada: String,
  },
  tienda: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tienda",
    required: true,
  },
  fechaCreacion: { type: Date, default: Date.now },
  fechaActualizacion: { type: Date, default: Date.now },
});

// Plugin de paginación
recojosOpticaSchema.plugin(mongoosePaginate);

// Métodos auxiliares
recojosOpticaSchema.methods.pagoCompleto = function () {
  return this.saldo <= 0;
};

recojosOpticaSchema.methods.getTipoDescripcion = function () {
  return this.tipo === "RECOJO" ? "Recojo" : "Separación";
};

// Middleware para mantener fecha de actualización
recojosOpticaSchema.pre("save", function (next) {
  this.fechaActualizacion = new Date();
  next();
});

const RecojoOptica = mongoose.model("RecojoOptica", recojosOpticaSchema);

module.exports = RecojoOptica;
