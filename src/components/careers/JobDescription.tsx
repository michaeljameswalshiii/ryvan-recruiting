import { parseJobDescription } from "@/lib/careers/format-description";
import {
  looksLikeHtml,
  sanitizeJobHtml,
} from "@/lib/careers/sanitize-job-html";

type Props = {
  description: string;
  className?: string;
};

/**
 * Renders a job description with real lists, headings, bold/italic when stored as HTML.
 * Plain-text legacy postings still use structural parse (bullets / section headings).
 */
export function JobDescription({ description, className = "" }: Props) {
  const raw = description || "";

  // Rich HTML (from new editor / Docs paste)
  if (looksLikeHtml(raw)) {
    const html = sanitizeJobHtml(raw);
    if (!html.replace(/<[^>]+>/g, "").trim()) {
      return (
        <p className={`text-sm text-slate-500 ${className}`}>
          No description provided.
        </p>
      );
    }
    return (
      <div
        className={`job-desc-html space-y-1 text-[15px] leading-[1.65] text-slate-700 ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  const blocks = parseJobDescription(raw);

  if (!blocks.length) {
    return (
      <p className={`text-sm text-slate-500 ${className}`}>
        No description provided.
      </p>
    );
  }

  return (
    <div
      className={`space-y-6 text-[15px] leading-[1.65] text-slate-700 ${className}`}
    >
      {blocks.map((b, idx) => {
        if (b.type === "h") {
          return (
            <h3
              key={idx}
              className="mt-1 border-b border-slate-200 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
            >
              {b.text}
            </h3>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={idx} className="space-y-3.5">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-3">
                  <span
                    className="mt-[0.35em] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 text-slate-700">{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={idx} className="space-y-3.5">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-400">
                    {j + 1}.
                  </span>
                  <span className="min-w-0 flex-1 text-slate-700">{item}</span>
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={idx} className="text-slate-700">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}
