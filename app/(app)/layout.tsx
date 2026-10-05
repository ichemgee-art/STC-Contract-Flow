import { ContractsProvider } from "@/components/ContractsProvider";
import { ProtectedShell } from "@/components/ProtectedShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ContractsProvider><ProtectedShell>{children}</ProtectedShell></ContractsProvider>;
}
