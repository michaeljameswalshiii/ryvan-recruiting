// src/app/email/page.tsx
'use client'; // or remove if you want full server component

import React from 'react';

export default function EmailPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Email</h1>
        <p className="text-muted-foreground mt-2">
          Contact email integration and inbox (in progress)
        </p>
      </div>

      <div className="bg-card rounded-lg border p-8 text-center">
        <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
          ✉️
        </div>
        <h3 className="text-xl font-semibold mb-2">Email Sync Coming Soon</h3>
        <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
          Connect your Gmail or view contact emails here. This page is currently a placeholder.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
