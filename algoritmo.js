const OpenAI = require("openai");
const fs = require("fs");
const { exec } = require("child_process");
const { promisify } = require("util");
const readline = require("readline");
const chalk = require("chalk");
const XLSX = require("xlsx");
const mongoose = require("mongoose");
const Luna = require("./src/users/almacen_service/luna_service/models/luna.model");

// Configuración de MongoDB con más logs
mongoose
  .connect(
    "mongodb+srv://alexiscasazola4:O1xbN3M4UJreuHuV@amydoramas.h0emeb1.mongodb.net/optica-chancay-v2"
  )
  .then(() => {
    console.log(chalk.green("✔️ Conectado a MongoDB"));
    console.log(chalk.blue("ℹ️ Estado de la conexión:"));
    console.log(chalk.blue(`- Host: ${mongoose.connection.host}`));
    console.log(chalk.blue(`- DB: ${mongoose.connection.name}`));
  })
  .catch((err) => {
    console.error(chalk.red("❌ Error de conexión a MongoDB:"), err);
    process.exit(1);
  });

const execAsync = promisify(exec);
const DEFAULT_API_KEY = "sk-590f2f36774c46bebb8cd49b9f5fb4f7";

// Función para seleccionar archivo Excel
async function selectFileWithDialog() {
  try {
    console.log(chalk.yellow("🖱️ Selecciona el archivo Excel..."));
    const { stdout } = await execAsync(
      'zenity --file-selection --title="Selecciona un archivo Excel" --file-filter="*.xlsx *.xls" 2>/dev/null || echo ""'
    );
    return stdout.trim();
  } catch (error) {
    console.log(
      chalk.red(
        "❌ No se seleccionó archivo o Zenity no está instalado. Usando ruta por defecto."
      )
    );
    return "/home/aleee/Descargas/Untitled spreadsheet.xlsx";
  }
}

// Función para seleccionar tipo de luna
async function getTipoLunaFromUser() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log(chalk.yellow("\n🔘 Selecciona el tipo de luna:"));
    console.log(chalk.blue("1. Fotomatic Blue Azul"));
    console.log(chalk.blue("2. Fotomatic Blue Verde"));
    console.log(chalk.blue("3. Rx Blue Block Azul"));
    console.log(chalk.blue("4. Rx Blue Block Verde"));
    console.log(chalk.blue("5. Rx Blanca"));

    return new Promise((resolve) => {
      const ask = () => {
        rl.question(chalk.yellow("Ingresa el número (1-5): "), (answer) => {
          const tipoMap = {
            1: "Fotomatic Blue Azul",
            2: "Fotomatic Blue Verde",
            3: "Rx Blue Block Azul",
            4: "Rx Blue Block Verde",
            5: "Rx Blanca",
          };

          if (tipoMap[answer.trim()]) {
            rl.close();
            resolve(tipoMap[answer.trim()]);
          } else {
            console.log(chalk.red("❌ Opción inválida. Intenta nuevamente."));
            ask();
          }
        });
      };
      ask();
    });
  } catch (error) {
    console.error(chalk.red("Error al seleccionar tipo de luna:"), error);
    throw error;
  }
}

// Función para analizar Excel con OpenAI
async function analyzeWithOpenAI(filePath, apiKey) {
  try {
    const workbook = XLSX.readFile(filePath);
    let resultText = "";

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      resultText += `=== Hoja: ${sheetName} ===\n`;

      // Buscar información de almacén
      const almacenRow = jsonData.find(
        (row) =>
          row &&
          row.some(
            (cell) => typeof cell === "string" && cell.includes("ALMACÉN")
          )
      );

      if (almacenRow) {
        const almacen = almacenRow.find(
          (cell) => cell !== "ALMACÉN" && cell !== "X"
        );
        resultText += `Almacén: ${almacen || "No identificado"}\n`;
      }

      // Mostrar estructura de datos
      const previewRows = jsonData
        .slice(0, 15)
        .filter((row) => row && row.length > 0);
      previewRows.forEach((row) => {
        resultText +=
          row
            .map((cell) => {
              if (cell === null || cell === undefined) return "null";
              if (typeof cell === "object") return JSON.stringify(cell);
              return cell.toString();
            })
            .join("\t") + "\n";
      });
      resultText += "...\n\n";
    });

    const openai = new OpenAI({
      baseURL: "https://api.deepseek.com/v1",
      apiKey: apiKey,
    });

    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "Eres un experto analista de datos ópticos. Analiza este inventario de lunas y proporciona: 1) Estructura de datos, 2) Problemas detectados, 3) Recomendaciones. Usa markdown con tablas.",
        },
        {
          role: "user",
          content: resultText,
        },
      ],
      temperature: 0.3,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error(chalk.red("Error en análisis con OpenAI:"), error);
    return "⚠️ No se pudo completar el análisis. Continuando con el procesamiento...";
  }
}

