const puppeteer = require("puppeteer");
const QRCode = require("qrcode");

const generarComprobantePDF = async (venta, tipo = "FACTURA ELECTRÓNICA") => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  // Configurar para A4 vertical
  await page.setViewport({ width: 794, height: 1123 }); // A4 en pixels

  const formatSigned = (val) =>
    val != null ? (val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2)) : "-";

  // 🔹 Construcción dinámica de items
  const rowsHtml = (venta.items || [])
    .map((item, i) => {
      const p = item.productId || {};
      const v = item.variantId || {};
      const m = item.measureId || {};
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

      // Limitar descripción para que no ocupe mucho espacio
      if (desc.length > 80) {
        desc = desc.substring(0, 80) + "...";
      }

      return `
        <tr>
          <td style="text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 10px;">${desc}</td>
          <td style="text-align: center; padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 10px;">${
            item.quantity || 1
          }</td>
          <td style="text-align: right; padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 10px;">S/ ${(
            item.unitPrice || 0
          ).toFixed(2)}</td>
          <td style="text-align: right; padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 10px;">S/ ${(
            item.totalPrice || 0
          ).toFixed(2)}</td>
        </tr>
      `;
    })
    .join("");

  // 🔹 Generar QR Data (SUNAT estándar)
  const qrData = [
    "20123456789",
    tipo.includes("FACTURA") ? "01" : "03",
    `${venta.serie || "F001"}-${venta.numero || venta.ot || "000001"}`,
    (venta.totalVenta - venta.totalVenta / 1.18).toFixed(2),
    venta.totalVenta.toFixed(2),
    new Date(venta.fechaVenta).toLocaleDateString("es-PE"),
    venta.paciente?.dni || "",
  ].join("|");

  const qrCodeDataUrl = await QRCode.toDataURL(qrData);

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
      
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: 'Inter', sans-serif;
        font-size: 12px;
        line-height: 1.3;
        color: #000;
        margin: 0;
        padding: 15px;
        background: #fff;
      }
      
      .container {
        max-width: 100%;
        margin: 0 auto;
      }
      
      /* HEADER ESTILO SUNAT */
      .header {
        border: 2px solid #000;
        padding: 12px;
        margin-bottom: 15px;
        background: #fff;
      }
      
      .header-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10px;
      }
      
      .empresa {
        flex: 2;
      }
      
      .empresa h1 {
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 4px;
        color: #000;
      }
      
      .empresa .ruc {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 4px;
      }
      
      .empresa .direccion {
        font-size: 11px;
        margin-bottom: 2px;
      }
      
      .comprobante-info {
        flex: 1;
        text-align: center;
        border: 2px solid #000;
        padding: 8px;
        background: #fff;
      }
      
      .comprobante-tipo {
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 5px;
        text-transform: uppercase;
      }
      
      .comprobante-numero {
        font-size: 14px;
        font-weight: 700;
        margin-bottom: 3px;
      }
      
      /* DATOS CLIENTE */
      .cliente-section {
        border: 1px solid #000;
        padding: 10px;
        margin-bottom: 12px;
        background: #fff;
      }
      
      .cliente-section h3 {
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 8px;
        text-decoration: underline;
      }
      
      .cliente-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 5px;
        font-size: 11px;
      }
      
      .cliente-item {
        display: flex;
      }
      
      .cliente-label {
        font-weight: 600;
        min-width: 100px;
      }
      
      /* TABLA COMPACTA */
      .tabla-container {
        margin-bottom: 12px;
      }
      
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
      }
      
      thead th {
        background: #000;
        color: #fff;
        padding: 8px 6px;
        text-align: center;
        font-weight: 600;
        border: 1px solid #000;
      }
      
      tbody td {
        padding: 6px 6px;
        border: 1px solid #ddd;
      }
      
      /* TOTALES COMPACTOS */
      .totales-section {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 12px;
      }
      
      .totales-container {
        width: 300px;
        border: 1px solid #000;
      }
      
      .total-line {
        display: flex;
        justify-content: space-between;
        padding: 6px 10px;
        border-bottom: 1px solid #ddd;
      }
      
      .total-line:last-child {
        border-bottom: none;
      }
      
      .total-line.igv {
        background: #f5f5f5;
      }
      
      .total-line.gran-total {
        background: #000;
        color: #fff;
        font-weight: 700;
        font-size: 13px;
      }
      
      .total-line.pagos {
        background: #f0f8f0;
      }
      
      .total-line.saldo {
        background: #fff8f0;
        font-weight: 600;
      }
      
      /* FOOTER COMPACTO */
      .footer {
        border: 1px solid #000;
        padding: 10px;
        margin-top: 10px;
        background: #fff;
      }
      
      .footer-content {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      
      .leyenda {
        flex: 2;
        font-size: 9px;
        line-height: 1.2;
      }
      
      .qr-container {
        flex: 1;
        text-align: center;
        padding: 5px;
      }
      
      .qr-code {
        width: 80px;
        height: 80px;
        border: 1px solid #ddd;
        padding: 2px;
      }
      
      .qr-text {
        font-size: 8px;
        margin-top: 3px;
      }
      
      /* ESTADOS COMPACTOS */
      .estado {
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 9px;
        font-weight: 600;
        display: inline-block;
      }
      
      .estado-pagado {
        background: #d4edda;
        color: #155724;
      }
      
      .estado-pendiente {
        background: #f8d7da;
        color: #721c24;
      }
      
      /* UTILIDADES */
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .text-left { text-align: left; }
      .font-bold { font-weight: 700; }
      .text-sm { font-size: 10px; }
      .text-xs { font-size: 9px; }
      
    </style>
  </head>
  <body>
    <div class="container">
      
      <!-- HEADER ESTILO SUNAT -->
      <div class="header">
        <div class="header-top">
          <div class="empresa">
            <h1>ÓPTICA VISION CENTER E.I.R.L.</h1>
            <div class="ruc">RUC: 20123456789</div>
            <div class="direccion">Av. Principal 123 - Lima, Perú</div>
            <div class="direccion">Tel: (01) 456-7890</div>
          </div>
          
          <div class="comprobante-info">
            <div class="comprobante-tipo">${tipo}</div>
            <div class="comprobante-numero">${venta.serie || "F001"}-${
    venta.numero || venta.ot || "000001"
  }</div>
            <div class="text-sm">${new Date(
              venta.fechaVenta
            ).toLocaleDateString("es-PE")}</div>
          </div>
        </div>
      </div>
      
      <!-- DATOS DEL CLIENTE -->
      <div class="cliente-section">
        <h3>DATOS DEL CLIENTE</h3>
        <div class="cliente-grid">
          <div class="cliente-item">
            <span class="cliente-label">Señor(es):</span>
            <span>${venta.paciente?.nombre || ""} ${
    venta.paciente?.apellido || ""
  }</span>
          </div>
          <div class="cliente-item">
            <span class="cliente-label">DNI/RUC:</span>
            <span>${venta.paciente?.dni || "—"}</span>
          </div>
          <div class="cliente-item">
            <span class="cliente-label">Dirección:</span>
            <span>${
              venta.paciente?.direccion?.ciudad ||
              venta.paciente?.direccion ||
              "—"
            }</span>
          </div>
          <div class="cliente-item">
            <span class="cliente-label">Celular:</span>
            <span>${venta.paciente?.celular || "—"}</span>
          </div>
          <div class="cliente-item">
            <span class="cliente-label">Vendedor:</span>
            <span>${venta.vendedora?.nombre || ""} ${
    venta.vendedora?.apellido || ""
  }</span>
          </div>
          <div class="cliente-item">
            <span class="cliente-label">Estado:</span>
            <span>
              ${
                (venta.saldoPendiente || 0) <= 0
                  ? '<span class="estado estado-pagado">PAGADO</span>'
                  : '<span class="estado estado-pendiente">PENDIENTE</span>'
              }
            </span>
          </div>
        </div>
      </div>
      
      <!-- DETALLE DE ITEMS -->
      <div class="tabla-container">
        <table>
          <thead>
            <tr>
              <th style="width: 55%; text-align: left;">DESCRIPCIÓN</th>
              <th style="width: 10%;">CANT.</th>
              <th style="width: 15%; text-align: right;">P. UNIT.</th>
              <th style="width: 20%; text-align: right;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
      
      <!-- TOTALES -->
      <div class="totales-section">
        <div class="totales-container">
          <div class="total-line">
            <span>OP. GRAVADA:</span>
            <span class="font-bold">S/ ${(venta.totalVenta / 1.18).toFixed(
              2
            )}</span>
          </div>
          <div class="total-line igv">
            <span>I.G.V. (18%):</span>
            <span class="font-bold">S/ ${(
              venta.totalVenta -
              venta.totalVenta / 1.18
            ).toFixed(2)}</span>
          </div>
          <div class="total-line gran-total">
            <span>IMPORTE TOTAL:</span>
            <span>S/ ${venta.totalVenta.toFixed(2)}</span>
          </div>
          <div class="total-line pagos">
            <span>TOTAL PAGADO:</span>
            <span class="font-bold">S/ ${(
              venta.pagos?.reduce((s, p) => s + (p.monto || 0), 0) || 0
            ).toFixed(2)}</span>
          </div>
          <div class="total-line saldo">
            <span>SALDO PENDIENTE:</span>
            <span class="font-bold">S/ ${(venta.saldoPendiente || 0).toFixed(
              2
            )}</span>
          </div>
        </div>
      </div>
      
      <!-- FOOTER -->
      <div class="footer">
        <div class="footer-content">
          <div class="leyenda">
            <div class="font-bold">SON: ${numeroAPalabras(
              venta.totalVenta
            )} SOLES</div>
            <div class="text-xs" style="margin-top: 3px;">
              Representación impresa de la ${tipo.toLowerCase()}. Este documento no será válido si ha sido alterado, mutilado o falsificado.
              Para consultas: optica.vision@email.com | Tel: (01) 456-7890
            </div>
          </div>
          <div class="qr-container">
            <img src="${qrCodeDataUrl}" alt="QR" class="qr-code">
            <div class="qr-text">CÓDIGO QR</div>
          </div>
        </div>
      </div>
      
    </div>
  </body>
  </html>
  `;

  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "10px",
      right: "10px",
      bottom: "10px",
      left: "10px",
    },
  });

  await browser.close();
  return pdfBuffer;
};

// Función auxiliar para convertir números a palabras (necesaria para "SON:")
function numeroAPalabras(numero) {
  // Esta es una implementación básica - puedes mejorarla
  const unidades = [
    "",
    "UNO",
    "DOS",
    "TRES",
    "CUATRO",
    "CINCO",
    "SEIS",
    "SIETE",
    "OCHO",
    "NUEVE",
  ];
  const decenas = [
    "",
    "DIEZ",
    "VEINTE",
    "TREINTA",
    "CUARENTA",
    "CINCUENTA",
    "SESENTA",
    "SETENTA",
    "OCHENTA",
    "NOVENTA",
  ];

  const entero = Math.floor(numero);
  const decimal = Math.round((numero - entero) * 100);

  if (entero === 0) return "CERO";
  if (entero === 1) return `UN SOL CON ${decimal}/100`;

  let palabras = "";

  if (entero < 10) {
    palabras = unidades[entero];
  } else if (entero < 100) {
    palabras = decenas[Math.floor(entero / 10)];
    if (entero % 10 !== 0) {
      palabras += " Y " + unidades[entero % 10];
    }
  } else {
    palabras = "CIEN"; // Simplificado para el ejemplo
  }

  return `${palabras} SOLES CON ${decimal}/100`;
}

module.exports = { generarComprobantePDF };
