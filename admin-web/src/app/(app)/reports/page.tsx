"use client";
// W11 — Reports: charts + CSV/Excel export (task W-11). Pixel port of
// W11-charts-export from a3tranz-admin-all.html, with real aggregates
// computed from jobsRepo / driversRepo / payrollRepo — no chart library
// (Donut/Bars/Legend are the existing conic-gradient / flex-div primitives).
//
// Two deliberate drops from the source markup, both because the fixture
// data can't honestly back them (plan §7 "no fabricated chart data
// disconnected from the actual fixtures"):
//   - "Avg. time to close" (no created/closed timestamps in the Job
//     contract) is replaced with "Active drivers", a real derived count.
//   - "Jobs by category" (Deliveries/Pickups/Transfers/…) has no field in
//     the Job contract to group by — dropped rather than invented.
//   - The overdue table drops "Days late": the fixture's due dates are a
//     fixed demo snapshot, not live, so diffing them against the real
//     system clock would print nonsense (hundreds of "days late"). Job +
//     Driver + Due are shown; the day count is not.
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { Skeleton } from "@/components/Skeleton";
import { Button } from "@/components/Button";
import { Donut } from "@/components/Donut";
import { Bars } from "@/components/Bars";
import { Legend } from "@/components/Legend";
import { EmptyState } from "@/components/EmptyState";
import { jobsRepo } from "@/data/repos/jobs";
import { driversRepo } from "@/data/repos/drivers";
import { payrollRepo } from "@/data/repos/payroll";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";
import { can } from "@/lib/rbac";
import { downloadCsv } from "@/lib/csv";
import type { Job } from "@/data/contracts/jobs";
import type { Driver } from "@/data/contracts/drivers";
import type { PayPeriod } from "@/data/contracts/payroll";

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

