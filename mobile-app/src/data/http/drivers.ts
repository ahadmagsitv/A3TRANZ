import type {Driver, DriverOverview, DriversRepo} from '../contracts';
import {api, maybe} from '../api';

export const httpDriversRepo: DriversRepo = {
  async me(): Promise<Driver> {
    const {driver} = await api<{driver: Driver}>('/drivers/me');
    return driver;
  },

  /** M18 Home — one read for the greeting, the badge and the four counts. */
  async overview(): Promise<DriverOverview> {
    const {overview} = await api<{overview: DriverOverview}>(
      '/drivers/me/overview',
    );
    return overview;
  },

  async get(id: string): Promise<Driver | null> {
    const r = await maybe(api<{driver: Driver}>(`/drivers/${id}`));
    return r ? r.driver : null;
  },

  /** Office-only server-side; a driver token gets 403. Kept for the contract. */
  async list(): Promise<Driver[]> {
    const {drivers} = await api<{drivers: Driver[]}>('/drivers');
    return drivers;
  },

  async changePassword(current: string, next: string): Promise<void> {
    await api<void>('/auth/change-password', {
      method: 'POST',
      body: {current, next},
    });
  },
};
