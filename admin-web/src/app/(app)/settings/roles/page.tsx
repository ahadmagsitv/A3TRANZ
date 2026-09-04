"use client";
// W13 — Team & roles: members table + three RBAC capability blocks (task
// W-12). Pixel port of W13-team from a3tranz-admin-all.html, except the
// permission blocks: the source markup hand-writes a curated, uneven bullet
// list per tier. Per this task's brief, that's a second copy of the RBAC
// matrix that can silently drift from `lib/rbac.ts`'s actual enforcement —
// so instead this renders all ten capabilities for all three tiers, driven
// entirely by `ALL_CAPABILITIES` / `CAPABILITY_LABEL` / `PERMISSION_TIERS`
// and `can()`. PermissionList.tsx's own header comment ("Three tiers, ten
// rows") already anticipated exactly this shape.
//
// "Add member" has no design frame in the 30 admin frames (plan §5), so its
// modal borrows W9's Add-driver form wholesale — same fields, same invite
// mechanism, plus the role picker. The screen itself is manageTeam-gated:
// the roster is every colleague's name, email and rank, and a role that
// cannot manage the team has no reason to read it either.
import { useEffect, useState } from "react";
import { CheckCircle2, MoreHorizontal, ShieldOff, UserPlus } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { Skeleton } from "@/components/Skeleton";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { MemberModal } from "@/components/MemberModal";
import { PermissionList } from "@/components/PermissionList";
import { useStore } from "@/data/repos/useStore";
import { authStore, authRepo } from "@/data/repos/auth";
import { can, ALL_CAPABILITIES, CAPABILITY_LABEL, PERMISSION_TIERS, ROLE_LABEL } from "@/lib/rbac";
import type { AuthUser } from "@/data/contracts/auth";

export default function RolesPage() {
  const user = useStore(authStore);
  const [members, setMembers] = useState<AuthUser[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const allowed = !!user && can(user.role, "manageTeam");

  useEffect(() => {
    // Not merely hidden: without the capability the request itself 403s, so
    // do not make it.
    if (allowed) authRepo.list().then(setMembers);
  }, [allowed]);

  if (!user) return null;

  if (!allowed) {
    return (
      <>
        <Topbar title="Settings — Roles & access" />
        <div className="content">
          <EmptyState
            icon={<ShieldOff />}
            title="Team & roles isn't available for your role"
            description="Only Admin and Manager accounts can see or change who has portal access (plan §6.6)."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Settings — Roles & access" />
      <div className="content">
        <div className="page-head">
          <div>
            <h1>Team &amp; roles</h1>
            <div className="sub">Office staff with portal access</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <Button variant="amber" onClick={() => setShowAdd(true)}>
              <UserPlus />
              Add member
            </Button>
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-h">
              <h3>Members</h3>
            </div>
            {members === null ? (
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td><Skeleton width="70%" /></td>
                      <td><Skeleton width={90} /></td>
                      <td><Skeleton width={60} /></td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span className="mini-av">{m.initials}</span>
                        <span className="t-strong">{m.name}</span>
                        <div className="t-id">{m.email}</div>
                      </td>
                      <td>
                        <span className="role-badge">{ROLE_LABEL[m.role]}</span>
                      </td>
                      <td>
                        <span className="tag-act">
                          <CheckCircle2 style={{ width: 14 }} />
                          Active
                        </span>
                      </td>
                      <td>
                        <span className="rowact">
                          <MoreHorizontal />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Role permissions</h3>
            </div>
            <div style={{ padding: "18px 22px" }}>
              {PERMISSION_TIERS.map((tier, i) => (
                <div key={tier.role}>
                  <div className="section-lbl" style={i > 0 ? { marginTop: 18 } : undefined}>
                    {tier.label}
                  </div>
                  <PermissionList
                    items={ALL_CAPABILITIES.map((cap) => ({
                      label: CAPABILITY_LABEL[cap],
                      allowed: can(tier.role, cap),
                    }))}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showAdd && (
        <MemberModal
          onClose={() => setShowAdd(false)}
          onCreated={(m) =>
            setMembers((prev) =>
              [...(prev ?? []), m].sort((a, b) => a.name.localeCompare(b.name)),
            )
          }
        />
      )}
    </>
  );
}
