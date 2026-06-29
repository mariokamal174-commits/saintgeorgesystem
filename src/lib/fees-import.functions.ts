import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as XLSX from "xlsx";
import * as ExcelJS from "exceljs";

interface FeesData {
  grade_name: string;
  first_installment: number;
  second_installment: number;
  golden_batch_fees: number;
  golden_first_installment?: number;
  golden_second_installment?: number;
  red_text_student_names?: string[];
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
      
      // قراءة الألوان باستخدام exceljs
      const buffer = Buffer.from(data.fileBase64, "base64");
      const excelWorkbook = new ExcelJS.Workbook();
      await excelWorkbook.xlsx.load(buffer);
      
      const fees: FeesData[] = [];
      
      // معالجة كل ورقة في المصنف
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as (string | number)[][];
        
        // الحصول على ورقة exceljs المقابلة للقراءة بالألوان
        const excelSheet = excelWorkbook.getWorksheet(sheetName);
        
        if (!jsonData || jsonData.length < 2) continue;
        
        // الصف الأول يحتوي على معلومات الفصل والرسوم
        const firstRow = jsonData[0];
        if (!firstRow || firstRow.length === 0) continue;
        
        // ادمج جميع خلايا الصف الأول كنص واحد
        const firstRowText = firstRow.map(r => String(r || "")).join(" ");
        
        // ابحث عن اسم الفصل (KG1, G1, Grade 1, 1، إلخ)
        const gradeMatch = firstRowText.match(/(KG\d+|G\d+|Grade\s*\d+|\d+)\b/i);
        if (!gradeMatch) continue;
        
        const gradeName = gradeMatch[1];
        
        // ابحث عن الأرقام مع كلمات القسط والإجمالي
        let firstInstall = 0;
        let secondInstall = 0;
        let goldenBatch = 0;
        let goldenFirst = 0;
        let goldenSecond = 0;
        
        // قسط أول (مع معالجة الصيغ المختلفة)
        const firstMatch = firstRowText.match(/قسط\s*(?:اول|أول|اولى|أولى|اوله|أوله)\s*[:\-\s]*(\d+)/i);
        if (firstMatch) firstInstall = parseFloat(firstMatch[1]) || 0;
        
        // قسط ثاني
        const secondMatch = firstRowText.match(/قسط\s*(?:تاني|ثاني|تانى|ثانى|تانية|ثانية)\s*[:\-\s]*(\d+)/i);
        if (secondMatch) secondInstall = parseFloat(secondMatch[1]) || 0;
        
        // دفعة ذهبية - اجمالى
        const goldenMatch = firstRowText.match(/اجمال[ى|ي|ة]\s*[:\-\s]*(\d+)/i);
        if (goldenMatch) {
          goldenBatch = parseFloat(goldenMatch[1]) || 0;
          // الأقساط الذهبية = الأقساط العادية
          goldenFirst = firstInstall;
          goldenSecond = secondInstall;
        }
        
        // البحث عن أسماء الطلاب باللون الأحمر
        const redTextStudents: string[] = [];
        if (excelSheet) {
          // البحث في الصفوف عن خلايا بأسماء باللون الأحمر (في العمود الثاني عادة)
          excelSheet.eachRow((row, rowNumber) => {
            if (rowNumber <= 1) return; // تخطي الصفوف الأولى (headers)
            
            const nameCell = row.getCell(2); // العمود الثاني عادة يحتوي على الاسم
            if (nameCell && nameCell.value) {
              const fontColor = nameCell.font?.color;
              // تحقق من اللون الأحمر (FF0000 أو معرّفات أخرى للأحمر)
              if (fontColor && typeof fontColor === 'object' && 'argb' in fontColor) {
                const color = String(fontColor.argb).toUpperCase();
                if (color === 'FFFF0000' || color === 'FF0000' || color.includes('FF0000')) {
                  redTextStudents.push(String(nameCell.value));
                }
              } else if (fontColor === 'FF0000' || fontColor === 'FF') {
                redTextStudents.push(String(nameCell.value));
              }
            }
          });
        }
        
        // إذا وجدنا رسوم، أضفها
        if (firstInstall > 0 || secondInstall > 0 || goldenBatch > 0) {
          fees.push({
            grade_name: gradeName,
            first_installment: firstInstall,
            second_installment: secondInstall,
            golden_batch_fees: goldenBatch,
            golden_first_installment: goldenFirst,
            golden_second_installment: goldenSecond,
            red_text_student_names: redTextStudents.length > 0 ? redTextStudents : undefined,
          });
        }
      }
      
      if (fees.length === 0) {
        throw new Error("لم يتم العثور على بيانات. تأكد من أن الملف يحتوي على أسماء الفصول والرسوم");
      }
      
      return { success: true, fees, count: fees.length };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "فشل في قراءة الملف");
    }
  });
