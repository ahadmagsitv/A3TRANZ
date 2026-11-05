"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Search, UserCog } from "lucide-react";
import { AccountModal } from "@/components/AccountModal";
import { useStore } from "@/data/repos/useStore";
import { authRepo, authStore } from "@/data/repos/auth";
import { notificationsStore } from "@/data/repos/notifications";
import { ROLE_LABEL } from "@/lib/rbac";

export function Topbar({
  title,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  onBellClick,
}: {
  title: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onBellClick?: () => void;
}) {
  const router = useRouter();
  const user = useStore(authStore);
  const notifications = useStore(notificationsStore);
  const hasUnread = notifications.some((n) => !n.read);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

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

  const logout = () => {
    setMenuOpen(false);
    void authRepo.logout();
  };

  return (
    <div className="tbar-w">
      <h2>{title}</h2>
      {searchPlaceholder && onSearchChange && (
        <div className="tbar-search">
          <Search />
          <input
            className="tbar-search-input"
            type="search"
            value={searchValue ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
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
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowAccount(true);
                  }}
                >
                  <UserCog /> Profile &amp; password
                </button>
                <button type="button" role="menuitem" className="danger" onClick={logout}>
                  <LogOut /> Log out
                </button>
              </div>
            )}
            {showAccount && <AccountModal user={user} onClose={() => setShowAccount(false)} />}
          </div>
        )}
      </div>
    </div>
  );
}
