const Movimiento = require("../movement_service/models/movimiento.model");

/**
 * Helper para crear movimientos de forma consistente
 * Maneja automáticamente la generación de correlativos
 */

class MovementHelper {
  /**
   * Crear múltiples movimientos ejecutando save() individualmente
   */
  static async createMovements(movementsData) {
    // 🔹 QUITAR session parameter
    try {
      const movements = [];

      console.log(`🔄 Creando ${movementsData.length} movimiento(s)...`);

      for (let i = 0; i < movementsData.length; i++) {
        const data = movementsData[i];
        console.log(
          `📝 Procesando movimiento ${i + 1}/${movementsData.length}:`,
          {
            referenceType: data.referenceType,
            movementType: data.movementType,
            quantity: data.quantity,
          }
        );

        const movimiento = new Movimiento(data);
        await movimiento.save(); // 🔹 QUITAR options/session
        movements.push(movimiento);

        console.log(`✅ Movimiento ${i + 1} creado:`, movimiento.correlativo);

        // 🔹 Pequeña pausa para evitar condiciones de carrera
        if (i < movementsData.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      console.log(`🎉 ${movements.length} movimiento(s) creados exitosamente`);
      return movements;
    } catch (error) {
      console.error("❌ Error en createMovements:", error);
      throw error;
    }
  }

  /**
   * Crear movimiento de stock inicial para variante
   */
  static async createInitialStockMovement(
    variant,
    zoneStock,
    user
    // 🔹 QUITAR session parameter
  ) {
    const movementData = {
      referenceType: "Variant",
      productId: variant.productId,
      variantId: variant._id,
      movementType: "income",
      subType: "initial",
      quantity: zoneStock.stock,
      originLocation: zoneStock.zoneId,
      registeredBy: user.userId || user._id,
      movementDate: new Date(),
      status: "completed",
      notes: `Creación de variante ${variant.code} - Stock inicial en zona ${zoneStock.zoneCode}`,
      relatedDocument: {
        type: "variant",
        reference: `VAR-${variant._id.toString().slice(-6)}`,
        date: new Date(),
      },
    };

    return await this.createMovements([movementData]); // 🔹 QUITAR session
  }

  /**
   * Crear movimiento de ajuste de stock
   */
  static async createStockAdjustmentMovement(
    variant,
    zoneStock,
    oldStock,
    newStock,
    user
    // 🔹 QUITAR session parameter
  ) {
    const difference = newStock - oldStock;

    if (difference === 0) return []; // No hay cambio

    const movementData = {
      referenceType: "Variant",
      productId: variant.productId,
      variantId: variant._id,
      movementType: difference > 0 ? "income" : "outflow",
      subType: "adjustment",
      quantity: Math.abs(difference),
      originLocation: zoneStock.zoneId,
      registeredBy: user.userId || user._id,
      movementDate: new Date(),
      status: "completed",
      notes: `Ajuste de variante ${variant.code} - ${
        difference > 0 ? "Incremento" : "Decremento"
      } en zona ${zoneStock.zoneCode} (${oldStock} → ${newStock})`,
      relatedDocument: {
        type: "inventory",
        reference: `VAR-ADJ-${variant._id.toString().slice(-6)}`,
        date: new Date(),
      },
      isAdjustment: true,
    };

    return await this.createMovements([movementData]); // 🔹 QUITAR session
  }

  /**
   * Crear movimiento de eliminación de variante
   */
  static async createDeletionMovement(
    variant,
    zoneStock,
    user
    // 🔹 QUITAR session parameter
  ) {
    if (zoneStock.stock <= 0) return [];

    const movementData = {
      referenceType: "Variant",
      productId: variant.productId,
      variantId: variant._id,
      movementType: "outflow",
      subType: "adjustment",
      quantity: zoneStock.stock,
      originLocation: zoneStock.zoneId,
      registeredBy: user.userId || user._id,
      movementDate: new Date(),
      status: "completed",
      notes: `Eliminación de variante ${variant.code} - Stock removido de zona ${zoneStock.zoneCode}`,
      relatedDocument: {
        type: "inventory",
        reference: `VAR-DEL-${variant._id.toString().slice(-6)}`,
        date: new Date(),
      },
      isAdjustment: true,
    };

    return await this.createMovements([movementData]); // 🔹 QUITAR session
  }

  /**
   * Crear movimientos de venta
   */
  static async createSaleMovements(saleItems, sale, user) {
    // 🔹 QUITAR session parameter
    const movementsData = saleItems.map((item) => ({
      referenceType: "Sale",
      saleId: sale._id,
      productId: item.productId,
      variantId: item.variantId,
      movementType: "outflow",
      subType: "sale",
      quantity: item.quantity,
      originLocation: item.zoneId, // Zona de donde se vende
      registeredBy: user.userId || user._id,
      movementDate: new Date(),
      status: "completed",
      notes: `Venta ${sale.code} - ${item.productName}${
        item.variantCode ? ` (${item.variantCode})` : ""
      }`,
      relatedDocument: {
        type: "sale",
        reference: sale.code || `SALE-${sale._id.toString().slice(-6)}`,
        date: sale.date || new Date(),
      },
    }));

    return await this.createMovements(movementsData); // 🔹 QUITAR session
  }

  /**
   * Obtener movimientos por referencia
   */
  static async getMovementsByReference(
    referenceType,
    referenceId,
    options = {}
  ) {
    const query = { [referenceType.toLowerCase() + "Id"]: referenceId };

    if (options.dateRange) {
      query.movementDate = {
        $gte: options.dateRange.start,
        $lte: options.dateRange.end,
      };
    }

    return await Movimiento.find(query)
      .populate("originLocation", "code name")
      .populate("registeredBy", "name email")
      .sort({ movementDate: -1, createdAt: -1 });
  }

  /**
   * Crear movimiento de stock inicial para medida
   */
  static async createInitialStockMovementForMeasure(measure, zoneStock, user) {
    const movementData = {
      referenceType: "Measure", // 🔹 CAMBIAR a Measure
      productId: measure.productId,
      measureId: measure._id, // 🔹 CAMBIAR a measureId
      movementType: "income",
      subType: "initial",
      quantity: zoneStock.stock,
      originLocation: zoneStock.zoneId,
      registeredBy: user.userId || user._id,
      movementDate: new Date(),
      status: "completed",
      notes: `Creación de medida ${measure.code} - Stock inicial en zona ${zoneStock.zoneCode}`,
      relatedDocument: {
        type: "measure", // 🔹 CAMBIAR a measure
        reference: `MEA-${measure._id.toString().slice(-6)}`,
        date: new Date(),
      },
    };

    return await this.createMovements([movementData]);
  }

  /**
   * Crear movimiento de ajuste de stock para medida
   */
  static async createStockAdjustmentMovementForMeasure(
    measure,
    zoneStock,
    oldStock,
    newStock,
    user
  ) {
    const difference = newStock - oldStock;

    if (difference === 0) return [];

    const movementData = {
      referenceType: "Measure",
      productId: measure.productId,
      measureId: measure._id,
      movementType: difference > 0 ? "income" : "outflow",
      subType: "adjustment",
      quantity: Math.abs(difference),
      originLocation: zoneStock.zoneId,
      registeredBy: user.userId || user._id,
      movementDate: new Date(),
      status: "completed",
      notes: `Ajuste de medida ${measure.code} - ${
        difference > 0 ? "Incremento" : "Decremento"
      } en zona ${zoneStock.zoneCode} (${oldStock} → ${newStock})`,
      relatedDocument: {
        type: "inventory",
        reference: `MEA-ADJ-${measure._id.toString().slice(-6)}`,
        date: new Date(),
      },
      isAdjustment: true,
    };

    return await this.createMovements([movementData]);
  }

  /**
   * Crear movimiento de eliminación de medida
   */
  static async createDeletionMovementForMeasure(measure, zoneStock, user) {
    if (zoneStock.stock <= 0) return [];

    const movementData = {
      referenceType: "Measure",
      productId: measure.productId,
      measureId: measure._id,
      movementType: "outflow",
      subType: "adjustment",
      quantity: zoneStock.stock,
      originLocation: zoneStock.zoneId,
      registeredBy: user.userId || user._id,
      movementDate: new Date(),
      status: "completed",
      notes: `Eliminación de medida ${measure.code} - Stock removido de zona ${zoneStock.zoneCode}`,
      relatedDocument: {
        type: "inventory",
        reference: `MEA-DEL-${measure._id.toString().slice(-6)}`,
        date: new Date(),
      },
      isAdjustment: true,
    };

    return await this.createMovements([movementData]);
  }
}

module.exports = MovementHelper;
