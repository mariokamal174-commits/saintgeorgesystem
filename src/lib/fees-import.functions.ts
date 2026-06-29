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
      
      // قراءة البيانات
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as (string | number)[][];
      
      const fees: FeesData[] = [];
      
      // المسح عبر الصفوف - البيانات من فوق مباشرة
      for (let i = 0; i < Math.min(50, jsonData.length); i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;
        
        // البحث عن اسم الفصل (Grade, G1, 10, 11، إلخ)
        let gradeName = "";
        let firstInstall = 0;
        let secondInstall = 0;
        let goldenBatch = 0;
        
        // البحث عن كلمات تدل على الفصل
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || "").trim();
          const cellLower = cell.toLowerCase();
          
          // ابحث عن كلمة "فصل" أو "grade" أو حرف واحد مع رقم
          if (cellLower.includes("grade") || 
              cellLower.match(/^g\d+$/i) ||
              cell.match(/^\d+$/) && parseInt(cell) >= 10 && parseInt(cell) <= 21) {
            gradeName = cell;
            break;
          }
        }
        
        // إذا وجدنا الفصل، ابحث عن الرسوم في نفس الصف
        if (gradeName) {
          for (let j = 0; j < row.length; j++) {
            const cell = String(row[j] || "");
            const cellLower = cell.toLowerCase();
            const num = parseFloat(cell.replace(/[^0-9.-]/g, "")) || 0;
            
            // ابحث عن كلمات الرسوم وأرقامها
            if (num > 1000) {
              if (cellLower.includes("أول") || cellLower.includes("first")) {
                firstInstall = num;
              } else if (cellLower.includes("ثاني") || cellLower.includes("second")) {
                secondInstall = num;
              } else if (cellLower.includes("ذهب") || cellLower.includes("golden") || cellLower.includes("دفعة")) {
                goldenBatch = num;
              }
            }
          }
          
          // إذا وجدنا رسوم، أضف الصف
          if (firstInstall > 0 || secondInstall > 0 || goldenBatch > 0) {
            fees.push({
              grade_name: gradeName,
              first_installment: firstInstall,
              second_installment: secondInstall,
              golden_batch_fees: goldenBatch,
            });
            
            // انتقل للصف التالي بعد العثور على فصل صحيح
            i += 2;
          }
        }
      }
      
      if (fees.length === 0) {
        throw new Error("لم يتم العثور على بيانات. تأكد من وجود أسماء الفصول والرسوم في الملف");
      }
      
      return { success: true, fees, count: fees.length };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "فشل في قراءة الملف");
    }
  });
