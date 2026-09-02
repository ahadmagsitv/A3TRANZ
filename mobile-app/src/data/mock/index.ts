/**
 * The eight mock implementations. Screens import from `data/contracts` for
 * types and from HERE for the instance — this file is the one line that changes
 * per domain when a real API lands (§2.3).
 */
export { mockAuthRepo as authRepo } from './auth';
export { mockChatRepo as chatRepo } from './chat';
export { mockCustomersRepo as customersRepo } from './customers';
export { mockDriversRepo as driversRepo } from './drivers';
export { mockFleetRepo as fleetRepo } from './fleet';
export { mockJobsRepo as jobsRepo } from './jobs';
export { mockNotificationsRepo as notificationsRepo } from './notifications';
export { mockPayrollRepo as payrollRepo } from './payroll';
export { MockError } from './db';
/** §6.8 tab-badge derivation — see `useUnreadBadges`. */
export {
  anyNotificationUnread,
  anyThreadUnread,
  subscribeMock,
} from './db';

/**
 * The names `data/repos` exports, so a test can stand in for it wholesale
 * (see `moduleNameMapper` in jest.config.js). The mock store is synchronous
 * and always current, so there is nothing for a refresh to do.
 */
export { subscribeMock as subscribeBadges } from './db';
export const refreshBadges = async (): Promise<void> => {};
