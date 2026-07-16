import { requirePagePermission } from "@/lib/require-page-role";

export default async function UsageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("usage");
  return children;
}
