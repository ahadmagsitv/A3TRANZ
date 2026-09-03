"use client";
// .tbar-w — 64px, search + bell + role badge + avatar (plan §6.4). The bell
// is `data-goto="W12-list"` on every frame in the source markup — default it
// to /notifications here, once, rather than wiring onBellClick on every page.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Search } from "lucide-react";
import { useStore } from "@/data/repos/useStore";
import { authRepo, authStore } from "@/data/repos/auth";
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

  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  // Dismiss on an outside press or Escape. `pointerdown` rather than `click`
  // so the menu is gone before the press lands on whatever is underneath;
  // the logout button sits inside `menu`, so its own press does not close it
  // before onClick fires.
  useEffect(() => {
    if (!menuOpen) return;
    const onPress = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPress);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPress);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // authRepo.logout clears the store even if the network call fails, and
  // AuthGate already owns "no user means /login" — so there is no redirect to
  // write here.
  const logout = () => {
    setMenuOpen(false);
    void authRepo.logout();
  };

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
          <div className="tb-user" ref={menu}>
            <span className="role-badge">{ROLE_LABEL[user.role] ?? user.role}</span>
            <button
              type="button"
              className="tb-av"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Account menu for ${user.name}`}
            >
              {user.initials}
            </button>
            {menuOpen && (
              <div className="tb-menu" role="menu">
                <div className="tb-menu-id">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <button type="button" role="menuitem" onClick={logout}>
                  <LogOut /> Log out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
