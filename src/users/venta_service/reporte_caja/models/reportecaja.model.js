const mongoose = require("mongoose");

const reporteCajaSchema = new mongoose.Schema({
  fechaCierre: {
    type: Date,
    default: Date.now,
    index: true,
  },
  apertura: {
    montoInicial: Number,
    responsable: String,
    horaApertura: Date,
  },
  cierre: {
    montoFinal: Number,
    responsable: String,
    horaCierre: Date,
    observaciones: String,
  },
  movimientos: [
    {
      ventaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Venta",
        required: true,
      },
      tipoMovimiento: {
        type: String,
        enum: ["INGRESO", "EGRESO", "AJUSTE"],
        required: true,
      },
      monto: {
        type: Number,
        required: true,
      },
      metodoPago: {
        type: String,
        enum: ["EFECTIVO", "TARJETA", "TRANSFERENCIA"],
      },
      comprobante: String,
    },
  ],
  resumen: {
    totalVentas: Number,
    totalEgresos: Number,
    saldoFinal: Number,
    diferencia: Number,
  },
});

// Middleware para cálculos automáticos
reporteCajaSchema.pre("save", function (next) {
  const ingresos = this.movimientos
    .filter((m) => m.tipoMovimiento === "INGRESO")
    .reduce((sum, m) => sum + m.monto, 0);

  const egresos = this.movimientos
    .filter((m) => m.tipoMovimiento === "EGRESO")
    .reduce((sum, m) => sum + m.monto, 0);

  this.resumen = {
    totalVentas: ingresos,
    totalEgresos: egresos,
    saldoFinal: ingresos - egresos,
    diferencia:
      (this.cierre.montoFinal || 0) -
      (this.apertura.montoInicial || 0) -
      (ingresos - egresos),
  };

  next();
});
module.exports = mongoose.model("ReporteCaja", reporteCajaSchema);
