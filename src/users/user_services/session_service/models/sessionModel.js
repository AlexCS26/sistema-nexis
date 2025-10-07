const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    accessToken: {
      type: String,
      required: true,
    },

    // 🔹 Historial de accessToken
    tokens: {
      type: [String],
      default: [],
    },

    refreshToken: {
      type: String,
      required: true,
    },

    ip: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },

    estado: {
      type: String,
      enum: ["activa", "revocada", "expirada"],
      default: "activa",
    },

    creadoEn: {
      type: Date,
      default: Date.now,
    },

    ultimaActividad: {
      type: Date,
      default: Date.now,
    },

    expiraEn: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true, // agrega createdAt y updatedAt automáticamente
  }
);

// 🔹 Quitar índice TTL para que no se elimine automáticamente
// sessionSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });

// 🔹 Middleware para actualizar `ultimaActividad` en cada save/update
sessionSchema.pre("save", function (next) {
  this.ultimaActividad = new Date();
  next();
});

// 🔹 Método para verificar si la sesión expiró
sessionSchema.methods.estaExpirada = function () {
  return new Date() > this.expiraEn;
};

const Session = mongoose.model("Session", sessionSchema);

module.exports = Session;
