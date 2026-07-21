/**
 * Careers pre-screen question evaluation (simple rule-based).
 * Used on public apply — never throw; callers wrap in try/catch.
 */

export type PreScreenQuestion = {
  id: string;
  prompt: string;
  type?: "text" | "yes_no" | "number" | "choice";
  options?: string[];
  required?: boolean;
};

export type ScreenEvalResult = {
  pass: boolean;
  score: number;
  summary: string;
  answersFormatted: string;
};

function normalizeYesNo(raw: string): "yes" | "no" | "unknown" {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return "unknown";
  if (
    /^(y|yes|true|1|ok|okay|sure|affirmative|yep|yeah)$/i.test(s) ||
    s.startsWith("yes")
  ) {
    return "yes";
  }
  if (
    /^(n|no|false|0|nope|nah|negative)$/i.test(s) ||
    s.startsWith("no")
  ) {
    return "no";
  }
  return "unknown";
}

function extractYearsRequirement(prompt: string): number | null {
  const p = prompt.toLowerCase();
  if (!/\byears?\b/.test(p)) return null;
  // "at least 5 years", "5+ years", "minimum 3 years", "3 years experience"
  const m =
    p.match(
      /(?:at\s+least|minimum|min\.?|>=?|more\s+than)\s*(\d+(?:\.\d+)?)\s*\+?\s*years?/
    ) ||
    p.match(/(\d+(?:\.\d+)?)\s*\+\s*years?/) ||
    p.match(/(\d+(?:\.\d+)?)\s*years?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

function sponsorshipQuestion(prompt: string): boolean {
  const p = prompt.toLowerCase();
  return (
    p.includes("sponsorship") ||
    p.includes("visa support") ||
    (p.includes("require") && p.includes("visa"))
  );
}

function expectsYesForPass(prompt: string): boolean {
  const p = prompt.toLowerCase();
  // Sponsorship questions are inverted (expect "no") — handled separately
  if (sponsorshipQuestion(prompt)) return false;
  return (
    p.includes("authorized") ||
    p.includes("willing") ||
    p.includes("eligible") ||
    p.includes("legally") ||
    p.includes("work authorization") ||
    p.includes("right to work") ||
    p.includes("relocate")
  );
}

/**
 * Evaluate pre-screen answers against questions.
 * Simple rules: yes_no + authorized/willing → expect yes;
 * number + years in prompt → compare; otherwise completeness score.
 */
export function evaluateScreenAnswers(
  questions: PreScreenQuestion[] | undefined | null,
  answers: Record<string, string>
): ScreenEvalResult {
  const qs = Array.isArray(questions) ? questions : [];
  const ans = answers && typeof answers === "object" ? answers : {};

  if (qs.length === 0) {
    return {
      pass: true,
      score: 100,
      summary: "No pre-screen questions configured.",
      answersFormatted: "",
    };
  }

  let points = 0;
  let maxPoints = 0;
  let hardFail = false;
  const notes: string[] = [];

  for (const q of qs) {
    const raw = String(ans[q.id] ?? "").trim();
    const required = q.required !== false;
    const type = q.type || "text";
    const weight = required ? 2 : 1;
    maxPoints += weight;

    if (!raw) {
      if (required) {
        hardFail = true;
        notes.push(`Missing required: "${q.prompt.slice(0, 60)}"`);
      }
      continue;
    }

    // Completeness credit
    points += weight * 0.5;

    if (type === "yes_no" || normalizeYesNo(raw) !== "unknown") {
      const yn = normalizeYesNo(raw);
      if (sponsorshipQuestion(q.prompt)) {
        // Prefer "no" (does not need sponsorship)
        if (yn === "no") {
          points += weight * 0.5;
        } else if (yn === "yes") {
          hardFail = true;
          notes.push(`Sponsorship required: "${q.prompt.slice(0, 50)}"`);
        }
      } else if (expectsYesForPass(q.prompt) || type === "yes_no") {
        if (
          expectsYesForPass(q.prompt) &&
          (q.prompt.toLowerCase().includes("authorized") ||
            q.prompt.toLowerCase().includes("willing") ||
            q.prompt.toLowerCase().includes("eligible"))
        ) {
          if (yn === "yes") {
            points += weight * 0.5;
          } else if (yn === "no") {
            hardFail = true;
            notes.push(`Failed yes/no: "${q.prompt.slice(0, 50)}"`);
          } else {
            points += weight * 0.25;
          }
        } else if (type === "yes_no") {
          // Generic yes_no: count as answered
          points += weight * 0.5;
        } else {
          points += weight * 0.5;
        }
      } else {
        points += weight * 0.5;
      }
      continue;
    }

    if (type === "number" || /\byears?\b/i.test(q.prompt)) {
      const num = parseFloat(raw.replace(/[^\d.-]/g, ""));
      const requiredYears = extractYearsRequirement(q.prompt);
      if (Number.isFinite(num)) {
        if (requiredYears != null) {
          if (num >= requiredYears) {
            points += weight * 0.5;
          } else {
            hardFail = true;
            notes.push(
              `Years short (${num} < ${requiredYears}): "${q.prompt.slice(0, 40)}"`
            );
          }
        } else {
          points += weight * 0.5;
        }
      } else if (required) {
        notes.push(`Invalid number for: "${q.prompt.slice(0, 40)}"`);
      }
      continue;
    }

    // text / choice — completeness already counted
    points += weight * 0.5;
  }

  const score =
    maxPoints > 0
      ? Math.max(0, Math.min(100, Math.round((points / maxPoints) * 100)))
      : 100;
  // Soft pass on completeness if no hard fails and score >= 50
  const pass = !hardFail && score >= 50;

  const summary = pass
    ? `Pre-screen passed (score ${score}/100).`
    : `Pre-screen flags (score ${score}/100). ${notes.slice(0, 3).join("; ") || "Incomplete or failed rules."}`;

  return {
    pass,
    score,
    summary,
    answersFormatted: formatAnswersForNote(qs, ans),
  };
}

export function formatAnswersForNote(
  questions: PreScreenQuestion[] | undefined | null,
  answers: Record<string, string>
): string {
  const qs = Array.isArray(questions) ? questions : [];
  const ans = answers && typeof answers === "object" ? answers : {};
  if (qs.length === 0) return "";

  const lines = ["Pre-screen Q&A:"];
  for (const q of qs) {
    const a = String(ans[q.id] ?? "").trim() || "(no answer)";
    lines.push(`Q: ${q.prompt}`);
    lines.push(`A: ${a}`);
    lines.push("");
  }
  return lines.join("\n").trim().slice(0, 4000);
}
