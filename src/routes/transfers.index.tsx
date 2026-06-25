import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { exportStudentsToExcel } from "@/lib/student-export";

export const Route = createFileRoute("/transfers/")({
  head: () => ({ meta: [{ title: "كشف المحولين والمسحوبين" }] }),
  component: () => <AppShell><TransfersPage /></AppShell>,
});

function TransfersPage() {
  const [filter, setFilter] = useState<"all" | "transfer" | "withdrawal">("all");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    let q = supabase.from("students").select("*").not("transfer_out_type", "is", null).order("transfer_out_date", { ascending: false });
    if (filter !== "all") q = q.eq("transfer_out_type", filter);
    q.then(({ data }) => setRows((data ?? []) as Record<string, unknown>[]));
  }, [filter]);

  const labelOf = (t: unknown) => t === "transfer" ? "محول" : t === "withdrawal" ? "مسحوب" : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">كشف المحولين والمسحوبين</h1>
          <p className="text-muted-foreground mt-1">{rows.length} طالب</p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as never)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="transfer">المحولين فقط</SelectItem>
              <SelectItem value="withdrawal">المسحوبين فقط</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => exportStudentsToExcel(rows as never, `transfers-${filter}.xlsx`)}>
            <Download className="ml-2 h-4 w-4" />تصدير
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-right">الاسم</th>
                  <th className="px-4 py-3 text-right">الكود</th>
                  <th className="px-4 py-3 text-right">النوع</th>
                  <th className="px-4 py-3 text-right">المدرسة المحول إليها</th>
                  <th className="px-4 py-3 text-right">التاريخ</th>
                  <th className="px-4 py-3 text-right">الهاتف</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد بيانات</td></tr>}
                {rows.map((s) => (
                  <tr key={s.id as string} className="border-t hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium">{String(s.full_name ?? "")}</td>
                    <td className="px-4 py-3 text-muted-foreground">{String(s.student_code ?? "—")}</td>
                    <td className="px-4 py-3">
                      {s.transfer_out_type === "transfer"
                        ? <Badge className="bg-warning text-warning-foreground">محول</Badge>
                        : <Badge variant="destructive">مسحوب</Badge>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{String(s.transfer_out_school ?? "—")}</td>
                    <td className="px-4 py-3 text-muted-foreground">{String(s.transfer_out_date ?? "—")}</td>
                    <td className="px-4 py-3 text-muted-foreground">{String(s.phone ?? "—")}</td>
                    <td className="px-4 py-3">
                      <Link to="/students/$id" params={{ id: s.id as string }}>
                        <Button variant="ghost" size="sm">عرض</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
