const mongoose = require("mongoose");
const Venta = require("../models/venta.model");
const RecojoOptica = require("../../../almacen_service/recojos_service/models/recojos.model");
const Product = require("../../../product_services/product_service/models/product.model");
const Measure = require("../../../product_services/measure_service/models/measure.model");
const Variant = require("../../../product_services/variant_service/models/variant.model");
const Tienda = require("../../../tienda_services/tienda_service/models/tienda.model");
const Counter = require("../../../utils/counter.model");
const MovementHelper = require("../../../utils/movementHelper");
const Client = require("../../../client_service/client_service/models/client.model");
const { updateProductStock } = require("../../../utils/updateProductStock");
const { PaymentMethods } = require("../../../constants/PaymentMethods");

class VentaService {
  /**
   * Crear una nueva venta con OT automática
   * @param {Object} ventaData - Datos de la venta
   * @param {Object} usuario - Usuario que realiza la venta
   * @returns {Promise<Object>} Venta creada
   */
  static async crearVenta(ventaData, usuario) {
    const session = await mongoose.startSession();

    try {
      let ventaResult = null;

      await session.withTransaction(async () => {
        // 1. Validaciones iniciales
        const { paciente, tienda } = await this.validarDatosVenta(
          ventaData,
          session
        );

        // 2. Generar número de OT
        const ot = await this.generarNumeroOT(session);

        // 3. Obtener datos de productos relacionados
        const { productoMap, variantMap, measureMap } =
          await this.obtenerDatosProductos(ventaData.items, session);

        // 4. Procesar items y calcular totales
        const {
          items,
          saleItemsForMovements,
          stockUpdateOperations,
          totalVenta,
        } = await this.procesarItemsYStocks(
          ventaData.items,
          productoMap,
          variantMap,
          measureMap
        );

        // 5. Actualizar stocks
        await this.ejecutarActualizacionesStock(stockUpdateOperations, session);

        // 6. Procesar pagos
        const {
          pagosValidados,
          totalPagado,
          saldoPendiente,
          porcentajePagado,
        } = this.procesarPagos(ventaData.pagos, ot, totalVenta);

        // 7. Crear documento de venta
        const nuevaVenta = await this.crearDocumentoVenta(
          {
            ...ventaData,
            ot,
            items,
            totalVenta,
            pagos: pagosValidados,
            saldoPendiente,
            porcentajePagado,
            pacienteNombreCompleto: `${paciente.nombre} ${paciente.apellido}`,
          },
          session
        );

        // 8. Ejecutar operaciones posteriores
        await this.ejecutarOperacionesPostVenta(
          nuevaVenta,
          saleItemsForMovements,
          ventaData.items,
          productoMap,
          usuario,
          pagosValidados,
          totalPagado,
          paciente,
          session
        );

        ventaResult = nuevaVenta;
      });

      // 9. Obtener venta completa con populate
      const ventaCompleta = await this.obtenerVentaPorId(ventaResult._id);
      return ventaCompleta;
    } catch (error) {
      console.error("💥 Error en VentaService.crearVenta:", error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Validar datos de la venta
   */
  static async validarDatosVenta(ventaData, session) {
    const { pacienteId, items, tienda } = ventaData;

    // Validaciones básicas
    if (
      !pacienteId ||
      !items ||
      !Array.isArray(items) ||
      items.length === 0 ||
      !tienda
    ) {
      throw new Error("Faltan datos obligatorios: pacienteId, items o tienda");
    }

    // Validar ObjectIds
    if (!mongoose.Types.ObjectId.isValid(pacienteId)) {
      throw new Error("ID de paciente no válido");
    }
    if (!mongoose.Types.ObjectId.isValid(tienda)) {
      throw new Error("ID de tienda no válido");
    }

    // Validar existencia de tienda
    const tiendaExiste = await Tienda.findById(tienda).session(session);
    if (!tiendaExiste) {
      throw new Error(`Tienda no encontrada con ID: ${tienda}`);
    }

    // Validar existencia de paciente
    const paciente = await Client.findById(pacienteId).session(session);
    if (!paciente) {
      throw new Error(`Paciente no encontrado con ID: ${pacienteId}`);
    }

    // Validar campos prohibidos
    const camposProhibidos = [
      "ot",
      "totalVenta",
      "saldoPendiente",
      "porcentajePagado",
    ];
    const camposEnviados = camposProhibidos.filter(
      (campo) => ventaData[campo] !== undefined
    );

    if (camposEnviados.length > 0) {
      throw new Error(`Campos no permitidos: ${camposEnviados.join(", ")}`);
    }

    // Validar que no se envíe unitPrice en items
    for (const item of items) {
      if (item.unitPrice !== undefined) {
        throw new Error(
          "El campo 'unitPrice' no debe ser enviado en los items"
        );
      }
    }

    return { paciente, tienda: tiendaExiste };
  }

  /**
   * Generar número de OT
   */
  static async generarNumeroOT(session) {
    const updatedCounter = await Counter.findOneAndUpdate(
      { _id: "ventaOt" },
      { $inc: { seq: 1 } },
      { new: true, session, upsert: true, setDefaultsOnInsert: true }
    );

    return updatedCounter.seq.toString().padStart(6, "0");
  }

  /**
   * Obtener datos de productos, variantes y medidas
   */
  static async obtenerDatosProductos(itemsData, session) {
    const productIds = [...new Set(itemsData.map((item) => item.productId))];
    const variantIds = [
      ...new Set(itemsData.map((item) => item.variantId).filter(Boolean)),
    ];
    const measureIds = [
      ...new Set(itemsData.map((item) => item.measureId).filter(Boolean)),
    ];

    // Validar ObjectIds de productos
    if (productIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      throw new Error("Uno o más productId no son ObjectId válidos");
    }

    // Consultas en paralelo optimizadas
    const [products, variants, measures] = await Promise.all([
      Product.find({ _id: { $in: productIds } })
        .populate("variants", "code price stockByZone")
        .populate("measures", "sphere cylinder add price stockByZone")
        .select("name code unitPrice stockGeneral variants measures")
        .session(session),
      variantIds.length > 0
        ? Variant.find({ _id: { $in: variantIds } })
            .select("code price stockByZone")
            .session(session)
        : [],
      measureIds.length > 0
        ? Measure.find({ _id: { $in: measureIds } })
            .select("sphere cylinder add price stockByZone")
            .session(session)
        : [],
    ]);

    // Crear mapas para acceso rápido
    const productoMap = new Map(products.map((p) => [p._id.toString(), p]));
    const variantMap = new Map(variants.map((v) => [v._id.toString(), v]));
    const measureMap = new Map(measures.map((m) => [m._id.toString(), m]));

    return { productoMap, variantMap, measureMap };
  }

  /**
   * Procesar items y preparar actualizaciones de stock
   */
  static procesarItemsYStocks(itemsData, productoMap, variantMap, measureMap) {
    const items = [];
    const saleItemsForMovements = [];
    const stockUpdateOperations = [];
    let totalVenta = 0;
    const documentosProcesados = new Map();

    for (const itemData of itemsData) {
      const product = productoMap.get(itemData.productId);
      if (!product) {
        throw new Error(`Producto no encontrado: ${itemData.productId}`);
      }

      // Buscar variante y medida
      const variantData = this.obtenerVariante(
        product,
        itemData.variantId,
        variantMap
      );
      const measureData = this.obtenerMedida(
        product,
        itemData.measureId,
        measureMap
      );

      // Validar zona si es requerida
      const requiereZona = this.productoRequiereZona(product);
      if (requiereZona && !itemData.zoneId) {
        throw new Error(
          `zoneId es requerido para el producto: ${product.code}`
        );
      }

      // Calcular precio y preparar stock
      const { precioFinal, documentoStock } = this.calcularPrecioYPrepararStock(
        product,
        variantData,
        measureData,
        itemData,
        requiereZona
      );

      // Evitar duplicados en operaciones de stock
      if (
        documentoStock &&
        !documentosProcesados.has(documentoStock._id.toString())
      ) {
        stockUpdateOperations.push({ document: documentoStock });
        documentosProcesados.set(documentoStock._id.toString(), true);
      }

      const itemTotal = precioFinal * itemData.quantity;
      totalVenta += itemTotal;

      // Crear item de venta
      const item = {
        productId: product._id,
        variantId: itemData.variantId || undefined,
        measureId: itemData.measureId || undefined,
        quantity: itemData.quantity,
        unitPrice: precioFinal,
        totalPrice: itemTotal,
        zoneId: requiereZona ? itemData.zoneId : undefined,
      };

      items.push(item);

      // Preparar datos para movimientos
      saleItemsForMovements.push({
        productId: product._id,
        variantId: itemData.variantId || null,
        measureId: itemData.measureId || null,
        productName: product.name || product.code,
        variantCode: variantData?.code || null,
        quantity: itemData.quantity,
        zoneId: requiereZona ? itemData.zoneId : null,
      });
    }

    return { items, saleItemsForMovements, stockUpdateOperations, totalVenta };
  }

  /**
   * Obtener variante del producto
   */
  static obtenerVariante(product, variantId, variantMap) {
    if (!variantId) return null;

    const variantData =
      product.variants?.find((v) => v._id.toString() === variantId) ||
      variantMap.get(variantId);

    if (!variantData) throw new Error(`Variante no encontrada: ${variantId}`);
    return variantData;
  }

  /**
   * Obtener medida del producto
   */
  static obtenerMedida(product, measureId, measureMap) {
    if (!measureId) return null;

    const measureData =
      product.measures?.find((m) => m._id.toString() === measureId) ||
      measureMap.get(measureId);

    if (!measureData) throw new Error(`Medida no encontrada: ${measureId}`);
    return measureData;
  }

  /**
   * Calcular precio y preparar stock
   */
  static calcularPrecioYPrepararStock(
    product,
    variantData,
    measureData,
    itemData,
    requiereZona
  ) {
    let precioFinal = product.unitPrice || 0;
    let documentoStock = null;

    if (measureData) {
      // ITEM CON MEDIDA
      precioFinal = this.obtenerPrecioYActualizarStockMedida(
        measureData,
        itemData,
        requiereZona
      );
      documentoStock = measureData;
    } else if (variantData) {
      // ITEM CON VARIANTE
      precioFinal = this.obtenerPrecioYActualizarStockVariante(
        variantData,
        itemData,
        requiereZona
      );
      documentoStock = variantData;
    } else {
      // PRODUCTO BASE
      const esServicio = this.esProductoServicio(product);
      if (!esServicio) {
        product.stockGeneral = Math.max(
          0,
          (product.stockGeneral || 0) - itemData.quantity
        );
        documentoStock = product;
      }
    }

    return { precioFinal, documentoStock };
  }

  /**
   * Obtener precio y actualizar stock para medida
   */
  static obtenerPrecioYActualizarStockMedida(
    measureData,
    itemData,
    requiereZona
  ) {
    if (requiereZona && itemData.zoneId) {
      const zoneStock = measureData.stockByZone.find(
        (sz) => sz.zoneId.toString() === itemData.zoneId
      );
      if (!zoneStock) {
        throw new Error(
          `La medida no tiene stock en la zona: ${itemData.zoneId}`
        );
      }
      zoneStock.stock = Math.max(0, zoneStock.stock - itemData.quantity);
      return zoneStock.price || 0;
    }
    return measureData.price || 0;
  }

  /**
   * Obtener precio y actualizar stock para variante
   */
  static obtenerPrecioYActualizarStockVariante(
    variantData,
    itemData,
    requiereZona
  ) {
    if (requiereZona && itemData.zoneId) {
      const zoneStock = variantData.stockByZone.find(
        (sz) => sz.zoneId.toString() === itemData.zoneId
      );
      if (!zoneStock) {
        throw new Error(
          `La variante no tiene stock en la zona: ${itemData.zoneId}`
        );
      }
      zoneStock.stock = Math.max(0, zoneStock.stock - itemData.quantity);
      return zoneStock.price || 0;
    }
    return variantData.price || 0;
  }

  /**
   * Determinar si es producto servicio
   */
  static esProductoServicio(product) {
    return (
      (!product.variants || product.variants.length === 0) &&
      (!product.measures || product.measures.length === 0) &&
      product.stockGeneral === 0
    );
  }

  /**
   * Determinar si un producto requiere zona
   */
  static productoRequiereZona(product) {
    const tieneVariantesConZona = product.variants?.some(
      (v) => v.stockByZone?.length > 0
    );
    const tieneMedidasConZona = product.measures?.some(
      (m) => m.stockByZone?.length > 0
    );
    return tieneVariantesConZona || tieneMedidasConZona;
  }

  /**
   * Ejecutar actualizaciones de stock
   */
  static async ejecutarActualizacionesStock(stockUpdateOperations, session) {
    for (const operation of stockUpdateOperations) {
      await operation.document.save({ session });
    }
  }

  /**
   * Procesar pagos
   */
  static procesarPagos(pagos, ot, totalVenta) {
    const pagosValidados = (pagos || []).map((pago) => {
      const metodo = (pago.metodo || pago.tipo || "").toUpperCase();
      if (!Object.keys(PaymentMethods).includes(metodo)) {
        throw new Error(`Método de pago no válido: ${metodo}`);
      }
      return {
        monto: Number(pago.monto),
        metodo,
        comprobante: ot,
        fecha: pago.fecha ? new Date(pago.fecha) : new Date(),
      };
    });

    const totalPagado = pagosValidados.reduce((sum, p) => sum + p.monto, 0);

    if (totalPagado > totalVenta) {
      throw new Error(
        `El total pagado (${totalPagado}) no puede superar el total de la venta (${totalVenta})`
      );
    }

    const porcentajePagado = Math.min(
      parseFloat(((totalPagado / (totalVenta || 1)) * 100).toFixed(2)),
      100
    );

    const saldoPendiente = totalVenta - totalPagado;

    console.log(
      `📊 Resumen: Total Venta: ${totalVenta} | Total Pagado: ${totalPagado} | Saldo: ${saldoPendiente} | %: ${porcentajePagado}%`
    );

    return { pagosValidados, totalPagado, saldoPendiente, porcentajePagado };
  }

  /**
   * Crear documento de venta
   */
  static async crearDocumentoVenta(ventaData, session) {
    const {
      pacienteId,
      items,
      vendedora,
      optometra,
      tienda,
      estadoEntrega = "EN_TIENDA",
      ot,
      totalVenta,
      pagos,
      saldoPendiente,
      porcentajePagado,
      pacienteNombreCompleto,
    } = ventaData;

    const nuevaVenta = new Venta({
      ot,
      paciente: pacienteId,
      items,
      vendedora,
      optometra,
      totalVenta,
      tienda,
      estadoEntrega,
      pagos,
      saldoPendiente,
      porcentajePagado,
      pacienteNombreCompleto,
      ...(saldoPendiente <= 0 && { fechaCancelacion: new Date() }),
    });

    await nuevaVenta.save({ session });
    return nuevaVenta;
  }

  /**
   * Ejecutar operaciones posteriores a la venta
   */
  static async ejecutarOperacionesPostVenta(
    nuevaVenta,
    saleItemsForMovements,
    itemsData,
    productoMap,
    usuario,
    pagosValidados,
    totalPagado,
    paciente,
    session
  ) {
    // 1. Movimientos de inventario
    await this.ejecutarMovimientosInventario(
      saleItemsForMovements,
      nuevaVenta,
      usuario,
      session
    );

    // 2. Actualizar stocks de productos
    await this.actualizarStocksProductos(itemsData, productoMap, session);

    // 3. Crear recojos si hay pagos
    if (pagosValidados.length > 0) {
      await this.crearRecojoOptica(
        nuevaVenta,
        paciente,
        pagosValidados,
        totalPagado,
        session
      );
    }
  }

  /**
   * Ejecutar movimientos de inventario
   */
  static async ejecutarMovimientosInventario(
    saleItemsForMovements,
    nuevaVenta,
    usuario,
    session
  ) {
    try {
      await MovementHelper.createSaleMovements(
        saleItemsForMovements,
        nuevaVenta,
        usuario,
        session
      );
    } catch (e) {
      console.warn(
        "Error en createSaleMovements con sesión, intentando sin sesión:",
        e
      );
      await MovementHelper.createSaleMovements(
        saleItemsForMovements,
        nuevaVenta,
        usuario
      );
    }
  }

  /**
   * Actualizar stocks de productos
   */
  static async actualizarStocksProductos(itemsData, productoMap, session) {
    const productosActualizados = new Set();

    for (const item of itemsData) {
      if (productosActualizados.has(item.productId)) continue;

      const product = productoMap.get(item.productId);
      const esServicio = this.esProductoServicio(product);

      if (!esServicio) {
        try {
          await updateProductStock(item.productId, { session });
          productosActualizados.add(item.productId);
        } catch (e) {
          console.warn(
            "Error en updateProductStock con sesión, intentando sin sesión:",
            e
          );
          await updateProductStock(item.productId);
          productosActualizados.add(item.productId);
        }
      }
    }
  }

  /**
   * Crear recojos óptica
   */
  static async crearRecojoOptica(
    nuevaVenta,
    paciente,
    pagosValidados,
    totalPagado,
    session
  ) {
    const tipoRecojo =
      totalPagado / nuevaVenta.totalVenta >= 0.5 ? "RECOJO" : "SEPARACION";

    const updatedCounterRecojo = await Counter.findOneAndUpdate(
      { _id: "recojoOptica" },
      { $inc: { seq: 1 } },
      { new: true, session, upsert: true, setDefaultsOnInsert: true }
    );

    const nuevoRecojo = new RecojoOptica({
      numero: updatedCounterRecojo.seq,
      tipo: tipoRecojo,
      fechaCompra: nuevaVenta.fechaVenta,
      ordenTrabajo: nuevaVenta.ot,
      nombreApellido: `${paciente.apellido} ${paciente.nombre}`,
      total: nuevaVenta.totalVenta,
      saldo: nuevaVenta.saldoPendiente,
      cuenta: totalPagado,
      tienda: nuevaVenta.tienda,
      estaEn: nuevaVenta.estadoEntrega,
      adelantos: pagosValidados.map((p) => ({
        fecha: p.fecha,
        ordenTrabajo: nuevaVenta.ot,
        importe: p.monto,
        saldo: nuevaVenta.totalVenta - p.monto,
      })),
      items: nuevaVenta.items.map((i) => ({
        productId: i.productId,
        measureId: i.measureId,
        variantId: i.variantId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
        zoneId: i.zoneId,
      })),
      venta: nuevaVenta._id,
    });

    await nuevoRecojo.save({ session });

    // Actualizar la venta con el recojos
    await Venta.findByIdAndUpdate(
      nuevaVenta._id,
      { $push: { recojos: nuevoRecojo._id } },
      { session }
    );
  }

  /**
   * Obtener venta por ID con populate
   */
  static async obtenerVentaPorId(ventaId) {
    return await Venta.findById(ventaId)
      .populate("paciente", "nombre apellido dni celular")
      .populate("tienda", "nombre direccion")
      .populate("items.productId", "name code")
      .populate("items.variantId", "code color size")
      .populate("items.measureId", "sphere cylinder add")
      .select("-__v");
  }
}

module.exports = VentaService;
