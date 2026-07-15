import { parseJobDescription } from "@/lib/careers/format-description";

type Props = {
  description: string;
  className?: string;
};

/**
 * Renders a job description with real lists, headings, and readable spacing.
 * Uses explicit bullet glyphs so lists stay visible even if list-style CSS is purged.
 */
export function JobDescription({ description, className = "" }: Props) {
  const blocks = parseJobDescription(description);

  if (!blocks.length) {
    return (
      <p className={`text-sm text-slate-500 ${className}`}>
        No description provided.
      </p>
    );
  }

  return (
    <div
      className={`space-y-5 text-[15px] leading-relaxed text-slate-700 ${className}`}
    >
      {blocks.map((b, idx) => {
        if (b.type === "h") {
          return (
            <h3
              key={idx}
              className="border-b border-slate-100 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              {b.text}
            </h3>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={idx} className="space-y-2.5">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-2.5">
                  <span
                    className="mt-0.5 shrink-0 font-semibold text-slate-400"
                    aria-hidden
                  >
                    •
                  </span>
                  <span className="min-w-0 flex-1">{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={idx} className="space-y-2.5">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-0.5 w-5 shrink-0 text-right text-sm font-semibold text-slate-400">
                    {j + 1}.
                  </span>
                  <span className="min-w-0 flex-1">{item}</span>
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
