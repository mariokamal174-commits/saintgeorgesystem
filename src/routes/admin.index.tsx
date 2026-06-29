import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "إدارة النظام" }] }),
  component: () => <AppShell><Admin /></AppShell>,
});

function Admin() {
  const { isAdmin, isStudentAffairs } = useAuth();
  const { data, refetch } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase.channel("profiles-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch, isAdmin]);

  if (!isAdmin && !isStudentAffairs) {
    return <div className="text-center py-12 text-muted-foreground">هذه الصفحة للمسؤولين وشؤون الطلاب فقط</div>;
  }

  async function setStatus(id: string, status: "approved" | "rejected") {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else toast.success(status === "approved" ? "تم تفعيل الحساب" : "تم رفض الحساب");
  }

  const depLabel = (d: string) => d === "admin" ? "مسؤول" : d === "finance" ? "الشؤون المالية" : "شؤون الطلاب";

  return (
    <div className="space-y-6">
      {isAdmin && (
        <>
          <h1 className="text-3xl font-bold">إدارة المستخدمين</h1>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-right">الاسم</th>
                    <th className="px-4 py-3 text-right">المستخدم</th>
                    <th className="px-4 py-3 text-right">القسم</th>
                    <th className="px-4 py-3 text-right">الحالة</th>
                    <th className="px-4 py-3 text-right">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.map(p => (
                    <tr key={p.id} className="border-t">
                      <td className="px-4 py-3 font-medium">{p.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.username}</td>
                      <td className="px-4 py-3">{depLabel(p.department)}</td>
                      <td className="px-4 py-3">
                        {p.status === "approved" && <Badge className="bg-success text-success-foreground">مفعّل</Badge>}
                        {p.status === "pending" && <Badge variant="outline">بانتظار</Badge>}
                        {p.status === "rejected" && <Badge variant="destructive">مرفوض</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        {p.status !== "approved" && <Button size="sm" onClick={() => setStatus(p.id, "approved")}>تفعيل</Button>}
                        {p.status === "pending" && <Button size="sm" variant="outline" className="mr-2" onClick={() => setStatus(p.id, "rejected")}>رفض</Button>}
                      </td>
                    </tr>
                  ))}
                  {(data ?? []).length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا يوجد مستخدمون</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-xs text-muted-foreground">ملاحظة: لتعيين أول مستخدم كمسؤول، فعّل حسابه أولاً ثم أضِف دور "admin" له من قاعدة البيانات.</p>
        </>
      )}
      {(isAdmin || isStudentAffairs) && <DangerZone />}
    </div>
  );
}

function DangerZone() {
  const { isAdmin, isStudentAffairs } = useAuth();
  const [targetType, setTargetType] = useState<"all" | "stage" | "grade">("all");
  const [selectedStage, setSelectedStage] = useState<"kindergarten" | "primary" | "preparatory" | "secondary">("kindergarten");
  const [selectedGradeId, setSelectedGradeId] = useState<string>("");
  const [yearType, setYearType] = useState<"current" | "archived" | "specific" | "all">("current");
  const [specificYear, setSpecificYear] = useState<string>("");
  const [confirmText, setConfirmText] = useState<string>("");
  const [wipePassword, setWipePassword] = useState<string>("");
  const [deleting, setDeleting] = useState(false);

  const { data: grades } = useQuery({
    queryKey: ["grades-list"],
    queryFn: async () => {
      const { data } = await supabase.from("grades").select("id, name, level").order("level");
      return data ?? [];
    },
    enabled: isAdmin || isStudentAffairs,
  });

  async function handleWipe() {
    if (!isAdmin && !isStudentAffairs) {
      toast.error("غير مصرح لك بإجراء هذه العملية");
      return;
    }

    if (confirmText !== "مسح البيانات") {
      toast.error("يرجى كتابة جملة التأكيد بشكل صحيح");
      return;
    }

    if (wipePassword !== "SaintGeorge2026") {
      toast.error("كلمة المرور غير صحيحة");
      return;
    }

    if (yearType === "specific" && !specificYear.trim()) {
      toast.error("يرجى تحديد السنة الدراسية المؤرشفة");
      return;
    }

    if (targetType === "grade" && !selectedGradeId) {
      toast.error("يرجى اختيار الصف الدراسي");
      return;
    }

    setDeleting(true);

    try {
      let query = supabase.from("students").delete();

      // Apply Year filter
      let yearDesc = "";
      if (yearType === "current") {
        query = query.is("archived_year", null);
        yearDesc = "السنة الحالية";
      } else if (yearType === "archived") {
        query = query.not("archived_year", "is", null);
        yearDesc = "السنوات المؤرشفة";
      } else if (yearType === "specific") {
        query = query.eq("archived_year", specificYear.trim());
        yearDesc = `السنة الدراسية ${specificYear.trim()}`;
      } else {
        query = query.neq("id", "00000000-0000-0000-0000-000000000000"); // all
        yearDesc = "كل السنوات (حالي ومؤرشف)";
      }

      // Apply Grade/Stage filter
      let targetDesc = "";
      if (targetType === "grade") {
        const gradeObj = grades?.find(g => g.id === selectedGradeId);
        targetDesc = `الصف ${gradeObj?.name ?? selectedGradeId}`;
        query = query.eq("grade_id", selectedGradeId);
      } else if (targetType === "stage") {
        const levelRange = 
          selectedStage === "kindergarten" ? [0, 2] :
          selectedStage === "primary" ? [3, 8] :
          selectedStage === "preparatory" ? [9, 11] :
          [12, 999];
        const gradeIds = (grades ?? [])
          .filter(g => (g.level ?? 0) >= levelRange[0] && (g.level ?? 0) <= levelRange[1])
          .map(g => g.id);

        if (gradeIds.length === 0) {
          toast.error("لم يتم العثور على صفوف لهذه المرحلة");
          setDeleting(false);
          return;
        }

        const stageNames = {
          kindergarten: "رياض الأطفال",
          primary: "المرحلة الابتدائية",
          preparatory: "المرحلة الإعدادية",
          secondary: "المرحلة الثانوية"
        };
        targetDesc = stageNames[selectedStage];
        query = query.in("grade_id", gradeIds);
      } else {
        targetDesc = "جميع الطلاب";
      }

      const confirmMessage = `هل أنت متأكد تمامًا؟\nسيتم حذف بيانات: ${targetDesc} - ${yearDesc}\nلا يمكن التراجع عن هذه العملية!`;
      if (!window.confirm(confirmMessage)) {
        setDeleting(false);
        return;
      }

      const { error } = await query;
      if (error) {
        toast.error(`فشل المسح: ${error.message}`);
      } else {
        toast.success(`تم مسح بيانات: ${targetDesc} - ${yearDesc}`);
        setConfirmText("");
        setWipePassword("");
        const { logActivity } = await import("@/lib/audit");
        await logActivity("حذف", "حذف_شامل", null, { target: targetDesc, year: yearDesc });
      }
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ غير متوقع");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="p-6 border-destructive/40">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-destructive">منطقة الخطر — مسح مخصص للبيانات</h2>
          <p className="text-sm text-muted-foreground">قم بتصفية الطلاب ومسح بياناتهم بشكل نهائي حسب المرحلة أو الصف وسنة الدراسة. يرجى توخي الحذر الشديد.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Target Filter */}
          <div className="space-y-2">
            <Label>الطلاب المستهدفون (النطاق)</Label>
            <Select value={targetType} onValueChange={(val: any) => setTargetType(val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الطلاب</SelectItem>
                <SelectItem value="stage">مرحلة دراسية معينة</SelectItem>
                <SelectItem value="grade">صف دراسي معين</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Period Filter */}
          <div className="space-y-2">
            <Label>سنة الدراسة / الأرشيف</Label>
            <Select value={yearType} onValueChange={(val: any) => setYearType(val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">السنة الدراسية الحالية فقط</SelectItem>
                <SelectItem value="archived">جميع السنوات المؤرشفة</SelectItem>
                <SelectItem value="specific">سنة مؤرشفة محددة</SelectItem>
                <SelectItem value="all">كل السنوات (حالي ومؤرشف)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Conditional Sub-filters */}
          {targetType === "stage" && (
            <div className="space-y-2">
              <Label>المرحلة الدراسية</Label>
              <Select value={selectedStage} onValueChange={(val: any) => setSelectedStage(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kindergarten">رياض الأطفال</SelectItem>
                  <SelectItem value="primary">المرحلة الابتدائية</SelectItem>
                  <SelectItem value="preparatory">المرحلة الإعدادية</SelectItem>
                  <SelectItem value="secondary">المرحلة الثانوية</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {targetType === "grade" && (
            <div className="space-y-2">
              <Label>الصف الدراسي</Label>
              <Select value={selectedGradeId} onValueChange={setSelectedGradeId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الصف الدراسي..." />
                </SelectTrigger>
                <SelectContent>
                  {grades?.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {yearType === "specific" && (
            <div className="space-y-2">
              <Label>السنة المؤرشفة المحددة (مثال: 2024/2025)</Label>
              <Input
                type="text"
                placeholder="أدخل السنة..."
                value={specificYear}
                onChange={e => setSpecificYear(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Security confirmation */}
        <div className="border-t border-destructive/20 pt-4 space-y-3">
          <div className="space-y-2">
            <Label className="text-destructive font-bold">لتأكيد رغبتك في حذف البيانات، اكتب عبارة "مسح البيانات" أدناه:</Label>
            <Input
              type="text"
              placeholder="اكتب 'مسح البيانات'..."
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="max-w-xs border-destructive/30 focus-visible:ring-destructive"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-destructive font-bold">أدخل كلمة المرور لإتمام المسح:</Label>
            <Input
              type="password"
              placeholder="كلمة المرور"
              value={wipePassword}
              onChange={e => setWipePassword(e.target.value)}
              className="max-w-xs border-destructive/30 focus-visible:ring-destructive"
            />
          </div>

          <Button
            variant="destructive"
            onClick={handleWipe}
            disabled={confirmText !== "مسح البيانات" || wipePassword !== "SaintGeorge2026" || deleting}
            className="w-full sm:w-auto"
          >
            {deleting ? "جاري المسح..." : "مسح البيانات المحددة نهائيًا"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
