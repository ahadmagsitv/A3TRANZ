"use client";
// W17 — Fleet units: trucks + chassis (task W-03d). Pixel port of W17-units
// from a3tranz-admin-all.html. `.unitchip` / `.oos` per plan §1.1.
import { useEffect, useMemo, useState } from "react";
import { jobLabel } from "@/lib/jobLabel";
import { useRouter } from "next/navigation";
import { AlertTriangle, Container, Download, MoreHorizontal, Plus } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { downloadCsv } from "@/lib/csv";
import { FilterBar, FilterChip } from "@/components/FilterBar";
import { DataTable, type Column } from "@/components/DataTable";
import { Pager } from "@/components/Pager";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Toast } from "@/components/Toast";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { UnitModal } from "@/components/UnitModal";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";
import { fleetRepo } from "@/data/repos/fleet";
import type { FleetUnit, UnitStatus } from "@/data/contracts/fleet";

const STATUS_LABEL: Record<UnitStatus, string> = {
  in_service: "In service",
  in_use: "In use",
  out_of_service: "Out of service",
};
const STATUS_CLASS: Record<UnitStatus, string> = {
  in_service: "sp-done",
  in_use: "sp-progress",
  out_of_service: "sp-overdue",
};

type UnitFilter = "all" | "truck" | "chassis" | "oos";

export default function FleetPage() {
  const router = useRouter();
  const user = useStore(authStore);
  const [units, setUnits] = useState<FleetUnit[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UnitFilter>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 6;

  useEffect(() => {
    fleetRepo.list().then(setUnits);
  }, []);

  const filterKey = `${query.trim()}|${filter}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const filtered = useMemo(() => {
    if (!units) return [];
    let rows = units;
    if (filter === "truck") rows = rows.filter((u) => u.type === "truck");
    if (filter === "chassis") rows = rows.filter((u) => u.type === "chassis");
    if (filter === "oos") rows = rows.filter((u) => u.status === "out_of_service");
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((u) => u.id.toLowerCase().includes(q) || u.plate.toLowerCase().includes(q));
    }
    return rows;
  }, [units, filter, query]);

  if (!user) return null;

  const outOfService = units?.filter((u) => u.status === "out_of_service") ?? [];

  const columns: Column<FleetUnit>[] = [
    {
      key: "unit",
      header: "Unit",
      render: (u) => (
        <>
          <span className="t-strong">{u.id}</span>
          <div className="t-id">{u.label}</div>
        </>
      ),
    },
    { key: "type", header: "Type", render: (u) => (u.type === "truck" ? "Truck" : "Chassis") },
    { key: "plate", header: "Plate", render: (u) => u.plate },
    { key: "status", header: "Status", render: (u) => <span className={`spill ${STATUS_CLASS[u.status]}`}>{STATUS_LABEL[u.status]}</span> },
    { key: "onjob", header: "On job", render: (u) => (u.onJobId ? <span className="t-id">{jobLabel(u.onJobId)}</span> : <span className="t-sub">—</span>) },
    { key: "lastinsp", header: "Last inspection", render: (u) => <span className="t-sub">{u.lastInspectionAt}</span> },
    {
      key: "nextdue",
      header: "Next due",
      render: (u) => (
        <span className="t-sub" style={u.status === "out_of_service" ? { color: "var(--st-overdue-ink)" } : undefined}>
          {u.nextDueAt}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: () => (
        <span className="rowact">
          <MoreHorizontal />
        </span>
      ),
    },
  ];

  // Exports what the table is showing — the filtered set, not the whole list.
  function exportCsv() {
    downloadCsv("a3tranz-fleet.csv", [
      ["Unit", "Type", "Plate", "Status", "On job", "Last inspection", "Next due"],
      ...filtered.map((u) => [
        u.id,
        u.type,
        u.plate,
        u.status,
        u.onJobId ?? "",
        u.lastInspectionAt,
        u.nextDueAt,
      ]),
    ]);
  }

  return (
    <>
      <Topbar title="Fleet" searchPlaceholder="Search units…" searchValue={query} onSearchChange={setQuery} />
      <div className="content">
        <div className="page-head">
          <div>
            <h1>Trucks &amp; equipment</h1>
            <div className="sub">
              {units === null ? "Loading…" : `${units.length} units · ${outOfService.length} out of service`}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <Button variant="secondary" onClick={exportCsv} disabled={units === null}>
              <Download />
              Export CSV
            </Button>
            <RoleGate role={user.role} cap="manageCustomersFleet">
              <Button variant="amber" onClick={() => setAdding(true)}>
                <Plus />
                Add unit
              </Button>
            </RoleGate>
          </div>
        </div>

        {outOfService.map((u) => (
          <div key={u.id} style={{ marginBottom: 18 }}>
            <Toast tone="warn">
              <AlertTriangle />
              {u.id} was placed out of service by a failed pre-trip inspection — it cannot be assigned to a job.
            </Toast>
          </div>
        ))}

        <FilterBar searchPlaceholder="Search by unit no. or plate…" searchValue={query} onSearchChange={setQuery}>
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All units
          </FilterChip>
          <FilterChip active={filter === "truck"} onClick={() => setFilter("truck")}>
            Trucks
          </FilterChip>
          <FilterChip active={filter === "chassis"} onClick={() => setFilter("chassis")}>
            Chassis
          </FilterChip>
          <FilterChip active={filter === "oos"} onClick={() => setFilter("oos")}>
            Out of service
          </FilterChip>
        </FilterBar>

        <div className="card">
          {units === null ? (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Type</th>
                  <th>Plate</th>
                  <th>Status</th>
                  <th>On job</th>
                  <th>Last inspection</th>
                  <th>Next due</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td><Skeleton width="60%" /></td>
                    <td><Skeleton width="50%" /></td>
                    <td><Skeleton width="60%" /></td>
                    <td><Skeleton width={78} /></td>
                    <td><Skeleton width="50%" /></td>
                    <td><Skeleton width="60%" /></td>
                    <td><Skeleton width="50%" /></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Container />} title="No units match" description="Try a different search or filter." />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
                rowKey={(u) => u.id}
                onRowClick={(u) => router.push(`/fleet/${u.id}`)}
              />
              <Pager
                page={page}
                totalPages={Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
                rangeLabel={`Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
                onChange={setPage}
              />
            </>
          )}
        </div>
      </div>

      {adding && (
        <UnitModal
          onClose={() => setAdding(false)}
          onCreated={(unit) => setUnits((prev) => [...(prev ?? []), unit])}
        />
      )}
    </>
  );
}