// Función mejorada para procesar Excel a MongoDB con más logs
async function processExcelToMongoDB(filePath, tipoLuna, userId) {
  try {
    console.log(chalk.blue("📖 Leyendo archivo Excel..."));
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;
    let totalProcessed = 0;
    let almacen = "Huaral";

    console.log(chalk.blue(`📑 Hojas encontradas: ${sheetNames.join(", ")}`));

    // 1. Identificar el almacén
    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
      });

      console.log(chalk.yellow(`\n🔍 Buscando almacén en hoja: ${sheetName}`));

      const almacenRow = jsonData.find(
        (row) =>
          row &&
          row.some(
            (cell) => typeof cell === "string" && cell.includes("ALMACÉN")
          )
      );

      if (almacenRow) {
        console.log(chalk.blue("ℹ️ Fila de almacén encontrada:"), almacenRow);
        const almacenCell = almacenRow.find(
          (cell) => cell !== "ALMACÉN" && cell !== "X" && cell
        );
        if (almacenCell) {
          almacen = almacenCell.toString().trim();
          console.log(chalk.green(`✅ Almacén identificado: ${almacen}`));
          break;
        }
      }
    }

    // 2. Procesar cada hoja
    for (const sheetName of sheetNames) {
      // Filtrar solo hojas de series
      if (!sheetName.includes("SERIE")) {
        console.log(
          chalk.yellow(`↩️ Saltando hoja no relevante: ${sheetName}`)
        );
        continue;
      }

      console.log(chalk.yellow(`\n📊 Procesando hoja: ${sheetName}`));
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
      });

      // Determinar tipo de serie (ESF+ o ESF-)
      const tipoSerie = sheetName.includes("ESF (+)") ? "ESF+" : "ESF-";
      const numSerie = sheetName.includes("1RA")
        ? 1
        : sheetName.includes("2DA")
        ? 2
        : 3;

      console.log(chalk.blue(`🔍 Tipo: ${tipoSerie}, Serie: ${numSerie}`));

      // Encontrar fila con encabezados de cilindros
      let headerRowIndex = -1;
      let cilindros = [];

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row) continue;

        // Buscar fila que contenga 0.25 en alguna columna (encabezado de cilindros)
        const hasCilHeaders = row.some(
          (cell) => typeof cell === "number" && cell.toFixed(2) === "0.25"
        );

        if (hasCilHeaders) {
          headerRowIndex = i;
          cilindros = row
            .slice(1) // Excluir primera columna (ESF)
            .filter((cell) => typeof cell === "number")
            .map((c) => c.toFixed(2));
          console.log(
            chalk.green("✅ Encabezados de cilindros encontrados en fila:", i)
          );
          console.log(chalk.blue("🔢 Cilindros:", cilindros.join(", ")));
          break;
        }
      }

      if (headerRowIndex === -1 || cilindros.length === 0) {
        console.log(
          chalk.red(`❌ No se encontraron encabezados válidos en ${sheetName}`)
        );
        continue;
      }

      // Procesar filas de datos (desde headerRowIndex + 1 hasta encontrar fila vacía)
      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) {
          console.log(chalk.yellow("📄 Fin de la tabla alcanzado"));
          break; // Fin de la tabla
        }

        const esferico = parseFloat(row[0]);
        if (isNaN(esferico)) {
          console.log(
            chalk.yellow(`⚠️ Valor ESF no numérico en fila ${i}:`, row[0])
          );
          continue;
        }

        // Procesar cada cilindro
        for (let j = 1; j <= cilindros.length && j < row.length; j++) {
          const stock = parseInt(row[j]);
          if (isNaN(stock)) {
            console.log(
              chalk.yellow(
                `⚠️ Valor de stock no numérico en fila ${i}, col ${j}:`,
                row[j]
              )
            );
            continue;
          }

          const lunaData = {
            esferico: esferico.toFixed(2),
            cilindrico: `-${cilindros[j - 1]}`,
            tipo: tipoLuna,
            zona: almacen,
            stock: stock,
            serie: numSerie,
            tipoEsferico: tipoSerie,
            precio: calcularPrecio(tipoLuna, esferico, cilindros[j - 1]),
            registradoPor: userId,
            fechaActualizacion: new Date(),
          };

          console.log(chalk.blue("\nℹ️ Datos a insertar:"), lunaData);

          try {
            // Validar que los datos cumplan con el esquema de Luna
            console.log(chalk.yellow("🔍 Validando datos con esquema Luna..."));
            const luna = new Luna(lunaData);
            await luna.validate();
            console.log(chalk.green("✅ Validación exitosa"));

            // Insertar o actualizar
            console.log(chalk.yellow("🔄 Intentando upsert en MongoDB..."));
            const result = await Luna.findOneAndUpdate(
              {
                esferico: lunaData.esferico,
                cilindrico: lunaData.cilindrico,
                tipo: lunaData.tipo,
                zona: lunaData.zona,
                serie: lunaData.serie,
              },
              lunaData,
              { upsert: true, new: true }
            );

            if (result) {
              totalProcessed++;
              console.log(
                chalk.green(`✔️ Registro procesado (Total: ${totalProcessed})`)
              );
              if (totalProcessed % 10 === 0) {
                process.stdout.write(chalk.green("."));
              }
            } else {
              console.log(chalk.yellow("⚠️ No se pudo realizar el upsert"));
            }
          } catch (error) {
            console.error(
              chalk.red(`\n❌ Error al guardar: ${JSON.stringify(lunaData)}`),
              error.message
            );
            if (error.errors) {
              console.error(chalk.red("Errores de validación:"), error.errors);
            }
          }
        }
      }
    }

    return totalProcessed;
  } catch (error) {
    console.error(
      chalk.red("\n❌ Error en procesamiento Excel a MongoDB:"),
      error
    );
    if (error.stack) {
      console.error(chalk.red("Stack trace:"), error.stack);
    }
    throw error;
  }
}

