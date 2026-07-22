import { redirect } from "next/navigation";
import { requirePagePermission } from "@/lib/require-page-role";
import { isApolloProductEnabled } from "@/lib/ai/apollo-feature";

export default async function AiApolloLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Product default: Apollo UI off. Re-enable with AI_TOOLS_APOLLO_ENABLED /
  // NEXT_PUBLIC_AI_TOOLS_APOLLO_ENABLED=true (code kept for easy restore).
  if (!isApolloProductEnabled()) {
    redirect("/dashboard/general-ai-usage");
  }
  await requirePagePermission("ai_apollo");
  return children;
}
