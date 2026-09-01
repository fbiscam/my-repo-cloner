import { useEffect, useRef, useState } from "react";

type Props = {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
};

// Simple in-browser avatar adjuster: square crop, drag to reposition, zoom slider.
// Exports a 512x512 JPEG.
export default function AvatarAdjuster({ file, onCancel, onDone }: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1); // multiplier over "cover" scale
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // in px, relative to center
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const BOX = 288; // px, on-screen crop box size

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Base "cover" scale: image fills the crop box exactly at zoom=1
  const baseScale = img ? Math.max(BOX / img.naturalWidth, BOX / img.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const dispW = img ? img.naturalWidth * scale : 0;
  const dispH = img ? img.naturalHeight * scale : 0;

  const clampOffset = (x: number, y: number) => {
    const maxX = Math.max(0, (dispW - BOX) / 2);
    const maxY = Math.max(0, (dispH - BOX) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  useEffect(() => {
    // Re-clamp when zoom changes
    setOffset((o) => clampOffset(o.x, o.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, img]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = draggingRef.current;
    if (!d) return;
    const nx = d.ox + (e.clientX - d.x);
    const ny = d.oy + (e.clientY - d.y);
    setOffset(clampOffset(nx, ny));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = null;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const next = Math.max(1, Math.min(4, zoom + (e.deltaY < 0 ? 0.06 : -0.06)));
    setZoom(next);
  };

  const doExport = async () => {
    if (!img) return;
    setSaving(true);
    try {
      // Export at HD: up to 1024px, never upscaling beyond what the source can fill.
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      const sourceCap = Math.round((Math.min(img.naturalWidth, img.naturalHeight) / Math.max(1, zoom)) * zoom);
      const OUT = Math.max(512, Math.min(1024, Math.round(Math.max(BOX * dpr * 2, Math.min(1024, sourceCap)))));
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas not supported");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#f4f4f5";
      ctx.fillRect(0, 0, OUT, OUT);
      // Map on-screen coords to output coords: 1px on-screen = (OUT/BOX)px output
      const k = OUT / BOX;
      const outW = dispW * k;
      const outH = dispH * k;
      const cx = OUT / 2 + offset.x * k;
      const cy = OUT / 2 + offset.y * k;
      ctx.drawImage(img, cx - outW / 2, cy - outH / 2, outW, outH);
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Export failed"))),
          "image/jpeg",
          0.96,
        ),
      );
      onDone(blob);
    } catch (e) {
      setSaving(false);
      throw e;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Adjust photo</h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-zinc-500 hover:text-zinc-800"
          >
            Cancel
          </button>
        </div>

        <div
          ref={boxRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          className="relative mx-auto touch-none overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 select-none"
          style={{ width: BOX, height: BOX, cursor: "grab" }}
        >
          {imgUrl && img && (
            <img
              src={imgUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: dispW,
                height: dispH,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          )}
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-3 text-xs text-zinc-600">
            <span className="w-10 shrink-0">Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-zinc-900"
            />
          </label>
          <p className="mt-2 text-[11px] text-zinc-500">
            Drag to reposition · Scroll or slider to zoom
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={doExport}
            disabled={!img || saving}
            className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
