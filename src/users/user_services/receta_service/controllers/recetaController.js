const Receta = require("../models/receta.model");
const {
  successResponse,
  errorResponse,
} = require("../../../utils/responseUtils");

// 📌 Crear una nueva receta (Solo Admin)
exports.crearReceta = async (req, res) => {
  try {
    if (req.usuario.rol !== "admin") {
      return errorResponse(
        res,
        403,
        "Acceso denegado. Se requiere rol de administrador."
      );
    }

    console.log("Datos recibidos para crear la receta:", req.body);

    const nuevaReceta = new Receta(req.body);
    const recetaGuardada = await nuevaReceta.save();

    console.log("Receta creada con éxito:", recetaGuardada);

    return successResponse(res, 201, "Receta creada con éxito", recetaGuardada);
  } catch (error) {
    console.error("Error al crear la receta:", error);
    return errorResponse(res, 500, "Error al crear la receta", error);
  }
};

// 📌 Obtener recetas con filtros optimizados
exports.obtenerRecetas = async (req, res) => {
  try {
    const {
      nombre,
      ot,
      fechaInicio,
      fechaFin,
      tienda,
      edadMin,
      edadMax,
      diagnostico,
    } = req.query;

    let filtro = {};

    // Filtro por nombre del cliente (búsqueda flexible)
    if (nombre) {
      filtro["cliente.nombre"] = new RegExp(nombre, "i");
    }

    // Filtro por número de OT (búsqueda flexible)
    if (ot) {
      filtro.ot = new RegExp(ot, "i");
    }

    // Filtro por rango de fechas
    if (fechaInicio && fechaFin) {
      filtro.fechaEmision = {
        $gte: new Date(fechaInicio),
        $lte: new Date(fechaFin),
      };
    } else if (fechaInicio) {
      filtro.fechaEmision = { $gte: new Date(fechaInicio) };
    } else if (fechaFin) {
      filtro.fechaEmision = { $lte: new Date(fechaFin) };
    }

    // Filtro por tienda
    if (tienda) {
      filtro.tienda = tienda;
    }

    // Filtro por rango de edad del cliente
    if (edadMin && edadMax) {
      filtro["cliente.edad"] = {
        $gte: parseInt(edadMin),
        $lte: parseInt(edadMax),
      };
    } else if (edadMin) {
      filtro["cliente.edad"] = { $gte: parseInt(edadMin) };
    } else if (edadMax) {
      filtro["cliente.edad"] = { $lte: parseInt(edadMax) };
    }

    // Filtro por diagnóstico (búsqueda flexible)
    if (diagnostico) {
      filtro.diagnostico = new RegExp(diagnostico, "i");
    }

    // Obtener las recetas con los filtros aplicados
    const recetas = await Receta.find(filtro).lean().limit(50); // Limitar a 50 resultados para mejorar el rendimiento

    return successResponse(res, 200, "Lista de recetas obtenida", recetas);
  } catch (error) {
    return errorResponse(res, 500, "Error al obtener las recetas", error);
  }
};
// 📌 Obtener una receta por ID
exports.obtenerRecetaPorId = async (req, res) => {
  try {
    const receta = await Receta.findById(req.params.id).lean();
    if (!receta) {
      return errorResponse(res, 404, "Receta no encontrada");
    }
    return successResponse(res, 200, "Receta obtenida con éxito", receta);
  } catch (error) {
    return errorResponse(res, 500, "Error al obtener la receta", error);
  }
};

// 📌 Actualizar una receta (Solo Admin)
exports.actualizarReceta = async (req, res) => {
  try {
    if (req.usuario.rol !== "admin") {
      return errorResponse(
        res,
        403,
        "Acceso denegado. Se requiere rol de administrador."
      );
    }

    const recetaActualizada = await Receta.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, lean: true }
    );

    if (!recetaActualizada) {
      return errorResponse(res, 404, "Receta no encontrada");
    }

    return successResponse(
      res,
      200,
      "Receta actualizada con éxito",
      recetaActualizada
    );
  } catch (error) {
    return errorResponse(res, 500, "Error al actualizar la receta", error);
  }
};

// 📌 Eliminar una receta (Solo Admin)
exports.eliminarReceta = async (req, res) => {
  try {
    if (req.usuario.rol !== "admin") {
      return errorResponse(
        res,
        403,
        "Acceso denegado. Se requiere rol de administrador."
      );
    }

    const recetaEliminada = await Receta.findByIdAndDelete(req.params.id);

    if (!recetaEliminada) {
      return errorResponse(res, 404, "Receta no encontrada");
    }

    return successResponse(res, 200, "Receta eliminada correctamente");
  } catch (error) {
    return errorResponse(res, 500, "Error al eliminar la receta", error);
  }
};
