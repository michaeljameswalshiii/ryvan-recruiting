"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onOpenChange, onClose, title, children, className }: ModalProps) {
  if (!open) return null;

  const handleClose = () => {
    if (onOpenChange) {
      onOpenChange(false);
    } else if (onClose) {
      onClose();
    }
  };

return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal Content */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div 
          className={cn(
            "relative bg-background border border-border rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-xl font-semibold">{title}</h2>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Body */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
