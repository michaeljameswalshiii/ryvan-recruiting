import { requirePagePermission } from "@/lib/require-page-role";

export default async function IssuesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("issues");
  return children;
}
