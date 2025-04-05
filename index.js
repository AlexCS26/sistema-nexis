const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./src/users/config/db");

// Importar rutas con require
const authRoutes = require("./src/users/user_services/auth_service/routes/authRoute");
const userRoutes = require("./src/users/user_services/user_service/routes/userRoute");
const lunaRoutes = require("./src/users/almacen_service/luna_service/routes/lunaRoute");
const inventarioRoutes = require("./src/users/almacen_service/inventario_service/routes/inventarioRoute");
const assistanceRoutes = require("./src/users/user_services/assistance_service/routes/assistanceRoute");
const recetaRoute = require("./src/users/user_services/receta_service/routes/recetaRoute");
const recojosRoute = require("./src/users/almacen_service/recojos_service/routes/recojosRoute");
const ventaRoute = require("./src/users/venta_service/venta_service/routes/ventaRoute");
const monturaRoute = require("./src/users/almacen_service/montura_service/routes/monturaRoute");

// Configurar Express
dotenv.config();
const app = express();
app.use(express.json());

// Configuración de CORS con variables de entorno
const corsOptions = {
  origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  credentials: true,
  optionsSuccessStatus: 200, // Para navegadores más antiguos
};
app.use(cors(corsOptions));

// Conectar a la base de datos
connectDB();

// Definir rutas principales
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/lunas", lunaRoutes);
app.use("/api/v1/recetas", recetaRoute);
app.use("/api/v1/inventario", inventarioRoutes);
app.use("/api/v1/assistance", assistanceRoutes);
app.use("/api/v1/recojos", recojosRoute);
app.use("/api/v1/ventas", ventaRoute);
app.use("/api/v1/monturas", monturaRoute);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
);
