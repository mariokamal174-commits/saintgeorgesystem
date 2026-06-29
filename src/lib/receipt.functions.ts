import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface DeleteReceiptInput {
  receiptId: string;
}

export const deleteReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): DeleteReceiptInput => {
    const i = input as DeleteReceiptInput;
    if (!i?.receiptId) throw new Error("معرف الإيصال مفقود");
    return { receiptId: i.receiptId };
  })
  .handler(async ({ data, context }) => {
    const { receiptId } = data;
    const userId = context.userId;
    const supabase = context.supabase;

    if (!userId) throw new Error("غير مصرح");

    // Get receipt details first
    const { data: receipt, error: fetchError } = await supabase
      .from("receipts")
      .select("*, students(full_name)")
      .eq("id", receiptId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!receipt) throw new Error("الإيصال غير موجود");

    // Check authorization - must be admin or finance
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const userRoles = (roles ?? []).map((r: any) => r.role);
    const isAdmin = userRoles.includes("admin");
    const isFinance = userRoles.includes("finance");

    if (!isAdmin && !isFinance) {
      throw new Error("فقط الموظفون الماليون والمديرون يمكنهم حذف الإيصالات");
    }

    // Import admin client dynamically to run on the server only
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Delete image from storage if exists using admin client
    if (receipt.image_url) {
      try {
        const path = receipt.image_url;
        await supabaseAdmin.storage.from("receipt-images").remove([path]);
      } catch (e) {
        console.warn("فشل حذف صورة الإيصال", e);
        // Don't fail the whole operation if image deletion fails
      }
    }

    // Delete the receipt using admin client to bypass any RLS restriction
    const { error: deleteError } = await supabaseAdmin
      .from("receipts")
      .delete()
      .eq("id", receiptId);

    if (deleteError) throw deleteError;

    // Explicitly recompute student balance using admin client to guarantee it reflects the deletion immediately
    await supabaseAdmin.rpc("recompute_student_totals", { _student_id: receipt.student_id });

    return {
      success: true,
      message: `تم حذف الإيصال من الطالب ${receipt.students?.full_name}`,
      receiptNumber: receipt.receipt_number || receiptId.slice(0, 8),
      studentName: receipt.students?.full_name,
    };
  });
