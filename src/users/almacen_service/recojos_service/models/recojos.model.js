const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const recojosOpticaSchema = new mongoose.Schema({
  // Tipo de documento (NUEVO CAMPO)
  tipo: {
    type: String,
    required: true,
    enum: ["RECOJO", "SEPARACION"],
    default: "RECOJO",
  },

  // Columnas principales
  numero: { type: Number, unique: true },
  fechaCompra: { type: Date, required: true },
  ordenTrabajo: { type: String, required: true },
  nombreApellido: { type: String, required: true },
  monturaLunas: { type: String, required: true },
  total: { type: Number, required: true },
  cuenta: { type: Number }, // Columna "A" en el Excel
  saldo: { type: Number },

  // Estructura para múltiples adelantos (pagos parciales)
  adelantos: [
    {
      fecha: Date,
      ordenTrabajo: String, // "OT" en el Excel
      importe: Number,
      saldo: Number, // Saldo después de este pago
    },
  ],

  // Cancelado (pago completo)
  cancelado: {
    fecha: Date,
    importe: Number,
  },

  // Ubicación actual
  estaEn: {
    type: String,
    enum: ["TIENDA", "LABORATORIO", "ENTREGADO"],
    default: "TIENDA",
  },

  // Entrega
  entregado: {
    ordenTrabajo: String, // "OT" en entrega
    fecha: Date,
    recibidoPor: String, // "MIRIAM" en el Excel
    encargada: String, // "YANNINA" en el Excel
  },

  // Tienda específica (NUEVO CAMPO)
  tienda: {
    type: String,
    enum: ["MIRIAM_BOLIVAR", "ZARA_HUARAL", "OTRA_TIENDA"],
    required: true,
  },

  // Metadata
  fechaCreacion: { type: Date, default: Date.now },
  fechaActualizacion: { type: Date, default: Date.now },
});

// Plugin de paginación
recojosOpticaSchema.plugin(mongoosePaginate);

// Middleware para número secuencial
recojosOpticaSchema.pre("save", async function (next) {
  if (!this.isNew || this.numero) {
    this.fechaActualizacion = new Date();
    return next();
  }

  try {
    const lastDoc = await RecojoOptica.findOne().sort({ numero: -1 }).limit(1);
    this.numero = lastDoc ? lastDoc.numero + 1 : 1;
    next();
  } catch (err) {
    next(err);
  }
});

// Método para verificar pago completo
recojosOpticaSchema.methods.pagoCompleto = function () {
  return this.saldo <= 0;
};

// Método para obtener el tipo como texto descriptivo
recojosOpticaSchema.methods.getTipoDescripcion = function () {
  return this.tipo === "RECOJO" ? "Recojo" : "Separación";
};

const RecojoOptica = mongoose.model("RecojoOptica", recojosOpticaSchema);

module.exports = RecojoOptica;
