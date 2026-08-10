import { requirePagePermission } from "@/lib/require-page-role";

export default async function AiReliabilityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("usage");
  return children;
}
