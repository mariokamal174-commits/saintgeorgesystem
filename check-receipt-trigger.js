import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://rvbtjytipbjmnikrsfbw.supabase.co";
// Using anon key - only shows RLS-visible data
const supabaseKey = "sb_publishable_1rHjswvH23OUi0Gqui6t1A_XEfbsOyM";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Step 1: sign in with existing user - use env or prompt
  // The user needs to provide credentials.
  // For now let's check what we can from the anon key (nothing useful for receipts due to RLS)
  // Instead, let's try to understand the trigger via migration files analysis.
  
  // Check: query receipts table - will fail due to RLS without auth
  console.log("=== Checking if trigger function exists ===");
  console.log("Based on code analysis:");
  console.log("");
  console.log("The trigger 'receipts_recompute_aiud' fires AFTER INSERT/UPDATE/DELETE on receipts.");
  console.log("It calls: recompute_student_totals(student_id)");
  console.log("");
  console.log("recompute_student_totals queries:");
  console.log("  SELECT SUM(amount) FROM receipts WHERE student_id=? AND status='approved'");
  console.log("  Then: UPDATE students SET total_paid = paid");
  console.log("");
  console.log("PROBLEM FOUND: The latest migration (20260629150000) redefines recompute_student_totals");
  console.log("but does NOT grant EXECUTE to authenticated or the trigger caller.");
  console.log("The OLD grant was in migration 20260616071556 which only grants to service_role.");
  console.log("");
  console.log("HOWEVER: Triggers with SECURITY DEFINER bypass this - they run as the function owner.");
  console.log("");
  console.log("Most likely cause: The receipt was created with the OLD code that also updated");
  console.log("first_installment, and the trigger DID fire and set total_paid=42000,");
  console.log("but THEN the student UPDATE (first_installment change) fired the BEFORE trigger");
  console.log("which didn't reset total_paid BUT the second UPDATE on students may have");
  console.log("caused recompute to run again with stale data.");
  console.log("");
  console.log("Actually - looking at the screenshot date: receipt date is 2026-07-27 (future).");
  console.log("This was likely added with the OLD buggy code (before today's fix).");
  console.log("The old code: (1) inserted receipt -> trigger sets total_paid=42000");
  console.log("             (2) updated student first_installment=42000 -> before trigger runs");
  console.log("             total_due increases -> payment_status=partial");
  console.log("BUT the remaining_balance was computed BEFORE the student update trigger ran again.");
  console.log("");
  console.log("=== REAL DIAGNOSIS NEEDED ===");
  console.log("Need to manually call recompute_student_totals for the affected student.");
  console.log("This requires service role key or running an RPC from the app.");
}

run();
