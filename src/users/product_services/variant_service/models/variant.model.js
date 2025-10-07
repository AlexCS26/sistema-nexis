const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
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
  code: { type: String, required: true }, // SKU interno
  color: { type: String },
  size: { type: String },
  material: { type: String },
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

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Middleware para actualizar updatedAt
variantSchema.pre(["save", "findOneAndUpdate"], function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Variant", variantSchema);
