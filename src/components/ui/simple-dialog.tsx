"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

interface SimpleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function SimpleDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: SimpleDialogProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog content — scrollable on short screens */}
      <div className="relative z-10 w-full max-w-lg sm:mx-4 max-h-[min(92vh,900px)] flex flex-col bg-background rounded-t-2xl sm:rounded-lg border shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body — scrolls when content is tall */}
        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">{children}</div>

        {/* Footer — always visible */}
        {footer && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t bg-background shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
