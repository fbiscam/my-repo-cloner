import { Send } from "lucide-react";
import { useEffect, useState } from "react";

export function CommandInput({
  onSubmit,
  disabled,
  externalValue,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  externalValue?: string;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (externalValue) setText(externalValue);
  }, [externalValue]);

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSubmit(t);
    setText("");
  };

  return (
    <div className="flex gap-2 rounded-xl border border-[color:var(--gold)]/30 bg-[#0a0d1f]/80 backdrop-blur p-2 shadow-[0_0_20px_-8px_rgba(212,175,55,0.4)]">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder='Try: "Analyze gold 15m" or "Give me A+ setup on 1H"'
        disabled={disabled}
        className="flex-1 min-w-0 bg-transparent text-sm text-[color:var(--gold)] placeholder:text-[color:var(--gold)]/40 focus:outline-none px-3 font-mono"
      />
      <button
        onClick={submit}
        disabled={disabled || !text.trim()}
        aria-label="Send"
        className="shrink-0 rounded-lg bg-gradient-to-br from-[color:var(--gold)] to-amber-600 px-3 sm:px-4 py-2 text-black font-semibold text-sm disabled:opacity-40 hover:brightness-110 flex items-center gap-1"
      >
        <Send className="h-4 w-4" />
        <span className="hidden sm:inline">Execute</span>
      </button>

    </div>
  );
}
