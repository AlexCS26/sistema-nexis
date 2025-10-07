const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const lunaSchema = new mongoose.Schema(
  {
    esferico: { type: String, trim: true },
    cilindrico: { type: String, trim: true },
    tipo: {
      type: String,
      enum: [
        "Fotomatic Blue Azul",
        "Fotomatic Blue Verde",
        "Rx Blue Block Azul",
        "Rx Blue Block Verde",
        "Rx Blanca",
      ],
      required: [true, "El tipo de luna es obligatorio"],
    },
    zona: {
      type: String,
      enum: ["Chancay", "Huaral"],
      required: [true, "La zona es obligatoria (Chancay o Huaral)"],
    },
    serie: { type: Number, enum: [1, 2, 3], default: null },
    stock: {
      type: Number,
      required: [true, "El stock es obligatorio"],
      min: [0, "El stock no puede ser negativo"],
      default: 0,
    },
    disponible: {
      type: Boolean,
      default: function () {
        return this.stock > 0;
      },
    },
    precioUnitario: {
      type: Number,
      required: [true, "El precio unitario es obligatorio"],
      min: [0, "El precio no puede ser negativo"],
    },
    ot: { type: String, trim: true, uppercase: true },
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
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Middleware para actualizar disponibilidad automáticamente
lunaSchema.pre("save", function (next) {
  this.disponible = this.stock > 0;
  next();
});

// Middleware de validación básica
lunaSchema.pre("validate", function (next) {
  if (!this.esferico && !this.cilindrico) {
    next(new Error("Debe proporcionar al menos esférico o cilíndrico"));
  } else {
    next();
  }
});

// Plugin de paginación
lunaSchema.plugin(mongoosePaginate);

const Luna = mongoose.model("Luna", lunaSchema);
module.exports = Luna;
