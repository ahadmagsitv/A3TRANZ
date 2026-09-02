"use client";
// W2 — Dashboard (task W-05a). Pixel port of W2-overview from
// a3tranz-admin-all.html: `.kpi-row` (4 KPIs w/ trend), `.donut` jobs-by-type
// (no library — conic-gradient, plan §1.6), driver activity, recent jobs
// via `.spill` status pills. Every number below is a real aggregate over
// jobsRepo / driversRepo / payrollRepo (plan §7 "no fabricated numbers
// disconnected from the fixtures") — same approach as Reports (W-11).
//
// Deliberate deviations from the source markup's hardcoded demo numbers:
//   - The source's "+3 today" / "needs attention" KPI deltas assume a live
//     clock against the fixture's fixed Nov-2025 dates. Reports already
//     established the pattern of dropping clock-dependent stats the
//     fixtures can't honestly back; here the "Ongoing jobs" delta is a
//     real "% of total" instead (matches Reports' own KPI captions).
//   - "Jobs by status" groups "blocked" into the "Overdue" donut slice —
//     StatusPill already renders both with the same sp-overdue class, so
//     this is one slice per pill colour actually in use, not a 6th slice.
//   - "Recent jobs" takes the first 6 jobs in repo order (fixture order,
//     same convention Reports/Jobs already rely on) rather than the
//     source's specific curated demo rows.
//   - "Driver activity" reads each job's own timeline for the most recent
//     entry actually authored by that job's assigned driver (meta starts
//     with the driver's name — excludes dispatcher/admin-authored lines),
//     one job per driver, instead of inventing activity text.
//   - "Payable Friday" reads the real `payable` pay period (amount, driver
//     count, pays-at date) instead of the source's static "held 1 week".
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { jobUrlSlug } from "@/lib/jobId";
import { Loader, Clock, AlertTriangle, Banknote } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { Kpi } from "@/components/Kpi";
import { Donut } from "@/components/Donut";
import { Legend } from "@/components/Legend";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import { JobTypeChip } from "@/components/JobTypeChip";
import { Money } from "@/components/Money";
import { Skeleton } from "@/components/Skeleton";
import { jobsRepo } from "@/data/repos/jobs";
import { driversRepo } from "@/data/repos/drivers";
import { customersRepo } from "@/data/repos/customers";
import { payrollRepo } from "@/data/repos/payroll";
import type { Job } from "@/data/contracts/jobs";
import type { Driver } from "@/data/contracts/drivers";
import type { Customer } from "@/data/contracts/customers";
import type { PayPeriod } from "@/data/contracts/payroll";

const RECENT_COUNT = 6;

