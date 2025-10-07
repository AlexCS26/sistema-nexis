// server/src/services/nubefact-service.js
const axios = require("axios");

class NubefactService {
  constructor() {
    this.apiUrl = process.env.NUBEFACT_API_URL;
    this.token = process.env.NUBEFACT_TOKEN;
    this.empresa = {
      ruc: process.env.NUBEFACT_EMPRESA_RUC,
      nombre: process.env.NUBEFACT_EMPRESA_NOMBRE,
      direccion: process.env.NUBEFACT_EMPRESA_DIRECCION,
    };
  }

  async generarComprobante(venta, tipo = "FACTURA ELECTRÓNICA") {
    try {
      console.log("🔄 Enviando comprobante a Nubefact...");

      const comprobanteData = this.prepararDatosComprobante(venta, tipo);

      const response = await axios.post(this.apiUrl, comprobanteData, {
        headers: {
          Authorization: this.token,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });

      console.log("✅ Comprobante enviado a Nubefact");
      return response.data;
    } catch (error) {
      console.error(
        "❌ Error Nubefact:",
        error.response?.data || error.message
      );
      throw new Error(
        `Nubefact: ${error.response?.data?.errors || error.message}`
      );
    }
  }

  prepararDatosComprobante(venta, tipo) {
    const igv = venta.totalVenta - venta.totalVenta / 1.18;
    const opGravada = venta.totalVenta / 1.18;

    // Determinar tipo de documento del cliente
    const clienteDoc = this.obtenerTipoDocumentoCliente(venta.paciente?.dni);

    // 🔹 CORRECCIÓN 1: Usar fecha actual (requerido por Nubefact)
    const fechaActual = new Date();

    // 🔹 CORRECCIÓN 2: Usar series válidas de tu cuenta Nubefact
    // Consulta en tu panel de Nubefact qué series tienes disponibles
    // Generalmente para boletas: "BBB1", "BBB2", etc.
    // Generalmente para facturas: "FFF1", "FFF2", etc.
    const serieValida = tipo.includes("FACTURA") ? "FFF1" : "BBB1";

    return {
      operacion: "generar_comprobante",
      tipo_de_comprobante: tipo.includes("FACTURA") ? 1 : 2,
      serie: serieValida, // Usar serie válida
      numero: venta.numero || venta.ot || 1,
      sunat_transaction: 1, // Venta interna
      cliente_tipo_de_documento: clienteDoc.tipo,
      cliente_numero_de_documento: clienteDoc.numero,
      cliente_denominacion:
        `${venta.paciente?.nombre || ""} ${
          venta.paciente?.apellido || ""
        }`.trim() || "CLIENTE GENERAL",
      cliente_direccion:
        venta.paciente?.direccion?.ciudad ||
        venta.paciente?.direccion ||
        "LIMA",
      cliente_email: venta.paciente?.email || "",
      fecha_de_emision: this.formatearFecha(fechaActual), // Fecha actual
      moneda: 1, // Soles
      porcentaje_de_igv: 18.0,
      total_gravada: parseFloat(opGravada.toFixed(2)),
      total_igv: parseFloat(igv.toFixed(2)),
      total: parseFloat(venta.totalVenta.toFixed(2)),
      enviar_automaticamente_a_la_sunat: true,
      enviar_automaticamente_al_cliente: false,
      items: this.prepararItems(venta.items || []),
      formato_de_pdf: "A4",
    };
  }

  obtenerTipoDocumentoCliente(dni) {
    if (!dni) return { tipo: "-", numero: "-" }; // Varios para boletas
    if (dni.length === 8) return { tipo: "1", numero: dni }; // DNI
    if (dni.length === 11) return { tipo: "6", numero: dni }; // RUC
    return { tipo: "-", numero: "-" };
  }

  prepararItems(items) {
    return items.map((item, index) => {
      const descripcion = this.obtenerDescripcionProducto(item);
      const valorUnitario = (item.unitPrice || 0) / 1.18; // Sin IGV
      const precioUnitario = item.unitPrice || 0; // Con IGV
      const cantidad = item.quantity || 1;
      const subtotal = valorUnitario * cantidad;
      const igv = (precioUnitario - valorUnitario) * cantidad;

      return {
        unidad_de_medida: "NIU",
        codigo: `ITEM${index + 1}`,
        descripcion: descripcion,
        cantidad: parseFloat(cantidad.toFixed(10)),
        valor_unitario: parseFloat(valorUnitario.toFixed(10)),
        precio_unitario: parseFloat(precioUnitario.toFixed(10)),
        subtotal: parseFloat(subtotal.toFixed(2)),
        tipo_de_igv: 1, // Gravado - Operación Onerosa
        igv: parseFloat(igv.toFixed(2)),
        total: parseFloat((precioUnitario * cantidad).toFixed(2)),
      };
    });
  }

  obtenerDescripcionProducto(item) {
    const p = item.productId || {};
    const v = item.variantId || {};
    const m = item.measureId || {};

    const formatSigned = (val) =>
      val != null ? (val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2)) : "-";

    let desc = p.name || "Producto";
    if (p.brand) desc += ` - ${p.brand}`;

    if (v._id) {
      const details = [
        v.color && `Color: ${v.color}`,
        v.size && `Tamaño: ${v.size}`,
        v.material && `Material: ${v.material}`,
      ]
        .filter(Boolean)
        .join(" | ");
      if (details) desc += ` (${details})`;
    }

    if (m._id) {
      desc += ` (Esf: ${formatSigned(m.sphere)} / Cil: ${formatSigned(
        m.cylinder
      )}${m.add != null ? ` / Add: ${formatSigned(m.add)}` : ""})`;
    }

    // Limitar descripción
    if (desc.length > 250) desc = desc.substring(0, 250) + "...";

    return desc;
  }

