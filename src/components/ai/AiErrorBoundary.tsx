"use client";

/**
 * Error boundary for AI surfaces — prevents a single turn crash from
 * white-screening the whole AI page.
 */

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  children: React.ReactNode;
  /** Optional label for logging */
  surface?: string;
  onReset?: () => void;
};

type State = { error: Error | null };

export class AiErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[AiErrorBoundary:${this.props.surface || "ai"}]`,
      error,
      info?.componentStack
    );
  }

  reset = () => {
    this.setState({ error: null });
    try {
      this.props.onReset?.();
    } catch {
      /* ignore */
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              AI assistant hit an unexpected error
            </h2>
            <p className="mt-2 max-w-md text-sm text-slate-600">
              This is usually a memory or response-size issue after a long chat.
              Recover with a fresh conversation — your prior threads stay in
              History when available.
            </p>
            <p className="mt-2 max-w-lg truncate font-mono text-[11px] text-slate-400">
              {this.state.error.message}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={this.reset}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Recover AI
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
