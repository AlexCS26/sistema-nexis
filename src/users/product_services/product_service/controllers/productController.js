const Product = require("../models/product.model.js");
const Movimiento = require("../../../movement_service/models/movimiento.model.js");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils.js");
const Category = require("../../category_service/models/category.model.js");

// Función auxiliar para registrar movimientos
const registrarMovimiento = async (movimientoData) => {
  try {
    const movimiento = new Movimiento(movimientoData);
    await movimiento.save();
    return movimiento;
  } catch (error) {
    console.error("Error registrando movimiento:", error);
    throw error;
  }
};

// Función para determinar el tipo de movimiento basado en cambios de stock
const determinarTipoMovimiento = (stockAnterior, stockNuevo, operacion) => {
  const diferencia = stockNuevo - stockAnterior;

  if (operacion === "create") return "income";
  if (operacion === "delete") return "outflow";

  if (diferencia > 0) return "income";
  if (diferencia < 0) return "outflow";

  return "adjustment";
};

// Función para obtener el subtipo basado en la operación
const determinarSubtipoMovimiento = (operacion) => {
  const subtipos = {
    create: "purchase",
    update: "inventory",
    delete: "loss",
    adjustment: "inventory",
  };
  return subtipos[operacion] || null;
};

/**
 * @desc    Crear un nuevo producto y registrar movimiento inicial
 * @route   POST /api/products
 * @access  Private
 */
const createProduct = async (req, res) => {
  try {
    const {
      code,
      name,
      categoryId,
      brand,
      descripcion,
      priceBase,
      unitPrice,
      stockGeneral,
    } = req.body;

    // 400 Bad Request - Validación de datos requeridos
    if (!code || !code.trim())
      return errorResponse(res, 400, "Product code is required");
    if (!name || !name.trim())
      return errorResponse(res, 400, "Product name is required");
    if (!categoryId) return errorResponse(res, 400, "Category ID is required");

    // 404 Not Found - Validación de existencia de categoría
    const category = await Category.findById(categoryId);
    if (!category) return errorResponse(res, 404, "Category not found");

    // 409 Conflict - Verificar si el código o nombre ya existe
    const existingProduct = await Product.findOne({
      $or: [{ code: code.trim() }, { name: name.trim() }],
    });
    if (existingProduct)
      return errorResponse(
        res,
        409,
        "Product with the same code or name already exists"
      );

    // 201 Created - Crear el producto
    const product = new Product({
      code,
      name,
      categoryId,
      brand,
      descripcion,
      priceBase,
      unitPrice,
      stockGeneral: stockGeneral || 0,
      measures: [],
      variants: [],
      createdBy: req.usuario.userId,
    });

    const savedProduct = await product.save();

    // REGISTRAR MOVIMIENTO DE CREACIÓN
    if (savedProduct.stockGeneral > 0) {
      await registrarMovimiento({
        referenceType: "Product",
        productId: savedProduct._id,
        movementType: "income",
        subType: "purchase",
        quantity: savedProduct.stockGeneral,
        originLocation: null, // Puedes ajustar según tu lógica de ubicaciones
        destinationLocation: req.body.destinationLocation || null,
        relatedDocument: {
          type: "inventory",
          reference: `CREACIÓN-PRODUCTO-${savedProduct.code}`,
          date: new Date(),
        },
        registeredBy: req.usuario.userId,
        movementDate: new Date(),
        status: "completed",
        notes: `Creación inicial de producto - Stock inicial: ${savedProduct.stockGeneral}`,
        isAdjustment: false,
      });
    }

    return successResponse(
      res,
      201,
      "Product created successfully",
      savedProduct
    );
  } catch (error) {
    console.error("Error creating product:", error);
    return errorResponse(res, 500, "Error creating product", error);
  }
};

/**
 * @desc    Obtener todos los productos con filtros, búsqueda avanzada y paginación
 * @route   GET /api/products
 * @access  Private
 */
