"use client";
// The driver's capture thumbnail — `.pshot`, used by the job detail step list
// and by the approve modal. Both rendered a bare 84×62 <img>, which is enough
// to show that something was captured and not nearly enough to review it.
// Clicking one now opens it full size.
//
// One component rather than a lightbox per screen: the approve modal is where
// the photos actually get judged, so a fix that skipped it would miss the
// case that matters most.
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

  // An empty slot is a placeholder, not something to open.
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
        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary delivery URLs are signed and per-asset; next/image would need remotePatterns and would re-proxy media the API already authorizes. */}
        <img src={src} alt={alt} />
      </button>

      {open && (
        // z-index 60: above `.scrim-bg` (50), so this still works when the
        // thumbnail is inside the approve modal.
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
          {/* eslint-disable-next-line @next/next/no-img-element -- see above. */}
          <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
          <div className="lightbox-cap">{alt}</div>
        </div>
      )}
    </>
  );
}
