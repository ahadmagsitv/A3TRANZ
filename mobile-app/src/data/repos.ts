/**
 * The eight repository instances the app runs against.
 *
 * This is the swap point §2.3 described: screens import types from
 * `data/contracts` and instances from HERE, so moving a domain onto the API is
 * one line in this file and nothing else.
 *
 * The mock implementations under `data/mock/` are no longer wired into the
 * app — they stay as the deterministic fixtures the tests run against, which
 * is what a unit test should use. A test that needed a live Postgres to assert
 * a state-machine gate would not be a unit test.
 */
export {httpAuthRepo as authRepo} from './http/auth';
export {httpChatRepo as chatRepo} from './http/chat';
export {httpCustomersRepo as customersRepo} from './http/customers';
export {httpDriversRepo as driversRepo} from './http/drivers';
export {httpFleetRepo as fleetRepo} from './http/fleet';
export {httpJobsRepo as jobsRepo} from './http/jobs';
export {httpNotificationsRepo as notificationsRepo} from './http/notifications';
export {httpPayrollRepo as payrollRepo} from './http/payroll';

/** §6.8 tab-badge derivation — see `useUnreadBadges`. */
export {
  anyNotificationUnread,
  anyThreadUnread,
  subscribeBadges,
  refreshBadges,
} from './http/badges';

export {ApiError, API_URL} from './api';
