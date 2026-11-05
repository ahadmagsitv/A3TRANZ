export const colors = {
  navy: '#16324F',
  navyInk: '#14212E',
  navyDeep: '#0F1E2E',
  navyGlass: 'rgba(22,50,79,.06)',
  navyLine: 'rgba(22,50,79,.14)',

  amber: '#F5A623',
  amberInk: '#7A4A00',
  onAmber: '#14212E',
  amberTint: 'rgba(245,166,35,.14)',

  sel: '#2563EB',

  bg: '#F4F6F8',
  surface: '#FFFFFF',
  surface2: '#F8FAFC',
  surface3: '#EEF2F6',
  hairline: '#E2E8F0',
  border: '#CBD5E1',

  text: '#14212E',
  text2: '#5A6B7B',
  muted: '#94A3B8',
  placeholder: '#64748B',
  onNavy: '#FFFFFF',

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

  priHigh: '#DC2626',
  priMed: '#F5A623',
  priLow: '#64748B',

  mapBg: '#E7EDF3',
  mapInk: '#5F6A87',

  sideInk: '#9FB0C4',

  okBg: '#EAF7EF',
  infoBg: '#EAF1FD',
  warnBg: '#FDF1E1',
} as const;

export const tint = {
  cardPending: { bg: 'rgba(100,116,139,.08)', border: 'rgba(100,116,139,.20)' },
  cardProgress: { bg: 'rgba(37,99,235,.06)', border: 'rgba(37,99,235,.18)' },
  cardReview: { bg: 'rgba(245,166,35,.10)', border: 'rgba(245,166,35,.30)' },
  cardDone: { bg: 'rgba(22,163,74,.06)', border: 'rgba(22,163,74,.20)' },
  cardOverdue: { bg: 'rgba(220,38,38,.055)', border: 'rgba(220,38,38,.22)' },

  pillPending: 'rgba(100,116,139,.14)',
  pillProgress: 'rgba(37,99,235,.12)',
  pillReview: colors.amberTint,
  pillDone: 'rgba(22,163,74,.13)',
  pillOverdue: 'rgba(220,38,38,.12)',

  priHigh: 'rgba(220,38,38,.10)',
  priMed: colors.amberTint,
  priLow: colors.surface3,

  jtypeImp: { bg: 'rgba(37,99,235,.10)', border: 'rgba(37,99,235,.20)' },
  jtypeExp: { bg: colors.navyGlass, border: colors.navyLine },

  inspPass: { bg: 'rgba(22,163,74,.05)', border: 'rgba(22,163,74,.30)' },
  inspFail: { bg: 'rgba(220,38,38,.05)', border: colors.stOverdue },

  toastOkBorder: 'rgba(22,163,74,.25)',
  toastInfoBorder: 'rgba(37,99,235,.22)',
  toastWarnBorder: 'rgba(245,166,35,.35)',

  dangerLine: 'rgba(220,38,38,.30)',

  fileIcon: 'rgba(37,99,235,.10)',
  unitOos: { bg: 'rgba(220,38,38,.10)', border: 'rgba(220,38,38,.28)' },

  statPending: 'rgba(100,116,139,.14)',
  statProgress: 'rgba(37,99,235,.12)',
  statDone: 'rgba(22,163,74,.13)',
  statOverdue: 'rgba(220,38,38,.10)',

  scrim: 'rgba(15,30,46,.42)',
  photoBadge: 'rgba(15,30,46,.62)',
  photoOverlay: 'rgba(15,30,46,.5)',
} as const;

export const splash = {
  gridPitch: 40,
  gridOpacity: 0.14,
  glowSize: 340,
  glowTop: 0.46,
  glowStops: [
    { offset: '0%', opacity: 0.42 },
    { offset: '34%', opacity: 0.24 },
    { offset: '58%', opacity: 0.08 },
    { offset: '76%', opacity: 0 },
  ],
  trackWidth: 120,
  trackHeight: 3,
  barWidth: 48,
  barFrom: -56,
  barTo: 120,
  track: 'rgba(255,255,255,.12)',
  caption: 'rgba(255,255,255,.35)',
} as const;

export const radii = {
  r: 12,
  r2: 18,
  r3: 22,
  pill: 999,
} as const;

export const chrome = {
  statusBar: 54,
  tabBar: 84,
  tabBarPadding: { top: 10, horizontal: 6, bottom: 24 },
  topbarPadding: { top: 50, horizontal: 18, bottom: 12 },
  topbarLgPadding: { top: 56, horizontal: 18, bottom: 10 },
  btnBarPadding: { top: 14, horizontal: 18, bottom: 20 },
  buttonHeight: 50,
  iconButton: 38,
  lockedOpacity: 0.45,
} as const;

export const iconSize = {
  tab: 25,
  iconBtn: 19,
  button: 18,
  input: 18,
  row: 20,
  meta: 14,
  err: 14,
  photoDelete: 12,
  step: 12,
  toast: 18,
  empty: 34,
  stat: 20,
} as const;

export const spacing = {
  screenH: 18,
  screenV: 16,
} as const;
