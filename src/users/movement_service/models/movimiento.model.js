const mongoose = require("mongoose");
const { Schema } = mongoose;

const movimientoSchema = new Schema(
  {
    // Referencias al producto
    referenceType: {
      type: String,
      enum: ["Product", "Variant", "Measure", "Sale"], // 🔹 EXPANDIR para todos los tipos
      default: "Product",
    },
    productId: { type: Schema.Types.ObjectId, ref: "Product" }, // 🔹 HACER OPCIONAL
    variantId: { type: Schema.Types.ObjectId, ref: "Variant" },
    measureId: { type: Schema.Types.ObjectId, ref: "Measure" },
    saleId: { type: Schema.Types.ObjectId, ref: "Sale" }, // 🔹 NUEVO

    // Tipo de movimiento
    movementType: {
      type: String,
      enum: ["income", "outflow", "adjustment", "transfer", "return"],
      required: true,
    },
    subType: {
      type: String,
      enum: [
        "purchase",
        "sale",
        "consumption",
        "loss",
        "breakage",
        "donation",
        "transfer",
        "inventory",
        "initial", // 🔹 NUEVO para stock inicial
        null,
      ],
      default: null,
    },

    // Cantidad
    quantity: { type: Number, required: true, min: 0.01 },

    // Ubicación
    originLocation: { type: Schema.Types.ObjectId, ref: "Warehouse" },
    destinationLocation: { type: Schema.Types.ObjectId, ref: "Warehouse" },

    // Documentos relacionados
    relatedDocument: {
      type: {
        type: String,
        enum: [
          "purchase-order",
          "invoice",
          "delivery-note",
          "requisition",
          "inventory",
          "ot",
          "sale", // 🔹 NUEVO
          "variant", // 🔹 NUEVO
          "measure", // 🔹 NUEVO
          null,
        ],
        default: null,
      },
      reference: { type: String, trim: true, uppercase: true },
      date: Date,
    },

    // Auditoría
    registeredBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorizedBy: { type: Schema.Types.ObjectId, ref: "User" },
    movementDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["pending", "completed", "canceled", "reversed"],
      default: "completed",
    },

    // Otros campos
    notes: { type: String, trim: true, maxlength: 500 },

    // 🔹 CAMBIO: Quitar unique y sparse
    correlativo: {
      type: String,
      // unique: true, // ❌ REMOVER
      // sparse: true, // ❌ REMOVER
    },

    serialNumber: {
      type: String,
      // unique: true // ❌ REMOVER
    },
    isAdjustment: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { getters: true, virtuals: true },
  }
);

// 🔹 NUEVA FUNCIÓN PARA GENERAR CORRELATIVOS
movimientoSchema.statics.generateCorrelativo = async function () {
  const Movimiento = this;

  // Buscar el máximo correlativo numérico existente
  const maxDoc = await Movimiento.findOne({
    correlativo: { $regex: /^MV-\d+$/ }, // 🔹 CAMBIAR A MV
  })
    .sort({ correlativo: -1 })
    .select("correlativo");

  let nextNumber = 1;
  if (maxDoc && maxDoc.correlativo) {
    const match = maxDoc.correlativo.match(/MV-(\d+)/);
    if (match) nextNumber = parseInt(match[1]) + 1;
  }

  return `MV-${nextNumber.toString().padStart(6, "0")}`;
};

// 🔹 NUEVA FUNCIÓN PARA GENERAR SERIAL
movimientoSchema.statics.generateSerialNumber = async function () {
  const count = await this.countDocuments();
  return `MOV-${(count + 1).toString().padStart(6, "0")}`;
};

// 🔹 MIDDLEWARE ACTUALIZADO (solo para save())
movimientoSchema.pre("save", async function (next) {
  try {
    // Solo generar si no existen
    if (!this.serialNumber) {
      this.serialNumber = await this.constructor.generateSerialNumber();
    }

    if (!this.correlativo) {
      this.correlativo = await this.constructor.generateCorrelativo();
    }

    next();
  } catch (error) {
    console.error("Error en middleware de Movimiento:", error);
    next(error);
  }
});

// 🔹 Índices
movimientoSchema.index({ productId: 1, movementDate: -1 });
movimientoSchema.index({ variantId: 1, movementDate: -1 });
movimientoSchema.index({ measureId: 1, movementDate: -1 });
movimientoSchema.index({ saleId: 1, movementDate: -1 });
movimientoSchema.index({ movementType: 1, status: 1 });
movimientoSchema.index({ "relatedDocument.reference": 1 });
movimientoSchema.index({ correlativo: 1 });

const Movimiento = mongoose.model("Movimiento", movimientoSchema);
module.exports = Movimiento;
