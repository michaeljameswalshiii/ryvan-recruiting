"use client";

// Fix for PDF.js worker in browser - React-PDF v9+ style
// This runs only on client side to set up the PDF worker
if (typeof window !== "undefined" && typeof window !== "undefined") {
  // Use the cdnjs worker directly - more reliable across versions
  // Note: This must match the PDF.js version bundled with react-pdf
  const pdfjsVersion = "4.0.379";
  (window as any).pdfjsLib = {
    GlobalWorkerOptions: {
      workerSrc: `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.mjs`,
    },
  };
}
