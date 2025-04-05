const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  apellido: { type: String, required: true, trim: true },
  dni: {
    type: String,
    required: true,
    unique: true,
    minlength: 8,
    maxlength: 8,
  },
  correo: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  celular: {
    type: String,
    required: true,
    match: [
      /^9\d{8}$/,
      "Número inválido (Debe empezar con 9 y tener 9 dígitos)",
    ],
  },
  fechaNacimiento: { type: Date, required: true },

  direccion: {
    calle: { type: String, trim: true },
    distrito: { type: String, trim: true },
    ciudad: { type: String, trim: true, default: "Lima" },
    referencia: { type: String, trim: true },
  },

  rol: {
    type: String,
    enum: ["admin", "optometrista", "vendedor", "almacen", "supervisor"],
    required: true,
  },

  datosVendedora: {
    sueldoBase: { type: Number, min: 0 },
    comisionPorVenta: { type: Number, min: 0, max: 1 }, // Ej: 0.05 (5%)
    metaMensual: { type: Number, min: 0 },
  },

  credenciales: {
    passwordHash: { type: String, required: true },
    tokenRecuperacion: { type: String },
    fechaUltimoAcceso: { type: Date, default: Date.now },
  },

  avatarUrl: {
    type: String,
    default:
      "https://ui-avatars.com/api/?name=Usuario&background=random&color=fff",
  },

  estado: { type: Boolean, default: true },
  fechaRegistro: { type: Date, default: Date.now },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
