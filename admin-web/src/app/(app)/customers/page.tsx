"use client";
// W14 — Customers list (task W-03a). Pixel port of W14-list from
// a3tranz-admin-all.html. Row `.togg` = per-customer completion-email opt-in.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Download, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { downloadCsv } from "@/lib/csv";
import { FilterBar, FilterChip } from "@/components/FilterBar";
import { DataTable, type Column } from "@/components/DataTable";
import { Pager } from "@/components/Pager";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Toggle } from "@/components/Toggle";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { CustomerModal } from "@/components/CustomerModal";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";
import { customersRepo } from "@/data/repos/customers";
import type { Customer } from "@/data/contracts/customers";

export default function CustomersPage() {
  const router = useRouter();
  const user = useStore(authStore);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [query, setQuery] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 6;

  useEffect(() => {
    customersRepo.list().then(setCustomers);
  }, []);

  // Render-time reset (not an effect) when the filter identity changes.
  const filterKey = `${query.trim()}|${onlyActive}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const filtered = useMemo(() => {
    if (!customers) return [];
    let rows = customers;
    if (onlyActive) rows = rows.filter((c) => c.activeJobs > 0);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((c) => c.name.toLowerCase().includes(q) || c.contactName.toLowerCase().includes(q));
    }
    return rows;
  }, [customers, onlyActive, query]);

  async function toggleNotify(customer: Customer) {
    const updated = await customersRepo.update(customer.id, { notifyOnComplete: !customer.notifyOnComplete });
    setCustomers((prev) => prev && prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  if (!user) return null;

  const columns: Column<Customer>[] = [
    {
      key: "company",
      header: "Company",
      render: (c) => (
        <>
          <span className="t-strong">{c.name}</span>
          <div className="t-id">{c.email}</div>
        </>
      ),
    },
    { key: "contact", header: "Primary contact", render: (c) => c.contactName },
    { key: "phone", header: "Phone", render: (c) => c.phone },
    { key: "active", header: "Active jobs", render: (c) => c.activeJobs },
    { key: "last", header: "Last job", render: (c) => <span className="t-sub">{c.lastJobAt}</span> },
    {
      key: "notify",
      header: "Email on complete",
      render: (c) => (
        <span onClick={(e) => e.stopPropagation()}>
          <RoleGate role={user.role} cap="manageCustomersFleet">
            <Toggle on={c.notifyOnComplete} onChange={() => toggleNotify(c)} />
          </RoleGate>
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

  const withActive = customers?.filter((c) => c.activeJobs > 0).length ?? 0;

  // Exports what the table is showing — the filtered set, not the whole list.
  function exportCsv() {
    downloadCsv("a3tranz-customers.csv", [
      ["Company", "Primary contact", "Email", "Phone", "Active jobs", "Last job", "Email on complete", "Customer since"],
      ...filtered.map((c) => [
        c.name,
        c.contactName,
        c.email,
        c.phone,
        c.activeJobs,
        c.lastJobAt,
        c.notifyOnComplete ? "Yes" : "No",
        c.customerSince,
      ]),
    ]);
  }

  return (
    <>
      <Topbar title="Customers" searchPlaceholder="Search customers…" searchValue={query} onSearchChange={setQuery} />
      <div className="content">
        <div className="page-head">
          <div>
            <h1>Customers</h1>
            <div className="sub">
              {customers === null ? "Loading…" : `${customers.length} companies · ${withActive} with active jobs`}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <Button variant="secondary" onClick={exportCsv} disabled={customers === null}>
              <Download />
              Export CSV
            </Button>
            <RoleGate role={user.role} cap="manageCustomersFleet">
              <Button variant="amber" onClick={() => setShowAdd(true)}>
                <Plus />
                Add customer
              </Button>
            </RoleGate>
          </div>
        </div>

        <FilterBar searchPlaceholder="Search by company or contact…" searchValue={query} onSearchChange={setQuery}>
          <FilterChip active={!onlyActive} onClick={() => setOnlyActive(false)}>
            All customers
          </FilterChip>
          <FilterChip active={onlyActive} onClick={() => setOnlyActive(true)}>
            With active jobs
          </FilterChip>
        </FilterBar>

        <div className="card">
          {customers === null ? (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Primary contact</th>
                  <th>Phone</th>
                  <th>Active jobs</th>
                  <th>Last job</th>
                  <th>Email on complete</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td><Skeleton width="70%" /></td>
                    <td><Skeleton width="60%" /></td>
                    <td><Skeleton width="50%" /></td>
                    <td><Skeleton width={24} /></td>
                    <td><Skeleton width="50%" /></td>
                    <td><Skeleton width={36} /></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Building2 />}
              title="No customers match"
              description="Try a different search or clear the active-jobs filter."
            />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
                rowKey={(c) => c.id}
                onRowClick={(c) => router.push(`/customers/${c.id}`)}
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
      {showAdd && (
        <CustomerModal
          onClose={() => setShowAdd(false)}
          onCreated={(c) => setCustomers((prev) => (prev ? [...prev, c] : [c]))}
        />
      )}
    </>
  );
}
