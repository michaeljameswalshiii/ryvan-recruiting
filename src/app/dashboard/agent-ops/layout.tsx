import { requirePagePermission } from "@/lib/require-page-role";
import "@/components/agent-ops/agent-ops.css";

export const metadata = {
  title: "Agent Ops · Trio",
};

export default async function AgentOpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("core_ats");
  return children;
}
