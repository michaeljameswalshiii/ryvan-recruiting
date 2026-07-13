'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
// ... your other imports (Table, Button, etc.)

export function CandidatesClient() {
  // ... your existing state and data fetching logic ...

  return (
    <div className="space-y-6">
      {/* Your header / search / new button ... */}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              {/* other headers */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((candidate) => (
              <TableRow key={candidate.id} className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  <Link
                    href={`/dashboard/candidates/${candidate.id}?tab=actions`}
                    className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
                  >
                    {candidate.name}
                  </Link>
                </TableCell>

                {/* Keep all your other columns exactly as they are */}
                <TableCell>{candidate.email}</TableCell>
                <TableCell>{candidate.phone}</TableCell>
                <TableCell>{candidate.stage}</TableCell>
                {/* ... etc. */}

                <TableCell className="text-right">
                  {/* Keep your existing View Actions button if you want both */}
                  <Link href={`/dashboard/candidates/${candidate.id}?tab=actions`}>
                    <Button variant="outline" size="sm">
                      View Actions
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
