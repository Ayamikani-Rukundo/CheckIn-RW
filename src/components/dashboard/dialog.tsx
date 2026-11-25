"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export function Dialog({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`dialog-card ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-heading"><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button></div>
        {children}
      </section>
    </div>
  );
}
