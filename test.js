#!/usr/bin/env node
const mongoose = require("mongoose");
const readline = require("readline");
const xlsx = require("xlsx");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const Luna = require("./src/users/almacen_service/luna_service/models/luna.model");

// Configuración de la conexión a MongoDB
mongoose.connect(
  "mongodb+srv://alexiscasazola4:O1xbN3M4UJreuHuV@amydoramas.h0emeb1.mongodb.net/optica-chancay"
);

// Interfaz para leer desde la consola
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ID del usuario que registra
const USER_ID = "67ccffae17b63bcdf7631706";

// Función principal
async function main() {
  try {
    console.log("=== PROCESADOR DE INVENTARIO DE LUNAS ===");

    // Mostrar menú de tipos de lentes
    const tipo = await seleccionarOpcion(
      [
        "Fotomatic Blue Azul",
        "Fotomatic Blue Verde",
        "Rx Blue Block Azul",
        "Rx Blue Block Verde",
        "Rx Blanca",
      ],
      "Seleccione el tipo de lente:"
    );

    // Mostrar menú de zonas
    const zona = await seleccionarOpcion(
      ["Chancay", "Huaral"],
      "Seleccione la zona:"
    );

    // Seleccionar archivo Excel
    const filePath = await seleccionarArchivo();

    if (!filePath) {
      throw new Error("No se seleccionó ningún archivo");
    }

    // Procesar el archivo
    console.log("\nProcesando archivo...");
    const result = await processExcel(filePath, tipo, zona);

    // Guardar resultado en JSON
    const outputPath = path.join(
      path.dirname(filePath),
      "inventario_procesado.json"
    );
    fs.writeFileSync(outputPath, JSON.stringify(result.jsonData, null, 2));

    console.log("\nProceso completado con éxito:");
    console.log(`- Documentos procesados: ${result.jsonData.length}`);
    console.log(`- Resultado guardado en: ${outputPath}`);

    // Preguntar si desea importar a MongoDB
    const importar = await askQuestion(
      "\n¿Desea importar los datos a MongoDB? (s/n): "
    );
    if (importar.toLowerCase() === "s") {
      const dbResult = await importToMongoDB(result.jsonData);
      console.log(
        `\nImportación completada: ${dbResult.created} creados, ${dbResult.updated} actualizados`
      );
    }
  } catch (error) {
    console.error("\nError durante el procesamiento:", error.message);
  } finally {
    rl.close();
    mongoose.disconnect();
  }
}

// Función para seleccionar archivo
function seleccionarArchivo() {
  return new Promise((resolve) => {
    exec(
      'zenity --file-selection --title="Seleccione el archivo Excel de inventario"',
      (error, stdout) => {
        if (error) {
          // Fallback a entrada por consola
          rl.question(
            "\nIngrese la ruta completa del archivo Excel: ",
            resolve
          );
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });
}

// Función para seleccionar opciones
async function seleccionarOpcion(opciones, mensaje) {
  console.log(`\n${mensaje}`);
  opciones.forEach((op, i) => console.log(`${i + 1}. ${op}`));

  let seleccion;
  while (true) {
    seleccion = await askQuestion("\nIngrese el número correspondiente: ");
    const num = parseInt(seleccion);
    if (num >= 1 && num <= opciones.length) {
      return opciones[num - 1];
    }
    console.log("Opción inválida. Por favor intente nuevamente.");
  }
}

async function processExcel(filePath, tipo, zona) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convertir a JSON manteniendo valores vacíos como null
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });

  const jsonData = [];

  // Procesar ESF (+) con CIL (-) - Series 1, 2 y 3
  processSerie(data, 7, 30, 1, 8, "+", jsonData, tipo, zona, 0.25, 1); // Serie 1 (B-I)
  processSerie(data, 7, 30, 11, 18, "+", jsonData, tipo, zona, 2.25, 2); // Serie 2 (M-T)
  processSerie(data, 7, 30, 21, 28, "+", jsonData, tipo, zona, 4.25, 3); // Serie 3 (W-AD)

  // Procesar ESF (-) con CIL (-) - Series 1, 2 y 3
  processSerie(data, 37, 60, 1, 8, "-", jsonData, tipo, zona, 0.25, 1); // Serie 1 (B-I)
  processSerie(data, 37, 60, 11, 18, "-", jsonData, tipo, zona, 2.25, 2); // Serie 2 (M-T)
  processSerie(data, 37, 60, 21, 28, "-", jsonData, tipo, zona, 4.25, 3); // Serie 3 (W-AD)

  // Procesar ESF (+) solos (columna AG)
  processEsfSolo(data, 7, 30, 32, "+", jsonData, tipo, zona);

  // Procesar CIL (-) solos (columna AJ)
  processCilSolo(data, 7, 30, 35, jsonData, tipo, zona);

  // Procesar ESF (-) solos (columna AM)
  processEsfSolo(data, 37, 60, 38, "-", jsonData, tipo, zona);

  // Procesar lentes planos (ESF +0.00 y CIL -0.00)
  processPlanos(data, jsonData, tipo, zona);

  return { jsonData };
}

