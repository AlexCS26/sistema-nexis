const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
  },
  brand: { type: String },
  descripcion: { type: String },

  // Solo para productos sin medidas
  priceBase: { type: Number },
  unitPrice: { type: Number },
  stockGeneral: { type: Number, default: 0 },

  // Relación con medidas (para lunas)
  measures: [{ type: mongoose.Schema.Types.ObjectId, ref: "Measure" }],

  // Relación con variantes (para monturas u otros productos con variantes)
  variants: [{ type: mongoose.Schema.Types.ObjectId, ref: "Variant" }],

  isActive: { type: Boolean, default: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Middleware para actualizar updatedAt
productSchema.pre(["save", "findOneAndUpdate"], function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Product", productSchema);
