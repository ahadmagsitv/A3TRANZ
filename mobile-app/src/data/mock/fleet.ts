import type { FleetRepo } from '../contracts';
import { clone, db, delay } from './db';

export const mockFleetRepo: FleetRepo = {
  async list() {
    await delay();
    return db.units.map(clone);
  },
  async get(id) {
    await delay();
    const unit = db.units.find(u => u.id === id);
    return unit ? clone(unit) : null;
  },
  async defect(unitId) {
    await delay();
    const unit = db.units.find(u => u.id === unitId);
    const defect = unit?.defectId
      ? db.defects.find(d => d.id === unit.defectId)
      : undefined;
    return defect ? clone(defect) : null;
  },
};
