"use client";
// .composer — pinned compose bar, shared by the job chat thread and the
// Messages inbox (W10-inbox). Same control, two call sites.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, FileText, Image as ImageIcon, Paperclip, Send, X } from "lucide-react";
import { uploadFile } from "@/data/repos/api";

/** What the composer is holding, already in the bucket, not yet sent. */
export interface DraftAttachment {
  key: string;
  name: string;
  type: string;
  /** Local object URL — the preview, before the message exists. */
  previewUrl: string | null;
}

/**
 * A control that is only its glyph.
 *
 * The paperclip was a plain <button>, which brings a border, a background and
 * padding from the browser's own stylesheet — it read as a boxed button next
 * to an unboxed input.
 */
const bareButton: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: 0,
  border: "none",
  background: "none",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
};

const IMAGE_ACCEPT = "image/jpeg,image/png,image/heic,image/webp,image/gif";
const FILE_ACCEPT =
  "application/pdf,text/plain,text/csv,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.ms-excel," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  sending,
  threadId,
  attachment,
  onAttachmentChange,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  placeholder: string;
  disabled?: boolean;
  sending?: boolean;
  /** Where an upload belongs. Without one the paperclip has nothing to attach to. */
  threadId?: string | null;
  attachment?: DraftAttachment | null;
  onAttachmentChange?: (next: DraftAttachment | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const capture = useRef<HTMLInputElement>(null);
  const doc = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // A menu that ignores a click elsewhere is a menu you cannot dismiss.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

  // The preview is an object URL; letting it outlive the draft leaks the blob.
  useEffect(
    () => () => {
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    },
    [attachment?.previewUrl],
  );

  async function take(file: File | undefined) {
    setMenuOpen(false);
    if (!file || !threadId) return;
    setError(null);
    setBusy(true);
    try {
      const up = await uploadFile(file, { threadId, purpose: "message" });
      onAttachmentChange?.({
        key: up.key,
        name: file.name,
        type: file.type,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      });
    } catch (e) {
      // Say why. A silently dropped attachment is one the sender believes went.
      setError(e instanceof Error ? e.message : "Could not attach that file.");
    } finally {
      setBusy(false);
    }
  }

  const remove = () => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    onAttachmentChange?.(null);
    setError(null);
    // Clearing the inputs too, or picking the SAME file again fires no change
    // event and the attachment cannot be restored.
    for (const r of [photo, capture, doc]) if (r.current) r.current.value = "";
  };

  // An attachment IS a message: a photo with no caption still sends.
  const nothingToSend = !value.trim() && !attachment;

  return (
    <div>
      {error && (
        <div
          className="t-sub"
          style={{ padding: "8px 18px 0", color: "var(--st-overdue-ink)" }}
          role="alert"
        >
          {error}
        </div>
      )}

      {attachment && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            margin: "10px 18px 0",
            padding: 8,
            border: "1px solid var(--hairline)",
            borderRadius: 10,
            background: "var(--surface)",
            maxWidth: 360,
          }}
        >
          {attachment.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attachment.previewUrl}
              alt={attachment.name}
              style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6 }}
            />
          ) : (
            <FileText style={{ width: 22, color: "var(--muted)" }} />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                font: "600 13px var(--f)",
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {attachment.name}
            </div>
            <div className="t-sub" style={{ fontSize: 11 }}>
              Attached · add a message, or send as is
            </div>
          </div>
          <button
            type="button"
            onClick={remove}
            aria-label={`Remove ${attachment.name}`}
            style={bareButton}
          >
            <X style={{ width: 16, color: "var(--muted)" }} />
          </button>
        </div>
      )}

      <form className="composer" onSubmit={onSubmit}>
        <div ref={menu} style={{ position: "relative", display: "flex" }}>
          <button
            type="button"
            aria-label="Add an attachment"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            // One attachment per message: a second would silently replace the
            // first, and the chip only has room to admit to one.
            disabled={disabled || busy || !threadId || !!attachment}
            onClick={() => setMenuOpen((o) => !o)}
            style={bareButton}
          >
            <Paperclip className="cg" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: 0,
                zIndex: 20,
                minWidth: 190,
                padding: 6,
                background: "var(--surface)",
                border: "1px solid var(--hairline)",
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,.12)",
              }}
            >
              {[
                { icon: <ImageIcon style={{ width: 16 }} />, label: "Photo or image", ref: photo },
                { icon: <Camera style={{ width: 16 }} />, label: "Take a photo", ref: capture },
                { icon: <FileText style={{ width: 16 }} />, label: "PDF or file", ref: doc },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => item.ref.current?.click()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    width: "100%",
                    padding: "9px 10px",
                    background: "none",
                    border: "none",
                    borderRadius: 7,
                    font: "600 13px var(--f)",
                    color: "var(--text)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* The three pickers the menu drives. `capture` opens the camera on a
            phone browser and falls back to the file picker on a desktop, which
            is the attribute doing exactly what it is for. */}
        <input
          ref={photo}
          type="file"
          accept={IMAGE_ACCEPT}
          hidden
          onChange={(e) => void take(e.target.files?.[0])}
        />
        <input
          ref={capture}
          type="file"
          accept={IMAGE_ACCEPT}
          capture="environment"
          hidden
          onChange={(e) => void take(e.target.files?.[0])}
        />
        <input
          ref={doc}
          type="file"
          accept={FILE_ACCEPT}
          hidden
          onChange={(e) => void take(e.target.files?.[0])}
        />

        <input
          className="ci"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={busy ? "Attaching…" : placeholder}
          style={{ border: "none", outline: "none", font: "inherit", color: "var(--text)" }}
          disabled={disabled}
        />
        <button
          type="submit"
          className="cb"
          disabled={disabled || sending || busy || nothingToSend}
          aria-label="Send"
        >
          <Send style={{ width: 18 }} />
        </button>
      </form>
    </div>
  );
}
