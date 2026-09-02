"use client";
// .composer — pinned compose bar, shared by the job chat thread and the
// Messages inbox (W10-inbox). Same control, two call sites.
import type { FormEvent } from "react";
import { Paperclip, Send } from "lucide-react";

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  sending,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  placeholder: string;
  disabled?: boolean;
  sending?: boolean;
}) {
  return (
    <form className="composer" onSubmit={onSubmit}>
      <Paperclip className="cg" />
      <input
        className="ci"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ border: "none", outline: "none", font: "inherit", color: "var(--text)" }}
        disabled={disabled}
      />
      <button type="submit" className="cb" disabled={disabled || sending || !value.trim()} aria-label="Send">
        <Send style={{ width: 18 }} />
      </button>
    </form>
  );
}
