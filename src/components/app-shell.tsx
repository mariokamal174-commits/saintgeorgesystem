import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { APP_VERSION } from "@/lib/app-version";
import { useAuth } from "@/hooks/use-auth";
import {
  GraduationCap, Users, Receipt, Upload, ShieldCheck,
  LayoutDashboard, LogOut, Loader2, Activity, Archive, UserMinus, Wallet,
  Download, Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";

interface NavItem { to: string; label: string; icon: typeof Users; show: boolean }

export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, loading, isAdmin, isApproved, isFinance, isStudentAffairs, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect if already installed / standalone
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;
    if (isStandalone) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
      toast.success("تم تثبيت التطبيق بنجاح على جهازك!");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // iOS Detection
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    if (isIOSDevice) {
      setIsIOS(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };

  const handleIOSInstallClick = () => {
    toast.info("لتثبيت التطبيق على آيفون:\n1. اضغط على زر مشاركة 📤 في متصفح Safari\n2. اختر 'إضافة إلى الصفحة الرئيسية' ➕", {
      duration: 8000,
    });
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!user) {
    if (typeof window !== "undefined") navigate({ to: "/auth" });
    return null;
  }
  if (!isApproved) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-warning/15 text-warning">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold">حسابك بانتظار الموافقة</h2>
          <p className="mt-2 text-muted-foreground">سيتم تفعيل حسابك بعد مراجعة المسؤول. يرجى التواصل مع إدارة النظام.</p>
          <Button onClick={signOut} variant="outline" className="mt-6"><LogOut className="ml-2 h-4 w-4" />تسجيل خروج</Button>
        </div>
      </div>
    );
  }

  const items: NavItem[] = [
    { to: "/", label: "لوحة التحكم", icon: LayoutDashboard, show: true },
    { to: "/students", label: "الطلاب", icon: Users, show: true },
    { to: "/receipts", label: "الإيصالات", icon: Receipt, show: isFinance || isAdmin },
    { to: "/finance/installments", label: "أقساط الفصول", icon: Wallet, show: isFinance || isAdmin },
    { to: "/imports", label: "استيراد ملفات", icon: Upload, show: isStudentAffairs || isAdmin },
    { to: "/transfers", label: "المحولين والمسحوبين", icon: UserMinus, show: true },
    { to: "/archive", label: "الأرشيف", icon: Archive, show: true },
    { to: "/activity", label: "سجل النشاط", icon: Activity, show: true },
    { to: "/admin", label: isAdmin ? "إدارة المستخدمين" : "مسح البيانات", icon: ShieldCheck, show: isAdmin || isStudentAffairs },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-5 border-b border-sidebar-border flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--gradient-primary)" }}>
            <GraduationCap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold leading-tight">نظام المدرسة</div>
            <div className="text-xs text-sidebar-foreground/60">الإدارة المتكاملة</div>
            <div className="text-[11px] text-sidebar-foreground/50">الإصدار {APP_VERSION}</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.filter(i => i.show).map((item) => {
            const active = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
            return (
              <Link key={item.to} to={item.to} className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {(isInstallable || isIOS) && (
          <div className="p-3 mx-3 my-2 rounded-xl bg-sidebar-accent/50 border border-sidebar-border text-center">
            <p className="text-[11px] text-sidebar-foreground/70 mb-2 font-medium">تنزيل التطبيق على جهازك</p>
            {isInstallable ? (
              <Button onClick={handleInstallClick} size="sm" className="w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 text-xs py-1.5 h-auto cursor-pointer">
                <Download className="ml-1.5 h-3.5 w-3.5" /> تثبيت التطبيق
              </Button>
            ) : (
              <Button onClick={handleIOSInstallClick} size="sm" variant="outline" className="w-full text-xs py-1.5 h-auto hover:bg-sidebar-accent text-sidebar-foreground/90 border-sidebar-border cursor-pointer">
                <Smartphone className="ml-1.5 h-3.5 w-3.5" /> تثبيت على الآيفون
              </Button>
            )}
          </div>
        )}

        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 text-sm">
            <div className="font-medium">{profile?.full_name}</div>
            <div className="text-xs text-sidebar-foreground/60">
              {profile?.department === "admin" && "مسؤول"}
              {profile?.department === "student_affairs" && "شؤون الطلاب"}
              {profile?.department === "finance" && "الشؤون المالية"}
            </div>
          </div>
          <Button onClick={signOut} variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <LogOut className="ml-2 h-4 w-4" />تسجيل خروج
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
