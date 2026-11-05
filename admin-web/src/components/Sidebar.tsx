"use client";
import Image from "next/image";
import mark from "@/assets/a3-mark.png";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AccountModal } from "@/components/AccountModal";
import {
  BarChart3,
  Banknote,
  Briefcase,
  Building2,
  Container,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";
import { can, ROLE_LABEL, type Capability } from "@/lib/rbac";

const NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  cap?: Capability;
}[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/customers", label: "Customers", icon: Building2 },
  { href: "/drivers", label: "Drivers", icon: Users },
  { href: "/fleet", label: "Fleet", icon: Container },
  { href: "/payroll", label: "Payroll", icon: Banknote, cap: "viewPayroll" },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/reports", label: "Reports", icon: BarChart3, cap: "viewReports" },
  { href: "/settings/roles", label: "Settings", icon: Settings, cap: "manageTeam" },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useStore(authStore);
  const [showAccount, setShowAccount] = useState(false);

  return (
    <aside className="side">
      <div className="side-logo">
        <span className="lm">
          <Image src={mark} alt="" width={34} height={34} unoptimized />
        </span>
        A3TRANZ
      </div>
      {NAV.filter(n => !n.cap || (user && can(user.role, n.cap))).map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={`nav-i${active ? " on" : ""}`}>
            <Icon />
            {label}
          </Link>
        );
      })}
      {user && (
        <button
          type="button"
          className="side-user"
          onClick={() => setShowAccount(true)}
          aria-label={`Profile & password for ${user.name}`}
          style={{ background: "none", border: "none", borderTop: "1px solid rgba(255,255,255,.08)", width: "100%", textAlign: "left", cursor: "pointer" }}
        >
          <div className="av">{user.initials}</div>
          <div>
            <div className="u-n">{user.name}</div>
            <div className="u-r">{ROLE_LABEL[user.role] ?? user.role} · Profile</div>
          </div>
        </button>
      )}
      {user && showAccount && <AccountModal user={user} onClose={() => setShowAccount(false)} />}
    </aside>
  );
}
