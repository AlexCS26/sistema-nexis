const mongoose = require("mongoose");

const inventarioSchema = new mongoose.Schema(
  {
    luna: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Luna",
      required: true,
    },
    estadoLuna: {
      type: String,
      enum: ["nuevo", "usado", "en reparación"],
      required: true,
    },
    tipoMovimiento: {
      type: String,
      enum: ["ingreso", "salida"],
      required: true,
    },
    cantidad: {
      type: Number,
      required: true,
      min: [1, "Debe ingresar al menos 1 unidad."],
    },
    ot: {
      type: String,
      required: true,
      trim: true,
    },
    tienda: {
      type: String,
      required: true,
      trim: true,
    },
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🔹 Información del cliente
    nombreCliente: {
      type: String,
      required: true,
      trim: true,
    },
    dniCliente: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{8}$/, "El DNI debe tener 8 dígitos."],
    },
    telefonoCliente: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{9}$/, "El teléfono debe tener 9 dígitos."],
    },
    emailCliente: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Debe ingresar un correo electrónico válido."],
    },

    // 🔹 Información de receta y optometrista
    doctor: {
      type: String,
      trim: true,
      required: true,
    },
    receta: {
      esferaOD: { type: String, trim: true },
      esferaOI: { type: String, trim: true },
      cilindroOD: { type: String, trim: true },
      cilindroOI: { type: String, trim: true },
      ejeOD: { type: String, trim: true },
      ejeOI: { type: String, trim: true },
      adicion: { type: String, trim: true },
    },
    // 🔹 Información de pago
    tipoPago: {
      type: String,
      enum: ["Efectivo", "Tarjeta", "Transferencia", "Otro"],
      required: true,
    },
    precioUnitario: {
      type: Number,
      required: true,
      min: [0, "El precio debe ser un valor positivo."],
    },
    total: {
      type: Number,
      required: true,
      min: [0, "El total debe ser un valor positivo."],
    },

    // 🔹 Proveedor (para controlar de dónde vienen las lunas)
    proveedor: {
      type: String,
      trim: true,
    },

    // 🔹 Otros datos
    observaciones: {
      type: String,
      trim: true,
    },
    fechaMovimiento: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Inventario = mongoose.model("Inventario", inventarioSchema);
module.exports = Inventario;
