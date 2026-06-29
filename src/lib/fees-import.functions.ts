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
      
      const fees: FeesData[] = [];
      
      // معالجة كل ورقة في المصنف
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as (string | number)[][];
        
        if (!jsonData || jsonData.length === 0) continue;
        
        // البحث عن اسم الفصل (Grade 8، Grade 9، إلخ) في الأعمدة الأولى
        let gradeTitle = "";
        let firstInstallment = 0;
        let secondInstallment = 0;
        let golden = 0;
        
        // البحث في الصفوف الأولى عن بيانات الرسوم
        for (let i = 0; i < Math.min(5, jsonData.length); i++) {
          const row = jsonData[i];
          if (!row) continue;
          
          for (let j = 0; j < row.length; j++) {
            const cell = String(row[j] || "").trim();
            
            // البحث عن اسم الفصل (Grade 8، Grade 12، إلخ)
            if (cell.match(/^(grade|الفصل|المرحلة)\s*(\d+|[a-z]+)/i)) {
              gradeTitle = cell;
            }
            
            // البحث عن الأرقام الكبيرة التي تمثل الرسوم
            const num = parseFloat(cell);
            if (num > 0 && num > 5000) {
              // نتوقع أن تكون الرسوم > 5000
              // ترتيب: قسط أول، قسط ثاني، اجمالي
              if (firstInstallment === 0) {
                firstInstallment = num;
              } else if (secondInstallment === 0 && num !== firstInstallment) {
                secondInstallment = num;
              }
            }
          }
        }
        
        // إذا لم نجد اسم الفصل من الصفوف الأولى، استخدم اسم الورقة
        if (!gradeTitle) {
          gradeTitle = sheetName;
        }
        
        // إذا كانت لدينا بيانات صحيحة، أضفها
        if (gradeTitle && (firstInstallment > 0 || secondInstallment > 0)) {
          fees.push({
            grade_name: gradeTitle,
            first_installment: firstInstallment,
            second_installment: secondInstallment,
            golden_batch_fees: golden,
          });
        }
      }
      
      if (fees.length === 0) {
        throw new Error("لم يتم العثور على بيانات صحيحة في الملف. تأكد من وجود أسماء الفصول والرسوم");
      }
      
      return { success: true, fees, count: fees.length };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "فشل في قراءة الملف");
    }
  });
