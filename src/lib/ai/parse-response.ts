/**
 * Safe parsing of /api/bedrock (and similar) responses.
 * Platform errors often return plain text / HTML, which blows up res.json().
 *
 * @clientSafe
 */

export type ParsedAiResponse = {
  /** Parsed JSON body when valid; otherwise a synthetic error object */
  data: Record<string, unknown>;
  /** HTTP status from the Response */
  status: number;
  /** True when the body was not valid JSON */
  nonJson: boolean;
  /** Raw body (truncated) for debugging / user messages */
  rawSnippet: string;
  /** User-facing error string when the call failed or body was unusable */
  errorMessage?: string;
};

const SNIPPET_MAX = 280;

function snippet(text: string, max = SNIPPET_MAX): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Classify common non-JSON platform / gateway bodies into a clear message.
 */
export function explainNonJsonBody(
  status: number,
  body: string
): string {
  const lower = (body || '').toLowerCase();
  const snip = snippet(body) || '(empty body)';

  if (
    status === 504 ||
    status === 408 ||
    /timeout|timed out|function_invocation_timeout|task timed out/i.test(body)
  ) {
    return (
      'The AI request timed out before a response was ready. ' +
      'Try a shorter message, or retry in a moment (tool-heavy actions can take longer).'
    );
  }

  if (
    status === 413 ||
    /payload too large|request entity too large/i.test(body)
  ) {
    return 'The AI request was too large. Try a shorter conversation or start a new chat.';
  }

  if (
    status === 502 ||
    status === 503 ||
    status === 520 ||
    /bad gateway|service unavailable|overloaded/i.test(body)
  ) {
    return (
      'The AI service is temporarily unavailable (platform/gateway error). ' +
      'Please try again in a moment.'
    );
  }

  if (
    status === 500 &&
    (/an error o/i.test(body) ||
      /internal server error/i.test(body) ||
      /application error/i.test(body))
  ) {
    return (
      'The AI server hit an unexpected error and returned a non-JSON response. ' +
      'Please try again. If it keeps happening, start a new chat or hard-refresh.'
    );
  }

  if (
    lower.includes('<!doctype') ||
    lower.includes('<html') ||
    lower.includes('</html>')
  ) {
    return (
      `The AI endpoint returned an HTML error page (HTTP ${status || '?'}). ` +
      'This usually means a server crash, auth redirect, or platform outage — try again shortly.'
    );
  }

  if (/an error o/i.test(body) || /^an error/i.test(body.trim())) {
    return (
      `The AI service returned a plain-text error (HTTP ${status || '?'}): ${snip}. ` +
      'Retry the request; if it continues, the server may be timing out or crashing on that action.'
    );
  }

  if (!body?.trim()) {
    return `The AI service returned an empty response (HTTP ${status || '?'}). Please try again.`;
  }

  return (
    `The AI service returned a non-JSON response (HTTP ${status || '?'}): ${snip}. ` +
    'Please try again in a moment.'
  );
}

/**
 * Read a fetch Response as JSON safely.
 * Never throws on invalid JSON — returns a structured result instead.
 */
export async function parseAiFetchResponse(
  res: Response
): Promise<ParsedAiResponse> {
  const status = res.status;
  let rawText = '';
  try {
    rawText = await res.text();
  } catch {
    return {
      data: {
        error: `Could not read AI response body (HTTP ${status}).`,
      },
      status,
      nonJson: true,
      rawSnippet: '',
      errorMessage: `Could not read the AI response (HTTP ${status}). Check your connection and try again.`,
    };
  }

  const rawSnippet = snippet(rawText);

  if (!rawText.trim()) {
    const errorMessage = `The AI service returned an empty response (HTTP ${status}). Please try again.`;
    return {
      data: { error: errorMessage, message: errorMessage },
      status,
      nonJson: true,
      rawSnippet: '',
      errorMessage,
    };
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const data = parsed as Record<string, unknown>;
      const err =
        typeof data.error === 'string'
          ? data.error
          : typeof data.message === 'string' && (!res.ok || data.error)
            ? data.message
            : undefined;
      const suggestion =
        typeof data.suggestion === 'string' ? data.suggestion : undefined;
      const errorMessage =
        !res.ok || data.error
          ? suggestion
            ? `${err || data.message || `Request failed (${status})`}\n\n${suggestion}`
            : String(err || data.message || `Request failed (${status})`)
          : undefined;
      return {
        data,
        status,
        nonJson: false,
        rawSnippet,
        errorMessage,
      };
    }
    // Valid JSON but not an object (array/primitive) — wrap it
    return {
      data: { response: parsed as unknown, raw: parsed },
      status,
      nonJson: false,
      rawSnippet,
      errorMessage: !res.ok
        ? `Request failed (HTTP ${status}).`
        : undefined,
    };
  } catch {
    const errorMessage = explainNonJsonBody(status, rawText);
    return {
      data: {
        error: errorMessage,
        message: errorMessage,
        nonJsonBody: true,
        rawSnippet,
      },
      status,
      nonJson: true,
      rawSnippet,
      errorMessage,
    };
  }
}

/**
 * Friendly message for fetch-level failures (network, abort).
 */
export function explainAiFetchError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const raw = err instanceof Error ? err.message : 'Network error';
  const isAbort = name === 'AbortError' || /aborted/i.test(raw);
  if (isAbort) {
    return (
      'The request was cancelled or timed out on the client. ' +
      'Try a shorter question, or retry — tool-heavy actions can take longer.'
    );
  }
  if (/failed to fetch|networkerror|load failed|fetch/i.test(raw)) {
    return (
      `Could not reach the AI service (${raw}). ` +
      'This is usually a network blip or server timeout — try again in a moment. ' +
      'If it keeps failing, hard-refresh the page.'
    );
  }
  // Legacy: JSON parse errors that escaped (shouldn't with parseAiFetchResponse)
  if (/unexpected token|is not valid json|json\.parse/i.test(raw)) {
    return (
      'The AI service returned an unreadable response (not valid JSON). ' +
      'This often means a server timeout or crash. Please try again.'
    );
  }
  return raw;
}
