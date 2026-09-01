import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster as SonnerToaster } from "sonner";
import { LiveChatWidget } from "@/components/LiveChatWidget";
import { PwaTabBar } from "@/components/PwaTabBar";


import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { installIntlGuard } from "../lib/intl-guard";

// Machines with a malformed system locale (e.g. `en-US@posix`) make every
// default-locale date/number format throw and crash the page. Neutralise it
// before any component renders.
installIntlGuard();

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const recoveryStarted = useRef(false);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    // Also log to our error_log table.
    (async () => {
      try {
        const { logError } = await import("../lib/error-log.functions");
        await logError({
          data: {
            message: error.message || String(error),
            stack: error.stack ?? null,
            route: typeof window !== "undefined" ? window.location.pathname : null,
            mechanism: "react_error_boundary",
            severity: "error",
            source: "client",
          },
        });
      } catch { /* ignore */ }
    })();

    // Deploys can briefly leave an already-open tab pointing at an old JS
    // chunk. Recover that case automatically once instead of stranding the
    // user on the error boundary. The URL-scoped marker prevents reload loops.
    const message = `${error.name} ${error.message} ${error.stack ?? ""}`;
    const isStaleBundle =
      /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [^ ]+ failed|ChunkLoadError|module is not defined|is not defined/i.test(message);
    if (isStaleBundle && !recoveryStarted.current && typeof window !== "undefined") {
      recoveryStarted.current = true;
      const recoveryKey = `jenvu:recovered:${window.location.pathname}`;
      if (window.sessionStorage.getItem(recoveryKey) !== "1") {
        window.sessionStorage.setItem(recoveryKey, "1");
        window.location.reload();
        return;
      }
    }
  }, [error]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const recoveryKey = `jenvu:recovered:${window.location.pathname}`;
    const timer = window.setTimeout(() => window.sessionStorage.removeItem(recoveryKey), 10_000);
    return () => window.clearTimeout(timer);
  }, []);


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              reset();
              void router.invalidate();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Jenvu" },
      { name: "application-name", content: "Jenvu" },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
      { name: "google-site-verification", content: "tbza8oQV5Q94J94ETfj9TDnV7gI8eoXIAF6q9nctPnQ" },
      { name: "google-adsense-account", content: "ca-pub-7687697849515472" },
      { title: "Jenvu — Voice Powered Gold Trading Intelligence" },
      { name: "description", content: "Voice-native AI gold desk for XAU/USD and every major XAU cross — live ICT/SMC analysis, A+ setups and spoken execution." },
      { name: "author", content: "Jenvu AI" },
      { name: "theme-color", content: "#000000" },
      { property: "og:site_name", content: "Jenvu AI" },
      { property: "og:title", content: "Jenvu AI — Institutional Gold Trading Desk" },
      { property: "og:description", content: "Speak. Analyze. Execute. The voice terminal that turns gold market noise into institutional-grade XAU signals across every major cross." },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en_US" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/afb81f86-c6e3-4892-b81f-eb551ed99e17/id-preview-cf5425ce--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app-1782731006346.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Jenvu AI — Institutional Gold Trading Desk" },
      { name: "twitter:description", content: "AI gold desk covering every XAU cross-pair with ICT/SMC analysis and voice narration." },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/afb81f86-c6e3-4892-b81f-eb551ed99e17/id-preview-cf5425ce--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app-1782731006346.png" },

    ],
    scripts: [
      {
        src: "https://www.googletagmanager.com/gtag/js?id=G-GCBC1RBN4Y",
        async: true,
      },
      {
        children: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-GCBC1RBN4Y');`,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://jenvu.com/#org",
              name: "Jenvu AI",
              alternateName: "Jenvu",
              url: "https://jenvu.com",
              logo: {
                "@type": "ImageObject",
                url: "https://jenvu.com/favicon.png",
                width: 1024,
                height: 1024,
              },
              image: "https://jenvu.com/favicon.png",
            },
            {
              "@type": "WebSite",
              "@id": "https://jenvu.com/#website",
              url: "https://jenvu.com",
              name: "Jenvu AI",
              publisher: { "@id": "https://jenvu.com/#org" },
              potentialAction: {
                "@type": "SearchAction",
                target: "https://jenvu.com/signals-live?symbol={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }),
      },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "any", href: "/favicon.png" },
      { rel: "shortcut icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/favicon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Google+Sans:wght@300;400;500;600;700&display=swap" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700&display=swap" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,400,1,0&display=block" },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the inline Material Symbols script below adds
    // the `ms-icons-ready` class to <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* PWA standalone mode disabled — always render website look */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var r=document.documentElement;var done=function(){r.classList.add('ms-icons-ready')};try{if(document.fonts&&document.fonts.load){document.fonts.load('20px \"Material Symbols Rounded\"','space_dashboard').then(done).catch(done)}else{done()}}catch(e){done()}setTimeout(done,2500)})();",
          }}
        />
      </head>

      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Native (Capacitor) bootstrap: status bar + hide splash. No-op on web.
    import("../lib/native/bootstrap")
      .then((m) => m.bootstrapNative())
      .catch(() => {});
  }, []);

  // Global runtime error capture → error_log table.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let recent = new Map<string, number>();
    const report = async (
      message: string,
      stack: string | undefined,
      mechanism: "onerror" | "unhandledrejection",
    ) => {
      try {
        // Dedupe identical errors within 5s to avoid spamming the log.
        const key = mechanism + "|" + message.slice(0, 200);
        const now = Date.now();
        const last = recent.get(key) ?? 0;
        if (now - last < 5000) return;
        recent.set(key, now);
        if (recent.size > 50) recent = new Map(Array.from(recent.entries()).slice(-25));

        // Skip noise: extension errors, resize observers, network aborts.
        if (/ResizeObserver|Non-Error promise rejection|AbortError|Load failed/i.test(message)) return;

        const { logError } = await import("../lib/error-log.functions");
        await logError({
          data: {
            message,
            stack: stack ?? null,
            route: window.location.pathname + window.location.search,
            mechanism,
            severity: "error",
            source: "client",
          },
        });
      } catch {
        /* never let logging fail */
      }
    };

    const onErr = (e: ErrorEvent) => {
      const msg = e.message || String(e.error || "unknown");
      const stack = e.error instanceof Error ? e.error.stack : undefined;
      void report(msg, stack, "onerror");
    };
    const onRej = (e: PromiseRejectionEvent) => {
      const reason: any = e.reason;
      const msg = reason instanceof Error ? reason.message : String(reason ?? "unhandled rejection");
      const stack = reason instanceof Error ? reason.stack : undefined;
      void report(msg, stack, "unhandledrejection");
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);


  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);





  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      {/* <PwaTabBar /> disabled */}
      <div className="hide-in-pwa">
        <LiveChatWidget />
      </div>
      
      <SonnerToaster
        theme="light"
        position={isMobile ? "bottom-center" : "top-right"}
        offset={isMobile ? 24 : 96}
        toastOptions={{ style: { background: "#ffffff", color: "#000000", border: "1px solid #e4e4e7", whiteSpace: "nowrap", width: "max-content", maxWidth: "min(92vw, 640px)" } }}
      />
    </QueryClientProvider>
  );
}
