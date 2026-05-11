/**
 * Global Error Boundary
 * Catches React errors and provides retry functionality
 * 
 * @clientOnly
 */

'use client';

import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary with retry button
 * Wraps application sections to catch and handle errors gracefully
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="text-center space-y-4 max-w-md">
            <div className="flex justify-center">
              <div className="rounded-full bg-red-100 p-4">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="text-muted-foreground">
              We encountered an unexpected error. Please try again.
            </p>
            <div className="flex gap-2 justify-center pt-4">
              <Button onClick={this.handleReset} variant="default">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Button onClick={() => window.location.reload()} variant="outline">
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Async error boundary for server actions and data fetching
 * Provides user-friendly error messages
 */
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, HelpCircle } from 'lucide-react';

interface AsyncErrorState {
  error: string | null;
 Retry: () => void;
}

/**
 * Hook to handle async operation errors
 * Returns error state and retry function
 */
export function useAsyncError() {
  const [error, setError] = useState<string | null>(null);

  const handleError = (err: unknown) => {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    setError(message);
    return message;
  };

  const clearError = () => setError(null);

  const retry = (fn: () => Promise<void>) => {
    clearError();
    return fn();
  };

  return { error, handleError, clearError, retry };
}

/**
 * Error display component for forms and data operations
 */
interface OperationErrorProps {
  error: string | null;
  onRetry?: () => void;
  title?: string;
}

export function OperationError({ error, onRetry, title = 'Operation Failed' }: OperationErrorProps) {
  if (!error) return null;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-red-800">{title}</h3>
          <p className="text-sm text-red-700 mt-1">{error}</p>
          {onRetry && (
            <Button
              onClick={onRetry}
              variant="outline"
              size="sm"
              className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
            >
              Try Again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Help tip component for user guidance
 */
export function HelpTip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        <HelpCircle className="h-5 w-5 text-blue-600 mt-0.5" />
        <div className="text-sm text-blue-800">{children}</div>
      </div>
    </div>
  );
}
