import type { Driver, DriverInput, DriversRepo } from "@/data/contracts/drivers";
import { api, maybe } from "./api";
import { relative } from "./format";

interface ApiDriver {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  base: string | null;
  active: boolean;
  joinedAt: string | null;
  lastActiveAt: string | null;
  jobsCompleted: number;
  jobsInProgress: number;
  jobsOverdue: number;
}

// `active: boolean` on the wire vs a `status` union in the UI, and `base` vs
// `city` — same asymmetry as customers, mapped once rather than renamed across
// both sides.
const toDriver = (d: ApiDriver): Driver => ({
  id: d.id,
  name: d.name,
  initials: d.initials,
  email: d.email,
  phone: d.phone ?? "",
  status: d.active ? "active" : "inactive",
  city: d.base ?? "",
  // Parsed by the detail screen, so this one stays an ISO string.
  joinedAt: d.joinedAt ?? "",
  jobsCompleted: d.jobsCompleted,
  jobsInProgress: d.jobsInProgress,
  jobsOverdue: d.jobsOverdue,
  lastActiveAt: relative(d.lastActiveAt),
});

export const driversRepo: DriversRepo = {
  async list(): Promise<Driver[]> {
    const { drivers } = await api<{ drivers: ApiDriver[] }>("/drivers");
    return drivers.map(toDriver);
  },

  async get(id: string): Promise<Driver | null> {
    const r = await maybe(api<{ driver: ApiDriver }>(`/drivers/${id}`));
    return r ? toDriver(r.driver) : null;
  },

  async add(input: DriverInput): Promise<Driver> {
    // Drivers are added by an admin, never self-registered. The API issues an
    // invite link either way; `tempPassword` is what lets them sign in before
    // that link can actually be emailed.
    const { driver } = await api<{ driver: ApiDriver }>("/drivers", {
      method: "POST",
      body: input,
    });
    return toDriver(driver);
  },

  async deactivate(id: string): Promise<Driver> {
    const { driver } = await api<{ driver: ApiDriver }>(`/drivers/${id}/deactivate`, {
      method: "POST",
    });
    return toDriver(driver);
  },

  async activate(id: string): Promise<Driver> {
    const { driver } = await api<{ driver: ApiDriver }>(`/drivers/${id}/activate`, {
      method: "POST",
    });
    return toDriver(driver);
  },
};
