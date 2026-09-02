/**
 * A3TRANZ design tokens — mobile.
 *
 * Ported verbatim from the `:root` block of `a3tranz-mobile-all.html`
 * (IMPLEMENTATION_PLAN §1.1) plus the four mobile-specific overrides (§1.2).
 *
 * THIS IS THE ONLY FILE IN src/ THAT MAY CONTAIN A COLOUR LITERAL.
 * Every component imports from here. QA gate §7 mechanical check #2 greps for
 * hex literals outside this file and expects zero hits.
 */

export const colors = {
  // Brand
  navy: '#16324F',
  navyInk: '#14212E',
  navyDeep: '#0F1E2E',
  navyGlass: 'rgba(22,50,79,.06)',
  navyLine: 'rgba(22,50,79,.14)',

  // Accent — fills only
  amber: '#F5A623',
  amberInk: '#7A4A00', // the ONLY amber usable as text on white (7.5:1)
  onAmber: '#14212E', // navy text on an amber fill (8:1)
  amberTint: 'rgba(245,166,35,.14)',

  // Selection — blue, never amber
  sel: '#2563EB',

  // Surfaces
  bg: '#F4F6F8',
  surface: '#FFFFFF',
  surface2: '#F8FAFC',
  surface3: '#EEF2F6',
  hairline: '#E2E8F0',
  border: '#CBD5E1',

  // Ink
  text: '#14212E',
  text2: '#5A6B7B',
  muted: '#94A3B8', // NON-TEXT ONLY — dividers, disabled, inert marks
  placeholder: '#64748B',
  onNavy: '#FFFFFF', // device/plain white on a navy fill

  // Status
  stPending: '#64748B',
  stProgress: '#2563EB',
  stReview: '#F5A623',
  stDone: '#16A34A',
  stOverdue: '#DC2626',
  stPendingInk: '#3E4C5A',
  stProgressInk: '#1E4FB8',
  stReviewInk: '#7A4A00',
  stDoneInk: '#137A3A',
  stOverdueInk: '#B4232B',

  // Priority
  priHigh: '#DC2626',
  priMed: '#F5A623',
  priLow: '#64748B',

  // Map placeholder
  mapBg: '#E7EDF3',
  mapInk: '#5F6A87',

  // Sidebar (shared token block; unused on mobile, kept for parity with admin-web)
  sideInk: '#9FB0C4',

  // Toast fills
  okBg: '#EAF7EF',
  infoBg: '#EAF1FD',
  warnBg: '#FDF1E1',
} as const;

/**
 * Derived translucent fills lifted out of the gallery's component rules.
 * They are colour literals, so they live here rather than in the components.
 */
export const tint = {
  // .jcard — status-tinted job card
  cardPending: { bg: 'rgba(100,116,139,.08)', border: 'rgba(100,116,139,.20)' },
  cardProgress: { bg: 'rgba(37,99,235,.06)', border: 'rgba(37,99,235,.18)' },
  cardReview: { bg: 'rgba(245,166,35,.10)', border: 'rgba(245,166,35,.30)' },
  cardDone: { bg: 'rgba(22,163,74,.06)', border: 'rgba(22,163,74,.20)' },
  cardOverdue: { bg: 'rgba(220,38,38,.055)', border: 'rgba(220,38,38,.22)' },

  // .spill — status pill fills
  pillPending: 'rgba(100,116,139,.14)',
  pillProgress: 'rgba(37,99,235,.12)',
  pillReview: colors.amberTint,
  pillDone: 'rgba(22,163,74,.13)',
  pillOverdue: 'rgba(220,38,38,.12)',

  // .pri — priority tag fills
  priHigh: 'rgba(220,38,38,.10)',
  priMed: colors.amberTint,
  priLow: colors.surface3,

  // .jtype — job-type chip
  jtypeImp: { bg: 'rgba(37,99,235,.10)', border: 'rgba(37,99,235,.20)' },
  jtypeExp: { bg: colors.navyGlass, border: colors.navyLine },

  // .insp — inspection row
  inspPass: { bg: 'rgba(22,163,74,.05)', border: 'rgba(22,163,74,.30)' },
  inspFail: { bg: 'rgba(220,38,38,.05)', border: colors.stOverdue },

  // .toast borders
  toastOkBorder: 'rgba(22,163,74,.25)',
  toastInfoBorder: 'rgba(37,99,235,.22)',
  toastWarnBorder: 'rgba(245,166,35,.35)',

  // M15's Log out `.btn-secondary` — the one button that borrows a danger hairline.
  dangerLine: 'rgba(220,38,38,.30)',

  // .filechip icon well, .unitchip.oos
  fileIcon: 'rgba(37,99,235,.10)',
  unitOos: { bg: 'rgba(220,38,38,.10)', border: 'rgba(220,38,38,.28)' },

  // .stat-ic wells (M18 home)
  statPending: 'rgba(100,116,139,.14)',
  statProgress: 'rgba(37,99,235,.12)',
  statDone: 'rgba(22,163,74,.13)',
  statOverdue: 'rgba(220,38,38,.10)',

  // Overlays
  scrim: 'rgba(15,30,46,.42)', // .scrim-bg
  photoBadge: 'rgba(15,30,46,.62)', // .pdel / .thumb .del
  photoOverlay: 'rgba(15,30,46,.5)', // .thumb .ov
} as const;

