import { requirePagePermission } from "@/lib/require-page-role";

export default async function LoginAuditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("team_admin");
  return children;
}
