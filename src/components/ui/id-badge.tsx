"use client";

import { Copy } from "lucide-react";
import { Button } from "./button";
import { toast } from "sonner";

interface IdBadgeProps {
  id: string;
  className?: string;
}

export function IdBadge({ id, className = "" }: IdBadgeProps) {
  const copyId = () => {
    navigator.clipboard.writeText(id);
    toast.success("ID copied to clipboard");
  };

  return (
    <div className={`flex items-center gap-1 text-xs text-muted-foreground font-mono group ${className}`}>
      <span className="truncate max-w-[120px]">{id}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={copyId}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}
