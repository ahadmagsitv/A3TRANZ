import type {Defect, FleetRepo, Unit} from '../contracts';
import {api, maybe} from '../api';

/** Also office-only server-side — see the note in `customers.ts`. */
export const httpFleetRepo: FleetRepo = {
  async list(): Promise<Unit[]> {
    const {units} = await api<{units: Unit[]}>('/fleet');
    return units;
  },

  async get(id: string): Promise<Unit | null> {
    const r = await maybe(api<{unit: Unit}>(`/fleet/${id}`));
    return r ? r.unit : null;
  },

  async defect(unitId: string): Promise<Defect | null> {
    const {defect} = await api<{defect: Defect | null}>(
      `/fleet/${unitId}/defect`,
    );
    return defect;
  },
};
