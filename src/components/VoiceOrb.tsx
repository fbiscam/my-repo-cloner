import { Mic, MicOff, Loader2, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "idle" | "listening" | "thinking" | "speaking";

export function VoiceOrb({
  status,
  onToggle,
}: {
  status: Status;
  onToggle: () => void;
}) {
  const label =
    status === "listening"
      ? "Listening"
      : status === "thinking"
        ? "Analyzing"
        : status === "speaking"
          ? "Speaking"
          : "Tap to speak";

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={onToggle}
        className={cn(
          "group relative h-32 w-32 rounded-full transition-all",
          "bg-gradient-to-br from-[#1a1f3a] to-[#0a0d1f]",
          "border border-[color:var(--gold)]/30",
          "shadow-[0_0_40px_-5px_rgba(212,175,55,0.4)]",
          status === "listening" && "shadow-[0_0_60px_0_rgba(0,229,255,0.6)] border-[color:var(--cyan)]/60",
          status === "speaking" && "shadow-[0_0_60px_0_rgba(212,175,55,0.7)]",
          status === "thinking" && "shadow-[0_0_60px_0_rgba(212,175,55,0.5)]",
        )}
      >
        {/* pulse rings */}
        <span
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full border-2",
            status === "listening" ? "border-[color:var(--cyan)]/50 animate-ping" : "border-transparent",
          )}
        />
        <span
          className={cn(
            "pointer-events-none absolute -inset-2 rounded-full border",
            status === "speaking" ? "border-[color:var(--gold)]/40 animate-pulse" : "border-transparent",
          )}
        />

        <div className="absolute inset-0 flex items-center justify-center">
          {status === "thinking" ? (
            <Loader2 className="h-10 w-10 animate-spin text-[color:var(--gold)]" />
          ) : status === "speaking" ? (
            <Volume2 className="h-10 w-10 text-[color:var(--gold)] animate-pulse" />
          ) : status === "listening" ? (
            <Mic className="h-10 w-10 text-[color:var(--cyan)]" />
          ) : (
            <MicOff className="h-10 w-10 text-[color:var(--gold)]/70 group-hover:text-[color:var(--gold)]" />
          )}
        </div>
      </button>
      <div className="text-xs font-mono uppercase tracking-[0.25em] text-[color:var(--gold)]/80">
        {label}
      </div>
    </div>
  );
}
