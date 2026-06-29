import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as XLSX from "xlsx";

interface FeesData {
  grade_name: string;
  first_installment: number;
  second_installment: number;
  golden_batch_fees: number;
  other_fees?: number;
}

export const importFeesFromExcel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { fileBase64: string };
    if (!i?.fileBase64) throw new Error("Missing file");
    return i;
  })
  .handler(async ({ data }) => {
    try {
      // تحويل base64 إلى Buffer
      const binaryString = Buffer.from(data.fileBase64, "base64").toString("binary");
      
      // قراءة الملف
      const workbook = XLSX.read(binaryString, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // قراءة كل البيانات
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as (string | number)[][];
      
      const fees: FeesData[] = [];
      
      // تسطيح جميع الخلايا إلى نص واحد لتحليله
      const allText: string[] = [];
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (row) {
          for (let j = 0; j < row.length; j++) {
            const cell = String(row[j] || "").trim();
            if (cell) allText.push(cell);
          }
        }
      }
      
      // البحث عن أسماء الفصول والرسوم
      let currentGrade = "";
      let firstInstall = 0;
      let secondInstall = 0;
      let goldenBatch = 0;
      
      for (let i = 0; i < allText.length; i++) {
        const cell = allText[i].toLowerCase();
        const cellOrig = allText[i];
        const num = parseFloat(cellOrig.replace(/[^0-9.-]/g, "")) || 0;
        
        // ابحث عن اسم الفصل
        if (cellOrig.match(/^(G|Grade)\d+$/i) || cellOrig.match(/^\d+$/) && parseInt(cellOrig) >= 10 && parseInt(cellOrig) <= 21) {
          // إذا كان لدينا فصل سابق بيانات، حفظه
          if (currentGrade && (firstInstall > 0 || secondInstall > 0 || goldenBatch > 0)) {
            fees.push({
              grade_name: currentGrade,
              first_installment: firstInstall,
              second_installment: secondInstall,
              golden_batch_fees: goldenBatch,
            });
          }
          
          // ابدأ بفصل جديد
          currentGrade = cellOrig;
          firstInstall = 0;
          secondInstall = 0;
          goldenBatch = 0;
        }
        
        // ابحث عن رسوم القسط الأول
        if ((cell.includes("قسط") && cell.includes("أول")) || cell.includes("first")) {
          // الرقم قد يكون في الخلية التالية أو في نفس الخلية
          if (num > 1000) {
            firstInstall = num;
          } else if (i + 1 < allText.length) {
            const nextNum = parseFloat(allText[i + 1].replace(/[^0-9.-]/g, "")) || 0;
            if (nextNum > 1000) {
              firstInstall = nextNum;
            }
          }
        }
        
        // ابحث عن رسوم القسط الثاني
        if ((cell.includes("قسط") && cell.includes("ثاني")) || cell.includes("second")) {
          if (num > 1000) {
            secondInstall = num;
          } else if (i + 1 < allText.length) {
            const nextNum = parseFloat(allText[i + 1].replace(/[^0-9.-]/g, "")) || 0;
            if (nextNum > 1000) {
              secondInstall = nextNum;
            }
          }
        }
        
        // ابحث عن الدفعة الذهبية
        if ((cell.includes("ذهب") || cell.includes("دفعة") || cell.includes("golden")) && !cell.includes("قسط")) {
          if (num > 1000) {
            goldenBatch = num;
          } else if (i + 1 < allText.length) {
            const nextNum = parseFloat(allText[i + 1].replace(/[^0-9.-]/g, "")) || 0;
            if (nextNum > 1000) {
              goldenBatch = nextNum;
            }
          }
        }
      }
      
      // أضف آخر فصل
      if (currentGrade && (firstInstall > 0 || secondInstall > 0 || goldenBatch > 0)) {
        fees.push({
          grade_name: currentGrade,
          first_installment: firstInstall,
          second_installment: secondInstall,
          golden_batch_fees: goldenBatch,
        });
      }
      
      if (fees.length === 0) {
        throw new Error("لم يتم العثور على بيانات. تأكد من وجود أسماء الفصول والرسوم في الملف");
      }
      
      return { success: true, fees, count: fees.length };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "فشل في قراءة الملف");
    }
  });
