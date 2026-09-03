"use client";
// W7 — Drivers list (task W-04a). Pixel port of W7-list from
// a3tranz-admin-all.html. `.mini-av`, `.tag-act` / `.tag-inact`.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleSlash, Eye, MoreHorizontal, UserPlus, Users } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { FilterBar } from "@/components/FilterBar";
import { DataTable, type Column } from "@/components/DataTable";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { DriverModal } from "@/components/DriverModal";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";
import { driversRepo } from "@/data/repos/drivers";
import type { Driver } from "@/data/contracts/drivers";

export default function DriversPage() {
  const router = useRouter();
  const user = useStore(authStore);
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    driversRepo.list().then(setDrivers);
  }, []);

  const filtered = useMemo(() => {
    if (!drivers) return [];
    if (!query.trim()) return drivers;
    const q = query.trim().toLowerCase();
    return drivers.filter((d) => d.name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q));
  }, [drivers, query]);

  if (!user) return null;

  const activeCount = drivers?.filter((d) => d.status === "active").length ?? 0;
  const inactiveCount = drivers?.filter((d) => d.status === "inactive").length ?? 0;

  const columns: Column<Driver>[] = [
    {
      key: "name",
      header: "Name",
      render: (d) => (
        <>
          <span className="mini-av" style={d.status === "inactive" ? { background: "var(--muted)" } : undefined}>
            {d.initials}
          </span>
          <span className="t-strong">{d.name}</span>
        </>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (d) => (
        <span className="t-sub">
          {d.email}
          <br />
          {d.phone}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (d) =>
        d.status === "active" ? (
          <span className="tag-act">
            <CheckCircle2 style={{ width: 14 }} />
            Active
          </span>
        ) : (
          <span className="tag-inact">
            <CircleSlash style={{ width: 14 }} />
            Inactive
          </span>
        ),
    },
    { key: "jobs", header: "Jobs done", render: (d) => d.jobsCompleted },
    { key: "active", header: "Last active", render: (d) => <span className="t-sub">{d.lastActiveAt}</span> },
    {
      key: "actions",
      header: "",
      render: () => (
        <span className="rowact">
          <Eye />
          <MoreHorizontal />
        </span>
      ),
    },
  ];

  return (
    <>
      <Topbar title="Drivers" searchPlaceholder="Search drivers…" searchValue={query} onSearchChange={setQuery} />
      <div className="content">
        <div className="page-head">
          <div>
            <h1>Drivers</h1>
            <div className="sub">
              {drivers === null ? "Loading…" : `${activeCount} active · ${inactiveCount} inactive`}
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <RoleGate role={user.role} cap="manageDrivers">
              <Button variant="amber" onClick={() => setShowAdd(true)}>
                <UserPlus />
                Add driver
              </Button>
            </RoleGate>
          </div>
        </div>

        <FilterBar searchPlaceholder="Search drivers…" searchValue={query} onSearchChange={setQuery} />

        <div className="card">
          {drivers === null ? (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Jobs done</th>
                  <th>Last active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td><Skeleton width="60%" /></td>
                    <td><Skeleton width="70%" /></td>
                    <td><Skeleton width={78} /></td>
                    <td><Skeleton width={24} /></td>
                    <td><Skeleton width="50%" /></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Users />} title="No drivers match" description="Try a different search." />
          ) : (
            <DataTable columns={columns} rows={filtered} rowKey={(d) => d.id} onRowClick={(d) => router.push(`/drivers/${d.id}`)} />
          )}
        </div>
      </div>
      {showAdd && (
        <DriverModal onClose={() => setShowAdd(false)} onCreated={(d) => setDrivers((prev) => (prev ? [...prev, d] : [d]))} />
      )}
    </>
  );
}
