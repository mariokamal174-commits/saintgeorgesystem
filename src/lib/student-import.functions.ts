import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as ExcelJS from "exceljs";

/**
 * Returns true if the font color is red.
 * Excel stores red in multiple ways:
 *   1. ARGB string  e.g. "FFFF0000"
 *   2. Indexed color 3  (the standard Excel palette red)
 *   3. Any ARGB where red channel >> green + blue
 */
function isFontColorRed(font: Partial<ExcelJS.Font> | undefined): boolean {
  if (!font) return false;
  const color = font.color as any;
  if (!color) return false;

  // Indexed color 3 = standard Excel red
  if (typeof color.indexed === "number" && color.indexed === 3) return true;

  if (typeof color.argb === "string") {
    const argb = color.argb.toUpperCase().replace(/^#/, "");
    // 8-char AARRGGBB
    if (argb.length === 8) {
      const r = parseInt(argb.slice(2, 4), 16);
      const g = parseInt(argb.slice(4, 6), 16);
      const b = parseInt(argb.slice(6, 8), 16);
      if (!isNaN(r) && r >= 180 && g < 100 && b < 100) return true;
    }
    // 6-char RRGGBB
    if (argb.length === 6) {
      const r = parseInt(argb.slice(0, 2), 16);
      const g = parseInt(argb.slice(2, 4), 16);
      const b = parseInt(argb.slice(4, 6), 16);
      if (!isNaN(r) && r >= 180 && g < 100 && b < 100) return true;
    }
  }

  return false;
}

const NAME_HEADER_ALIASES = [
  "الاسم", "اسم الطالب", "الاسم الكامل", "اسم الطالب كاملا",
  "name", "student_name", "fullname", "full_name",
];

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

function isNameHeader(val: string): boolean {
  const s = sanitize(val);
  return NAME_HEADER_ALIASES.some((a) => sanitize(a) === s);
}

/** Heuristic: looks like an Arabic student name (at least 2 words, no digits) */
function looksLikeName(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed || trimmed.length < 4) return false;
  if (/\d/.test(trimmed)) return false;                           // has digits → not a name
  if (/^[\d\s.,؟!:،]+$/.test(trimmed)) return false;             // only punctuation
  const arabicLetters = (trimmed.match(/[\u0600-\u06FF]/g) || []).length;
  return arabicLetters >= 4;                                      // at least 4 Arabic letters
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
        if (!sheet.rowCount) continue;

        // ── Step 1: find the column that holds student names ──────────────
        // Strategy A: look for a header row with a known name alias
        let nameColIdx = -1;
        const headerScanLimit = Math.min(sheet.rowCount, 20);

        for (let r = 1; r <= headerScanLimit && nameColIdx === -1; r++) {
          const row = sheet.getRow(r);
          row.eachCell({ includeEmpty: false }, (cell, colNum) => {
            const val = String(cell.value ?? "").trim();
            if (val && isNameHeader(val)) {
              nameColIdx = colNum;
            }
          });
        }

        // Strategy B: if no header found, find the column that has the most
        // Arabic-looking values in the first 15 data rows
        if (nameColIdx === -1) {
          const colScores: Record<number, number> = {};
          const dataScanLimit = Math.min(sheet.rowCount, 15);
          for (let r = 1; r <= dataScanLimit; r++) {
            const row = sheet.getRow(r);
            row.eachCell({ includeEmpty: false }, (cell, colNum) => {
              const val = String(cell.value ?? "").trim();
              if (looksLikeName(val)) {
                colScores[colNum] = (colScores[colNum] ?? 0) + 1;
              }
            });
          }
          const best = Object.entries(colScores).sort((a, b) => b[1] - a[1])[0];
          if (best && Number(best[1]) >= 2) {
            nameColIdx = Number(best[0]);
          }
        }

        // ── Step 2: scan every row and check font color ───────────────────
        sheet.eachRow({ includeEmpty: false }, (row) => {
          if (nameColIdx !== -1) {
            // Check the detected name column only
            const cell = row.getCell(nameColIdx);
            const valStr = String(cell.value ?? "").trim();
            if (valStr && looksLikeName(valStr) && isFontColorRed(cell.font)) {
              redTextStudents.add(valStr);
            }
          } else {
            // Last-resort: any Arabic-looking cell with red font
            row.eachCell({ includeEmpty: false }, (cell) => {
              const valStr = String(cell.value ?? "").trim();
              if (looksLikeName(valStr) && isFontColorRed(cell.font)) {
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
