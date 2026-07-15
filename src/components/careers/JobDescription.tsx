import { parseJobDescription } from "@/lib/careers/format-description";

type Props = {
  description: string;
  className?: string;
};

/**
 * Renders a job description with real lists, headings, and readable spacing.
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
      className={`space-y-4 text-sm leading-relaxed text-slate-700 ${className}`}
    >
      {blocks.map((b, idx) => {
        if (b.type === "h") {
          return (
            <h3
              key={idx}
              className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              {b.text}
            </h3>
          );
        }
        if (b.type === "ul") {
          return (
            <ul
              key={idx}
              className="list-disc space-y-1.5 pl-5 marker:text-slate-400"
            >
              {b.items.map((item, j) => (
                <li key={j} className="pl-0.5">
                  {item}
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol
              key={idx}
              className="list-decimal space-y-1.5 pl-5 marker:text-slate-400"
            >
              {b.items.map((item, j) => (
                <li key={j} className="pl-0.5">
                  {item}
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