// Función para calcular precio
function calcularPrecio(tipoLuna, esferico, cilindrico) {
  const preciosBase = {
    "Fotomatic Blue Azul": 120,
    "Fotomatic Blue Verde": 130,
    "Rx Blue Block Azul": 150,
    "Rx Blue Block Verde": 160,
    "Rx Blanca": 100,
  };

  const precioBase = preciosBase[tipoLuna] || 100;
  const factorEsf = Math.min(1 + Math.abs(esferico) * 0.05, 1.5);
  const factorCil = Math.min(1 + Math.abs(cilindrico) * 0.03, 1.3);

  return Math.round(precioBase * factorEsf * factorCil);
}

// Función principal
async function main() {
  try {
    console.log(
      chalk.bgBlue.white.bold("\n=== SISTEMA DE IMPORTACIÓN ÓPTICA ===")
    );
    console.log(chalk.blue("Versión 3.0 - Con logs detallados\n"));

    // 1. Selección de archivo
    const filePath = await selectFileWithDialog();
    if (!filePath) {
      console.log(chalk.yellow("🚫 Operación cancelada."));
      return;
    }
    console.log(chalk.green(`📂 Archivo seleccionado: ${filePath}`));

    // 2. Análisis con OpenAI (opcional)
    console.log(chalk.blue("\n🔍 Analizando estructura del archivo..."));
    try {
      const analysisResult = await analyzeWithOpenAI(filePath, DEFAULT_API_KEY);
      fs.writeFileSync("analisis_optico.txt", analysisResult);
      console.log(
        chalk.yellow("💾 Resultados guardados en 'analisis_optico.txt'")
      );
    } catch (error) {
      console.log(chalk.yellow("⚠️ Continuando sin análisis de OpenAI..."));
    }

    // 3. Selección de tipo de luna
    console.log(chalk.blue("\n🔄 Preparando importación a MongoDB..."));
    const tipoLuna = await getTipoLunaFromUser();
    console.log(chalk.green(`\n🔘 Tipo seleccionado: ${tipoLuna}`));

    // 4. Confirmación
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const confirm = await new Promise((resolve) => {
      rl.question(
        chalk.yellow(`¿Importar ${tipoLuna} a MongoDB? (s/n): `),
        (answer) => {
          rl.close();
          resolve(answer.toLowerCase() === "s");
        }
      );
    });

    if (!confirm) {
      console.log(chalk.yellow("🚫 Importación cancelada por el usuario."));
      return;
    }

    // 5. Procesamiento e importación
    console.log(chalk.blue("\n⏳ Procesando archivo Excel..."));
    const userId = new mongoose.Types.ObjectId();
    console.log(chalk.blue(`🆔 ID de usuario simulado: ${userId}`));

    const totalProcessed = await processExcelToMongoDB(
      filePath,
      tipoLuna,
      userId
    );

    if (totalProcessed === 0) {
      console.log(
        chalk.red("\n⚠️ No se importaron registros. Posibles causas:")
      );
      console.log(
        chalk.yellow("1. El archivo no tiene datos en el formato esperado")
      );
      console.log(chalk.yellow("2. Los datos no pasaron las validaciones"));
      console.log(chalk.yellow("3. Problemas de conexión con MongoDB"));
      console.log(
        chalk.yellow("4. Errores en el esquema de la colección Luna")
      );
    } else {
      console.log(
        chalk.green(
          `\n✅ ${totalProcessed} registros importados/actualizados correctamente`
        )
      );
    }

    console.log(chalk.blue("\n✔️ Proceso completado exitosamente"));
  } catch (error) {
    console.error(chalk.red("\n❌ Error crítico:"), error.message);
    if (error.stack) {
      console.error(chalk.red("Stack trace:"), error.stack);
    }
  } finally {
    try {
      await mongoose.disconnect();
      console.log(chalk.blue("🔌 Desconectado de MongoDB"));
    } catch (err) {
      console.error(chalk.red("Error al desconectar de MongoDB:"), err);
    }
    process.exit(0);
  }
}

// Ejecutar
main();
