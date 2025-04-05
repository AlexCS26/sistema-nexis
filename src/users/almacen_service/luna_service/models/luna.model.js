const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

// Función para validar que el valor esté en el rango y en incrementos de 0.25
const validarRangoYIncremento = (valor, esCilindrico = false) => {
  if (!valor || valor.trim() === "") return true;
  const valorNum = parseFloat(valor);
  if (isNaN(valorNum)) return false;

  if (!esCilindrico && (valorNum < -6.0 || valorNum > 6.0)) return false;
  if (esCilindrico && (valorNum < -6.0 || valorNum > 0.0)) return false;

  return Math.abs(valorNum * 100) % 25 === 0;
};

// Función para determinar la serie automáticamente
const determinarSerie = (cilindrico) => {
  if (!cilindrico || cilindrico.trim() === "") return null;
  const cilindricoValor = parseFloat(cilindrico);
  if (isNaN(cilindricoValor)) return null;

  if (cilindricoValor <= -0.25 && cilindricoValor >= -2.0) return 1;
  if (cilindricoValor < -2.0 && cilindricoValor >= -4.0) return 2;
  if (cilindricoValor < -4.0 && cilindricoValor >= -6.0) return 3;

  return null;
};

// Validación para OT (Orden de Trabajo)
const validarOT = (ot) => {
  if (!ot) return true; // Opcional
  return /^[A-Za-z0-9-]{4,20}$/.test(ot); // Formato básico: 4-20 caracteres alfanuméricos con guiones
};

const lunaSchema = new mongoose.Schema(
  {
    esferico: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => validarRangoYIncremento(v, false),
        message:
          "Esférico debe estar entre -6.00 y +6.00 en incrementos de 0.25",
      },
    },
    cilindrico: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => validarRangoYIncremento(v, true),
        message:
          "Cilíndrico debe estar entre -6.00 y 0.00 en incrementos de 0.25",
      },
    },
    tipo: {
      type: String,
      enum: {
        values: [
          "Fotomatic Blue Azul",
          "Fotomatic Blue Verde",
          "Rx Blue Block Azul",
          "Rx Blue Block Verde",
          "Rx Blanca",
        ],
        message: "Tipo de luna no válido",
      },
      required: [true, "El tipo de luna es obligatorio"],
    },
    serie: {
      type: Number,
      enum: [1, 2, 3],
      default: null,
    },
    stock: {
      type: Number,
      required: [true, "El stock es obligatorio"],
      min: [0, "El stock no puede ser negativo"],
      default: 0,
      validate: {
        validator: function (v) {
          // Permite cero pero no valores negativos
          return v >= 0;
        },
        message: "El stock no puede ser negativo",
      },
    },
    disponible: {
      type: Boolean,
      default: function () {
        // Calcula automáticamente si está disponible basado en el stock
        return this.stock > 0;
      },
    },
    precio: {
      type: Number,
      min: [0, "El precio no puede ser negativo"],
    },
    ot: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: validarOT,
        message: "Formato de OT inválido. Use 4-20 caracteres alfanuméricos",
      },
    },
    registradoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "El usuario que registra es obligatorio"],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Middlewares
lunaSchema.pre("save", function (next) {
  if (this.cilindrico) {
    this.serie = determinarSerie(this.cilindrico);
  }
  // Actualiza el campo disponible basado en el stock
  this.disponible = this.stock > 0;
  next();
});

lunaSchema.pre("save", function (next) {
  if (this.isModified("stock")) {
    this.disponible = this.stock > 0;
  }
  next();
});

lunaSchema.pre("validate", function (next) {
  if (!this.esferico && !this.cilindrico) {
    next(new Error("Debe proporcionar al menos esférico o cilíndrico"));
  } else {
    next();
  }
});

// Plugin de paginación
lunaSchema.plugin(mongoosePaginate);

// Métodos personalizados
lunaSchema.statics.obtenerStockPorTipo = async function () {
  return this.aggregate([
    {
      $group: {
        _id: "$tipo",
        stockTotal: { $sum: "$stock" },
        cantidadModelos: { $sum: 1 },
        disponibles: {
          $sum: {
            $cond: [{ $gt: ["$stock", 0] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        tipo: "$_id",
        stockTotal: 1,
        cantidadModelos: 1,
        disponibles: 1,
        agotados: { $subtract: ["$cantidadModelos", "$disponibles"] },
      },
    },
    { $sort: { tipo: 1 } },
  ]);
};

lunaSchema.methods.estaDisponible = function () {
  return this.stock > 0;
};

const Luna = mongoose.model("Luna", lunaSchema);
module.exports = Luna;
