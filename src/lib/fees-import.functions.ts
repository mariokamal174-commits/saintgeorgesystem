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
        
        // تقسيم النص إلى أسطر معالجة
        const lines = firstRowText.split(/\n|\r\n/);
        let allText = firstRowText.toLowerCase();
        
        // استخراج جميع الأرقام من النص
        const allNumbers = firstRowText.match(/\d+/g) || [];
        const numbers = allNumbers.map(n => parseInt(n));
        
        // قسط أول - البحث في كل سطر
        for (const line of lines) {
          if (line.toLowerCase().includes('قسط') && (line.toLowerCase().includes('اول') || line.toLowerCase().includes('أول'))) {
            const match = line.match(/(\d+)/);
            if (match) firstInstall = parseInt(match[1]);
            break;
          }
        }
        
        // قسط ثاني
        for (const line of lines) {
          if (line.toLowerCase().includes('قسط') && (line.toLowerCase().includes('ثاني') || line.toLowerCase().includes('تاني'))) {
            const match = line.match(/(\d+)/);
            if (match) secondInstall = parseInt(match[1]);
            break;
          }
        }
        
        // الدفعة الذهبية (اجمالى)
        // قد تكون "اجمالى" أو "إجمالي"
        const totalMatch = firstRowText.match(/اجمال[ىي]?\s+(\d+)/i);
        if (totalMatch) {
          goldenBatch = parseInt(totalMatch[1]);
        }
        
        // إذا كان لدينا إجمالي، فالأقساط الذهبية = الأقساط العادية (أو قد نحتاج معلومات منفصلة)
        if (goldenBatch > 0) {
          goldenFirst = firstInstall;
          goldenSecond = secondInstall;
        }
        
        // إذا كان النص يحتوي على معلومات منفصلة للدفعة الذهبية (قسط ذهبي أول، قسط ذهبي ثاني)
        const goldenFirstMatch = firstRowText.match(/(?:قسط|ق)\s*ذهب[ي|يّ|ي|ة]?\s*(?:اول|أول|أولى|اولى)\s*(\d+)/i);
        if (goldenFirstMatch) {
          goldenFirst = parseInt(goldenFirstMatch[1]);
        }
        
        const goldenSecondMatch = firstRowText.match(/(?:قسط|ق)\s*ذهب[ي|يّ|ي|ة]?\s*(?:ثاني|تاني|ثانى|تانى|ثانية|تانية)\s*(\d+)/i);
        if (goldenSecondMatch) {
          goldenSecond = parseInt(goldenSecondMatch[1]);
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
