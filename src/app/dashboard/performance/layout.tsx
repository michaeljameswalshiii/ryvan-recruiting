import { requirePagePermission } from "@/lib/require-page-role";

export default async function PerformanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("performance");
  return children;
}
