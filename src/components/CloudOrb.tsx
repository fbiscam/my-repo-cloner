export type OrbStatus = "idle" | "listening" | "thinking" | "speaking";

export function CloudOrb({ status = "idle", pulse = 0 }: { status?: OrbStatus; pulse?: number }) {
  const speaking = status === "speaking";
  const hueShift = (pulse * 47) % 360;
  const kick = speaking ? 1 + ((pulse % 2) === 0 ? 0.04 : 0.07) : 1;
  const baseScale =
    status === "speaking" ? 1.05 :
    status === "listening" ? 1.02 :
    status === "thinking" ? 1.0 : 0.97;
  const scale = baseScale * kick;

  return (
    <div
      className="relative h-full w-full aspect-square flex items-center justify-center"
      style={{
        transform: `scale(${scale})`,
        transition: "transform 220ms cubic-bezier(0.4,0,0.2,1)",
        filter: speaking ? `hue-rotate(${hueShift}deg) saturate(1.3)` : "none",
      }}
    >
      <div className="relative h-full w-full aspect-square rounded-full flex items-center justify-center">
        <div
          className="relative h-full w-full aspect-square rounded-full overflow-hidden"

          style={{
            background:
              "radial-gradient(circle at 50% 25%, #f4faff 0%, #b8dcff 28%, #5ea8ee 60%, #1f5fb0 90%, #0b3a7a 100%)",
            boxShadow:
              "inset -14px -20px 50px rgba(20,60,140,0.7), inset 10px 14px 38px rgba(255,255,255,0.95), 0 0 90px rgba(150,200,255,0.9), 0 0 140px rgba(170,130,255,0.45)",
          }}
        >
          <div
            className="absolute -inset-1/3"
            style={{
              animation: `orb-drift-a ${status === "speaking" ? "7s" : status === "thinking" ? "9s" : "14s"} ease-in-out infinite, orb-hue 18s linear infinite`,
              background:
                "radial-gradient(30% 24% at 28% 30%, rgba(244,114,182,0.95), transparent 70%), radial-gradient(28% 22% at 72% 26%, rgba(251,191,36,0.9), transparent 70%), radial-gradient(32% 26% at 30% 74%, rgba(52,211,153,0.95), transparent 70%), radial-gradient(30% 24% at 74% 72%, rgba(167,139,250,0.95), transparent 70%)",
              mixBlendMode: "screen",
            }}
          />
          <div
            className="absolute -inset-1/3"
            style={{
              animation: `orb-drift-b ${status === "speaking" ? "9s" : "18s"} ease-in-out infinite`,
              background:
                "conic-gradient(from 90deg, rgba(255,90,160,0.7) 0%, rgba(56,189,248,0.0) 18%, rgba(255,200,80,0.7) 35%, rgba(255,255,255,0.0) 50%, rgba(80,230,180,0.7) 65%, rgba(56,189,248,0.0) 80%, rgba(170,130,255,0.7) 100%)",
              filter: "blur(24px)",
              mixBlendMode: "screen",
            }}
          />
          <div
            className="absolute -inset-1/4"
            style={{
              animation: `orb-shimmer ${status === "speaking" ? "2.2s" : "5s"} ease-in-out infinite`,
              background:
                "radial-gradient(36% 12% at 50% 50%, rgba(255,255,255,0.9), transparent 70%), radial-gradient(26% 9% at 36% 58%, rgba(255,210,235,0.75), transparent 70%), radial-gradient(28% 10% at 66% 46%, rgba(200,245,255,0.85), transparent 70%)",
              filter: "blur(6px)",
              mixBlendMode: "screen",
            }}
          />
          {/* Glossy top highlight */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_38%_16%,rgba(255,255,255,1),transparent_42%)]" />
          {/* Crescent specular highlight */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(ellipse 55% 18% at 50% 14%, rgba(255,255,255,0.95), transparent 70%)",
              filter: "blur(2px)",
            }}
          />
          {/* Small bright spec dot */}
          <div
            className="absolute rounded-full"
            style={{
              top: "14%",
              left: "30%",
              width: "14%",
              height: "10%",
              background: "radial-gradient(circle, rgba(255,255,255,1) 0%, transparent 70%)",
              filter: "blur(1px)",
            }}
          />
          {/* Bottom reflective bounce light */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(ellipse 60% 16% at 50% 92%, rgba(180,220,255,0.55), transparent 70%)",
              filter: "blur(3px)",
              mixBlendMode: "screen",
            }}
          />
          {/* Soft sky rim */}
          <div
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: "inset 0 0 30px rgba(200,230,255,0.8)" }}
          />
          {speaking && (
            <div
              className="absolute inset-0 animate-pulse"
              style={{
                background:
                  "radial-gradient(circle at 50% 55%, rgba(120,180,240,0.45), transparent 60%)",
                animationDuration: "0.9s",
                mixBlendMode: "screen",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
