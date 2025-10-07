const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
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
    lowercase: true,
    trim: true,
  },
  celular: {
    type: String,
    match: [
      /^9\d{8}$/,
      "Número inválido (Debe empezar con 9 y tener 9 dígitos)",
    ],
  },
  direccion: {
    calle: { type: String, trim: true },
    distrito: { type: String, trim: true },
    ciudad: { type: String, trim: true, default: "Lima" },
    referencia: { type: String, trim: true },
  },
  fechaRegistro: { type: Date, default: Date.now },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // empleado que registró
  estado: { type: Boolean, default: true },
});

const Client = mongoose.model("Client", clientSchema);

module.exports = Client;
