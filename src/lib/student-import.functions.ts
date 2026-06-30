import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as ExcelJS from "exceljs";

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
      const excelWorkbook = new ExcelJS.Workbook();
      await excelWorkbook.xlsx.load(buffer as any);
      
      const redTextStudents = new Set<string>();
      
      const nameAliases = ["الاسم", "اسم الطالب", "name", "student_name", "fullname"];
      const sanitize = (s: string) => 
        s.trim()
         .toLowerCase()
         .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u00A0]/g, "")
         .replace(/[أإآ]/g, "ا")
         .replace(/ى/g, "ي")
         .replace(/ة/g, "ه")
         .replace(/[\u064B-\u0652]/g, "");

      const isRedColor = (fontColor: any): boolean => {
        if (!fontColor) return false;
        if (typeof fontColor === "object") {
          const argb = fontColor.argb;
          if (argb) {
            const colorStr = String(argb).toUpperCase();
            return colorStr === "FFFF0000" || colorStr === "FF0000" || colorStr.includes("FF0000");
          }
        }
        return false;
      };

      for (const sheet of excelWorkbook.worksheets) {
        let nameColIdx = -1;
        
        // Find header row and name column index (scan first 20 rows)
        const scanLimit = Math.min(sheet.rowCount, 20);
        for (let r = 1; r <= scanLimit; r++) {
          const row = sheet.getRow(r);
          row.eachCell((cell, colNumber) => {
            const val = String(cell.value || "").trim();
            if (val) {
              const sanitizedVal = sanitize(val);
              if (nameAliases.some(alias => sanitize(alias) === sanitizedVal)) {
                nameColIdx = colNumber;
              }
            }
          });
          if (nameColIdx !== -1) break;
        }

        // Scan rows
        sheet.eachRow((row, rowNumber) => {
          // If we found name column, look at that column specifically
          if (nameColIdx !== -1) {
            const nameCell = row.getCell(nameColIdx);
            if (nameCell && nameCell.value) {
              const valStr = String(nameCell.value).trim();
              const fontColor = nameCell.font?.color;
              if (isRedColor(fontColor) && valStr && !nameAliases.some(alias => sanitize(alias) === sanitize(valStr))) {
                redTextStudents.add(valStr);
              }
            }
          } else {
            // Fallback: check any cell in this row that might have red color
            row.eachCell((cell) => {
              if (cell.value) {
                const valStr = String(cell.value).trim();
                const fontColor = cell.font?.color;
                // If it's a string, not a number, and not a header alias
                if (isRedColor(fontColor) && valStr && isNaN(Number(valStr)) && !nameAliases.some(alias => sanitize(alias) === sanitize(valStr))) {
                  if (valStr.length > 3) {
                    redTextStudents.add(valStr);
                  }
                }
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
