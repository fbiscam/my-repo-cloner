import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuthUser } from "@/hooks/useAuthUser";
import CreditsPill from "@/components/CreditsPill";


const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";

export default function HeaderAuthButtons({ signInOnly = false }: { signInOnly?: boolean } = {}) {
  const { user } = useAuthUser();
  // Avoid SSR/CSR hydration mismatch: server has no localStorage, so it
  // always renders the signed-out UI. Only reveal the signed-in variant
  // after the client has mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (mounted && user) {

    return (
      <div className="flex shrink-0 items-center gap-2">
        
        <Link

          to="/dashboard"
          className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 transition ${MONO} text-[10px] tracking-wider uppercase`}
        >
          Dashboard
        </Link>
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 sm:gap-2 sm:px-3.5 sm:text-sm"
        >
          Launch
          <span className={`${MONO} text-[10px] opacity-70`}>↗</span>
        </Link>
      </div>
    );
  }

  if (signInOnly) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/auth"
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 sm:gap-2 sm:px-3.5 sm:text-sm"
        >
          Sign In
          <span className={`${MONO} text-[10px] opacity-70`}>→</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        to="/auth"
        className="hidden sm:inline-flex px-3 py-1.5 text-sm text-zinc-900 hover:text-zinc-700"
      >
        Sign In
      </Link>
      <Link
        to="/founding"
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 sm:gap-2 sm:px-3.5 sm:text-sm"
      >
        Apply
        <span className={`${MONO} text-[10px] opacity-70`}>→</span>
      </Link>
    </div>
  );
}
