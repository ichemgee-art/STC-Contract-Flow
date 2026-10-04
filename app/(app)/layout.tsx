import { ProtectedShell } from "@/components/ProtectedShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
