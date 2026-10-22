/**
 * CSV Generation Utilities for Dokani POS
 *
 * Implements RFC 4180 escaping and cell sanitization to prevent CSV injection.
 */

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
}

/**
 * Sanitizes a string cell value to prevent formula injection (=, +, -, @)
 * and safely wraps in RFC 4180 quotes.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }

  let str = String(value);

  // Guard against spreadsheet formula injection in Excel/Sheets
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }

  // Escape internal double quotes by doubling them
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Formats an array of objects into standard CSV text.
 */
export function generateCsv<T>(columns: CsvColumn<T>[], data: T[]): string {
  const headerRow = columns.map((col) => sanitizeCsvCell(col.header)).join(",");

  const rows = data.map((item) => {
    return columns.map((col) => sanitizeCsvCell(col.accessor(item))).join(",");
  });

  return [headerRow, ...rows].join("\r\n");
}
