require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./src/users/config/db");

// Importar rutas
const authRoutes = require("./src/users/user_services/auth_service/routes/authRoute");
const userRoutes = require("./src/users/user_services/user_service/routes/userRoute");
const lunaRoutes = require("./src/users/almacen_service/luna_service/routes/lunaRoute");
const inventarioRoutes = require("./src/users/almacen_service/inventario_service/routes/inventarioRoute");
const assistanceRoutes = require("./src/users/user_services/assistance_service/routes/assistanceRoute");
const recetaRoute = require("./src/users/user_services/receta_service/routes/recetaRoute");
const recojosRoute = require("./src/users/almacen_service/recojos_service/routes/recojosRoute");
const ventaRoute = require("./src/users/venta_service/venta_service/routes/ventaRoute");
const monturaRoute = require("./src/users/almacen_service/montura_service/routes/monturaRoute");

// Inicializar Express
const app = express();

// Middleware básico
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración avanzada de CORS
const allowedOrigins = process.env.CLIENT_ORIGINS
  ? process.env.CLIENT_ORIGINS.split(",")
  : ["http://localhost:5173"];

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir solicitudes sin origen (como mobile apps o curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

// Aplicar CORS
app.use(cors(corsOptions));

// Manejar preflight requests para todas las rutas
app.options("*", cors(corsOptions));

// Conectar a la base de datos
connectDB();

// Rutas principales
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/lunas", lunaRoutes);
app.use("/api/v1/recetas", recetaRoute);
app.use("/api/v1/inventario", inventarioRoutes);
app.use("/api/v1/assistance", assistanceRoutes);
app.use("/api/v1/recojos", recojosRoute);
app.use("/api/v1/ventas", ventaRoute);
app.use("/api/v1/monturas", monturaRoute);

// Middleware para manejar errores
app.use((err, req, res, next) => {
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "Origen no permitido por CORS",
    });
  }
  next(err);
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Orígenes permitidos: ${allowedOrigins.join(", ")}`);
});
