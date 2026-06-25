import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { schoolYearLabel } from "@/lib/age";
import { exportStudentsToExcel } from "@/lib/student-export";
import { Archive, Download } from "lucide-react";
import { logActivity } from "@/lib/audit";

export const Route = createFileRoute("/archive/")({
  head: () => ({ meta: [{ title: "الأرشيف" }] }),
  component: () => <AppShell><ArchivePage /></AppShell>,
});

function ArchivePage() {
  const { isAdmin, isStudentAffairs } = useAuth();
  const [years, setYears] = useState<{ year: string; count: number }[]>([]);
  const [archiving, setArchiving] = useState(false);
  const currentYear = schoolYearLabel();

  async function load() {
    const { data } = await supabase.from("students").select("archived_year").not("archived_year", "is", null);
    const map = new Map<string, number>();
    (data ?? []).forEach((r) => {
      if (r.archived_year) map.set(r.archived_year, (map.get(r.archived_year) ?? 0) + 1);
    });
    setYears(Array.from(map.entries()).map(([year, count]) => ({ year, count })).sort((a, b) => b.year.localeCompare(a.year)));
  }
  useEffect(() => { load(); }, []);

  async function archiveCurrent() {
    if (!(isAdmin || isStudentAffairs)) return;
    if (!confirm(`سيتم نقل كل الطلاب غير المؤرشفين إلى أرشيف العام الدراسي ${currentYear}. هل أنت متأكد؟`)) return;
    setArchiving(true);
    const { data, error } = await supabase.from("students").update({ archived_year: currentYear })
      .is("archived_year", null).select("id");
    setArchiving(false);
    if (error) return toast.error(error.message);
    toast.success(`تمت أرشفة ${data?.length ?? 0} طالب للعام ${currentYear}`);
    await logActivity("archive", "students", null, { year: currentYear, count: data?.length ?? 0 });
    load();
  }

  async function exportYear(year: string) {
    const { data } = await supabase.from("students").select("*").eq("archived_year", year);
    exportStudentsToExcel((data ?? []) as never, `archive-${year.replace("/", "-")}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">أرشيف السنوات الدراسية</h1>
          <p className="text-muted-foreground mt-1">العام الدراسي الحالي: {currentYear}</p>
        </div>
        {(isAdmin || isStudentAffairs) && (
          <Button onClick={archiveCurrent} disabled={archiving}>
            <Archive className="ml-2 h-4 w-4" />أرشفة العام الحالي
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>السنوات المؤرشفة</CardTitle></CardHeader>
        <CardContent>
          {years.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد سنوات مؤرشفة بعد</p>
          ) : (
            <div className="space-y-2">
              {years.map((y) => (
                <div key={y.year} className="flex items-center justify-between p-3 border rounded-md">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{y.year}</Badge>
                    <span className="text-sm">{y.count} طالب</span>
                  </div>
                  <div className="flex gap-2">
                    <Link to="/students" search={{ archived: y.year } as never}><Button variant="outline" size="sm">عرض</Button></Link>
                    <Button variant="outline" size="sm" onClick={() => exportYear(y.year)}><Download className="ml-1 h-4 w-4" />تصدير</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