const getAllProducts = async (req, res) => {
  try {
    const {
      search,
      categoryId,
      brand,
      estado,
      minPrice,
      maxPrice,
      minStock,
      maxStock,
      productId,
      sortBy = "createdAt",
      order = "desc",
      page = 1,
      limit = 10,
      zoneId,
    } = req.query;

    // Construcción de query dinámico
    let query = {};
    if (estado !== undefined) {
      if (estado === "true" || estado === "1") query.isActive = true;
      else if (estado === "false" || estado === "0") query.isActive = false;
    }
    if (categoryId) query.categoryId = categoryId;
    if (brand) query.brand = { $regex: brand, $options: "i" };
    if (productId) query._id = productId;
    if (minPrice || maxPrice)
      query.unitPrice = {
        ...(minPrice && { $gte: Number(minPrice) }),
        ...(maxPrice && { $lte: Number(maxPrice) }),
      };

    // Ordenamiento seguro
    const allowedSortFields = [
      "createdAt",
      "updatedAt",
      "unitPrice",
      "stockGeneral",
      "name",
      "code",
    ];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortOrder = order === "asc" ? 1 : -1;

    // Traer todos los productos
    const products = await Product.find(query)
      .select(
        "code name brand stockGeneral unitPrice isActive createdAt updatedAt categoryId"
      )
      .populate("categoryId", "name")
      .populate({
        path: "variants",
        select: "code color size stockByZone price stockByZone",
      })
      .populate({
        path: "measures",
        select: "sphere cylinder add stockByZone price serie",
      })
      .sort({ [sortField]: sortOrder });

    // 🔹 Desglosar productos en filas considerando stockByZone
    const allRows = [];
    products.forEach((product) => {
      // Variantes
      if (product.variants?.length) {
        product.variants.forEach((v) => {
          // Stock y precio por zona
          const stockObj = zoneId
            ? v.stockByZone.find((s) => s.zoneId.toString() === zoneId)
            : v.stockByZone[0];
          const stockGeneral = stockObj ? stockObj.stock : 0;
          const displayPrice = stockObj ? stockObj.price : 0;

          allRows.push({
            ...product.toObject(),
            variants: [v],
            measures: [],
            stockGeneral,
            _id: v._id + "_variant",
            productId: product._id,
            displayCode: v.code,
            displayPrice,
            displayName: `${product.name} - ${v.color} ${v.size}`,
          });
        });
      }
      // Medidas
      else if (product.measures?.length) {
        product.measures.forEach((m) => {
          const stockObj = zoneId
            ? m.stockByZone.find((s) => s.zoneId.toString() === zoneId)
            : m.stockByZone[0];
          const stockGeneral = stockObj ? stockObj.stock : 0;
          const displayPrice = stockObj ? stockObj.price : 0;

          allRows.push({
            ...product.toObject(),
            variants: [],
            measures: [m],
            stockGeneral,
            _id: m._id + "_measure",
            productId: product._id,
            displayCode: product.code,
            displayPrice,
            displayName: `${product.name} - Esf:${m.sphere} Cil:${
              m.cylinder
            } Add:${m.add ?? 0}`,
          });
        });
      }
      // Producto simple
      else {
        allRows.push({
          ...product.toObject(),
          productId: product._id,
          displayCode: product.code,
          displayPrice: product.unitPrice,
          displayName: product.name,
        });
      }
    });

    // 🔹 Búsqueda avanzada con tolerancia
    let filteredRows = allRows;
    if (search) {
      const searchLower = search.toLowerCase().trim();
      const esfMatch = searchLower.match(/esf\s*[:=]\s*([+-]?\d+(\.\d+)?)/);
      const cilMatch = searchLower.match(/cil\s*[:=]\s*([+-]?\d+(\.\d+)?)/);
      const addMatch = searchLower.match(/add\s*[:=]\s*([+-]?\d+(\.\d+)?)/);
      const EPS = 0.01;

      filteredRows = allRows.filter((row) => {
        const codeMatch = row.displayCode?.toLowerCase().includes(searchLower);
        const nameMatch = row.displayName?.toLowerCase().includes(searchLower);
        const brandMatch = row.brand?.toLowerCase().includes(searchLower);

        let measureMatch = true;
        if (row.measures?.length) {
          measureMatch = row.measures.some((m) => {
            let match = true;
            if (esfMatch)
              match =
                match && Math.abs(parseFloat(esfMatch[1]) - m.sphere) < EPS;
            if (cilMatch)
              match =
                match && Math.abs(parseFloat(cilMatch[1]) - m.cylinder) < EPS;
            if (addMatch)
              match =
                match && Math.abs(parseFloat(addMatch[1]) - (m.add ?? 0)) < EPS;
            return match;
          });
        } else if (esfMatch || cilMatch || addMatch) measureMatch = false;

        return (codeMatch || nameMatch || brandMatch) && measureMatch;
      });
    }

    const totalRows = filteredRows.length;
    const pageNum = Math.max(Number(page), 1);
    const limitNum = Math.min(Math.max(Number(limit), 1), 100);
    const totalPages = Math.max(Math.ceil(totalRows / limitNum), 1);
    const skip = (pageNum - 1) * limitNum;
    const paginatedRows = filteredRows.slice(skip, skip + limitNum);

    const baseUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}${
      req.path
    }`;
    const queryString = (p) => {
      const qs = new URLSearchParams({
        ...req.query,
        page: p,
        limit: limitNum,
      });
      return `${baseUrl}?${qs.toString()}`;
    };
    const links = {
      first: queryString(1),
      prev: pageNum > 1 ? queryString(pageNum - 1) : null,
      next: pageNum < totalPages ? queryString(pageNum + 1) : null,
      last: queryString(totalPages),
    };
    const pagination = {
      total: totalRows,
      page: pageNum,
      limit: limitNum,
      totalPages,
      from: totalRows === 0 ? 0 : skip + 1,
      to: skip + paginatedRows.length,
      hasPrevPage: pageNum > 1,
      hasNextPage: pageNum < totalPages,
      prevPage: pageNum > 1 ? pageNum - 1 : null,
      nextPage: pageNum < totalPages ? pageNum + 1 : null,
      sortBy: sortField,
      order: sortOrder === 1 ? "asc" : "desc",
      links,
    };

    return successResponse(res, 200, "Products fetched successfully", {
      meta: pagination,
      data: paginatedRows,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return errorResponse(res, 500, "Error fetching products", error);
  }
};

/**
 * @desc    Obtener resumen de productos / inventario - CORREGIDO
 * @route   GET /api/products/summary
 * @access  Private
 */
const getProductsSummary = async (req, res) => {
  try {
    // Traer solo productos activos, con variantes y medidas
    const products = await Product.find({ isActive: true })
      .populate("categoryId", "name")
      .populate({ path: "variants", select: "stock code color size" })
      .populate({ path: "measures", select: "stock code sphere cylinder" });

    // Total de productos
    const totalProductos = products.length;

    // Inicializar acumuladores
    let stockTotal = 0;
    const lowStockItems = [];
    const stockPorCategoria = {};

    // Recorrer productos - CORREGIDO: usar solo stockGeneral
    products.forEach((p) => {
      const tipo = p.categoryId?.name || "Sin categoría";
      if (!stockPorCategoria[tipo])
        stockPorCategoria[tipo] = {
          stockTotal: 0,
          cantidadModelos: 0,
          cantidadVariants: 0,
          cantidadMeasures: 0,
        };

      // 🔹 SOLO usar stockGeneral (ya incluye todo)
      const productoStock = p.stockGeneral || 0;
      stockPorCategoria[tipo].stockTotal += productoStock;
      stockTotal += productoStock;

      // 🔹 Verificar stock bajo del producto general
      if (productoStock <= 5) {
        lowStockItems.push({
          ...p.toObject(),
          type: "producto",
          stock: productoStock,
        });
      }

      // 🔹 Variants - solo para detectar stock bajo individual
      if (p.variants && p.variants.length) {
        p.variants.forEach((v) => {
          if (v.stock <= 5) {
            lowStockItems.push({
              ...v.toObject(),
              parent: p.name,
              type: "variant",
            });
          }
        });
        stockPorCategoria[tipo].cantidadVariants += p.variants.length;
      }

      // 🔹 Measures - solo para detectar stock bajo individual
      if (p.measures && p.measures.length) {
        p.measures.forEach((m) => {
          if (m.stock <= 5) {
            lowStockItems.push({
              ...m.toObject(),
              parent: p.name,
              type: "measure",
            });
          }
        });
        stockPorCategoria[tipo].cantidadMeasures += p.measures.length;
      }

      // Contar modelo de producto
      stockPorCategoria[tipo].cantidadModelos += 1;
    });

    // Convertir objeto a array y agregar stock promedio
    const stockPorTipo = Object.entries(stockPorCategoria).map(
      ([tipo, info]) => ({
        tipo,
        ...info,
        stockPromedio:
          info.cantidadModelos > 0 ? info.stockTotal / info.cantidadModelos : 0,
      })
    );

    // Agrupar lowStockItems por tipo
    const lowStockByType = {};
    lowStockItems.forEach((item) => {
      const tipo = item.categoryId?.name || "Sin categoría";
      if (!lowStockByType[tipo]) lowStockByType[tipo] = [];
      lowStockByType[tipo].push(item);
    });

    // Ordenar lowStockItems por stock ascendente (más críticos primero)
    lowStockItems.sort((a, b) => (a.stock || 0) - (b.stock || 0));

    // Marcar alerta crítica por tipo (stock <=2)
    const alertaCritica = {};
    Object.entries(lowStockByType).forEach(([tipo, items]) => {
      alertaCritica[tipo] = items.some((i) => (i.stock || 0) <= 2);
    });

    // Respuesta final
    return successResponse(res, 200, "Resumen de inventario obtenido", {
      totalProductos,
      stockTotal,
      stockPorTipo,
      lowStockItems,
      lowStockByType,
      alertaCritica,
    });
  } catch (error) {
    console.error("Error fetching product summary:", error);
    return errorResponse(res, 500, "Error fetching product summary", error);
  }
};

/**
 * @desc    Obtener un producto por ID
 * @route   GET /api/products/:id
 * @access  Private
 */
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // 400 Bad Request - Validación ID
    if (!id) return errorResponse(res, 400, "Product ID is required");

    const product = await Product.findById(id)
      .populate("categoryId", "code name")
      .populate("createdBy", "nombre apellido correo")
      .populate({
        path: "variants",
        select: "code color size material stock price createdAt updatedAt",
      })
      .populate({
        path: "measures",
        select: "sphere cylinder add stock price serie createdAt updatedAt",
      });

    // 404 Not Found - Producto no encontrado
    if (!product) return errorResponse(res, 404, "Product not found");

    // 200 OK - Producto encontrado
    return successResponse(res, 200, "Product fetched successfully", product);
  } catch (error) {
    // 500 Internal Server Error
    console.error("Error fetching product:", error);
    return errorResponse(res, 500, "Error fetching product", error);
  }
};

/**
 * @desc    Actualizar un producto existente y registrar movimientos de stock
 * @route   PUT /api/products/:id
 * @access  Private
 */
const updateProduct = async (req, res) => {
  let session = null;
  try {
    const { id } = req.params;
    const updates = { ...req.body, updatedAt: Date.now() };

    // 400 Bad Request - Validación ID
    if (!id) return errorResponse(res, 400, "Product ID is required");

    // Obtener producto actual antes de la actualización
    const productoActual = await Product.findById(id);
    if (!productoActual) return errorResponse(res, 404, "Product not found");

    // 404 Not Found - Validación categoría si se cambia
    if (updates.categoryId) {
      const category = await Category.findById(updates.categoryId);
      if (!category) return errorResponse(res, 404, "Category not found");
    }

    // 409 Conflict - Validar conflicto de código o nombre
    if (updates.code || updates.name) {
      const conflictProduct = await Product.findOne({
        _id: { $ne: id }, // Ignorar el producto actual
        $or: [{ code: updates.code?.trim() }, { name: updates.name?.trim() }],
      });
      if (conflictProduct)
        return errorResponse(
          res,
          409,
          "Another product with the same code or name already exists"
        );
    }

    // Iniciar transacción para asegurar consistencia
    session = await Product.startSession();
    session.startTransaction();

    const product = await Product.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
      session,
    });

    // 404 Not Found - Producto no encontrado
    if (!product) {
      await session.abortTransaction();
      return errorResponse(res, 404, "Product not found");
    }

    // REGISTRAR MOVIMIENTO SI HAY CAMBIO EN STOCK
    const stockAnterior = productoActual.stockGeneral || 0;
    const stockNuevo = product.stockGeneral || 0;

    if (stockAnterior !== stockNuevo) {
      const diferencia = Math.abs(stockNuevo - stockAnterior);
      const movimientoType = determinarTipoMovimiento(
        stockAnterior,
        stockNuevo,
        "update"
      );
      const movimientoSubType = determinarSubtipoMovimiento("update");

      await registrarMovimiento({
        referenceType: "Product",
        productId: product._id,
        movementType: movimientoType,
        subType: movimientoSubType,
        quantity: diferencia,
        originLocation: null,
        destinationLocation: req.body.destinationLocation || null,
        relatedDocument: {
          type: "inventory",
          reference: `ACTUALIZACIÓN-${product.code}`,
          date: new Date(),
        },
        registeredBy: req.usuario.userId,
        movementDate: new Date(),
        status: "completed",
        notes: `Actualización de producto - Stock anterior: ${stockAnterior}, Stock nuevo: ${stockNuevo}, Diferencia: ${diferencia}`,
        isAdjustment: true,
      });
    }

    await session.commitTransaction();

    // 200 OK - Producto actualizado
    return successResponse(res, 200, "Product updated successfully", product);
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    console.error("Error updating product:", error);
    return errorResponse(res, 500, "Error updating product", error);
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

/**
 * @desc    Eliminar (soft delete) un producto y registrar movimiento de baja
 * @route   DELETE /api/products/:id
 * @access  Private
 */
const deleteProduct = async (req, res) => {
  let session = null;
  try {
    const { id } = req.params;

    // 400 Bad Request - Validación ID
    if (!id) return errorResponse(res, 400, "Product ID is required");

    // Obtener producto antes de eliminar
    const productoActual = await Product.findById(id);
    if (!productoActual) return errorResponse(res, 404, "Product not found");

    // Iniciar transacción
    session = await Product.startSession();
    session.startTransaction();

    const product = await Product.findByIdAndUpdate(
      id,
      { isActive: false, updatedAt: Date.now() },
      { new: true, session }
    );

    // 404 Not Found - Producto no encontrado
    if (!product) {
      await session.abortTransaction();
      return errorResponse(res, 404, "Product not found");
    }

    // REGISTRAR MOVIMIENTO DE BAJA SI HABÍA STOCK
    const stockEliminado = productoActual.stockGeneral || 0;
    if (stockEliminado > 0) {
      await registrarMovimiento({
        referenceType: "Product",
        productId: product._id,
        movementType: "outflow",
        subType: "loss",
        quantity: stockEliminado,
        originLocation: null,
        destinationLocation: null,
        relatedDocument: {
          type: "inventory",
          reference: `ELIMINACIÓN-${product.code}`,
          date: new Date(),
        },
        registeredBy: req.usuario.userId,
        movementDate: new Date(),
        status: "completed",
        notes: `Eliminación de producto - Stock removido: ${stockEliminado}`,
        isAdjustment: false,
      });
    }

    await session.commitTransaction();

    // 200 OK - Producto eliminado (soft delete)
    return successResponse(
      res,
      200,
      "Product deleted (soft delete) successfully",
      product
    );
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    console.error("Error deleting product:", error);
    return errorResponse(res, 500, "Error deleting product", error);
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

/**
 * @desc    Ajustar stock de un producto específico
 * @route   PATCH /api/products/:id/adjust-stock
 * @access  Private
 */
const adjustProductStock = async (req, res) => {
  let session = null;
  try {
    const { id } = req.params;
    const { newStock, reason, locationId } = req.body;

    // Validaciones
    if (!id) return errorResponse(res, 400, "Product ID is required");
    if (newStock === undefined || newStock === null)
      return errorResponse(res, 400, "New stock value is required");
    if (newStock < 0)
      return errorResponse(res, 400, "Stock cannot be negative");

    // Obtener producto actual
    const productoActual = await Product.findById(id);
    if (!productoActual) return errorResponse(res, 404, "Product not found");

    const stockAnterior = productoActual.stockGeneral || 0;
    const diferencia = Math.abs(newStock - stockAnterior);

    // Iniciar transacción
    session = await Product.startSession();
    session.startTransaction();

    // Actualizar stock
    const product = await Product.findByIdAndUpdate(
      id,
      { stockGeneral: newStock, updatedAt: Date.now() },
      { new: true, session }
    );

    // REGISTRAR MOVIMIENTO DE AJUSTE
    const movimientoType = determinarTipoMovimiento(
      stockAnterior,
      newStock,
      "adjustment"
    );

    await registrarMovimiento({
      referenceType: "Product",
      productId: product._id,
      movementType: movimientoType,
      subType: "inventory",
      quantity: diferencia,
      originLocation: locationId || null,
      destinationLocation: locationId || null,
      relatedDocument: {
        type: "inventory",
        reference: `AJUSTE-${product.code}`,
        date: new Date(),
      },
      registeredBy: req.usuario.userId,
      movementDate: new Date(),
      status: "completed",
      notes: `Ajuste manual de stock - ${
        reason || "Sin motivo especificado"
      }. Stock anterior: ${stockAnterior}, Stock nuevo: ${newStock}`,
      isAdjustment: true,
    });

    await session.commitTransaction();

    return successResponse(res, 200, "Stock adjusted successfully", {
      product,
      stockAnterior,
      stockNuevo: newStock,
      diferencia,
      movimientoType,
    });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    console.error("Error adjusting stock:", error);
    return errorResponse(res, 500, "Error adjusting stock", error);
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductsSummary,
  adjustProductStock,
};
