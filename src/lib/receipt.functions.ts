import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

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
    const user = context.user;

    if (!user) throw new Error("غير مصرح");

    // Get receipt details first
    const { data: receipt, error: fetchError } = await supabase
      .from("receipts")
      .select("*, students(full_name)")
      .eq("id", receiptId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!receipt) throw new Error("الإيصال غير موجود");

    // Check authorization - must be admin or finance
    const { data: userData } = await supabase
      .from("users_and_permissions")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = userData?.role === "admin";
    const isFinance = userData?.role === "finance";

    if (!isAdmin && !isFinance) {
      throw new Error("فقط الموظفون الماليون والمديرون يمكنهم حذف الإيصالات");
    }

    // Delete image from storage if exists
    if (receipt.image_url) {
      try {
        const path = receipt.image_url;
        await supabase.storage.from("receipt-images").remove([path]);
      } catch (e) {
        console.warn("فشل حذف صورة الإيصال", e);
        // Don't fail the whole operation if image deletion fails
      }
    }

    // Delete the receipt
    const { error: deleteError } = await supabase
      .from("receipts")
      .delete()
      .eq("id", receiptId);

    if (deleteError) throw deleteError;

    return {
      success: true,
      message: `تم حذف الإيصال من الطالب ${receipt.students?.full_name}`,
      receiptNumber: receipt.receipt_number || receiptId.slice(0, 8),
      studentName: receipt.students?.full_name,
    };
  });
