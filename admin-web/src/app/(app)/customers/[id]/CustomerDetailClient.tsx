"use client";
// W15 — Customer detail: profile + jobs + notification prefs (task W-03b).
// Pixel port of W15-profile-jobs from a3tranz-admin-all.html. The "Job title"
// and street-address rows in the gallery's Contact card have no field in the
// CustomersRepo contract (plan §2.3 didn't model them) — dropped rather than
// invented; everything else is wired to the real repo.
import { use, useEffect, useMemo, useState } from "react";
import { jobLabel } from "@/lib/jobLabel";
import { Building2, Mail, MailCheck, Pencil, Phone, Plus, User } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { Toggle } from "@/components/Toggle";
import { StatusPill } from "@/components/StatusPill";
import { JobTypeChip } from "@/components/JobTypeChip";
import { Money } from "@/components/Money";
import { Donut } from "@/components/Donut";
import { Legend } from "@/components/Legend";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";
import { customersRepo } from "@/data/repos/customers";
import { jobsRepo } from "@/data/repos/jobs";
import type { Customer } from "@/data/contracts/customers";
import type { Job } from "@/data/contracts/jobs";

export default function CustomerDetailClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useStore(authStore);
  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined); // undefined = loading
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    customersRepo.get(id).then(setCustomer);
    jobsRepo.list().then((all) => setJobs(all.filter((j) => j.customerId === id)));
  }, [id]);

  async function toggleNotify() {
    if (!customer) return;
    const updated = await customersRepo.update(customer.id, { notifyOnComplete: !customer.notifyOnComplete });
    setCustomer(updated);
  }

  const imports = useMemo(() => jobs.filter((j) => j.type === "import").length, [jobs]);
  const exports = useMemo(() => jobs.filter((j) => j.type === "export").length, [jobs]);

  if (!user) return null;

  if (customer === undefined) {
    return (
      <>
        <Topbar title="Customers" />
        <div className="content">
          <Skeleton height={120} />
        </div>
      </>
    );
  }

  if (customer === null) {
    return (
      <>
        <Topbar title="Customers" />
        <div className="content">
          <EmptyState icon={<Building2 />} title="Customer not found" description={`No customer with id ${id}.`} />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Customers" />
      <div className="content">
        <div className="page-head">
          <div>
            <h1>{customer.name}</h1>
            <div className="sub">
              Customer since {customer.customerSince} · {customer.activeJobs} active jobs
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <RoleGate role={user.role} cap="manageCustomersFleet">
              <Button variant="secondary">
                <Pencil />
                Edit
              </Button>
            </RoleGate>
            <Button variant="amber">
              <Plus />
              Create job
            </Button>
          </div>
        </div>

        <div className="grid-2">
          <div>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-h">
                <h3>Contact</h3>
              </div>
              <div style={{ padding: "6px 22px 18px" }}>
                <div className="act">
                  <span className="ic" style={{ background: "var(--navy-glass)", color: "var(--navy)" }}>
                    <User />
                  </span>
                  <div className="b">
                    <div className="t">{customer.contactName}</div>
                    <div className="m">Primary contact</div>
                  </div>
                </div>
                <div className="act">
                  <span className="ic" style={{ background: "var(--navy-glass)", color: "var(--navy)" }}>
                    <Mail />
                  </span>
                  <div className="b">
                    <div className="t">{customer.email}</div>
                    <div className="m">Completion emails go here</div>
                  </div>
                </div>
                <div className="act">
                  <span className="ic" style={{ background: "var(--navy-glass)", color: "var(--navy)" }}>
                    <Phone />
                  </span>
                  <div className="b">
                    <div className="t">{customer.phone}</div>
                    <div className="m">Main line</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-h">
                <h3>Job history</h3>
              </div>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Value</th>
                    <th>Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="t-sub" style={{ textAlign: "center", padding: "24px 20px" }}>
                        No jobs on record for this customer yet.
                      </td>
                    </tr>
                  ) : (
                    jobs.map((j) => (
                      <tr key={j.id}>
                        <td>
                          <span className="t-strong">{j.title}</span>
                          <div className="t-id">{jobLabel(j.id)}</div>
                        </td>
                        <td>
                          <JobTypeChip type={j.type} />
                        </td>
                        <td>
                          <StatusPill status={j.status} />
                        </td>
                        <td>
                          <Money amount={j.price} />
                        </td>
                        <td className="t-sub">
                          {j.status === "done"
                            ? new Date(j.dueDate).toLocaleDateString("en-US", { month: "short", day: "2-digit" })
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-h">
                <h3>Completion emails</h3>
              </div>
              <div style={{ padding: "16px 22px 20px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    paddingBottom: 14,
                    borderBottom: "1px solid var(--hairline)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ font: "600 14px var(--f)", color: "var(--text)" }}>Email on driver submit</div>
                    <div style={{ font: "500 12px var(--f)", color: "var(--text-2)", marginTop: 2 }}>
                      Sends the closeout summary and photos as soon as the driver completes
                    </div>
                  </div>
                  <RoleGate role={user.role} cap="manageCustomersFleet">
                    <Toggle on={customer.notifyOnComplete} onChange={toggleNotify} />
                  </RoleGate>
                </div>
                <div className="section-lbl" style={{ margin: "16px 0 10px" }}>
                  Recipients
                </div>
                <div className="act">
                  <span className="ic" style={{ background: "var(--info-bg)", color: "var(--st-progress)" }}>
                    <MailCheck />
                  </span>
                  <div className="b">
                    <div className="t">{customer.email}</div>
                    <div className="m">Primary · {customer.contactName}</div>
                  </div>
                </div>
                <div style={{ font: "600 13px var(--f)", color: "var(--amber-ink)", marginTop: 12 }}>
                  + Add recipient
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-h">
                <h3>Job mix</h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "22px 20px" }}>
                {jobs.length === 0 ? (
                  <div className="t-sub">No jobs yet.</div>
                ) : (
                  <>
                    <Donut
                      segments={[
                        { color: "var(--navy)", value: imports },
                        { color: "var(--st-progress)", value: exports },
                      ]}
                    />
                    <Legend
                      items={[
                        { color: "var(--navy)", label: "Import", value: String(imports) },
                        { color: "var(--st-progress)", label: "Export", value: String(exports) },
                      ]}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
