/**
 * server.js - Servidor principal de la aplicación Nexis
 * Configuración Express con CORS, conexión a BD y rutas de la API
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./src/users/config/db");
const { clientOrigins } = require("./src/users/config/index");

// Rutas de la aplicación
const authRoutes = require("./src/users/user_services/auth_service/routes/authRoute");
const sessionRoutes = require("./src/users/user_services/session_service/routes/sessionRoute");
const userRoutes = require("./src/users/user_services/user_service/routes/userRoute");
const categoryRoute = require("./src/users/product_services/category_service/routes/categoryRoute");
const productRoute = require("./src/users/product_services/product_service/routes/productRoute");
const variantRoute = require("./src/users/product_services/variant_service/routes/variantRoute");
const measureRoute = require("./src/users/product_services/measure_service/routes/measureRoute");
const zoneRoute = require("./src/users/zone_service/zone_service/routes/zoneRoute");
const tiendaRoute = require("./src/users/tienda_services/tienda_service/routes/tiendaRoute");
const clientRoute = require("./src/users/client_service/client_service/routes/clientRoute");
const reniecRoute = require("./src/users/client_service/reniec_service/routes/reniecRoute");
const inventarioRoutes = require("./src/users/almacen_service/inventario_service/routes/inventarioRoute");
const assistanceRoutes = require("./src/users/user_services/assistance_service/routes/assistanceRoute");
const recetaRoute = require("./src/users/user_services/receta_service/routes/recetaRoute");
const recojosRoute = require("./src/users/almacen_service/recojos_service/routes/recojosRoute");
const ventaRoute = require("./src/users/venta_service/venta_service/routes/ventaRoute");

const app = express();

// Configuración de CORS mejorada
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl)
    if (!origin) return callback(null, true);

    // Verificar si el origen está en la lista permitida
    if (clientOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`⚠️  CORS bloqueado: ${origin}`);
      console.log(`✅ Orígenes permitidos: ${clientOrigins.join(", ")}`);
      callback(new Error("Bloqueado por política CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "X-API-Key",
  ],
  exposedHeaders: ["X-Total-Count", "X-Page-Count"],
  maxAge: 86400, // Cache preflight por 24 horas
  optionsSuccessStatus: 200,
};

// Aplicar CORS
app.use(cors(corsOptions));

// Manejar preflight requests globalmente
app.options("*", cors(corsOptions));

// Middlewares esenciales
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

// Logger de requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${req.method} ${req.path} - Origin: ${
      req.headers.origin || "Directo"
    }`
  );
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Conectar a la base de datos
connectDB();

// Registrar rutas de la API
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/sessions", sessionRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/category", categoryRoute);
app.use("/api/v1/products", productRoute);
app.use("/api/v1/variants", variantRoute);
app.use("/api/v1/measures", measureRoute);
app.use("/api/v1/zones", zoneRoute);
app.use("/api/v1/tiendas", tiendaRoute);
app.use("/api/v1/clients", clientRoute);
app.use("/api/v1/reniec", reniecRoute);
app.use("/api/v1/recetas", recetaRoute);
app.use("/api/v1/inventario", inventarioRoutes);
app.use("/api/v1/assistance", assistanceRoutes);
app.use("/api/v1/recojos", recojosRoute);
app.use("/api/v1/ventas", ventaRoute);

// Ruta para manejar endpoints no encontrados
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
});

// Manejo centralizado de errores
app.use((err, req, res, next) => {
  console.error("❌ Error en la aplicación:", err);

  // Error de CORS
  if (err.message === "Bloqueado por política CORS") {
    return res.status(403).json({
      success: false,
      message: "Origen no permitido",
      allowedOrigins: clientOrigins,
    });
  }

  // Error de validación JSON
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "JSON malformado en el request",
    });
  }

  // Error general del servidor
  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Error interno del servidor"
        : err.message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// Manejo graceful de shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Recibido SIGTERM, cerrando servidor...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Recibido SIGINT, cerrando servidor...");
  process.exit(0);
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`
🚀 Servidor Nexis activo
📍 Puerto: ${PORT}
🌍 Entorno: ${process.env.NODE_ENV || "development"}
✅ Orígenes permitidos: ${clientOrigins.length} configurados
📅 Iniciado: ${new Date().toLocaleString()}
  `);
});

// Manejar errores de escucha
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`❌ Puerto ${PORT} ya en uso`);
    process.exit(1);
  } else {
    console.error("❌ Error iniciando servidor:", error);
    process.exit(1);
  }
});

module.exports = app;
