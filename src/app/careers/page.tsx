/**
 * /careers → redirect to default tenant careers page
 */

import { redirect } from "next/navigation";
import { resolveCareersTenant } from "@/lib/careers/public";

export const dynamic = "force-dynamic";

export default async function CareersRootPage() {
  const ctx = await resolveCareersTenant(null);
  if (ctx?.slug) {
    redirect(`/careers/${ctx.slug}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Careers</h1>
        <p className="mt-2 text-sm text-slate-600">
          Open roles live at{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
            /careers/&#123;your-slug&#125;
          </code>
          . Ask your recruiting team for the correct careers link.
        </p>
      </div>
    </div>
  );
}
