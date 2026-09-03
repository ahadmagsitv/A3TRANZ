"use client";
// W3 — Jobs table + filters (task W-05b). Pixel port of W3-table-filters /
// W3-filtered-no-results / W3-loading / W3-empty from a3tranz-admin-all.html.
// All four states are driven by the real jobsRepo — loading is the mock's
// 200–400ms delay, no-results and empty are real filter combinations against
// the fixture data (plan §2.3 / §7).
import { useEffect, useMemo, useState } from "react";
import { jobLabel } from "@/lib/jobLabel";
import { downloadCsv } from "@/lib/csv";
import { useRouter } from "next/navigation";
import { Briefcase, Download, FilterX, MoreHorizontal, Pencil, Plus, SearchX, Loader } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { FilterBar, ChipSelect } from "@/components/FilterBar";
import { DataTable, type Column } from "@/components/DataTable";
import { Pager } from "@/components/Pager";
import { Skeleton } from "@/components/Skeleton";
import { StatusPill } from "@/components/StatusPill";
import { JobTypeChip } from "@/components/JobTypeChip";
import { Money } from "@/components/Money";
import { Button } from "@/components/Button";
import { JobFormModal } from "@/components/JobFormModal";
import { jobsRepo } from "@/data/repos/jobs";
import { customersRepo } from "@/data/repos/customers";
import { driversRepo } from "@/data/repos/drivers";
import type { Job, JobStatus, Priority } from "@/data/contracts/jobs";
import type { Customer } from "@/data/contracts/customers";
import type { Driver } from "@/data/contracts/drivers";

const PAGE_SIZE = 6;

const STATUS_OPTIONS: { value: JobStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "awaiting_approval", label: "Awaiting approval" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
  { value: "overdue", label: "Overdue" },
];

const PRIORITY_OPTIONS: { value: Priority | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "med", label: "Medium" },
  { value: "low", label: "Low" },
];

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

