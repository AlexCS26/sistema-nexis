const mongoose = require("mongoose");

const monturaSchema = new mongoose.Schema(
  {
    codigo: {
      type: String,
      required: [true, "El código es obligatorio"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    modelo: {
      type: String,
      required: [true, "El modelo es obligatorio"],
      trim: true,
    },
    material: {
      type: String,
      enum: {
        values: ["ACETATO", "METAL", "TITANIO", "FLEXIBLE"],
        message:
          "Material no válido. Opciones: ACETATO, METAL, TITANIO, FLEXIBLE",
      },
      required: [true, "El material es obligatorio"],
    },
    marca: {
      type: String,
      trim: true,
      default: "GENÉRICO",
    },
    precioUnitario: {
      // <-- Modificado
      type: Number,
      required: [true, "El precio unitario es obligatorio"],
      min: [0, "El precio unitario no puede ser negativo"],
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, "El stock no puede ser negativo"],
    },
    estado: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automáticamente
    versionKey: false, // Evita el campo __v de versiones de Mongoose
  }
);

module.exports = mongoose.model("Montura", monturaSchema);
