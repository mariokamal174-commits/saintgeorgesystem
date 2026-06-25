import * as XLSX from "xlsx";
import { formatAge } from "./age";

type StudentRow = Record<string, unknown> & {
  full_name?: string | null;
  student_code?: string | null;
  national_id?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  gender?: string | null;
  religion?: string | null;
  mother_name?: string | null;
  mother_national_id?: string | null;
  father_national_id?: string | null;
  guardian_name?: string | null;
  guardian_job?: string | null;
  address?: string | null;
  phone?: string | null;
  phone2?: string | null;
  first_installment?: number | null;
  second_installment?: number | null;
  previous_installments?: number | null;
  other_fees?: number | null;
  total_due?: number | null;
  total_paid?: number | null;
  remaining_balance?: number | null;
  payment_status?: string | null;
  is_transferred_in?: boolean | null;
  transfer_out_type?: string | null;
  transfer_out_date?: string | null;
  archived_year?: string | null;
};

export function exportStudentsToExcel(rows: StudentRow[], filename = "students.xlsx") {
  const data = rows.map((s) => ({
    "اسم الطالب": s.full_name ?? "",
    "كود الطالب": s.student_code ?? "",
    "الرقم القومي للطالب": s.national_id ?? "",
    "تاريخ الميلاد": s.birth_date ?? "",
    "السن (1/10)": formatAge(s.birth_date as string | null | undefined),
    "محل الميلاد": s.birth_place ?? "",
    "النوع": s.gender ?? "",
    "الديانة": s.religion ?? "",
    "اسم الأم": s.mother_name ?? "",
    "الرقم القومي للأم": s.mother_national_id ?? "",
    "الرقم القومي للأب": s.father_national_id ?? "",
    "اسم ولي الأمر": s.guardian_name ?? "",
    "وظيفة ولي الأمر": s.guardian_job ?? "",
    "العنوان": s.address ?? "",
    "الهاتف 1": s.phone ?? "",
    "الهاتف 2": s.phone2 ?? "",
    "القسط الأول": Number(s.first_installment ?? 0),
    "القسط الثاني": Number(s.second_installment ?? 0),
    "أقساط سابقة": Number(s.previous_installments ?? 0),
    "رسوم أخرى": Number(s.other_fees ?? 0),
    "الإجمالي": Number(s.total_due ?? 0),
    "المدفوع": Number(s.total_paid ?? 0),
    "المتبقي": Number(s.remaining_balance ?? 0),
    "الصف / الفصل": String((s.classes as any)?.name ?? (s.grades as any)?.name ?? ""),
    "حالة السداد": s.payment_status === "paid" ? "مسدد بالكامل" : "غير مسدد",
    "محول للمدرسة": s.is_transferred_in ? "نعم" : "لا",
    "حالة سحب الملف": s.transfer_out_type === "transfer" ? "محول" : s.transfer_out_type === "withdrawal" ? "مسحوب" : "",
    "تاريخ سحب الملف": s.transfer_out_date ?? "",
    "السنة المؤرشفة": s.archived_year ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "الطلاب");
  XLSX.writeFile(wb, filename);
}
