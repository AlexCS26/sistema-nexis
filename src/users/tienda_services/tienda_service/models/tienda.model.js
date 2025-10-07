const mongoose = require("mongoose");

const tiendaSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true, // Ej: "STO-001"
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },

    // 📍 Dirección estructurada
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String },
      country: { type: String, default: "Perú" },
      postalCode: { type: String },
    },

    // 📞 Contacto de la tienda
    contact: {
      phone: { type: String },
      email: { type: String, lowercase: true, trim: true },
    },

    // 👨‍💼 Historial de encargados
    managersHistory: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        startDate: { type: Date, default: Date.now },
        endDate: { type: Date }, // null = encargado actual
      },
    ],

    // 🕒 Horarios de atención
    openingHours: {
      type: String, // Ej: "Lun-Sab 9:00-19:00"
    },

    // 🧾 Información fiscal
    taxInfo: {
      ruc: { type: String, trim: true },
      razonSocial: { type: String, trim: true },
    },

    // ⚙️ Configuración de la tienda
    settings: {
      currency: { type: String, default: "PEN" },
      timezone: { type: String, default: "America/Lima" },
      allowNegativeStock: { type: Boolean, default: false },
    },

    // Estado de la tienda
    isActive: {
      type: Boolean,
      default: true,
    },

    // 📝 Auditoría
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    fechaRegistro: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tienda", tiendaSchema);
