"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import CameraCapture from "./camera-capture";

export default function CameraOverlay({ onPhoto, onVoice, onText, onClose }: {
  onPhoto: (file: File) => void;
  onVoice: () => void;
  onText: () => void;
  onClose: () => void;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlay.current?.querySelector<HTMLButtonElement>("button")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      } else if (event.key === "Tab") {
        const buttons = Array.from(overlay.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        if (!buttons.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return createPortal(<div ref={overlay} className="camera-overlay" role="dialog" aria-modal="true" aria-label="Scan your food">
    <CameraCapture onPhoto={onPhoto} onVoice={onVoice} onText={onText} onClose={onClose} />
  </div>, document.body);
}
