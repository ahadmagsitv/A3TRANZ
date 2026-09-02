"use client";
// .tbar-w — 64px, search + bell + role badge + avatar (plan §6.4). The bell
// is `data-goto="W12-list"` on every frame in the source markup — default it
// to /notifications here, once, rather than wiring onBellClick on every page.
import { useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";
import { notificationsStore } from "@/data/repos/notifications";
import { ROLE_LABEL } from "@/lib/rbac";

export function Topbar({
  title,
  searchPlaceholder,
  onBellClick,
}: {
  title: string;
  searchPlaceholder?: string;
  onBellClick?: () => void;
}) {
  const router = useRouter();
  const user = useStore(authStore);
  const notifications = useStore(notificationsStore);
  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="tbar-w">
      <h2>{title}</h2>
      {searchPlaceholder && (
        <div className="tbar-search">
          <Search />
          {searchPlaceholder}
        </div>
      )}
      <div className="tbar-r">
        <div className="bell" onClick={onBellClick ?? (() => router.push("/notifications"))} role="button">
          <Bell />
          {hasUnread && <span className="dot" />}
        </div>
        {user && (
          <>
            <span className="role-badge">{ROLE_LABEL[user.role] ?? user.role}</span>
            <div className="tb-av">{user.initials}</div>
          </>
        )}
      </div>
    </div>
  );
}
