const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      uppercase: true, // Siempre en mayúsculas
      minlength: 2,
      maxlength: 5,
    },
    // Ejemplo: MNT = Monturas, LNS = Lunas, ACC = Accesorios, SRV = Servicios

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },
    // Nombre descriptivo: Monturas, Lunas, Accesorios, Servicios, Regalos

    description: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    // Descripción opcional para reportes o información extendida

    type: {
      type: String,
      enum: ["product", "service", "promotional"],
      default: "product",
      index: true,
    },
    // Tipo de categoría: producto físico, servicio, promoción

    icon: { type: String, trim: true },
    // Ícono de referencia para UI (ej: "glasses", "lens", "gift")

    colorTag: { type: String, trim: true },
    // Color para identificar en dashboards (ej: "#FF5733")

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "El usuario que registra es obligatorio"],
    },
    // Usuario que creó/registró la categoría (referencia a collection 'User')

    isActive: { type: Boolean, default: true },
    // Estado: activa o inactiva (no se elimina para mantener historial)

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: false, // Usamos control manual en lugar de timestamps automáticos
    versionKey: false, // Eliminamos __v
  }
);

// Middleware: asegura que updatedAt se actualice siempre
categorySchema.pre(["save", "findOneAndUpdate"], function (next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual: útil para reportes (ejemplo: "MNT - Monturas")
categorySchema.virtual("label").get(function () {
  return `${this.code} - ${this.name}`;
});

// Índices extra para mejorar rendimiento en búsquedas
categorySchema.index({ name: 1 });
categorySchema.index({ type: 1 });

module.exports = mongoose.model("Category", categorySchema);
