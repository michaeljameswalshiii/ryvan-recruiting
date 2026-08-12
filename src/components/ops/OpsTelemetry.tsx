"use client";

import { useEffect } from "react";

type PendingEvent = {
  kind: "api" | "nav" | "vital" | "js_error";
  path?: string;
  status?: number;
  ms?: number;
  name?: string;
  message?: string;
  value?: number;
};

const SKIP = /\/api\/performance\/(ingest|overview|health)|\/_vercel|speed-insights|va\.vercel-scripts/i;
const queue: PendingEvent[] = [];
let flushTimer: number | null = null;
let enabled = true;
let patched = false;

function pathFromInput(input: RequestInfo | URL): string {
  try {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.pathname;
    if (typeof Request !== "undefined" && input instanceof Request) {
      return new URL(input.url).pathname;
    }
  } catch {
    /* ignore */
  }
  return "/";
}

function enqueue(event: PendingEvent) {
  if (!enabled) return;
  if (event.path && SKIP.test(event.path)) return;
  queue.push(event);
  if (queue.length >= 12) {
    void flush();
    return;
  }
  if (flushTimer == null) {
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void flush();
    }, 8000);
  }
}

async function flush() {
  if (!enabled || queue.length === 0) return;
  const events = queue.splice(0, 40);
  try {
    const res = await fetch("/api/performance/ingest", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    });
    if (res.status === 401 || res.status === 403) enabled = false;
  } catch {
    queue.unshift(...events.slice(0, 20));
  }
}

function patchFetch() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = pathFromInput(input);
    if (SKIP.test(path)) return original(input, init);
    const started = performance.now();
    try {
      const res = await original(input, init);
      enqueue({
        kind: "api",
        path,
        status: res.status,
        ms: Math.round(performance.now() - started),
      });
      return res;
    } catch (err) {
      enqueue({
        kind: "api",
        path,
        status: 0,
        ms: Math.round(performance.now() - started),
        message: err instanceof Error ? err.message : "network error",
      });
      throw err;
    }
  };
}

export function OpsTelemetry() {
  useEffect(() => {
    patchFetch();

    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav) {
      enqueue({
        kind: "nav",
        path: window.location.pathname,
        ms: Math.round(nav.duration || performance.now()),
      });
    }

    const onError = (event: ErrorEvent) => {
      enqueue({
        kind: "js_error",
        path: window.location.pathname,
        name: event.error?.name || "Error",
        message: event.message || "Unhandled browser error",
      });
    };
    const onReject = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      enqueue({
        kind: "js_error",
        path: window.location.pathname,
        name: reason instanceof Error ? reason.name : "UnhandledRejection",
        message:
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : "Unhandled promise rejection",
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);

    let lcpObs: PerformanceObserver | null = null;
    try {
      lcpObs = new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (!last) return;
        enqueue({
          kind: "vital",
          path: window.location.pathname,
          name: "LCP",
          value: Math.round(last.startTime),
          ms: Math.round(last.startTime),
        });
      });
      lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      lcpObs = null;
    }

    const onHide = () => {
      void flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush();
    });

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
      window.removeEventListener("pagehide", onHide);
      lcpObs?.disconnect();
      void flush();
    };
  }, []);

  return null;
}
