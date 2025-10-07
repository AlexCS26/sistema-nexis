const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const { PaymentMethods } = require("../../../constants/PaymentMethods"); // enum de métodos de pago

const ventaSchema = new mongoose.Schema(
  {
    // Datos principales
    ot: {
      type: String,
      required: true,
      unique: true,
    },
    paciente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client", // referencia al cliente
      required: true,
    },

    // Items de venta: productos, variantes o medidas
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Variant" }, // opcional
        measureId: { type: mongoose.Schema.Types.ObjectId, ref: "Measure" }, // opcional
        quantity: { type: Number, default: 1 },
        unitPrice: { type: Number, required: true }, // precio aplicado en esta venta
        totalPrice: { type: Number, required: true }, // unitPrice * quantity
      },
    ],

    // Datos de la transacción
    vendedora: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    optometra: String,
    totalVenta: { type: Number, required: true },
    tienda: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tienda",
      required: true,
    },

    // Pagos y estado financiero
    pagos: [
      {
        monto: { type: Number, required: true, min: 0 },
        metodo: {
          type: String,
          enum: Object.keys(PaymentMethods),
          required: true,
        },
        fecha: { type: Date, default: Date.now, required: true },
        comprobante: { type: String, default: undefined },
      },
    ],
    saldoPendiente: {
      type: Number,
      default: function () {
        return this.totalVenta;
      },
    },
    porcentajePagado: { type: Number, default: 0, min: 0, max: 100 },
    fechaCancelacion: Date,

    // Integración con Recojo/Separación
    recojos: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "RecojoOptica",
      },
    ],
    estadoEntrega: {
      type: String,
      enum: ["EN_TIENDA", "EN_LABORATORIO", "ENTREGADO"],
      default: "EN_TIENDA",
    },
    detallesEntrega: {
      fecha: Date,
      recibidoPor: String,
      encargada: String,
    },

    // Auditoría
    fechaVenta: { type: Date, default: Date.now },
    ultimaActualizacion: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Plugin de paginación
ventaSchema.plugin(mongoosePaginate);

// Virtual para nombre completo del paciente
ventaSchema.virtual("pacienteNombreCompleto").get(function () {
  if (!this.paciente) return "";
  return `${this.paciente.nombre || ""} ${this.paciente.apellido || ""}`.trim();
});

// Middleware para mantener actualizada la fecha de modificación
ventaSchema.pre("save", function (next) {
  this.ultimaActualizacion = new Date();
  next();
});

// Sincronización de estadoEntrega con RecojoOptica
ventaSchema.post("findOneAndUpdate", async function (doc) {
  if (doc && doc.estadoEntrega && doc.recojos && doc.recojos.length) {
    await mongoose
      .model("RecojoOptica")
      .updateMany(
        { _id: { $in: doc.recojos } },
        { $set: { estado: doc.estadoEntrega } }
      );
  }
});

// Índices para rendimiento
ventaSchema.index({ ot: 1 });
ventaSchema.index({ fechaVenta: -1 });
ventaSchema.index({ tienda: 1, estadoEntrega: 1 });

const Venta = mongoose.model("Venta", ventaSchema);
module.exports = Venta;
