// pdfkit is loaded lazily so an unrelated deployment problem with it can never
// stop the whole API (login, books, loans...) from starting.

/**
 * Streams a simple tabular PDF report directly to an HTTP response.
 * columns: [{ key, label, width }]
 * rows: array of plain objects
 */
function toPdf(res, { title, columns, rows }) {
  const PDFDocument = require("pdfkit");
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  doc.fontSize(18).fillColor("#7A3B2E").text(title, { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#888888").text(`Generated ${new Date().toLocaleString()} · ${rows.length} records`);
  doc.moveDown(1);

  const startX = doc.x;
  let y = doc.y;
  const rowHeight = 20;

  function drawHeader() {
    doc.fontSize(9).fillColor("#ffffff");
    doc.rect(startX, y, columns.reduce((s, c) => s + c.width, 0), rowHeight).fill("#1F2937");
    let x = startX;
    columns.forEach((col) => {
      doc.fillColor("#ffffff").text(col.label, x + 4, y + 6, { width: col.width - 8, ellipsis: true });
      x += col.width;
    });
    y += rowHeight;
  }

  drawHeader();

  rows.forEach((row, i) => {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = doc.y;
      drawHeader();
    }
    if (i % 2 === 0) {
      doc.rect(startX, y, columns.reduce((s, c) => s + c.width, 0), rowHeight).fill("#F3F1EA");
    }
    let x = startX;
    columns.forEach((col) => {
      const val = row[col.key] === undefined || row[col.key] === null ? "—" : String(row[col.key]);
      doc.fontSize(8).fillColor("#22201B").text(val, x + 4, y + 6, { width: col.width - 8, ellipsis: true });
      x += col.width;
    });
    y += rowHeight;
  });

  doc.end();
}

module.exports = { toPdf };
