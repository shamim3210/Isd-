// Minimal, dependency-free CSV writer. Good enough for exporting reports —
// escapes quotes/commas/newlines per RFC 4180.
function escapeCsvValue(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows, fields) {
  const header = fields.join(",");
  const lines = rows.map((row) => fields.map((f) => escapeCsvValue(row[f])).join(","));
  return [header, ...lines].join("\n");
}

module.exports = { toCsv };