function shortName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  if (d.getHours() === 0 && d.getMinutes() === 0) return dateLabel;
  const timeLabel = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateLabel}, ${timeLabel}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [periods, setPeriods] = useState<PayPeriod[]>([]);

  useEffect(() => {
    jobsRepo.list().then(setJobs);
    driversRepo.list().then(setDrivers);
    customersRepo.list().then(setCustomers);
    payrollRepo.list().then(setPeriods);
  }, []);

  const driverById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const customerName = useMemo(() => {
    const map = new Map(customers.map((c) => [c.id, c.name]));
    return (id: string) => map.get(id) ?? id;
  }, [customers]);

  const stats = useMemo(() => {
    if (!jobs) return null;
    const count = (s: Job["status"]) => jobs.filter((j) => j.status === s).length;
    const inProgress = count("in_progress");
    const pending = count("pending");
    const awaiting = count("awaiting_approval");
    const done = count("done");
    const overdue = count("overdue") + count("blocked"); // both render sp-overdue (StatusPill)
    const total = jobs.length;

    const payable = periods.find((p) => p.status === "payable") ?? null;

    const activity: { driver: Driver; job: Job; title: string; when: string }[] = [];
    const usedDrivers = new Set<string>();
    for (const job of jobs) {
      if (!job.driverId || usedDrivers.has(job.driverId)) continue;
      const driver = driverById.get(job.driverId);
      if (!driver) continue;
      const event = [...job.timeline].reverse().find((e) => e.meta.startsWith(driver.name));
      if (!event) continue;
      usedDrivers.add(job.driverId);
      activity.push({ driver, job, title: event.title, when: event.meta.split(" · ")[1] ?? event.at });
      if (activity.length === 3) break;
    }

    return {
      inProgress,
      pending,
      awaiting,
      done,
      overdue,
      total,
      payable,
      recent: jobs.slice(0, RECENT_COUNT),
      activity,
    };
  }, [jobs, periods, driverById]);

  const columns: Column<Job>[] = [
    {
      key: "job",
      header: "Job",
      render: (j) => (
        <>
          <span className="t-strong">{j.title}</span>
          <div className="t-id">{j.id}</div>
        </>
      ),
    },
    { key: "customer", header: "Customer", render: (j) => <span className="t-sub">{customerName(j.customerId)}</span> },
    { key: "type", header: "Type", render: (j) => <JobTypeChip type={j.type} /> },
    {
      key: "driver",
      header: "Driver",
      render: (j) => {
        const driver = j.driverId ? driverById.get(j.driverId) : null;
        return driver ? (
          <>
            <span className="mini-av">{driver.initials}</span>
            {shortName(driver.name)}
          </>
        ) : (
          <span className="t-sub">Unassigned</span>
        );
      },
    },
    { key: "status", header: "Status", render: (j) => <StatusPill status={j.status} /> },
    {
      key: "due",
      header: "Due",
      render: (j) => (
        <span style={j.status === "overdue" ? { color: "var(--st-overdue-ink)" } : undefined}>{formatDue(j.dueDate)}</span>
      ),
    },
  ];

  return (
    <>
      <Topbar title="Dashboard" searchPlaceholder="Search jobs, drivers…" />
      <div className="content">
        {!stats ? (
          <>
            <div className="kpi-row">
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="kpi" key={i}>
                  <Skeleton width="60%" height={13} />
                  <div style={{ marginTop: 10 }}>
                    <Skeleton width="40%" height={30} />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid-2">
              <div className="card">
                <Skeleton height={280} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div className="card">
                  <Skeleton height={130} />
                </div>
                <div className="card">
                  <Skeleton height={130} />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="kpi-row">
              <Kpi
                label="Ongoing jobs"
                icon={<Loader />}
                iconBg="rgba(37,99,235,.12)"
                iconColor="var(--st-progress)"
                value={stats.inProgress}
                delta={`${stats.total ? Math.round((stats.inProgress / stats.total) * 100) : 0}% of ${stats.total} jobs`}
              />
              <Kpi
                label="Pending"
                icon={<Clock />}
                iconBg="rgba(100,116,139,.14)"
                iconColor="var(--st-pending)"
                value={stats.pending}
                delta="awaiting start"
              />
              <Kpi
                label="Overdue"
                icon={<AlertTriangle />}
                iconBg="rgba(220,38,38,.10)"
                iconColor="var(--st-overdue)"
                value={stats.overdue}
                delta={stats.overdue > 0 ? "needs attention" : "none open"}
                deltaTone={stats.overdue > 0 ? "down" : undefined}
              />
              <Kpi
                label="Payable Friday"
                icon={<Banknote />}
                iconBg="rgba(37,99,235,.12)"
                iconColor="var(--st-progress)"
                value={<Money amount={stats.payable?.amount ?? 0} />}
                delta={
                  stats.payable ? (
                    <span style={{ color: "var(--st-progress-ink)" }}>
                      {stats.payable.driverCount} drivers · pays {stats.payable.paysAt}
                    </span>
                  ) : (
                    "No period payable"
                  )
                }
              />
            </div>

            <div className="grid-2">
              <div className="card">
                <div className="card-h">
                  <h3>Recent jobs</h3>
                  <Link href="/jobs" className="link" style={{ textDecoration: "none" }}>
                    View all →
                  </Link>
                </div>
                <DataTable
                  columns={columns}
                  rows={stats.recent}
                  rowKey={(j) => j.id}
                  onRowClick={(j) => router.push(`/jobs/${encodeURIComponent(jobUrlSlug(j.id))}`)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div className="card">
                  <div className="card-h">
                    <h3>Jobs by status</h3>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "22px 20px" }}>
                    <Donut
                      segments={[
                        { color: "var(--st-progress)", value: stats.inProgress },
                        { color: "var(--st-pending)", value: stats.pending },
                        { color: "var(--st-review)", value: stats.awaiting },
                        { color: "var(--st-done)", value: stats.done },
                        { color: "var(--st-overdue)", value: stats.overdue },
                      ]}
                    />
                    <Legend
                      items={[
                        { color: "var(--st-progress)", label: "In progress", value: String(stats.inProgress) },
                        { color: "var(--st-pending)", label: "Pending", value: String(stats.pending) },
                        { color: "var(--st-review)", label: "Awaiting", value: String(stats.awaiting) },
                        { color: "var(--st-done)", label: "Done", value: String(stats.done) },
                        { color: "var(--st-overdue)", label: "Overdue", value: String(stats.overdue) },
                      ]}
                    />
                  </div>
                </div>
                <div className="card">
                  <div className="card-h">
                    <h3>Driver activity</h3>
                  </div>
                  {stats.activity.length === 0 ? (
                    <div style={{ padding: "20px", color: "var(--text-2)", font: "500 14px var(--f)" }}>
                      No driver activity yet.
                    </div>
                  ) : (
                    stats.activity.map(({ driver, job, title, when }) => (
                      <div className="act" key={job.id}>
                        <div className="av">{driver.initials}</div>
                        <div className="b">
                          <div className="t">
                            {shortName(driver.name)} {title.charAt(0).toLowerCase() + title.slice(1)} on <b>{job.id}</b>
                          </div>
                          <div className="m">{when}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