  formatearFecha(fecha) {
    const date = new Date(fecha);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  async consultarComprobante(tipo, serie, numero) {
    try {
      const data = {
        operacion: "consultar_comprobante",
        tipo_de_comprobante: tipo,
        serie: serie,
        numero: numero,
      };

      const response = await axios.post(this.apiUrl, data, {
        headers: {
          Authorization: this.token,
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(
        `Error consultando comprobante: ${
          error.response?.data?.errors || error.message
        }`
      );
    }
  }

  // NUEVO: Método para obtener el PDF del comprobante
  async obtenerPDFComprobante(comprobanteResponse) {
    try {
      // Verificar si la respuesta tiene enlace_del_pdf
      if (comprobanteResponse.enlace_del_pdf) {
        const pdfResponse = await axios.get(
          comprobanteResponse.enlace_del_pdf,
          {
            responseType: "arraybuffer",
            headers: {
              Authorization: this.token,
            },
          }
        );
        return Buffer.from(pdfResponse.data);
      }
      // Si no tiene enlace directo, intentar con el enlace base + .pdf
      else if (comprobanteResponse.enlace) {
        const pdfUrl = comprobanteResponse.enlace.endsWith(".pdf")
          ? comprobanteResponse.enlace
          : `${comprobanteResponse.enlace}.pdf`;

        const pdfResponse = await axios.get(pdfUrl, {
          responseType: "arraybuffer",
          headers: {
            Authorization: this.token,
          },
        });
        return Buffer.from(pdfResponse.data);
      }
      // Si viene en base64 (pdf_zip_base64)
      else if (comprobanteResponse.pdf_zip_base64) {
        return Buffer.from(comprobanteResponse.pdf_zip_base64, "base64");
      } else {
        throw new Error("No se encontró PDF en la respuesta de Nubefact");
      }
    } catch (error) {
      console.error("❌ Error obteniendo PDF:", error.message);
      throw new Error(`Error al obtener PDF: ${error.message}`);
    }
  }

  // NUEVO: Método para anular comprobante
  async anularComprobante(tipo, serie, numero, motivo = "ERROR DEL SISTEMA") {
    try {
      const data = {
        operacion: "generar_anulacion",
        tipo_de_comprobante: tipo,
        serie: serie,
        numero: numero,
        motivo: motivo,
      };

      const response = await axios.post(this.apiUrl, data, {
        headers: {
          Authorization: this.token,
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(
        `Error anulando comprobante: ${
          error.response?.data?.errors || error.message
        }`
      );
    }
  }

  // NUEVO: Método para consultar anulación
  async consultarAnulacion(tipo, serie, numero) {
    try {
      const data = {
        operacion: "consultar_anulacion",
        tipo_de_comprobante: tipo,
        serie: serie,
        numero: numero,
      };

      const response = await axios.post(this.apiUrl, data, {
        headers: {
          Authorization: this.token,
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(
        `Error consultando anulación: ${
          error.response?.data?.errors || error.message
        }`
      );
    }
  }

  // NUEVO: Método completo que genera comprobante y retorna PDF
  async generarComprobanteConPDF(venta, tipo = "FACTURA ELECTRÓNICA") {
    try {
      // 1. Generar comprobante en Nubefact
      const comprobanteResponse = await this.generarComprobante(venta, tipo);

      // 2. Obtener el PDF generado por Nubefact
      const pdfBuffer = await this.obtenerPDFComprobante(comprobanteResponse);

      return {
        comprobante: comprobanteResponse,
        pdf: pdfBuffer,
      };
    } catch (error) {
      throw new Error(`Error generando comprobante con PDF: ${error.message}`);
    }
  }
}

module.exports = new NubefactService();
