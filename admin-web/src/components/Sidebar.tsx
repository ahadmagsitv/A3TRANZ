"use client";
// .side — 240px, --navy-deep fill. Nine items, fixed order (plan §1.4 / §6.1 / §7 gate 15).
//
// Three of the nine name a capability. Actions stay visible-and-locked
// (RoleGate) because a greyed button tells you the action exists; a nav link
// to a screen that can only answer "not for your role" tells you nothing, so
// those are dropped instead. The page still refuses on its own — this is the
// menu, not the lock.
import Image from "next/image";
import mark from "@/assets/a3-mark.png";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

  return (
    <aside className="side">
      <div className="side-logo">
        {/* `.lm` is a WHITE tile (globals.css): the artwork is blue with a
            near-white wordmark and goes muddy on this navy rail.
            IMPORTED, not referenced by path: the console runs under a
            basePath, and neither a raw src nor `next/image` prefixes a string
            src with it. An import resolves to a `/_next/static/` url that
            carries the prefix, and skips the optimizer that was being handed a
            root-relative path it could not fetch. */}
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
        <div className="side-user">
          <div className="av">{user.initials}</div>
          <div>
            <div className="u-n">{user.name}</div>
            <div className="u-r">{ROLE_LABEL[user.role] ?? user.role}</div>
          </div>
        </div>
      )}
    </aside>
  );
}
