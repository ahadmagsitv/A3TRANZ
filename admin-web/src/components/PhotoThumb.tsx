"use client";
import { useEffect, useState } from "react";
import { Camera, X } from "lucide-react";

export function PhotoThumb({ src, alt }: { src?: string | null; alt: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!src) {
    return (
      <span className="pshot">
        <Camera />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="pshot"
        onClick={() => setOpen(true)}
        aria-label={`View ${alt} full size`}
      >
        <img src={src} alt={alt} />
      </button>

      {open && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
        >
          <button type="button" className="lightbox-x" aria-label="Close">
            <X />
          </button>
          <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
          <div className="lightbox-cap">{alt}</div>
        </div>
      )}
    </>
  );
}
