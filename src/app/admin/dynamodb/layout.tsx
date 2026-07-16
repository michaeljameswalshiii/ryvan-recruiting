import { requirePagePermission } from "@/lib/require-page-role";

export default async function AdminDynamoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("dynamo_search");
  return children;
}
