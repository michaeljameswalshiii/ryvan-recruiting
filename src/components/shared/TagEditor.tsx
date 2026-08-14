"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { mergeTaxonomy, type TagObjectType } from "@/lib/tags";

export function TagEditor({
  value,
  onChange,
  objectType,
  disabled,
  placeholder = "Add tag…",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  objectType: TagObjectType;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const library = useMemo(
    () =>
      mergeTaxonomy().filter((row) => row.objects.includes(objectType)),
    [objectType]
  );
  const selected = new Set(value.map((t) => t.toLowerCase()));
  const suggestions = library
    .filter((row) => !selected.has(row.label.toLowerCase()))
    .filter((row) =>
      !draft.trim()
        ? true
        : row.label.toLowerCase().includes(draft.trim().toLowerCase())
    )
    .slice(0, 8);

  const add = (label: string) => {
    const tag = label.trim();
    if (!tag || selected.has(tag.toLowerCase())) return;
    onChange([...value, tag].slice(0, 18));
    setDraft("");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-800"
          >
            {tag}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(value.filter((item) => item !== tag))}
              className="text-violet-400 hover:text-violet-800"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (suggestions[0]) add(suggestions[0].label);
              else add(draft);
            }
          }}
          placeholder={placeholder}
          className="h-7 min-w-[8rem] flex-1 rounded-md border border-dashed border-slate-300 bg-white px-2 text-[11px] outline-none focus:border-violet-400"
        />
      </div>
      {draft.trim() && suggestions.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {suggestions.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => add(row.label)}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-violet-300 hover:text-violet-800"
            >
              {row.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
