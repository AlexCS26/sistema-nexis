const Product = require("../product_services/product_service/models/product.model");
const Measure = require("../product_services/measure_service/models/measure.model");
const Variant = require("../product_services/variant_service/models/variant.model");

/**
 * @desc    Actualizar el stock general de un producto sumando medidas y variantes por zona
 * @param   {string} productId - ID del producto
 */
const updateProductStock = async (productId) => {
  // 🔹 Sumar stock de todas las medidas
  const measures = await Measure.find({ productId });
  const stockMeasures = measures.reduce((total, measure) => {
    return (
      total + measure.stockByZone.reduce((sum, z) => sum + (z.stock || 0), 0)
    );
  }, 0);
  const measureIds = measures.map((m) => m._id);

  // 🔹 Sumar stock de todas las variantes
  const variants = await Variant.find({ productId });
  const stockVariants = variants.reduce((total, variant) => {
    return (
      total + variant.stockByZone.reduce((sum, z) => sum + (z.stock || 0), 0)
    );
  }, 0);
  const variantIds = variants.map((v) => v._id);

  // 🔹 Actualizar producto
  await Product.findByIdAndUpdate(productId, {
    stockGeneral: stockMeasures + stockVariants,
    measures: measureIds,
    variants: variantIds,
    updatedAt: Date.now(),
  });
};

module.exports = { updateProductStock };
