"use client";
import { useEffect, useId, useRef, useState } from "react";
import { api, ApiError } from "@/data/repos/api";

type Suggestion = { placeId: string; text: string };
let disabled = false;

export function PlaceInput({
  value,
  onChange,
  onPick,
  required,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick?: (mapQuery: string | null) => void;
  required?: boolean;
}) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const picked = useRef<string | null>(null);

  useEffect(() => {
    if (disabled || value.trim().length < 2 || value === picked.current) return;
    const t = setTimeout(() => {
      api<{ suggestions: Suggestion[] }>(`/places/autocomplete?q=${encodeURIComponent(value)}`)
        .then((r) => setSuggestions(r.suggestions))
        .catch((e) => {
          if (e instanceof ApiError && e.status === 501) disabled = true;
          setSuggestions([]);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  function change(text: string) {
    onChange(text);
    const hit = suggestions.find((s) => s.text === text);
    if (!hit) {
      picked.current = null;
      onPick?.(null);
      return;
    }
    picked.current = text;
    setSuggestions([]);
    api<{ address: string; mapQuery: string | null }>(`/places/${encodeURIComponent(hit.placeId)}`)
      .then((p) => {
        if (picked.current !== text) return;
        if (p.address) {
          picked.current = p.address;
          onChange(p.address);
        }
        onPick?.(p.mapQuery);
      })
      .catch(() => onPick?.(null));
  }

  return (
    <>
      <input
        className="input"
        value={value}
        onChange={(e) => change(e.target.value)}
        list={listId}
        autoComplete="off"
        placeholder="Search address or place"
        required={required}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s.placeId} value={s.text} />
        ))}
      </datalist>
    </>
  );
}
