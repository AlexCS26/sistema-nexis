const mongoose = require("mongoose");

const zoneSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, "El código de la zona es obligatorio"],
    unique: true,
    uppercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: [true, "El nombre de la zona es obligatorio"],
    trim: true,
  },
  location: {
    city: { type: String, required: true, trim: true }, // Ejemplo: "Huaral"
    province: { type: String, required: true, trim: true }, // Ejemplo: "Lima"
    country: { type: String, default: "Perú", trim: true },
  },
  description: {
    type: String,
    trim: true,
    default: null,
  },
  type: {
    type: String,
    enum: ["warehouse", "store", "distribution_center"],
    default: "store",
  },
  isActive: {
    type: Boolean,
    default: true,
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "El usuario que crea la zona es obligatorio"],
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Middleware para actualizar la fecha en updates
zoneSchema.pre("findOneAndUpdate", function (next) {
  this.getUpdate().updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Zone", zoneSchema);
