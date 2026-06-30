import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as ExcelJS from "exceljs";

/**
 * Determines whether an ExcelJS font color is red.
 * Excel stores red in multiple ways:
 *   1. ARGB "FFFF0000" or "FF0000" (standard hex red)
 *   2. Indexed color 3  (red in the default Excel color palette)
 *   3. Any ARGB where the red channel >> green and blue (e.g. dark reds)
 */
function isFontColorRed(font: Partial<ExcelJS.Font> | undefined): boolean {
  if (!font) return false;

  const color = font.color as any;
  if (!color) return false;

  // --- 1. Indexed color 3 is Excel's standard red ---
  if (typeof color.indexed === "number" && color.indexed === 3) return true;

  // --- 2. ARGB string check ---
  if (typeof color.argb === "string") {
    const argb = color.argb.toUpperCase().replace(/^#/, "");
    // Full 8-char ARGB (AARRGGBB)
    if (argb.length === 8) {
      const r = parseInt(argb.slice(2, 4), 16);
      const g = parseInt(argb.slice(4, 6), 16);
      const b = parseInt(argb.slice(6, 8), 16);
      // Red dominant: red channel >= 200, green < 80, blue < 80
      if (!isNaN(r) && !isNaN(g) && !isNaN(b) && r >= 200 && g < 80 && b < 80) return true;
      // Exact standard reds
      if (argb === "FFFF0000" || argb === "FF0000FF") return false; // blue guard
      if (argb.endsWith("FF0000")) return true;
    }
    // Short 6-char RGB
    if (argb.length === 6) {
      const r = parseInt(argb.slice(0, 2), 16);
      const g = parseInt(argb.slice(2, 4), 16);
      const b = parseInt(argb.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b) && r >= 200 && g < 80 && b < 80) return true;
    }
  }

  return false;
}

const NAME_ALIASES = ["الاسم", "اسم الطالب", "name", "student_name", "fullname", "الاسم الكامل"];

function sanitize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u00A0]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u0652]/g, "");
}

function isHeaderValue(val: string): boolean {
  return NAME_ALIASES.some((alias) => sanitize(alias) === sanitize(val));
}

export const getRedTextStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { fileBase64: string };
    if (!i?.fileBase64) throw new Error("الملف مفقود");
    return i;
  })
  .handler(async ({ data }) => {
    try {
      const buffer = Buffer.from(data.fileBase64, "base64");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as any);

      const redTextStudents = new Set<string>();

      for (const sheet of wb.worksheets) {
        // ── Step 1: find which column holds student names ──────────────────
        let nameColIdx = -1;
        const scanLimit = Math.min(sheet.rowCount, 25);

        for (let r = 1; r <= scanLimit; r++) {
          const row = sheet.getRow(r);
          let found = false;
          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const val = String(cell.value ?? "").trim();
            if (val && isHeaderValue(val)) {
              nameColIdx = colNumber;
              found = true;
            }
          });
          if (found) break;
        }

        // ── Step 2: scan every data row for red-font cells ─────────────────
        sheet.eachRow({ includeEmpty: false }, (row) => {
          if (nameColIdx !== -1) {
            // Check the specific name column
            const cell = row.getCell(nameColIdx);
            const valStr = String(cell.value ?? "").trim();
            if (valStr && !isHeaderValue(valStr) && isFontColorRed(cell.font)) {
              redTextStudents.add(valStr);
            }
          } else {
            // Fallback: scan all cells in the row
            row.eachCell({ includeEmpty: false }, (cell) => {
              const valStr = String(cell.value ?? "").trim();
              if (
                valStr &&
                valStr.length > 2 &&
                isNaN(Number(valStr)) &&
                !isHeaderValue(valStr) &&
                isFontColorRed(cell.font)
              ) {
                redTextStudents.add(valStr);
              }
            });
          }
        });
      }

      return { success: true, redTextStudents: Array.from(redTextStudents) };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "فشل تحليل الألوان في الملف");
    }
  });
