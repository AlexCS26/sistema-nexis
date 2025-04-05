const mongoose = require("mongoose");

const asistenciaSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  dni: {
    type: String,
    required: true,
    minlength: 8,
    maxlength: 8,
  },
  fecha: {
    type: Date,
    default: Date.now,
  },
  horaEntrada: {
    type: String,
    required: true,
  },
  horaSalida: {
    type: String,
    required: false,
  },
  estado: {
    type: String,
    enum: ["Puntual", "Tardanza", "Falta"],
    required: true,
  },
  tipoJornada: {
    type: String,
    enum: ["Completa", "Medio Día", "Turno Especial"],
    required: true,
  },
  validadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  observaciones: {
    type: String,
    required: false,
    trim: true,
  },
  ubicacion: {
    latitud: { type: Number, required: false },
    longitud: { type: Number, required: false },
  },
});

const Asistencia = mongoose.model("Asistencia", asistenciaSchema);

// ✅ Exportar correctamente en CommonJS
module.exports = Asistencia;
