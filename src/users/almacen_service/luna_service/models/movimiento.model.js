const mongoose = require("mongoose");
const { Schema } = mongoose;

const movimientoSchema = new Schema(
  {
    // Información básica del movimiento
    tipo: {
      type: String,
      enum: ["luna", "montura", "accesorio", "material", "otro"],
      required: [true, "El tipo de movimiento es obligatorio."],
      index: true,
    },
    referencia: {
      type: Schema.Types.ObjectId,
      required: [true, "La referencia es obligatoria."],
      refPath: "tipo",
      index: true,
    },
    tipoMovimiento: {
      type: String,
      enum: ["ingreso", "salida", "ajuste", "transferencia", "devolucion"],
      required: [true, "El tipo de movimiento es obligatorio."],
    },
    subtipo: {
      type: String,
      enum: [
        "compra",
        "venta",
        "consumo",
        "perdida",
        "rotura",
        "donacion",
        "traslado",
        "inventario",
        null,
      ],
      default: null,
    },

    cantidad: {
      type: Number,
      required: [true, "La cantidad es obligatoria."],
      min: [0.01, "La cantidad debe ser mayor a 0."],
      get: (v) => parseFloat(v.toFixed(2)),
      set: (v) => {
        // Convertir a número de manera más robusta
        let num;
        if (typeof v === "string") {
          // Eliminar cualquier caracter no numérico excepto punto decimal
          const cleaned = v.replace(/[^0-9.]/g, "");
          num = parseFloat(cleaned);
        } else {
          num = Number(v);
        }

        // Verificar si es un número válido
        if (isNaN(num)) {
          throw new Error(
            `Valor no numérico proporcionado para cantidad: ${v}`
          );
        }

        // Redondear a 2 decimales
        return parseFloat(num.toFixed(2));
      },
    },

    // Información de ubicación
    ubicacionOrigen: {
      type: Schema.Types.ObjectId,
      ref: "Almacen",
    },
    ubicacionDestino: {
      type: Schema.Types.ObjectId,
      ref: "Almacen",
    },

    // Documentos relacionados
    documentoRelacionado: {
      tipo: {
        type: String,
        enum: [
          "orden-compra",
          "factura",
          "remision",
          "requisicion",
          "inventario",
          "ot",
          null,
        ],
        default: null,
      },
      referencia: {
        type: String,
        trim: true,
        uppercase: true,
      },
      fecha: Date,
    },
    // Auditoría y trazabilidad
    registradoPor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "El usuario que registra el movimiento es obligatorio."],
    },
    autorizadoPor: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    fechaMovimiento: {
      type: Date,
      default: Date.now,
      index: true,
    },
    estado: {
      type: String,
      enum: ["pendiente", "completado", "cancelado", "reversado"],
      default: "completado",
    },

    // Campos adicionales
    notas: {
      type: String,
      trim: true,
      maxlength: [500, "Las notas no pueden exceder los 500 caracteres."],
    },

    // Campos técnicos
    correlativo: {
      type: String,
      unique: true,
      index: true,
    },
    esAjuste: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { getters: true, virtuals: true },
  }
);

// Middleware para generar correlativo antes de guardar
movimientoSchema.pre("save", async function (next) {
  if (!this.correlativo) {
    const Movimiento = mongoose.model("Movimiento");
    const count = await Movimiento.countDocuments();
    this.correlativo = `MOV-${(count + 1).toString().padStart(6, "0")}`;
  }
  next();
});

// Virtual para calcular el costo total si no está definido
movimientoSchema.virtual("costoCalculado").get(function () {
  return this.costoTotal || this.cantidad * (this.precioUnitario || 0);
});

// Índices compuestos para mejor rendimiento en consultas frecuentes
movimientoSchema.index({ tipo: 1, referencia: 1 });
movimientoSchema.index({ tipoMovimiento: 1, fechaMovimiento: -1 });
movimientoSchema.index({
  "documentoRelacionado.tipo": 1,
  "documentoRelacionado.referencia": 1,
});

// Método para verificar disponibilidad de stock
movimientoSchema.methods.verificarDisponibilidad = async function () {
  if (this.tipoMovimiento === "salida") {
    const Inventario = mongoose.model("Inventario");
    const stock = await Inventario.findOne({
      tipo: this.tipo,
      referencia: this.referencia,
    });

    if (!stock || stock.cantidad < this.cantidad) {
      throw new Error(
        `Stock insuficiente para ${this.tipo}. Disponible: ${
          stock?.cantidad || 0
        }, Requerido: ${this.cantidad}`
      );
    }
  }
  return true;
};

// Método estático para movimientos por rango de fechas
movimientoSchema.statics.porRangoFechas = function (desde, hasta) {
  return this.find({
    fechaMovimiento: {
      $gte: new Date(desde),
      $lte: new Date(hasta),
    },
  }).sort({ fechaMovimiento: 1 });
};

const Movimiento = mongoose.model("Movimiento", movimientoSchema);

module.exports = Movimiento;
