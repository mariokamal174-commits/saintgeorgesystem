import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as ExcelJS from "exceljs";

/**
 * Returns true if the font color is red.
 * Handles:
 *   1. ARGB strings  e.g. "FFFF0000", "FF0000"
 *   2. Excel indexed color 3  (standard palette red)
 *   3. Any ARGB where red channel >= 180, green < 100, blue < 100
 */
function isFontColorRed(font: Partial<ExcelJS.Font> | undefined): boolean {
  if (!font) return false;
  const color = font.color as any;
  if (!color) return false;

  // Indexed color 3 = standard Excel palette red
  if (typeof color.indexed === "number" && color.indexed === 3) return true;

  if (typeof color.argb === "string") {
    const argb = color.argb.toUpperCase().replace(/^#/, "");
    if (argb.length === 8) {
      const r = parseInt(argb.slice(2, 4), 16);
      const g = parseInt(argb.slice(4, 6), 16);
      const b = parseInt(argb.slice(6, 8), 16);
      if (!isNaN(r) && r >= 180 && g < 100 && b < 100) return true;
    }
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

/**
 * Arabic student names have at least 3 words, no digits, mostly Arabic letters.
 * This strict check avoids false-positives from status words like "مدفوع" or short labels.
 */
function isArabicStudentName(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed || trimmed.length < 6) return false;
  if (/\d/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length < 3) return false;                              // must have ≥ 3 words
  const arabicLetters = (trimmed.match(/[\u0600-\u06FF]/g) ?? []).length;
  const nonArabic = trimmed.replace(/[\u0600-\u06FF\s]/g, "").length;
  return arabicLetters >= 8 && nonArabic < 3;                     // mostly Arabic
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

        const sheetName = sheet.name || "";
        const sanitizedSheetName = sanitize(sheetName);

        // Skip sheets that look like exports, contact lists, student affairs, summaries, siblings, or transfer lists
        if (/(?:اخوه|ش[ؤئ]ون|جمله|محول|قايمه|موبايل|هاتف|list|mob|id|phone|mobile|contact)/i.test(sanitizedSheetName)) {
          continue;
        }

        // Skip parenthesized counts with arrows
        if (/\(\s*\d+\s*طالب\s*\).*←|←.*\(\s*\d+\s*طالب\s*\)/i.test(sheetName)) {
          continue;
        }

        // ── Step 1: find the name column ─────────────────────────────────
        // Strategy A: look for a recognised header label
        let nameColIdx = -1;
        let headerRowNum = -1;
        const headerScanLimit = Math.min(sheet.rowCount, 25);

        for (let r = 1; r <= headerScanLimit && nameColIdx === -1; r++) {
          sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, colNum) => {
            const val = String(cell.value ?? "").trim();
            if (val && isNameHeader(val)) {
              nameColIdx = colNum;
              headerRowNum = r;
            }
          });
        }

        // Strategy B: pick the column with the most Arabic student-name-shaped cells
        if (nameColIdx === -1) {
          const colScores: Record<number, number> = {};
          const dataScanLimit = Math.min(sheet.rowCount, 30);
          for (let r = 1; r <= dataScanLimit; r++) {
            sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, colNum) => {
              const val = String(cell.value ?? "").trim();
              if (isArabicStudentName(val)) {
                colScores[colNum] = (colScores[colNum] ?? 0) + 1;
              }
            });
          }
          // Only trust a column if it has at least 3 name-shaped values
          const best = Object.entries(colScores)
            .sort((a, b) => Number(b[1]) - Number(a[1]))[0];
          if (best && Number(best[1]) >= 3) {
            nameColIdx = Number(best[0]);
          }
        }

        // ── Step 2: scan rows for red-font names ─────────────────────────
        sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
          if (rowNum === headerRowNum) return;   // skip the header row itself

          if (nameColIdx !== -1) {
            const cell = row.getCell(nameColIdx);
            const valStr = String(cell.value ?? "").trim();
            if (valStr && isArabicStudentName(valStr) && isFontColorRed(cell.font)) {
              redTextStudents.add(valStr);
            }
          } else {
            // Last-resort: any Arabic student-name-shaped cell with red font
            row.eachCell({ includeEmpty: false }, (cell) => {
              const valStr = String(cell.value ?? "").trim();
              if (isArabicStudentName(valStr) && isFontColorRed(cell.font)) {
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
