import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://rvbtjytipbjmnikrsfbw.supabase.co";
const supabaseKey = "sb_publishable_1rHjswvH23OUi0Gqui6t1A_XEfbsOyM";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkReceipts() {
  // Let's sign in first to bypass RLS if needed, or query directly.
  // Wait, let's query receipts directly.
  const { data: receipts, error: receiptsError } = await supabase
    .from("receipts")
    .select("id, student_id, receipt_number, receipt_date, amount, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (receiptsError) {
    console.error("Error fetching receipts:", receiptsError);
    return;
  }

  console.log("=== RECENT RECEIPTS ===");
  console.log(JSON.stringify(receipts, null, 2));

  if (receipts && receipts.length > 0) {
    const studentIds = receipts.map(r => r.student_id);
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id, full_name, total_due, total_paid, remaining_balance, payment_status")
      .in("id", studentIds);

    if (studentsError) {
      console.error("Error fetching students:", studentsError);
      return;
    }

    console.log("=== RELATED STUDENTS ===");
    console.log(JSON.stringify(students, null, 2));
  }
}

checkReceipts();
