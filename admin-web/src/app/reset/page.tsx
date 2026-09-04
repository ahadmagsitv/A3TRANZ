// The address the reset and invite emails already point at
// (`${APP_URL}/reset?token=…`, api/src/mailer.ts). It is the login screen in
// its third state — the panel, the styles and the "back to sign in" exit are
// all the same, so this is the same component under a second URL rather than
// a second copy of it.
export { default } from "../login/page";
