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
// "Add member" has no design frame anywhere in the 30 admin frames (plan §5)
// — it stays RBAC-gated (manageTeam) and inert, matching how other
// undesigned actions (e.g. jobs table row icons) are left decorative rather
// than invented.
import { useEffect, useState } from "react";
import { CheckCircle2, MoreHorizontal, UserPlus } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { Skeleton } from "@/components/Skeleton";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { PermissionList } from "@/components/PermissionList";
import { useStore } from "@/data/repos/useStore";
import { authStore, authRepo } from "@/data/repos/auth";
import { can, ALL_CAPABILITIES, CAPABILITY_LABEL, PERMISSION_TIERS, ROLE_LABEL } from "@/lib/rbac";
import type { AuthUser } from "@/data/contracts/auth";

export default function RolesPage() {
  const user = useStore(authStore);
  const [members, setMembers] = useState<AuthUser[] | null>(null);

  useEffect(() => {
    authRepo.list().then(setMembers);
  }, []);

  if (!user) return null;

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
            <RoleGate role={user.role} cap="manageTeam">
              <Button variant="amber">
                <UserPlus />
                Add member
              </Button>
            </RoleGate>
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
    </>
  );
}