export default function JobsPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [jobs, setJobs] = useState<Job[] | null>(null); // null while loading
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<JobStatus | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [driverId, setDriverId] = useState<string>("all");

  useEffect(() => {
    customersRepo.list().then(setCustomers);
    driversRepo.list().then(setDrivers);
  }, []);

  // Resetting `jobs` to null (loading) and `page` to 1 when the filters
  // change is a "reset state when a dep changes" case — done during render
  // (React's endorsed pattern for this) rather than in a useEffect, which
  // would call setState synchronously in the effect body.
  const filterKey = JSON.stringify({ query: query.trim(), status, priority, driverId });
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setJobs(null);
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;
    jobsRepo
      .list({
        status: status === "all" ? undefined : status,
        priority: priority === "all" ? undefined : priority,
        driverId: driverId === "all" ? undefined : driverId,
        query: query.trim() || undefined,
      })
      .then((result) => {
        if (!cancelled) setJobs(result);
      });
    return () => {
      cancelled = true;
    };
  }, [filterKey, query, status, priority, driverId]);

  const customerName = useMemo(() => {
    const map = new Map(customers.map((c) => [c.id, c.name]));
    return (id: string) => map.get(id) ?? id;
  }, [customers]);

  const driverName = useMemo(() => {
    const map = new Map(drivers.map((d) => [d.id, d.name]));
    return (id: string | null) => (id ? (map.get(id) ?? id) : "—");
  }, [drivers]);

  const driverInitials = useMemo(() => {
    const map = new Map(drivers.map((d) => [d.id, d.initials]));
    return (id: string | null) => (id ? (map.get(id) ?? "—") : "—");
  }, [drivers]);

  const hasSearch = query.trim() !== "";
  const hasChipFilter = status !== "all" || priority !== "all" || driverId !== "all";
  const overdueCount = useMemo(() => jobs?.filter((j) => j.status === "overdue").length ?? 0, [jobs]);

  function exportCsv() {
    if (!jobs) return;
    downloadCsv("a3tranz-jobs.csv", [
      ["Job ID", "Title", "Customer", "Type", "Driver", "Status", "Price", "Due"],
      ...jobs.map((j) => [
        jobLabel(j.id),
        j.title,
        customerName(j.customerId),
        j.type,
        j.driverId ? driverName(j.driverId) : "Unassigned",
        j.status,
        j.price.toFixed(2),
        formatDue(j.dueDate),
      ]),
    ]);
  }

  function handleCreated(created: Job) {
    setJobs((prev) => (prev ? [created, ...prev] : [created]));
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setPriority("all");
    setDriverId("all");
  }

  const totalPages = jobs ? Math.max(1, Math.ceil(jobs.length / PAGE_SIZE)) : 1;
  const pageJobs = jobs ? jobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : [];

  const columns: Column<Job>[] = [
    {
      key: "job",
      header: "Job",
      render: (j) => (
        <>
          <span className="t-strong">{j.title}</span>
          <div className="t-id">{jobLabel(j.id)}</div>
        </>
      ),
    },
    { key: "customer", header: "Customer", render: (j) => <span className="t-sub">{customerName(j.customerId)}</span> },
    { key: "type", header: "Type", render: (j) => <JobTypeChip type={j.type} /> },
    {
      key: "driver",
      header: "Driver",
      render: (j) =>
        j.driverId ? (
          <>
            <span className="mini-av">{driverInitials(j.driverId)}</span>
            {shortName(driverName(j.driverId))}
          </>
        ) : (
          <span className="t-sub">Unassigned</span>
        ),
    },
    { key: "status", header: "Status", render: (j) => <StatusPill status={j.status} /> },
    { key: "price", header: "Price", render: (j) => <Money amount={j.price} /> },
    {
      key: "due",
      header: "Due",
      render: (j) => (
        <span style={j.status === "overdue" ? { color: "var(--st-overdue-ink)" } : undefined}>
          {formatDue(j.dueDate)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: () => (
        <span className="rowact">
          <Pencil />
          <MoreHorizontal />
        </span>
      ),
    },
  ];

  const driverOptions = [{ value: "all", label: "All" }, ...drivers.map((d) => ({ value: d.id, label: shortName(d.name) }))];

  return (
    <>
      <Topbar title="Jobs" searchPlaceholder="Search jobs…" searchValue={query} onSearchChange={setQuery} />
      <div className="content">
        <div className="page-head">
          <div>
            <h1>All jobs</h1>
            <div className="sub">
              {jobs === null ? (
                <>
                  <Loader className="spin" style={{ width: 14, verticalAlign: -2 }} /> Loading jobs…
                </>
              ) : jobs.length === 0 ? (
                hasSearch ? "0 results" : "No jobs yet"
              ) : hasSearch || hasChipFilter ? (
                `${jobs.length} result${jobs.length === 1 ? "" : "s"}`
              ) : (
                `${jobs.length} jobs · ${overdueCount} overdue`
              )}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <Button variant="secondary" onClick={exportCsv} style={jobs === null ? { opacity: 0.5 } : undefined} disabled={jobs === null}>
              <Download />
              Export CSV
            </Button>
            <Button variant="amber" onClick={() => setShowCreate(true)}>
              <Plus />
              Create job
            </Button>
          </div>
        </div>

        {/* Always mounted. It used to render only once jobs had loaded, and every
            keystroke sets jobs back to null — so the search box unmounted
            mid-type, lost focus, and the whole header flashed. Only the table
            below should swap to its skeleton. */}
        <FilterBar searchPlaceholder="Search by title or ID…" searchValue={query} onSearchChange={setQuery}>
            <ChipSelect label="Status" value={status} onChange={(v) => setStatus(v as JobStatus | "all")} options={STATUS_OPTIONS} active={status !== "all"} />
            <ChipSelect label="Priority" value={priority} onChange={(v) => setPriority(v as Priority | "all")} options={PRIORITY_OPTIONS} active={priority !== "all"} />
            <ChipSelect label="Driver" value={driverId} onChange={setDriverId} options={driverOptions} active={driverId !== "all"} />
        </FilterBar>

        <div className="card">
          {jobs === null ? (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>Price</th>
                  <th>Due</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td><Skeleton width="70%" /></td>
                    <td><Skeleton width="60%" /></td>
                    <td><Skeleton width={48} /></td>
                    <td><Skeleton width="64%" /></td>
                    <td><Skeleton width={78} /></td>
                    <td><Skeleton width={56} /></td>
                    <td><Skeleton width="70%" /></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : jobs.length === 0 ? (
            hasSearch ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "72px 24px", gap: 8 }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--muted)" }}>
                  <SearchX style={{ width: 32 }} />
                </div>
                <div style={{ font: "800 18px var(--fd)", color: "var(--text)" }}>No jobs match these filters</div>
                <div style={{ font: "500 14px var(--f)", color: "var(--text-2)", maxWidth: 360 }}>
                  {[
                    status !== "all" ? STATUS_OPTIONS.find((o) => o.value === status)?.label : null,
                    driverId !== "all" ? shortName(driverName(driverId)) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Nothing"}{" "}
                  matching &quot;{query}&quot;. Try clearing a filter or widening the date range.
                </div>
                <Button variant="secondary" style={{ marginTop: 12 }} onClick={clearFilters}>
                  <FilterX />
                  Clear all filters
                </Button>
              </div>
            ) : (
              <div className="empty-w">
                <span className="ic">
                  <Briefcase />
                </span>
                <h3>No jobs yet</h3>
                <p>
                  {hasChipFilter
                    ? "No jobs match the current filters yet. Create the first one and assign it to a driver."
                    : "Create the first job card and assign it to a driver. Import and export runs all start here."}
                </p>
                <Button variant="amber" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>
                  <Plus />
                  Create job
                </Button>
              </div>
            )
          ) : (
            <>
              <DataTable columns={columns} rows={pageJobs} rowKey={(j) => j.id} onRowClick={(j) => router.push(`/jobs/${encodeURIComponent(j.id)}`)} />
              <Pager
                page={page}
                totalPages={totalPages}
                rangeLabel={`Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, jobs.length)} of ${jobs.length}`}
                onChange={setPage}
              />
            </>
          )}
        </div>
      </div>
      {showCreate && <JobFormModal mode="create" onClose={() => setShowCreate(false)} onSaved={handleCreated} />}
    </>
  );
}