export default function ReportsPage() {
  const user = useStore(authStore);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [periods, setPeriods] = useState<PayPeriod[]>([]);

  useEffect(() => {
    jobsRepo.list().then(setJobs);
    driversRepo.list().then(setDrivers);
    payrollRepo.list().then(setPeriods);
  }, []);

  const driverName = useMemo(() => {
    const map = new Map(drivers.map((d) => [d.id, d.name]));
    return (id: string | null) => (id ? (map.get(id) ?? id) : "Unassigned");
  }, [drivers]);

  const stats = useMemo(() => {
    if (!jobs) return null;
    const completed = jobs.filter((j) => j.status === "done");
    const overdue = jobs.filter((j) => j.status === "overdue");
    const importJobs = jobs.filter((j) => j.type === "import");
    const exportJobs = jobs.filter((j) => j.type === "export");
    const activeDrivers = drivers.filter((d) => d.status === "active");

    const perDriver = new Map<string, number>();
    for (const j of completed) {
      if (!j.driverId) continue;
      perDriver.set(j.driverId, (perDriver.get(j.driverId) ?? 0) + 1);
    }
    const driverBars = drivers
      .map((d) => ({ label: d.name.split(" ")[0], value: perDriver.get(d.id) ?? 0 }))
      .sort((a, b) => b.value - a.value);

    const importValue = importJobs.reduce((sum, j) => sum + j.price, 0);
    const exportValue = exportJobs.reduce((sum, j) => sum + j.price, 0);

    return {
      completedCount: completed.length,
      overdueCount: overdue.length,
      overduePct: jobs.length ? ((overdue.length / jobs.length) * 100).toFixed(1) : "0",
      activeDrivers: activeDrivers.length,
      totalDrivers: drivers.length,
      importCount: importJobs.length,
      exportCount: exportJobs.length,
      importValue,
      exportValue,
      driverBars,
      overdueJobs: overdue,
    };
  }, [jobs, drivers]);

  const payrollBars = useMemo(
    () => periods.map((p) => ({ label: p.label.split(" ")[0] + " " + p.label.split(" ")[1], value: p.amount })),
    [periods]
  );

  function exportCsv(filename: string) {
    if (!stats) return;
    const rows: (string | number)[][] = [
      ["Section", "Label", "Value"],
      ["KPI", "Jobs completed", stats.completedCount],
      ["KPI", "Overdue jobs", stats.overdueCount],
      ["KPI", "Active drivers", `${stats.activeDrivers} of ${stats.totalDrivers}`],
      ...stats.driverBars.map((b) => ["Completed jobs per driver", b.label, b.value]),
      ["Jobs by type", "Import", stats.importCount],
      ["Jobs by type", "Export", stats.exportCount],
      ["Job value by type", "Import", stats.importValue.toFixed(2)],
      ["Job value by type", "Export", stats.exportValue.toFixed(2)],
      ...periods.map((p) => ["Payroll amount by pay period", p.label, p.amount.toFixed(2)]),
      ...stats.overdueJobs.map((j) => ["Overdue job", `${j.id} ${j.title}`, formatDue(j.dueDate)]),
    ];
    downloadCsv(filename, rows);
  }

  if (!user) return null;

  if (!can(user.role, "viewReports")) {
    return (
      <>
        <Topbar title="Reports" />
        <div className="content">
          <EmptyState
            icon={<BarChart3 />}
            title="Reports isn't available for your role"
            description="Project Manager and Dispatcher accounts aren't granted reports & export access (plan §6.6)."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Reports" />
      <div className="content">
        <div className="page-head">
          <div>
            <h1>Reports</h1>
            <div className="sub">Across all jobs in the current dataset</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <Button variant="secondary" onClick={() => exportCsv("a3tranz-reports.csv")} disabled={!stats}>
              <Download />
              Export Excel
            </Button>
            <Button variant="amber" onClick={() => exportCsv("a3tranz-reports.csv")} disabled={!stats}>
              <Download />
              Export CSV
            </Button>
          </div>
        </div>

        {!stats ? (
          <>
            <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div className="kpi" key={i}>
                  <Skeleton width="60%" height={13} />
                  <div style={{ marginTop: 10 }}>
                    <Skeleton width="40%" height={30} />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid-2b">
              <div className="card"><Skeleton height={220} /></div>
              <div className="card"><Skeleton height={220} /></div>
            </div>
          </>
        ) : (
          <>
            <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              <div className="kpi">
                <div className="kpi-l">Jobs completed</div>
                <div className="kpi-n">{stats.completedCount}</div>
                <div className="kpi-d" style={{ color: "var(--text-2)" }}>
                  of {jobs?.length ?? 0} total
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-l">Overdue jobs</div>
                <div className="kpi-n">{stats.overdueCount}</div>
                <div className="kpi-d" style={{ color: "var(--text-2)" }}>
                  {stats.overduePct}% of total
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-l">Active drivers</div>
                <div className="kpi-n">{stats.activeDrivers}</div>
                <div className="kpi-d" style={{ color: "var(--text-2)" }}>
                  of {stats.totalDrivers} total
                </div>
              </div>
            </div>

            <div className="grid-2b">
              <div className="card">
                <div className="card-h">
                  <h3>Completed jobs per driver</h3>
                </div>
                <div style={{ padding: "24px 24px 18px" }}>
                  <Bars
                    items={stats.driverBars.map((b) => ({ label: b.label, value: b.value, displayValue: String(b.value) }))}
                  />
                </div>
              </div>
              <div className="card">
                <div className="card-h">
                  <h3>Jobs by type</h3>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "24px 20px" }}>
                  <Donut
                    segments={[
                      { color: "var(--navy)", value: stats.importCount },
                      { color: "var(--st-progress)", value: stats.exportCount },
                    ]}
                  />
                  <Legend
                    items={[
                      { color: "var(--navy)", label: "Import", value: String(stats.importCount) },
                      { color: "var(--st-progress)", label: "Export", value: String(stats.exportCount) },
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="grid-2b" style={{ marginTop: 20 }}>
              <div className="card">
                <div className="card-h">
                  <h3>Job value by type</h3>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "24px 20px" }}>
                  <Donut
                    segments={[
                      { color: "var(--navy)", value: stats.importValue },
                      { color: "var(--st-progress)", value: stats.exportValue },
                    ]}
                  />
                  <Legend
                    items={[
                      { color: "var(--navy)", label: "Import", value: stats.importValue.toLocaleString("en-US", { style: "currency", currency: "USD" }) },
                      { color: "var(--st-progress)", label: "Export", value: stats.exportValue.toLocaleString("en-US", { style: "currency", currency: "USD" }) },
                    ]}
                  />
                </div>
              </div>
              <div className="card">
                <div className="card-h">
                  <h3>Payroll amount by pay period</h3>
                </div>
                <div style={{ padding: "24px 24px 18px" }}>
                  <Bars
                    items={payrollBars.map((b) => ({
                      label: b.label,
                      value: b.value,
                      displayValue: b.value.toLocaleString("en-US", { maximumFractionDigits: 0 }),
                    }))}
                  />
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-h">
                <h3>Overdue jobs</h3>
                <span className="spill sp-overdue" style={{ marginLeft: "auto" }}>
                  {stats.overdueCount} open
                </span>
              </div>
              {stats.overdueJobs.length === 0 ? (
                <div style={{ padding: "32px 24px", color: "var(--text-2)", font: "500 14px var(--f)" }}>
                  No overdue jobs.
                </div>
              ) : (
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Driver</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.overdueJobs.map((j) => (
                      <tr key={j.id}>
                        <td>
                          <span className="t-strong">{j.title}</span>
                          <div className="t-id">{j.id}</div>
                        </td>
                        <td>{driverName(j.driverId)}</td>
                        <td style={{ color: "var(--st-overdue-ink)", fontWeight: 700 }}>{formatDue(j.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
