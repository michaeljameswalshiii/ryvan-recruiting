'use client';

export function JobListView() {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left p-4">Job Title</th>
            <th className="text-left p-4">Company</th>
            <th className="text-left p-4">Type</th>
            <th className="text-left p-4">Candidates</th>
            <th className="text-left p-4">Date Added</th>
            <th className="text-left p-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {/* Sample rows - replace with real data */}
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b border-border hover:bg-muted/50">
              <td className="p-4 font-medium">Sr. Accountant</td>
              <td className="p-4 text-blue-400">RyVan Recruiting</td>
              <td className="p-4"><span className="bg-green-500/10 text-green-500 px-2 py-1 rounded">Full-time</span></td>
              <td className="p-4">0 candidates</td>
              <td className="p-4 text-muted-foreground">Jun 4, 2026</td>
              <td className="p-4">
                <span className="bg-green-500 text-white px-3 py-1 rounded-full text-xs">Open</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
