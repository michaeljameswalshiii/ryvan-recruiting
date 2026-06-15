"use client";

import { useEffect } from "react";

/**
 * DragDropProvider - Prevents browser default drag & drop behavior
 * that causes files to open in new tabs
 */
export function DragDropProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const preventDefault = (e: Event) => {
      // Only prevent if it's a drag event with files
      if (e instanceof DragEvent) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Prevent default on whole window for drag events
    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);

    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, []);

  return <>{children}</>;
}
