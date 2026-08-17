import { requirePagePermission } from "@/lib/require-page-role";

export default async function AiAgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("site_admin_tools");
  return children;
}
