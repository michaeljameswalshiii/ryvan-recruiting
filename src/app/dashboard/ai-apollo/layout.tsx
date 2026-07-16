import { requirePagePermission } from "@/lib/require-page-role";

export default async function AiApolloLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("ai_apollo");
  return children;
}
