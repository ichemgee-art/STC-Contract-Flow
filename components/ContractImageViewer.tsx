"use client";

import { Download, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export function ContractImageViewer({ src, name, contentType, ar, onClose, onDownload }: {
  src: string; name: string; contentType?: string; ar: boolean; onClose: () => void; onDownload: () => void;
}) {
  const isPdf = contentType === "application/pdf" || /\.pdf$/i.test(name);
  const dialog = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const current = useRef({ scale: 1, x: 0, y: 0 });
  const [view, setView] = useState(current.current);
  const apply = useCallback((scale: number, x = current.current.x, y = current.current.y) => {
    scale = Math.min(6, Math.max(1, scale));
    const box = viewport.current;
    const img = image.current;
    const maxX = box && img ? Math.max(0, (img.offsetWidth * scale - box.clientWidth) / 2) : 0;
    const maxY = box && img ? Math.max(0, (img.offsetHeight * scale - box.clientHeight) / 2) : 0;
    current.current = { scale, x: scale === 1 ? 0 : Math.max(-maxX, Math.min(maxX, x)), y: scale === 1 ? 0 : Math.max(-maxY, Math.min(maxY, y)) };
    setView(current.current);
  }, []);
  const zoom = useCallback((scale: number, clientX?: number, clientY?: number) => {
    const previous = current.current;
    const next = Math.min(6, Math.max(1, scale));
    const bounds = viewport.current?.getBoundingClientRect();
    const px = bounds && clientX !== undefined ? clientX - bounds.left - bounds.width / 2 : 0;
    const py = bounds && clientY !== undefined ? clientY - bounds.top - bounds.height / 2 : 0;
    const ratio = next / previous.scale;
    apply(next, px - (px - previous.x) * ratio, py - (py - previous.y) * ratio);
  }, [apply]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (!isPdf && (event.key === "+" || event.key === "=")) zoom(current.current.scale * 1.25);
      if (!isPdf && event.key === "-") zoom(current.current.scale / 1.25);
      if (!isPdf && event.key === "0") apply(1);
      if (event.key === "Tab") {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    const box = viewport.current;
    const wheel = (event: WheelEvent) => { event.preventDefault(); zoom(current.current.scale * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY); };
    if (!isPdf) box?.addEventListener("wheel", wheel, { passive: false });
    const observer = new ResizeObserver(() => apply(current.current.scale));
    if (!isPdf && box) observer.observe(box);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      if (!isPdf) box?.removeEventListener("wheel", wheel);
      observer.disconnect();
      previousFocus?.focus();
    };
  }, [apply, isPdf, zoom, onClose]);

  return <div className="attachment-modal" role="dialog" aria-modal="true" aria-label={name} tabIndex={-1} ref={dialog}>
    <button className="attachment-modal-backdrop" onClick={onClose} aria-label={ar ? "إغلاق المعاينة" : "Close preview"} />
    <div className="attachment-modal-panel document-viewer-panel">
      <header><strong title={name}>{name}</strong><div className="attachment-modal-actions">
        <button className="icon-button" onClick={onDownload} aria-label={ar ? "تنزيل المرفق" : "Download attachment"}><Download size={18} /></button>
        <button className="icon-button" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}><X size={20} /></button>
      </div></header>
      {isPdf ? (
        <div className="document-pdf-viewport">
          <iframe src={src} title={name} />
        </div>
      ) : (
        <>
          <div className="document-zoom-toolbar">
            <button className="icon-button" onClick={() => zoom(view.scale / 1.25)} disabled={view.scale === 1} aria-label={ar ? "تصغير" : "Zoom out"}><Minus size={18} /></button>
            <output aria-live="polite">{Math.round(view.scale * 100)}%</output>
            <button className="icon-button" onClick={() => zoom(view.scale * 1.25)} disabled={view.scale === 6} aria-label={ar ? "تكبير" : "Zoom in"}><Plus size={18} /></button>
            <button className="button button-secondary" onClick={() => apply(1)}><RotateCcw size={16} />{ar ? "إعادة ضبط" : "Reset"}</button>
            <span>{ar ? "كبّر بالعجلة أو بإصبعين، ثم اسحب للتحريك" : "Wheel or pinch to zoom, then drag to pan"}</span>
          </div>
          <div ref={viewport} className="document-zoom-viewport" style={{ cursor: view.scale > 1 ? "grab" : "default" }}
            onPointerDown={event => { pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={event => {
              const before = [...pointers.current.values()];
              const old = pointers.current.get(event.pointerId);
              if (!old) return;
              pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
              const after = [...pointers.current.values()];
              if (before.length >= 2) {
                const distance = (points: typeof before) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
                const previousDistance = distance(before);
                if (previousDistance > 0) zoom(current.current.scale * distance(after) / previousDistance, (after[0].x + after[1].x) / 2, (after[0].y + after[1].y) / 2);
              } else if (current.current.scale > 1) apply(current.current.scale, current.current.x + event.clientX - old.x, current.current.y + event.clientY - old.y);
            }}
            onPointerUp={event => pointers.current.delete(event.pointerId)}
            onPointerCancel={event => pointers.current.delete(event.pointerId)}
            onLostPointerCapture={event => pointers.current.delete(event.pointerId)}>
            <img ref={image} src={src} alt={name} draggable={false} onLoad={() => apply(1)} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} />
          </div>
        </>
      )}
    </div>
  </div>;
}
