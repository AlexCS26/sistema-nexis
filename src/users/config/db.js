const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado a MongoDB");
  } catch (error) {
    console.error("❌ Error al conectar a MongoDB", error);
    process.exit(1); // Detener la aplicación si falla la conexión
  }
};

module.exports = connectDB;
