// Guarded PWA service worker registration. Safe in Lovable preview/dev (no-op).
export async function registerPWA() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const host = window.location.hostname;
  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const isLovablePreview =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" || host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev");
  const killSwitch = new URL(window.location.href).searchParams.get("sw") === "off";

  const shouldRefuse = !import.meta.env.PROD || inIframe || isLovablePreview || killSwitch;

  if (shouldRefuse) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(
        regs.filter((r) => r.active?.scriptURL.endsWith("/sw.js")).map((r) => r.unregister())
      );
    } catch { /* ignore */ }
    return;
  }

  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  } catch (e) {
    console.warn("PWA register failed", e);
  }
}
