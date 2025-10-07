// models/auditLog.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    // Entidad afectada
    entityType: {
      type: String,
      enum: ["Category", "Product", "User", "System"],
      required: true,
    },
    entityId: { type: Schema.Types.ObjectId, required: true },

    // Acción realizada
    action: {
      type: String,
      enum: ["create", "update", "delete", "restore", "status_change"],
      required: true,
    },

    // Cambios realizados
    changes: {
      before: Schema.Types.Mixed, // Estado anterior
      after: Schema.Types.Mixed, // Estado nuevo
      updatedFields: [String], // Campos modificados
    },

    // Metadata
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ipAddress: String,
    userAgent: String,

    // Información adicional
    description: String,
    relatedDocument: String,
  },
  {
    timestamps: true,
  }
);

// Índices para mejor performance
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);
module.exports = AuditLog;
