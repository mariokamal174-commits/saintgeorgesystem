import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Download, Printer } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatAge } from "@/lib/age";
import { exportStudentsToExcel } from "@/lib/student-export";

export const Route = createFileRoute("/students/")({
  head: () => ({ meta: [{ title: "الطلاب | نظام إدارة المدرسة" }] }),
  component: () => <AppShell><StudentsList /></AppShell>,
});

function StudentsList() {
  const { isStudentAffairs, isAdmin, isFinance } = useAuth();
  const [q, setQ] = useState("");
  const [gradeId, setGradeId] = useState<string>("all");
  const [classId, setClassId] = useState<string>("all");
  const [archivedFilter, setArchivedFilter] = useState<"current" | "archived" | "all">("current");
  const [page, setPage] = useState(0);
  const PAGE = 25;

  const { data: grades } = useQuery({
    queryKey: ["grades-all"],
    queryFn: async () => {
      const { data } = await supabase.from("grades").select("id, name, level").order("level");
      return data ?? [];
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["classes-all"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name, grade_id").order("name");
      return data ?? [];
    },
  });

  const gradeGroups = useMemo(() => {
    const groups: Record<string, { id: string; name: string }[]> = {
      "رياض الأطفال": [], "المرحلة الابتدائية": [], "المرحلة الإعدادية": [], "المرحلة الثانوية": [],
    };
    (grades ?? []).forEach((g) => {
      const lvl = g.level ?? 0;
      if (lvl <= 2) groups["رياض الأطفال"].push(g);
      else if (lvl <= 8) groups["المرحلة الابتدائية"].push(g);
      else if (lvl <= 11) groups["المرحلة الإعدادية"].push(g);
      else groups["المرحلة الثانوية"].push(g);
    });
    return groups;
  }, [grades]);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["students", q, page, gradeId, classId, archivedFilter],
    queryFn: async () => {
      let qb = supabase.from("students").select("*, classes(name), grades(name), delivery_tracking(item, delivered)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (gradeId !== "all") qb = qb.eq("grade_id", gradeId);
      if (classId !== "all") qb = qb.eq("class_id", classId);
      if (archivedFilter === "current") qb = qb.is("archived_year", null);
      else if (archivedFilter === "archived") qb = qb.not("archived_year", "is", null);
      if (q.trim()) {
        const term = `%${q.trim()}%`;
        qb = qb.or(`full_name.ilike.${term},student_code.ilike.${term},national_id.ilike.${term}`);
      }
      const { data, count } = await qb;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  useEffect(() => {
    const ch = supabase.channel("students-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));
  const pages = useMemo(() => Math.max(1, Math.ceil((data?.total ?? 0) / PAGE)), [data]);

  const currentClass = useMemo(() => {
    const rows = (data?.rows ?? []) as any[];
    const classIds = Array.from(new Set(rows.map((student) => student.class_id).filter(Boolean)));
    if (classIds.length !== 1) return null;
    const classRow = rows.find((student) => student.class_id === classIds[0]);
    return classRow ? { id: classIds[0], name: classRow.classes?.name ?? classRow.grades?.name ?? "فصل" } : null;
  }, [data]);

  async function exportAll() {
    let qb = supabase.from("students").select("*, classes(name), grades(name)");
    if (gradeId !== "all") qb = qb.eq("grade_id", gradeId);
    if (classId !== "all") qb = qb.eq("class_id", classId);
    if (archivedFilter === "current") qb = qb.is("archived_year", null);
    else if (archivedFilter === "archived") qb = qb.not("archived_year", "is", null);
    const { data: all } = await qb;
    const rows = ((all ?? []) as any[]).slice();
    rows.sort((a, b) => {
      const aClass = String(a.classes?.name ?? a.grades?.name ?? "").trim();
      const bClass = String(b.classes?.name ?? b.grades?.name ?? "").trim();
      const classCompare = aClass.localeCompare(bClass, "ar");
      if (classCompare !== 0) return classCompare;
      return String(a.full_name ?? "").localeCompare(String(b.full_name ?? ""), "ar");
    });
    exportStudentsToExcel(rows as never, "students.xlsx");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">الطلاب</h1>
          <p className="text-muted-foreground mt-1">إجمالي {fmt(data?.total ?? 0)} طالب</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {currentClass && (
            <Link to="/classes/$id/print" params={{ id: currentClass.id }}>
              <Button variant="outline"><Printer className="ml-2 h-4 w-4" />طباعة الفصل ({currentClass.name})</Button>
            </Link>
          )}
          {(isStudentAffairs || isAdmin || isFinance) && (
            <Button variant="outline" onClick={exportAll}><Download className="ml-2 h-4 w-4" />تصدير Excel</Button>
          )}
          {(isStudentAffairs || isAdmin) && (
            <Link to="/imports"><Button variant="outline"><Plus className="ml-2 h-4 w-4" />استيراد من Excel</Button></Link>
          )}
          {(isStudentAffairs || isAdmin) && (
            <Link to="/students/new"><Button><Plus className="ml-2 h-4 w-4" />طالب جديد</Button></Link>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="ابحث بالاسم أو الكود أو الرقم القومي..." className="pr-10" />
          </div>
          <Select value={gradeId} onValueChange={(v) => { setGradeId(v); setClassId("all"); setPage(0); }}>
            <SelectTrigger className="md:w-64"><SelectValue placeholder="كل الصفوف" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الصفوف</SelectItem>
              {Object.entries(gradeGroups).map(([groupName, items]) => (
                items.length > 0 && (
                  <SelectGroup key={groupName}>
                    <SelectLabel>{groupName}</SelectLabel>
                    {items.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectGroup>
                )
              ))}
            </SelectContent>
          </Select>
          <Select value={classId} onValueChange={(v) => { setClassId(v); setPage(0); }}>
            <SelectTrigger className="md:w-64"><SelectValue placeholder="كل الفصول" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفصول</SelectItem>
              {(classes ?? []).filter((c) => gradeId === "all" || c.grade_id === gradeId).map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={archivedFilter} onValueChange={(v) => { setArchivedFilter(v as never); setPage(0); }}>
            <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="current">الحاليون فقط</SelectItem>
              <SelectItem value="archived">المؤرشفون فقط</SelectItem>
              <SelectItem value="all">الكل</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right">الاسم</th>
                <th className="px-4 py-3 text-right">الكود</th>
                <th className="px-4 py-3 text-right">السن (1/10)</th>
                <th className="px-4 py-3 text-right">الفصل</th>
                <th className="px-4 py-3 text-right">المتبقي</th>
                <th className="px-4 py-3 text-right">الملف</th>
                <th className="px-4 py-3 text-right">الحالة</th>
                <th className="px-4 py-3 text-right">طباعة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>}
              {!isLoading && data?.rows.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">لا يوجد طلاب</td></tr>}
              {data?.rows.map((s: any) => (
                <tr key={s.id} className="border-t hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link to="/students/$id" params={{ id: s.id }} className="font-medium hover:text-primary">{s.full_name}</Link>
                    {s.archived_year && <Badge variant="secondary" className="mr-2 text-xs">{s.archived_year}</Badge>}
                    {s.transfer_out_type && <Badge variant="outline" className="mr-2 text-xs">{s.transfer_out_type === "transfer" ? "محول" : "مسحوب"}</Badge>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.student_code ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatAge(s.birth_date)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.class_id ? (
                      <Link to="/classes/$id/print" params={{ id: s.class_id }} className="font-medium hover:text-primary">
                        {s.classes?.name ?? s.grades?.name ?? "—"}
                      </Link>
                    ) : (
                      s.classes?.name ?? s.grades?.name ?? "—"
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{fmt(Number(s.remaining_balance))}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const d = (s.delivery_tracking ?? []).find((x: any) => x.item === "ملف الطالب");
                      return d?.delivered
                        ? <Badge className="bg-success text-success-foreground">تم التسليم</Badge>
                        : <Badge variant="outline" className="text-destructive border-destructive/40">لم يُسلَّم</Badge>;
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {s.payment_status === "paid"
                      ? <Badge className="bg-success text-success-foreground">مسدد بالكامل</Badge>
                      : <Badge variant="destructive">غير مسدد</Badge>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-wrap gap-2">
                      <Link to="/students/$id/print" params={{ id: s.id }}>
                        <Button size="sm" variant="outline"><Printer className="ml-2 h-4 w-4" />طباعة الطالب</Button>
                      </Link>
                      {s.class_id && (
                        <Link to="/classes/$id/print" params={{ id: s.class_id }}>
                          <Button size="sm" variant="outline"><Printer className="ml-2 h-4 w-4" />طباعة الفصل</Button>
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>السابق</Button>
            <span className="text-sm text-muted-foreground">{page + 1} / {pages}</span>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>التالي</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
