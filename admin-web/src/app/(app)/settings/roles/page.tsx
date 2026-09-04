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
import { CheckCircle2, Pencil, ShieldOff, Trash2, UserCheck, UserPlus, UserX } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { Skeleton } from "@/components/Skeleton";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { MemberModal } from "@/components/MemberModal";
import { Modal } from "@/components/Modal";
import { RowMenu } from "@/components/RowMenu";
import { PermissionList } from "@/components/PermissionList";
import { useStore } from "@/data/repos/useStore";
import { authStore, authRepo } from "@/data/repos/auth";
import { can, ALL_CAPABILITIES, CAPABILITY_LABEL, PERMISSION_TIERS, ROLE_LABEL } from "@/lib/rbac";
import type { TeamMember } from "@/data/contracts/auth";

export default function RolesPage() {
  const user = useStore(authStore);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);
  // The server refuses some of these — deleting someone with job history,
  // acting on your own account. Its wording is the one the user sees.
  const [error, setError] = useState<string | null>(null);
  const allowed = !!user && can(user.role, "manageTeam");

  useEffect(() => {
    // Not merely hidden: without the capability the request itself 403s, so
    // do not make it.
    if (allowed) authRepo.list().then(setMembers);
  }, [allowed]);

  const upsert = (m: TeamMember) =>
    setMembers(prev => {
      const rest = (prev ?? []).filter(x => x.id !== m.id);
      return [...rest, m].sort(
        (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
      );
    });

  async function setActive(m: TeamMember, active: boolean) {
    setError(null);
    try {
      upsert(await authRepo.update(m.id, { active }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change that account.");
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await authRepo.remove(deleting.id);
      setMembers(prev => (prev ?? []).filter(x => x.id !== deleting.id));
      setDeleting(null);
    } catch (e) {
      // Most often: they have history, and the record keeps them. That is the
      // answer, not a failure — say it and leave the modal open.
      setError(e instanceof Error ? e.message : "Could not delete that account.");
    } finally {
      setBusy(false);
    }
  }

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

        {error && !deleting && (
          <div className="toast toast-err" style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}

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
                        {m.active ? (
                          <span className="tag-act">
                            <CheckCircle2 style={{ width: 14 }} />
                            Active
                          </span>
                        ) : (
                          <span className="tag-act" style={{ opacity: 0.55 }}>
                            <UserX style={{ width: 14 }} />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {/* Your own row has no menu: the server refuses every
                            one of these against yourself, and that refusal is
                            what guarantees somebody can still manage the team
                            when the request finishes. */}
                        {m.id !== user.id && (
                          <RowMenu
                            label={`Actions for ${m.name}`}
                            items={[
                              {
                                label: "Edit",
                                icon: <Pencil />,
                                onSelect: () => setEditing(m),
                              },
                              m.active
                                ? {
                                    label: "Deactivate",
                                    icon: <UserX />,
                                    onSelect: () => void setActive(m, false),
                                  }
                                : {
                                    label: "Reactivate",
                                    icon: <UserCheck />,
                                    onSelect: () => void setActive(m, true),
                                  },
                              {
                                label: "Delete",
                                icon: <Trash2 />,
                                danger: true,
                                onSelect: () => {
                                  setError(null);
                                  setDeleting(m);
                                },
                              },
                            ]}
                          />
                        )}
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

      {showAdd && <MemberModal onClose={() => setShowAdd(false)} onSaved={upsert} />}

      {editing && (
        <MemberModal member={editing} onClose={() => setEditing(null)} onSaved={upsert} />
      )}

      {deleting && (
        <Modal
          onClose={() => setDeleting(null)}
          style={{ width: 460 }}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={busy}>
                <Trash2 />
                {busy ? "Deleting…" : "Delete account"}
              </Button>
            </>
          }
        >
          <div style={{ textAlign: "center", padding: "6px 4px 0" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "rgba(220,38,38,.10)",
                color: "var(--st-overdue)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 14px",
              }}
            >
              <Trash2 style={{ width: 26 }} />
            </div>
            <h3 style={{ font: "800 19px var(--fd)", color: "var(--text)" }}>
              Delete {deleting.name}?
            </h3>
            <p
              style={{
                font: "500 14px var(--f)",
                color: "var(--text-2)",
                lineHeight: 1.55,
                marginTop: 8,
              }}
            >
              This removes the account for good. Anyone who has messaged a
              driver or written a note cannot be deleted — deactivate them
              instead, which takes away access and keeps the record.
            </p>
            {error && (
              <div className="toast toast-err" style={{ width: "100%", marginTop: 14 }}>
                {error}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
