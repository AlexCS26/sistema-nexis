const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const ventaSchema = new mongoose.Schema(
  {
    // Datos principales
    ot: {
      type: String,
      required: true,
      unique: true,
    },
    paciente: {
      nombres: { type: String, required: true },
      apellidos: { type: String, required: true },
      telefono: String,
    },

    // Productos (referencias)
    montura: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Montura",
      required: true,
    },
    luna: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Luna",
      required: true,
    },

    // Datos de la transacción
    vendedora: { type: String, required: true },
    optometra: String,
    totalVenta: { type: Number, required: true },
    tienda: {
      type: String,
      enum: ["MIRIAM_BOLIVAR", "ZARA_HUARAL", "OTRA_TIENDA"],
      required: true,
    },

    // Pagos y estado financiero
    // En tu modelo de Venta, modifica el esquema de pagos:
    pagos: [
      {
        monto: {
          type: Number,
          required: true,
          min: 0, // Asegura que el monto sea positivo
        },
        tipo: {
          type: String,
          enum: ["INGRESO", "A_CUENTA", "SEPARACION"],
          required: true,
          default: "INGRESO", // Valor por defecto
        },
        fecha: {
          type: Date,
          default: Date.now,
          required: true,
        },
        comprobante: {
          type: String,
          default: undefined, // Permite valores undefined
        },
      },
    ],
    saldoPendiente: {
      type: Number,
      default: function () {
        return this.totalVenta;
      },
    },
    porcentajePagado: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
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
    timestamps: true, // Añade createdAt y updatedAt automáticamente
    toJSON: { virtuals: true }, // Para incluir virtuals al convertir a JSON
    toObject: { virtuals: true }, // Para incluir virtuals al convertir a objeto
  }
);

// Plugin de paginación (IMPORTANTE: Debe ir antes de crear el modelo)
ventaSchema.plugin(mongoosePaginate);

// Virtual para nombre completo del paciente
ventaSchema.virtual("paciente.nombreCompleto").get(function () {
  return `${this.paciente.nombres} ${this.paciente.apellidos}`;
});

// Middleware para actualización automática
ventaSchema.pre("save", async function (next) {
  this.ultimaActualizacion = new Date();

  if (this.isModified("pagos")) {
    const totalPagado = this.pagos.reduce((sum, pago) => sum + pago.monto, 0);
    this.saldoPendiente = this.totalVenta - totalPagado;
    this.porcentajePagado = parseFloat(
      ((totalPagado / this.totalVenta) * 100).toFixed(2)
    );

    // Determinar tipo de documento a generar
    const primerPago = this.pagos[0];
    if (primerPago) {
      const esSeparacion =
        this.porcentajePagado < 50 && primerPago.tipo === "SEPARACION";
      const esRecojo =
        this.porcentajePagado >= 50 && primerPago.tipo === "INGRESO";

      if ((esSeparacion || esRecojo) && !this.recojos.length) {
        const tipoRecojo = esRecojo ? "RECOJO" : "SEPARACION";
        await this.crearRecojo(tipoRecojo);
      }
    }

    if (this.saldoPendiente <= 0) {
      this.fechaCancelacion = new Date();
    }
  }
  next();
});

// Método para crear recojos/separaciones
ventaSchema.methods.crearRecojo = async function (tipo = "RECOJO") {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const RecojoOptica = mongoose.model("RecojoOptica");
    const recojosCount = await RecojoOptica.countDocuments({ tipo }).session(
      session
    );

    const nuevoRecojo = new RecojoOptica({
      tipo,
      numero: recojosCount + 1,
      fechaCompra: this.fechaVenta,
      ordenTrabajo: this.ot,
      nombreApellido: `${this.paciente.apellidos} ${this.paciente.nombres}`,
      productos: {
        montura: this.montura,
        luna: this.luna,
        descripcion: `Montura: ${this.montura.codigo} | Lunas: ${this.luna.codigo}`,
      },
      total: this.totalVenta,
      saldo: this.saldoPendiente,
      porcentajePagado: this.porcentajePagado,
      tienda: this.tienda,
      estado: this.estadoEntrega,
      adelantos: this.pagos.map((pago) => ({
        fecha: pago.fecha,
        ordenTrabajo: this.ot,
        importe: pago.monto,
        saldo: this.totalVenta - pago.monto,
      })),
    });

    this.recojos.push(nuevoRecojo._id);

    await Promise.all([nuevoRecojo.save({ session }), this.save({ session })]);

    await session.commitTransaction();
    return nuevoRecojo;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Sincronización de estados
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

// Índices para mejorar el rendimiento de las consultas
ventaSchema.index({ ot: 1 }); // Índice único ya que es campo unique
ventaSchema.index({ "paciente.nombres": 1, "paciente.apellidos": 1 });
ventaSchema.index({ fechaVenta: -1 });
ventaSchema.index({ tienda: 1, estadoEntrega: 1 });

const Venta = mongoose.model("Venta", ventaSchema);
module.exports = Venta;
