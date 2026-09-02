/**
 * RBAC comes from `@a3/domain` — the same map the API's `requires()` reads.
 *
 * This file used to be a copy of it. Two copies of who-can-do-what is the one
 * duplication that cannot be allowed to drift: the client decides what to grey
 * out, the server decides what to refuse, and a disagreement is either a
 * user staring at a locked button they should be able to press, or a hole.
 *
 * Kept as a re-export rather than rewriting the 8 import sites — the path
 * `@/lib/rbac` is fine, it just must not be a second source of truth.
 */
export {
  can,
  CAPABILITY_LABEL,
  ALL_CAPABILITIES,
  PERMISSION_TIERS,
  ROLE_LABEL,
} from "@a3/domain";
export type { Capability } from "@a3/domain";
