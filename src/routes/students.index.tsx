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
  const [archivedFilter, setArchivedFilter] = useState<"current" | "archived" | "all">("current");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [newStudentFilter, setNewStudentFilter] = useState<"all" | "new" | "old">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("new") === "true" ? "new" : "all";
    }
    return "all";
  });
  const [page, setPage] = useState(0);
  const PAGE = 25;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (newStudentFilter === "new") {
        url.searchParams.set("new", "true");
      } else {
        url.searchParams.delete("new");
      }
      window.history.replaceState({}, "", url.toString());
    }
  }, [newStudentFilter]);

  const { data: grades } = useQuery({
    queryKey: ["grades-all"],
    queryFn: async () => {
      const { data } = await supabase.from("grades").select("id, name, level").order("level");
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
    queryKey: ["students", q, page, gradeId, archivedFilter, paymentFilter, newStudentFilter],
    queryFn: async () => {
      let qb = supabase.from("students").select("*, classes(name), grades(name), delivery_tracking(item, delivered)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (gradeId !== "all") qb = qb.eq("grade_id", gradeId);
      if (archivedFilter === "current") qb = qb.is("archived_year", null);
      else if (archivedFilter === "archived") qb = qb.not("archived_year", "is", null);
      if ((isFinance || isAdmin) && paymentFilter !== "all") {
        qb = qb.eq("payment_status", paymentFilter);
      }
      if (newStudentFilter === "new") {
        qb = qb.eq("is_new_student", true);
      } else if (newStudentFilter === "old") {
        qb = qb.eq("is_new_student", false);
      }
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
  const [importedStudentIds, setImportedStudentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem("imported-student-ids");
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        setImportedStudentIds(new Set(ids.filter(Boolean)));
      }
    } catch {
      setImportedStudentIds(new Set());
    }
  }, []);

  useEffect(() => {
    const syncImportedIds = () => {
      try {
        const raw = localStorage.getItem("imported-student-ids");
        if (raw) {
          const ids = JSON.parse(raw) as string[];
          setImportedStudentIds(new Set(ids.filter(Boolean)));
        } else {
          setImportedStudentIds(new Set());
        }
      } catch {
        setImportedStudentIds(new Set());
      }
    };

    window.addEventListener("students-import-mark-updated", syncImportedIds);
    return () => window.removeEventListener("students-import-mark-updated", syncImportedIds);
  }, []);

  const isImportedInCurrentSession = (studentId: string) => importedStudentIds.has(studentId);
  const pages = useMemo(() => Math.max(1, Math.ceil((data?.total ?? 0) / PAGE)), [data]);

  const currentGrade = useMemo(() => {
    if (gradeId !== "all") {
      const selected = (grades ?? []).find((grade) => grade.id === gradeId);
      return selected ? { id: selected.id, name: selected.name ?? "الصف" } : null;
    }
    return null;
  }, [gradeId, grades]);

  async function exportAll() {
    let qb = supabase.from("students").select("*, classes(name), grades(name)");
    if (gradeId !== "all") qb = qb.eq("grade_id", gradeId);
    if (archivedFilter === "current") qb = qb.is("archived_year", null);
    else if (archivedFilter === "archived") qb = qb.not("archived_year", "is", null);
    if ((isFinance || isAdmin) && paymentFilter !== "all") {
      qb = qb.eq("payment_status", paymentFilter);
    }
    if (newStudentFilter === "new") {
      qb = qb.eq("is_new_student", true);
    } else if (newStudentFilter === "old") {
      qb = qb.eq("is_new_student", false);
    }
    const { data: all } = await qb;
    const rows = ((all ?? []) as any[]).slice();
    rows.sort((a, b) => {
      const aClass = String(a.classes?.name ?? a.grades?.name ?? "").trim();
      const bClass = String(b.classes?.name ?? b.grades?.name ?? "").trim();
      const classCompare = aClass.localeCompare(bClass, "ar");
      if (classCompare !== 0) return classCompare;
      return String(a.full_name ?? "").localeCompare(String(b.full_name ?? ""), "ar");
    });
    exportStudentsToExcel(rows as never, "students.xlsx", isStudentAffairs);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">الطلاب</h1>
          <p className="text-muted-foreground mt-1">إجمالي {fmt(data?.total ?? 0)} طالب</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(isStudentAffairs || isAdmin || isFinance) && (
            <Button variant="outline" onClick={exportAll} className="no-print"><Download className="ml-2 h-4 w-4" />تصدير Excel</Button>
          )}
          {(isFinance || isAdmin) && (
            <Button variant="outline" onClick={() => window.print()} className="no-print"><Printer className="ml-2 h-4 w-4" />طباعة القائمة</Button>
          )}
          {(isStudentAffairs || isAdmin) && (
            <Link to="/imports" className="no-print"><Button variant="outline"><Plus className="ml-2 h-4 w-4" />استيراد من Excel</Button></Link>
          )}
          {(isStudentAffairs || isAdmin) && (
            <Link to="/students/new" className="no-print"><Button><Plus className="ml-2 h-4 w-4" />طالب جديد</Button></Link>
          )}
        </div>
      </div>

      <Card className="p-6 bg-secondary/5 border border-secondary/20 no-print">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm text-muted-foreground">طباعة الصف الكامل</div>
            <div className="text-xl font-semibold">
              {gradeId !== "all"
                ? currentGrade?.name ?? "الصف المحدد"
                : "اختر الصف هنا للطباعة"
              }
            </div>
            <div className="text-sm text-muted-foreground">
              {gradeId !== "all"
                ? "اضغط طباعة الصف لفتح طباعة الصف الكامل." 
                : "اختر الصف من القائمة لتفعيل زر الطباعة."
              }
            </div>
          </div>
          <div className="w-full sm:w-auto">
            {gradeId !== "all" && currentGrade ? (
              <Link to="/grades/$id/print" params={{ id: currentGrade.id }}>
                <Button size="lg" className="w-full sm:w-auto"><Printer className="ml-2 h-4 w-4" />طباعة الصف</Button>
              </Link>
            ) : (
              <Button size="lg" className="w-full sm:w-auto" disabled>اختر الصف للطباعة</Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4 no-print">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="ابحث بالاسم أو الكود أو الرقم القومي..." className="pr-10" />
          </div>
          <Select value={gradeId} onValueChange={(v) => { setGradeId(v); setPage(0); }}>
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
          <Select value={newStudentFilter} onValueChange={(v) => { setNewStudentFilter(v as any); setPage(0); }}>
            <SelectTrigger className="md:w-44"><SelectValue placeholder="نوع الطالب" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الطلاب</SelectItem>
              <SelectItem value="new">الطلاب الجدد فقط</SelectItem>
              <SelectItem value="old">الطلاب القدامى فقط</SelectItem>
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
          {(isFinance || isAdmin) && (
            <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v as any); setPage(0); }}>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="حالة السداد" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل حالات السداد</SelectItem>
                <SelectItem value="paid">مسدد بالكامل</SelectItem>
                <SelectItem value="unpaid">غير مسدد</SelectItem>
              </SelectContent>
            </Select>
          )}
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
                {!isStudentAffairs && <th className="px-4 py-3 text-right">المتبقي</th>}
                <th className="px-4 py-3 text-right">الملف</th>
                <th className="px-4 py-3 text-right">الحالة</th>
                <th className="px-4 py-3 text-right no-print">طباعة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={isStudentAffairs ? 7 : 8} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>}
              {!isLoading && data?.rows.length === 0 && <tr><td colSpan={isStudentAffairs ? 7 : 8} className="text-center py-8 text-muted-foreground">لا يوجد طلاب</td></tr>}
              {data?.rows.map((s: any) => (
                <tr key={s.id} className="border-t hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to="/students/$id" params={{ id: s.id }} className="font-medium hover:text-primary">{s.full_name}</Link>
                      {(isImportedInCurrentSession(s.id) || s.is_new_student) && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">جديد</Badge>}
                      {s.archived_year && <Badge variant="secondary" className="text-xs">{s.archived_year}</Badge>}
                      {s.transfer_out_type && <Badge variant="outline" className="text-xs">{s.transfer_out_type === "transfer" ? "محول" : "مسحوب"}</Badge>}
                    </div>
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
                  {!isStudentAffairs && <td className="px-4 py-3 font-medium">{fmt(Number(s.remaining_balance))}</td>}
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
                  <td className="px-4 py-3 whitespace-nowrap no-print">
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
          <div className="flex items-center justify-between p-4 border-t no-print">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>السابق</Button>
            <span className="text-sm text-muted-foreground">{page + 1} / {pages}</span>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>التالي</Button>
          </div>
        )}
      </Card>

      <style>{`
        @media print {
          /* اخفاء الأقسام غير الضرورية للطباعة */
          aside, header, nav, .no-print, button, input, select, [role="combobox"], [role="listbox"] {
            display: none !important;
          }
          main, .container, .space-y-6, .w-full, .max-w-7xl {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .card, .border, .shadow-sm {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          th, td {
            border: 1px solid #cbd5e1 !important;
            padding: 6px 10px !important;
            text-align: right !important;
            color: #000 !important;
          }
          thead th {
            background-color: #f1f5f9 !important;
          }
        }
      `}</style>
    </div>
  );
}
