import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { AuthGate } from "@/components/AuthGate";
import styles from "./AppShell.module.css";

// .web > .side + .main > .tbar-w + .content (plan §6.4). Each page renders
// its own Topbar + .content; this layout only owns the shell + sidebar.
// AuthGate (plan §6.6/W-02) keeps the whole shell behind W1 — no authStore
// user means no sidebar, no content, straight back to /login.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className={`web ${styles.shell}`}>
        <Sidebar />
        <div className="main">{children}</div>
      </div>
    </AuthGate>
  );
}
