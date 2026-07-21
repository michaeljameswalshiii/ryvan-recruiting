/**
 * Lightweight reply classification for sequence stop / stage suggestions.
 * Rule-based — no LLM required.
 */

export type ReplyClassification =
  | "positive"
  | "negative"
  | "neutral"
  | "ooo";

export interface ReplyClassifyResult {
  classification: ReplyClassification;
  confidence: number; // 0-1
  reasons: string[];
  stageSuggestion?: string;
}

const POSITIVE = [
  /\b(interested|sounds good|let'?s talk|happy to|open to|available|schedule|book a time|yes[,!]?\s*(i am|i'?d|sure)|definitely|would love|keen|please send|tell me more|more info)\b/i,
  /\b(free (on|this)|works for me|that works|i can chat|happy to chat)\b/i,
];

const NEGATIVE = [
  /\b(not interested|no thanks|no thank you|unsubscribe|remove me|stop (emailing|contacting)|don'?t contact|pass on this|not a fit|wrong person|leave me alone)\b/i,
  /\b(already (employed|placed|hired)|happy where i am|not looking|no longer looking)\b/i,
];

const OOO = [
  /\b(out of (the )?office|ooo|on leave|on vacation|on holiday|auto[- ]?reply|automatic reply|away from (my )?desk|limited access to email)\b/i,
  /\b(i will (be )?return|back on \w+day|returning \w+day)\b/i,
];

/**
 * Classify free-text candidate reply.
 */
export function classifyReply(text: string): ReplyClassifyResult {
  const raw = (text || "").trim();
  if (!raw) {
    return {
      classification: "neutral",
      confidence: 0.3,
      reasons: ["Empty reply text"],
      stageSuggestion: "contacted",
    };
  }

  const reasons: string[] = [];

  for (const re of OOO) {
    if (re.test(raw)) {
      return {
        classification: "ooo",
        confidence: 0.85,
        reasons: ["Out-of-office / auto-reply signals"],
      };
    }
  }

  let pos = 0;
  let neg = 0;
  for (const re of POSITIVE) {
    if (re.test(raw)) {
      pos += 1;
      reasons.push("Positive intent phrase");
    }
  }
  for (const re of NEGATIVE) {
    if (re.test(raw)) {
      neg += 1;
      reasons.push("Negative / opt-out phrase");
    }
  }

  if (pos > neg && pos > 0) {
    return {
      classification: "positive",
      confidence: Math.min(0.95, 0.55 + pos * 0.15),
      reasons: reasons.length ? reasons : ["Positive tone"],
      stageSuggestion: "interested",
    };
  }
  if (neg > pos && neg > 0) {
    return {
      classification: "negative",
      confidence: Math.min(0.95, 0.55 + neg * 0.15),
      reasons: reasons.length ? reasons : ["Negative tone"],
      stageSuggestion: "not_interested",
    };
  }

  // Short yes/no
  if (/^(yes|yep|yeah|sure|ok|okay)\b/i.test(raw) && raw.length < 40) {
    return {
      classification: "positive",
      confidence: 0.7,
      reasons: ["Short affirmative"],
      stageSuggestion: "interested",
    };
  }
  if (/^(no|nope|nah)\b/i.test(raw) && raw.length < 40) {
    return {
      classification: "negative",
      confidence: 0.7,
      reasons: ["Short decline"],
      stageSuggestion: "not_interested",
    };
  }

  return {
    classification: "neutral",
    confidence: 0.5,
    reasons: ["No strong positive/negative signals"],
    stageSuggestion: "contacted",
  };
}