/**
 * M1-launch is the only frame with a navy ground, so the whites it layers on
 * top live here rather than in the screen. Everything else is `colors.sel`
 * at an opacity, which is a style value, not a colour literal.
 */
export const splash = {
  /** `background-size:40px 40px` on the two 1px `--sel` line gradients. */
  gridPitch: 40,
  gridOpacity: 0.14,
  /** The 340px `radial-gradient` circle, `top:46%`. */
  glowSize: 340,
  glowTop: 0.46,
  glowStops: [
    { offset: '0%', opacity: 0.42 },
    { offset: '34%', opacity: 0.24 },
    { offset: '58%', opacity: 0.08 },
    { offset: '76%', opacity: 0 },
  ],
  /** The 120×3 progress track and its 40%-wide travelling bar. */
  trackWidth: 120,
  trackHeight: 3,
  barWidth: 48, // 40% of 120
  barFrom: -56,
  barTo: 120,
  track: 'rgba(255,255,255,.12)',
  caption: 'rgba(255,255,255,.35)',
} as const;

/** §1.2 — mobile radii. Do NOT unify with admin-web (16/20 there). */
export const radii = {
  r: 12,
  r2: 18,
  r3: 22,
  pill: 999,
} as const;

/** Fixed chrome heights read off the gallery CSS (§6.4). */
export const chrome = {
  statusBar: 54, // .sbar
  tabBar: 84, // .tbar
  tabBarPadding: { top: 10, horizontal: 6, bottom: 24 },
  topbarPadding: { top: 50, horizontal: 18, bottom: 12 }, // .topbar
  topbarLgPadding: { top: 56, horizontal: 18, bottom: 10 }, // .topbar.lg
  btnBarPadding: { top: 14, horizontal: 18, bottom: 20 }, // .btnbar
  buttonHeight: 50, // .btn
  iconButton: 38, // .iconbtn
  /** Opacity of a visible-but-locked control (§6.1 / §6.6). Never hide it. */
  lockedOpacity: 0.45,
} as const;

/** Icon pixel sizes read off the gallery CSS (§1.4 — do not guess). */
export const iconSize = {
  tab: 25, // .tb svg
  iconBtn: 19, // .iconbtn svg
  button: 18, // .btn svg
  input: 18, // .inwrap>svg and .inwrap .eye
  row: 20, // .row-ic svg
  meta: 14, // .jcard-meta svg
  err: 14, // .err svg
  photoDelete: 12, // .pdel svg
  step: 12, // .step .dot svg
  toast: 18, // .toast svg
  empty: 34, // .empty .ec svg
  stat: 20, // .stat-ic svg
} as const;

export const spacing = {
  screenH: 18, // the gallery's standard horizontal screen padding
  screenV: 16,
} as const;
