import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { AuthGate } from "@/components/AuthGate";
import { MessageToast } from "@/components/MessageToast";
import styles from "./AppShell.module.css";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className={`web ${styles.shell}`}>
        <Sidebar />
        <div className="main">{children}</div>
      </div>
      <MessageToast />
    </AuthGate>
  );
}
