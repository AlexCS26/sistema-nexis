const mongoose = require("mongoose");

const measureSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
  },

  sphere: { type: Number, required: true }, // Puede ser positivo o negativo
  cylinder: { type: Number, required: true }, // Siempre negativo
  add: { type: Number, default: null }, // Opcional
  serie: { type: String }, // Se calculará en el controlador

  // Stock y precio por zona
  stockByZone: [
    {
      zoneId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Zone",
        required: true,
      },
      zoneCode: { type: String }, // nuevo
      zoneName: { type: String }, // nuevo
      stock: { type: Number, default: 0 },
      price: { type: Number, required: true },
    },
  ],
  // Código único para la medida
  code: {
    type: String,
    unique: true,
    required: true,
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "El usuario que registra es obligatorio"],
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Middleware solo para actualizar updatedAt
measureSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

measureSchema.pre("findOneAndUpdate", function (next) {
  this.getUpdate().updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Measure", measureSchema);
