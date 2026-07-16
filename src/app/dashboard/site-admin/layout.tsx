import { requirePagePermission } from "@/lib/require-page-role";

export default async function SiteAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("site_admin_tools");
  return children;
}