// Función para procesar una serie de lentes
function processSerie(
  data,
  startRow,
  endRow,
  startCol,
  endCol,
  signoEsf,
  jsonData,
  tipo,
  zona,
  cilStart,
  serieNum
) {
  for (let i = startRow; i <= endRow; i++) {
    const row = data[i];
    if (row && row[0] !== null && !isNaN(parseFloat(row[0]))) {
      const esferico = `${signoEsf}${parseFloat(row[0]).toFixed(2)}`;

      for (let j = startCol, cilIndex = 0; j <= endCol; j++, cilIndex++) {
        const cilValue = (cilStart + cilIndex * 0.25).toFixed(2);
        const cilindrico = `-${cilValue}`;
        const stock = row[j] !== null ? parseInt(row[j]) : 0;

        if (stock > 0) {
          jsonData.push({
            esferico,
            cilindrico,
            tipo,
            zona,
            serie: serieNum,
            stock,
            disponible: true,
            registradoPor: USER_ID,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
    }
  }
}

// Función para procesar ESF solos (positivos o negativos)
function processEsfSolo(
  data,
  startRow,
  endRow,
  colIndex,
  signo,
  jsonData,
  tipo,
  zona
) {
  for (let i = startRow; i <= endRow; i++) {
    const row = data[i];
    if (row && row[0] !== null && !isNaN(parseFloat(row[0]))) {
      const stock = row[colIndex] !== null ? parseInt(row[colIndex]) : 0;

      if (stock > 0) {
        jsonData.push({
          esferico: `${signo}${parseFloat(row[0]).toFixed(2)}`,
          cilindrico: "-0.00",
          tipo,
          zona,
          serie: 1, // Serie 1 por defecto para ESF solos
          stock,
          disponible: true,
          registradoPor: USER_ID,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }
}

// Función para procesar CIL solos (negativos)
function processCilSolo(
  data,
  startRow,
  endRow,
  colIndex,
  jsonData,
  tipo,
  zona
) {
  for (let i = startRow; i <= endRow; i++) {
    const row = data[i];
    if (row && row[0] !== null && !isNaN(parseFloat(row[0]))) {
      const stock = row[colIndex] !== null ? parseInt(row[colIndex]) : 0;

      if (stock > 0) {
        const cilindrico = `-${parseFloat(row[0]).toFixed(2)}`;
        jsonData.push({
          esferico: "+0.00",
          cilindrico,
          tipo,
          zona,
          serie: determinarSerie(cilindrico, 1),
          stock,
          disponible: true,
          registradoPor: USER_ID,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }
}

// Función para procesar lentes planos
function processPlanos(data, jsonData, tipo, zona) {
  // Buscar la fila que contiene los planos (fila 4 en el Excel)
  const planosRow = data[4];
  if (planosRow && planosRow[33] !== null) {
    const stockPlanos = parseInt(planosRow[33]);
    if (stockPlanos > 0) {
      jsonData.push({
        esferico: "+0.00",
        cilindrico: "-0.00",
        tipo,
        zona,
        serie: 1,
        stock: stockPlanos,
        disponible: true,
        registradoPor: USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
}

// Función para importar a MongoDB
async function importToMongoDB(data) {
  let created = 0;
  let updated = 0;

  for (const item of data) {
    try {
      const filter = {
        esferico: item.esferico,
        cilindrico: item.cilindrico,
        tipo: item.tipo,
        zona: item.zona,
      };

      const update = {
        $set: {
          stock: item.stock,
          disponible: item.disponible,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          serie: item.serie,
          registradoPor: new mongoose.Types.ObjectId(item.registradoPor),
          createdAt: new Date(),
        },
      };

      const options = { upsert: true, new: true };

      const existingDoc = await Luna.findOne(filter);

      if (existingDoc) {
        // Document exists, update it
        await Luna.updateOne(filter, update);
        updated++;
      } else {
        // Document doesn't exist, insert it
        await Luna.create({
          ...filter,
          ...update.$set,
          ...update.$setOnInsert,
        });
        created++;
      }
    } catch (error) {
      console.error("Error al procesar documento:", error);
    }
  }

  return { created, updated };
}

// Función auxiliar para determinar la serie basada en el cilíndrico
function determinarSerie(cilindrico, defaultSerie) {
  if (!cilindrico) return defaultSerie;
  const cilindricoValor = parseFloat(cilindrico);
  if (isNaN(cilindricoValor)) return defaultSerie;

  if (cilindricoValor === 0) return 1; // Planos son serie 1
  if (cilindricoValor >= -2.0) return 1; // Serie 1: -0.25 a -2.00
  if (cilindricoValor >= -4.0) return 2; // Serie 2: -2.25 a -4.00
  return 3; // Serie 3: -4.25 a -6.00
}

// Función para hacer preguntas por consola
function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

// Ejecutar el programa
main().catch((err) => {
  console.error("Error inesperado:", err);
  process.exit(1);
});
