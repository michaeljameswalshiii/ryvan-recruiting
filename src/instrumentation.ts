export async function register() {
  // Reserved for future OpenTelemetry wiring. Error capture lives in onRequestError.
}

export async function onRequestError(
  error: { digest?: string } & Error,
  request: { path?: string; method?: string },
  context: { routePath?: string; routeType?: string }
) {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { recordServerError } = await import("@/lib/observability/store");
    await recordServerError({
      path: context.routePath || request.path || "/",
      name: error?.name || "ServerError",
      message: [error?.message, error?.digest ? `digest ${error.digest}` : ""]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 400),
    });
  } catch {
    // Never let observability take down a request.
  }
}
