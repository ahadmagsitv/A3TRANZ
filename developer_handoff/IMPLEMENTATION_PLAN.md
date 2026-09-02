# A3TRANZ — Implementation Plan

**Two standalone projects.** `mobile-app/` (React Native CLI, TypeScript) and `admin-web/` (Next.js, TypeScript), as sibling folders of `developer_handoff/` under `/Users/techplanet/Documents/ahad/A3TRANZ/`.

**Source of truth, in priority order:**
1. `a3tranz-mobile-all.html` / `a3tranz-admin-all.html` — markup + CSS. Copy rule bodies, do not re-derive them.
2. `a3tranz-demo.html` — the flow graph (654 `data-goto` attributes across 69 frames). This is the interaction spec.
3. `A3TRANZ-Design-Scope.pdf` — business rules, RBAC, payroll model, deferred items.

Where the PDF and the HTML disagree, **the HTML wins for pixels, the PDF wins for rules**. Four disagreements were found and are logged in §8.

**Frontend-only.** No backend exists or is specified. Every project ships a mock data layer behind a per-domain repository interface. No real API work is planned here.

---

## 1 · Shared design tokens

### 1.1 The canonical block

Verbatim from `:root` in both galleries. **Nothing may hardcode a colour outside this list.** Verified: zero hex literals outside `:root` in either file, except `#fff` / `#000` device chrome and the `#20262E` gallery canvas (gallery scaffolding — dropped).

| Token | Value | Usage |
|---|---|---|
| `--navy` | `#16324F` | Primary brand, primary button fill |
| `--navy-ink` | `#14212E` | Device bezel, deepest ink |
| `--navy-deep` | `#0F1E2E` | Pressed states, **desktop sidebar fill** |
| `--navy-glass` | `rgba(22,50,79,.06)` | Subtle navy wash |
| `--navy-line` | `rgba(22,50,79,.14)` | Navy hairline |
| `--amber` | `#F5A623` | Accent — **fills only**. Key CTA, FAB, priority-med |
| `--amber-ink` | `#7A4A00` | The **only** amber usable as text on white (7.5:1) |
| `--on-amber` | `#14212E` | Navy text placed on an amber fill (8:1) |
| `--amber-tint` | `rgba(245,166,35,.14)` | Amber pill background |
| `--sel` | `#2563EB` | Selected / active nav — **blue, never amber** |
| `--bg` | `#F4F6F8` | App background |
| `--surface` | `#FFFFFF` | Card surface |
| `--surface-2` | `#F8FAFC` | Table headers, hovers |
| `--surface-3` | `#EEF2F6` | Icon wells, chat input fill |
| `--hairline` | `#E2E8F0` | Card borders |
| `--border` | `#CBD5E1` | Input borders |
| `--text` | `#14212E` | All primary text (~16:1) |
| `--text-2` | `#5A6B7B` | All secondary copy (5:1) |
| `--muted` | `#94A3B8` | **Non-text only** — dividers, disabled, inert marks (2.6:1) |
| `--placeholder` | `#64748B` | Input placeholders (4.8:1) |
| `--st-pending` | `#64748B` | Queued / not started |
| `--st-progress` | `#2563EB` | In progress |
| `--st-review` | `#F5A623` | Awaiting admin approval |
| `--st-done` | `#16A34A` | Closed / approved |
| `--st-overdue` | `#DC2626` | Overdue · defect · out of service |
| `--st-pending-ink` | `#3E4C5A` | Pill text on pending tint |
| `--st-progress-ink` | `#1E4FB8` | Pill text on progress tint |
| `--st-review-ink` | `#7A4A00` | Pill text on review tint |
| `--st-done-ink` | `#137A3A` | Pill text on done tint |
| `--st-overdue-ink` | `#B4232B` | Pill text on overdue tint |
| `--pri-high` | `#DC2626` | Priority high |
| `--pri-med` | `#F5A623` | Priority medium |
| `--pri-low` | `#64748B` | Priority low |
| `--map-bg` | `#E7EDF3` | Map placeholder fill (behind the live embed) |
| `--map-ink` | `#5F6A87` | Map placeholder ink |
| `--side-ink` | `#9FB0C4` | Sidebar inactive item text |
| `--ok-bg` | `#EAF7EF` | `toast-ok` background |
| `--info-bg` | `#EAF1FD` | `toast-info` background |
| `--warn-bg` | `#FDF1E1` | `toast-warn` background |
| `--r` | `12px` | Base radius |
| `--rp` | `999px` | Pill radius |
| `--shadow-sm` | `0 1px 2px rgba(15,30,46,.06), 0 0 0 1px var(--hairline)` | Cards |
| `--shadow-md` | `0 6px 20px rgba(15,30,46,.10)` | Raised |
| `--shadow-lg` | `0 16px 44px rgba(15,30,46,.16)` | Modals, sheets |

### 1.2 The four tokens that are NOT shared — do not "unify" them

The PDF §9.2 prints one set of radii. **The two galleries actually differ.** Reproduce each surface's own values or every card on one surface will be 2px off.

| Token | `mobile-app` | `admin-web` |
|---|---|---|
| `--r2` | `18px` | `16px` |
| `--r3` | `22px` | `20px` |
| `--f` | `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif` | `'Inter', -apple-system, system-ui, sans-serif` |
| `--fd` | `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Outfit', system-ui, sans-serif` | `'Outfit', -apple-system, system-ui, sans-serif` |

PDF §9.2 states `--r2 · --r3 = 18px · 22px` — that is the **mobile** value. The admin gallery is 16/20. The galleries are the source of truth for pixels; use them.

### 1.3 Type

- **Weights required.** Inter: 400, 500, 600, 700. Outfit: 500, 600, 700, 800, 900. (`.topbar h1` and `.card-h h3` use Outfit 800; `.money-lg` uses 900 in places — bundle the whole set, it is ~8 files.)
- **`font-variant-numeric: tabular-nums` on every number.** Money, job IDs, unit IDs, container numbers, timestamps, counts, KPI values, chart legend values.
- **ID formats:** jobs `#A3-0421`, trucks `TRK-118`, chassis `CH-4402`, containers ISO `MSCU-441028-3`, seals `SL-778142`, J1 tickets `J1-2288-1104`, chassis return `CR-4402-8871`.
- Headings ≤ 6 words.

### 1.4 Icons — Lucide, exact set

**63 distinct names** across both galleries (46 mobile, 50 admin, 33 shared). Rendered at 18–22px in the galleries; `.nav-i svg` is 19px, `.tb svg` is 25px (tab bar), `.rowact svg` is 17px, `.errmsg svg` is 14px, `.pdel svg` is 12px. Read the size off the CSS rule, do not assume.

```
alert-circle alert-triangle banknote bar-chart-3 bell bell-off briefcase building-2
calendar camera check check-check check-circle-2 chevron-down chevron-left chevron-right
circle-slash clipboard-check clock container download eye file-text filter-x flag hash
history home info layout-dashboard loader loader-2 lock log-out mail mail-check map-pin
message-square more-horizontal navigation paperclip pause pencil phone play plus
plus-circle refresh-cw search search-x send settings shield-alert trash-2 trending-up
truck upload user user-plus user-x users wrench x
```

Mobile-only: `alert-circle bell-off calendar chevron-right history home log-out navigation play plus-circle trash-2 loader-2`
Admin-only: `bar-chart-3 chevron-down circle-slash filter-x layout-dashboard loader more-horizontal pause pencil phone search-x settings shield-alert trending-up user-plus user-x wrench`

Sidebar mapping (fixed order, §6.1): Dashboard `layout-dashboard` · Jobs `briefcase` · Customers `building-2` · Drivers `users` · Fleet **`container`** (not `truck`) · Payroll `banknote` · Messages `message-square` · Reports `bar-chart-3` · Settings `settings`.

### 1.5 Maps — three live embeds, that is all

Only **three** frames carry an `<iframe>`. Everything else classed `.map` is a CSS grid placeholder and stays a placeholder.

| Frame | Embed URL |
|---|---|
| `M7-default` | `https://maps.google.com/maps?q=4200+Clay+St%2C+Houston%2C+TX+77023&output=embed` |
| `W5-detail-timeline` | `https://maps.google.com/maps?q=500+Meyerland+Plaza%2C+Houston%2C+TX&output=embed` |
| `W5-dispatcher-view-rbac` | same as W5-detail-timeline |

The `q=` string must match the address rendered beside it. `pointer-events:none` is set deliberately so a long page still scrolls — **keep it on mobile** (a WebView inside a ScrollView will otherwise eat the scroll gesture); on web, drop the declaration only if the client asks for an interactive map.

### 1.6 Mechanically-verified invariants (already true in the design — keep them true)

- `backdrop-filter` / `blur(` → **zero hits** in both files. Confirmed. No glass, no scrims behind text.
- Photos live inside solid cards as bounded thumbnails, never as backgrounds.
- Status is carried by colour + label, never translucency.
- Charts use `conic-gradient` (donut) and flex `<div>` columns (bars). **No chart library is needed and none should be added.**
- Only two `@keyframes` exist: `shim` (skeleton shimmer) and `spin`. There are **zero** `@media` queries in the admin gallery — see §8 Q4.

---

## 2 · Project scaffolding

### 2.1 `mobile-app/` — React Native CLI, TypeScript

```bash
cd /Users/techplanet/Documents/ahad/A3TRANZ
npx @react-native-community/cli@latest init A3TranzDriver --directory mobile-app
```
TypeScript is the default template since RN 0.71 — do not pass a template flag. Set `"strict": true` in `tsconfig.json`.

**Dependencies — each one earns its place.**

| Package | Why it is required | What it replaces |
|---|---|---|
| `@react-navigation/native` + `native-stack` + `bottom-tabs` | 5-tab bottom bar (§5) plus ~20 pushed screens with back chevrons. Nothing in RN core does this. | Hand-rolled navigator |
| `react-native-screens`, `react-native-safe-area-context` | Hard peer deps of the above. `safe-area-context` also gives the real values behind `.sbar` (54px) and `.hind`. | — |
| `zustand` | The 4-step capture flow is one shared mutable state machine read by 12 frames. Photo capture on M22 must not re-render the job list. | Context + `useReducer` — viable, but fans out re-renders across the whole capture stack. If the team objects to the dep, Context is an acceptable downgrade; say so before starting M-06. |
| `lucide-react-native` + `react-native-svg` | 63 exact Lucide glyphs. Hand-porting 63 SVG paths is strictly worse. | — |
| `react-native-webview` | PDF §10.4 mandates a **live** Google Maps embed. RN has no `<iframe>`. One screen (M7). | — |
| `react-native-image-picker` | The photo slots need a real image URI to render a captured thumbnail. `launchCamera` + `launchImageLibrary` in one small dep, no custom camera UI required. | `react-native-vision-camera` — **rejected**: no frame in the design shows a custom camera viewfinder, so its build complexity buys nothing. |

**Explicitly rejected, do not install:**
- `axios`, `@tanstack/react-query` — there is no API. Add them the day a backend contract exists, at the repository boundary only.
- `react-hook-form` / `formik` — three forms exist (M2 login, M3 reset, M16 change password), max 3 fields each. `useState` is smaller.
- `react-native-reanimated` — the design has two animations, both trivial (skeleton shimmer, spinner rotation). `Animated` covers both.
- `styled-components` / NativeWind — the design is a StyleSheet-shaped problem; a CSS-in-JS layer adds a translation step where pixel drift creeps in.
- Any i18n, analytics, or crash-reporting library — not requested, no frames.

**Fonts.** No CDN in RN. Bundle `Inter` (400/500/600/700) and `Outfit` (500/600/700/800/900) TTFs to `assets/fonts/` for **both iOS and Android** (§8 Q3 — resolved, matches admin-web exactly), declare in `react-native.config.js`, run `npx react-native-asset`.

**Folder structure.**
```
mobile-app/
  src/
    theme/
      tokens.ts            # §1.1 + mobile §1.2 overrides. The ONLY place a hex appears.
      typography.ts        # font families, weights, tabular-nums helper
      shadows.ts           # --shadow-sm/md/lg as RN elevation + shadow props
    components/            # 1:1 with the gallery class names
      StatusPill.tsx       # .spill  (sp-pending/progress/review/done/overdue)
      PriorityTag.tsx      # .pri
      JobTypeChip.tsx      # .jtype  (imp/exp; .emt exists but is DEFERRED — do not render)
      Stepper.tsx          # .stepper/.step  four nodes, no more
      InspectionRow.tsx    # .insp  + .inote
      PhotoSlot.tsx        # .pslot / .blank / .pdel / .pk
      EvidenceField.tsx    # .evid  (a number + its photo)
      LegRow.tsx           # .legrow / .legtotal  — READ-ONLY on mobile
      Money.tsx            # .money / .money-lg  — tabular, --text ink, never green/amber
      Toast.tsx            # .toast -ok/-info/-warn/-err
      Button.tsx           # .btn -primary/-amber/-secondary/-ghost/-danger/-block
      UnitChip.tsx         # .unitchip / .oos
      Sheet.tsx            # .sheet + .scrim-bg
      Empty.tsx            # .empty / .ec
      JobCard.tsx          # .jcard status-tinted
      Row.tsx              # .row / .row-ic / .row-b
      Thumb.tsx            # .thumb / .del / .ov / .progress
      FileChip.tsx         # .filechip
      Segmented.tsx        # .seg
      StatCard.tsx         # .stat / .home-*
      ChatBubble.tsx       # .bubble / .b-me / .b-them
      ChatRow.tsx          # .chatrow / .unread
      MapEmbed.tsx         # WebView wrapper, pointerEvents none
    navigation/
      RootNavigator.tsx    # auth stack | app tabs
      TabNavigator.tsx     # .tbar — Home · Jobs · Alerts · Chat · Profile
    features/<domain>/screens/…
    data/
      contracts/           # ← the swap point. One interface per domain.
      mock/                # in-memory implementations + the state machine
      fixtures.json        # SHARED with admin-web — see §3.3
  assets/fonts/
```

### 2.2 `admin-web/` — Next.js, TypeScript

```bash
cd /Users/techplanet/Documents/ahad/A3TRANZ
npx create-next-app@latest admin-web --typescript --app --eslint --src-dir \
  --no-tailwind --import-alias "@/*"
```

**`--no-tailwind` is deliberate and is the single most important call in this plan.** The admin gallery is ~1,100 lines of hand-written, token-driven CSS that already renders the target exactly. Re-expressing it as utility classes is a pure translation task with a guaranteed pixel-drift cost and zero upside. **Copy the gallery `<style>` block into `src/app/globals.css` verbatim**, delete only the gallery scaffolding (`.gallery`, `.frame-wrap`, `.frame-label`, `.frame-state`, `.board-*`, `.sect*`, `.protobar`, `.flash`, `.hot`), and keep every rule after it. Pixel parity then holds by construction rather than by inspection.

Use CSS Modules for anything genuinely new. There should be very little.

**Dependencies.**

| Package | Why |
|---|---|
| `lucide-react` | Same 63-glyph set, official React package. |
| `next/font/google` (built in) | Inter 400/500/600/700 + Outfit 500/600/700/800/900, self-hosted, no CDN request, `display: swap`. |

**That is the entire dependency list.** Justifications for what is absent:
- **No Tailwind** — above.
- **No chart library** — donuts are `conic-gradient`, bars are flex divs. Confirmed in the CSS.
- **No table library** (TanStack Table, AG Grid) — `.dtable` is a plain `<table>` with a static-page pager (`.pg`). Sorting/virtualisation are not in any frame.
- **No state library** — the mock store is a module with `subscribe()`, consumed via React's built-in `useSyncExternalStore`. Zero deps, correct tearing semantics.
- **No form library** — 16 `<select>` + 36 `<input>` across 30 frames, all uncontrolled-or-simple. `useState` per modal.
- **No date library** — every date in the design is a pre-formatted string. Add one only if the client asks for a real date picker; `<input type="date">` covers W4's Start/Due today.
- **No auth library** — W1 is a mock login against a role fixture.

**Folder structure.**
```
admin-web/
  src/
    app/
      globals.css                 # ← the gallery stylesheet, verbatim, minus scaffolding
      tokens.css                  # the :root block (imported first by globals.css)
      layout.tsx                  # <html> + next/font + AppShell
      login/page.tsx              # W1 — renders outside AppShell
      (app)/
        layout.tsx                # .web > .side + .main > .tbar-w + .content
        page.tsx                  # W2  dashboard
        jobs/page.tsx             # W3
        jobs/[id]/page.tsx        # W5, W6, W22
        customers/…               # W14 W15 W16
        drivers/…                 # W7 W8 W9
        fleet/…                   # W17 W18
        payroll/…                 # W19 W20 W21
        messages/page.tsx         # W10
        reports/page.tsx          # W11
        notifications/page.tsx    # W12
        settings/roles/page.tsx   # W13
    components/                   # 1:1 with gallery classes (see mobile list; admin adds:)
      Sidebar.tsx  Topbar.tsx  DataTable.tsx  FilterBar.tsx  Modal.tsx  Drawer.tsx
      Skeleton.tsx Timeline.tsx  Donut.tsx  Bars.tsx  Legend.tsx  Kpi.tsx
      PayGroup.tsx PayLine.tsx  PermissionList.tsx  Toggle.tsx  EmptyState.tsx
      Pager.tsx    RoleGate.tsx   ← the RBAC wrapper, see §6.6
    data/ contracts/ mock/ fixtures.json
    lib/rbac.ts
```

### 2.3 The repository contract — the one abstraction this plan allows

Eight domains: `jobs · drivers · customers · fleet · payroll · chat · notifications · auth`. Each gets **one** interface file and **one** mock implementation. UI components never import from `data/mock/` — only from `data/contracts/`.

```ts
// data/contracts/jobs.ts — shape is identical in both projects
export interface JobsRepo {
  list(filter?: JobFilter): Promise<Job[]>;
  get(id: string): Promise<Job | null>;
  // mobile only
  advance(id: string, step: JobStep): Promise<Job>;
  capturePhoto(id: string, step: JobStep, slot: number, uri: string): Promise<Job>;
  deletePhoto(id: string, step: JobStep, slot: number): Promise<Job>;
  submit(id: string): Promise<Job>;
  // web only
  create(draft: JobDraft): Promise<Job>;
  approve(id: string): Promise<Job>;
  sendBack(id: string, reason: string): Promise<Job>;
}
```

Rules:
- One interface per domain, one implementation each. **No factory, no DI container, no adapter layer.** The swap is a one-line import change per domain when the API lands.
- The mock is `async` and `await`s a 200–400ms delay so the skeleton (`W3-loading`) and spinner (`M2-signing-in`) states are actually reachable and testable. A mock that resolves synchronously makes loading states dead code.
- The mock throws on the error paths so `M2-error`, `W1-error`, `W4-validation-error` are reachable rather than hand-placed.

---

## 3 · Build order

### 3.1 Validating the PDF's suggested order

PDF §12.3 suggests: auth+shell → job list/detail → 4-step capture with gates → admin approval → customers/fleet → payroll → reports.

**Accepted, with three corrections:**

1. **A phase 0 is missing.** Tokens, fonts, icons and the ~25 shared primitives must exist before any screen. Building M2 first means building `Button`, `Toast`, `Input` inline and refactoring later. Half a day up front saves a rewrite.
2. **"Admin approval" is not a phase-4 dependency.** The two projects have separate mock layers and share only a fixture file. After Phase 0, **mobile and admin are two fully parallel tracks** and should be run as such. Sequencing admin behind the mobile capture flow serialises work that has no shared file.
3. **Customers/fleet should move earlier on the admin track.** `W4-import-export` (create job) has a Customer `<select>`, a Vehicle `<select>` and a Chassis `<select>`. Building the create-job modal before the customer and fleet fixtures exist means stubbing those dropdowns twice.

### 3.2 Phases

```
PHASE 0  SHARED FOUNDATION  (serial, blocks everything)
  S-01 tokens + type + icon set, both projects
  S-02 fixtures.json — one coherent dataset, copied into both
  S-03 repository contracts (8 interfaces), identical shapes
  S-04 primitive components, per project

         ┌──────────────────────────────┬──────────────────────────────┐
PHASE 1  │ MOBILE TRACK                 │ ADMIN TRACK                  │  ← run in PARALLEL
         │ M-01 shell + tab navigator   │ W-01 shell (sidebar+topbar)  │
         │ M-02 auth (M1 M2 M3)         │ W-02 auth + RBAC engine (W1) │
PHASE 2  │ M-03 jobs list (M4 M5 M6)    │ W-03 customers + fleet        │
         │ M-04 home (M18)              │ W-04 drivers                  │
         │ M-05 job detail (M7 M8)      │ W-05 jobs table (W3)          │
PHASE 3  │ M-06 STATE MACHINE  ★        │ W-06 create/edit job (W4) ★   │
         │ M-07 capture flow M19–M23    │ W-07 job detail + timeline W5 │
PHASE 4  │ M-08 chat + notes + alerts   │ W-08 approve job (W22) ★      │
         │ M-09 earnings (M24 M25)      │ W-09 messages + notifications │
PHASE 5  │ M-10 profile (M15 M16 M17)   │ W-10 payroll (W19 W20 W21)    │
         │                              │ W-11 reports (W11)            │
         │                              │ W-12 roles & access (W13)     │
         └──────────────────────────────┴──────────────────────────────┘
PHASE 6  QA GATES — §7 checklist run against BOTH projects
```
★ = highest-risk items. Build M-06 and W-06 early enough that the questions they raise (§8) still have time to be answered.

**Risk ordering rationale.** The 4-step evidence gate (M-06/M-07) and the create-job leg-split validator (W-06) are where the product's real logic lives; everything else is presentation. The PDF is right that these must come early. Payroll and reports are last because they are read-only renderings of data the earlier phases define.

### 3.3 `fixtures.json` — one dataset, two copies

The demo must tell one story across both surfaces. Job `#A3-0421` ("Container pickup — Terminal B", Gulf Coast Logistics LLC, driver John Reyes, container `MSCU-441028-3`, seal `SL-778142`, truck `TRK-118`, chassis `CH-4402`, price $120.00 split across three legs) must be the same job on both. Extract the fixture from the gallery markup once and copy the file into both projects. It is a copied static asset, not a shared package — two standalone repos was the requirement.

---

## 4 · Mobile screen tasks — all 39 frames

Chrome column: **T** = 5-tab bar present · **B** = fixed `.btnbar` bottom button · **C** = `.chatbar` compose · **L** = `.topbar.lg` large title · **S** = sheet + scrim.

| Task | Frame(s) | Screen | States built | Chrome | Notes |
|---|---|---|---|---|---|
| M-02a | `M1-launch` | Splash | Launch | — | Brand mark only. Auto-advance → M2. |
| M-02b | `M2-default` `M2-error` `M2-signing-in` | Login | Default · **Error** · Signing in | — | 2 inputs, eye toggle (`.haseye`). Error = `.toast-warn` + `.err` on the field. Signing-in = `.spin` in the button. |
| M-02c | `M3-request` `M3-link-sent` | Reset password | Request · Link sent | — | 1 input. Link-sent is a full `.empty` state, not a toast. |
| M-04 | `M18-dashboard` | Home | Greeting · this-week earnings · up-next job · status stat cards | **T** | Entry tab. Earnings card → M24. |
| M-03 | `M4-default` `M4-empty` `M5-default` `M6-default` | Jobs — Pending / In Progress / Completed | Default · **Empty** (pending only) | **T L** | One screen, `.seg` segmented control switches three lists. Only Pending has an empty frame — reuse `.empty` for the other two (see §8 Q6). |
| M-05a | `M7-default` | Job detail | Default | **B** | The hub. Customer, `.jtype`, `.unitchip`, four-node `.stepper`, **your legs** (`.legrow` read-only), **live map WebView**, dates, instructions, `.filechip` attachments. Outbound: M4, M12, M8, M19. |
| M-05b | `M8-photos-docs` | Attachments | Photos + docs | — | `.thumbs` grid with `.del` corner badges + `.filechip` rows. Delete → M20-delete-confirm sheet. |
| M-05c | `M9-sheet` `M9-submitted` | Status update | Sheet · Submitted | **S** | **Orphaned in the flow graph — see §8 Q6.** Build only if confirmed. |
| M-05d | `M10-uploading` | Upload work | Uploading | **B** | `.dropzone` + `.thumbs` with `.ov` % overlay + `.progress` bar + a `<textarea>`. Reached from every `.pslot` tap. |
| M-06 | — | **Job state machine** | — | — | Not a screen. See §6.1. |
| M-07a | `M19-8-of-12-checked` `M19-all-pass` `M19-defect-found` | ① Pre-trip inspection | 8 of 12 · All pass · **Defect found (job blocked)** | **B** | 12 `.insp` rows, Pass/Defect. A Defect docks a **required** `.inote` textarea beneath the row (row loses its bottom radius). One defect blocks the job and flags the unit out of service. **A ✗ with no note is an invalid state.** |
| M-07b | `M20-capturing` `M20-photos-captured` `M20-delete-confirm` | ② Confirm pickup | Capturing (1 of 2, locked) · Captured (2 of 2) · **Delete photo?** | **B** (+**S** on delete) | 2 `.pslot`: `1 · Chassis + container no.`, `2 · Seal in hand`. Plus the **Seal number `.evid`** — now a real controlled text input (§8 Q1, resolved). Button locked at `opacity:.45` + `lock` until 2 photos **and** a non-empty seal number. |
| M-07c | `M21-confirm-load` | ③ Confirm load | Photos captured (3 of 3) | **B** | 3 `.pslot`: `1 · Seal + chassis no.`, `2 · Bill of lading`, `3 · Load, doors open`. |
| M-07d | `M22-capturing` `M22-complete` | ④ Confirm delivery | Capturing (3 of 4, submit locked) · Ready to submit (4 of 4) | **B** | 4 `.pslot`: `1 · Container + chassis`, `2 · Seal in hand` (the **cut** seal — never collapse with the pickup shot), `3 · J1 ticket`, `4 · Chassis return ticket`. |
| M-07e | `M23-submitted` | Submitted | Awaiting approval | **B** | Result state, **not a step**. `.spill sp-review`, `.dcard` summary with `.krow`, `.money`. Customer email fires **here**, on submit. |
| M-09a | `M24-pending` `M24-paid` | Earnings | **Pending (default)** · Paid | — | `.seg` tabs. Pending is default — a driver's first question is "what am I owed?". `.money-lg`, `.perrow` period rows. Hold-rule info toast on both tabs, rendered **literally**: period closes Sunday, pays the following Friday. |
| M-09b | `M25-statement-detail` | Earnings statement | Per-job leg lines | **B** | `.dcard` + `.krow` + `.legtotal`. Read-only. |
| M-08a | `M27-list` | Chats | History — job-scoped threads, unread badges | **T L** | Chat tab root. Never opens a single thread directly. |
| M-08b | `M12-with-admin` | Job chat | With admin | **C** | `.chat-ctx` job header → M13. `.chatwrap` bubbles + `.b-att` image attachment. |
| M-08c | `M13-default` | Job notes | Default | **C** | `.row` list, attributed + timestamped. Same compose bar as chat. |
| M-08d | `M14-list` `M14-empty` | Notifications | List · **Empty** | **T L** | Alerts tab. Rows link to their job. |
| M-10a | `M15-default` `M15-confirm` | Profile | Default · Log out confirm | **T L** (+**S**) | `.avatar`, earnings row → M24, rows → M16 / M17, log-out `.sheet` with `.btn-danger`. |
| M-10b | `M16-default` | Change password | Default | — | 3 inputs, all `.haseye`. |
| M-10c | `M17-list` `M17-empty` | Job history | List · **Empty** | — | `.jcard st-done` stack. |

**Not built:** `M11` (generic checklist — removed; the DOT inspection is the only checklist), `M26` (empty pickup — deferred, §11.1). `.jtype.emt` CSS may be carried for restorability but **must never render**.

### 4.1 Tab bar — five, fixed

Home · Jobs · Alerts · Chat · Profile. `.tbar` is 84px tall, `padding: 10px 6px 24px`, `.tb svg` 25px, active = `--sel` blue. Present on exactly nine frames: M18, M4, M4-empty, M5, M6, M27, M14, M14-empty, M15. Every other frame is a stack push with a `chevron-left` `.iconbtn`. Earnings is **not** a tab — reached from the Home card and a Profile row.

---

## 5 · Admin screen tasks — all 30 frames

| Task | Frame(s) | Screen | States built | Notes |
|---|---|---|---|---|
| W-02a | `W1-role-based` `W1-error` | Login | Default · **Error** | `.login-split` — hero + form, renders **outside** the app shell. Role is chosen at login and drives everything downstream. Error = `.toast-err` + `.errmsg` + `.bad` field. |
| W-01 | — | App shell | — | `.web` 1440×1024 → `.side` 240px `--navy-deep` + `.main` → `.tbar-w` 64px + `.content` (the only scrolling region). Nine sidebar items, fixed order, active = `.on` = `--sel` blue fill, **never amber**. |
| W-02b | — | RBAC engine | — | Not a screen. See §6.6. |
| W-05a | `W2-overview` | Dashboard | KPIs · driver activity · recent jobs | `.kpi-row`, `.donut` (jobs by type — **no Empty slice**), `.spill` job rows. |
| W-05b | `W3-table-filters` `W3-filtered-no-results` `W3-loading` `W3-empty` | Jobs — table + filters | Default · Filtered no-results · **Loading (skeleton)** · **Empty** | Four distinct states. Loading is `.skel` shimmer, **never a spinner on a blank page**. No-results uses `search-x` + a "clear filters" action (`filter-x`); Empty uses a create CTA. `.filterbar` + `.search` + `.chipf` + `.pg` pager. |
| W-06 | `W4-import-export` `W4-validation-error` | Create / edit job card | Import / Export · **Validation error** | **One scrolling card**, `max-height:88%`, body scrolls, never split across two screens. Fixed field order: Job type → Customer → Job title → Description → Container no. → Pickup / Delivery location → Start / Due date → Priority → **Job price (total + legs)** → Vehicle & equipment → Notify → Attachments. Import and Export share **one** form; the `.jtype` chip records which run it is and changes nothing. See §6.4 for the leg validator. |
| W-07a | `W5-detail-timeline` `W5-dispatcher-view-rbac` | Job detail + timeline | Detail + timeline · **Dispatcher view (RBAC)** | Pre-trip inspection card, driver capture by step (`.pslot`, **read-only, no `.pdel`**), job notes, attachment history tagged by step, `.timeline` with `.tl-i` dot colours, **live map iframe**. The RBAC variant is the same page with blocked actions at `opacity:.45` + `lock`. |
| W-07b | `W6-thread` | Job chat thread | Thread | `.bubble` `.b-me` `.b-them`, mirrors M12. |
| W-08 | `W22-notify-customer` | **Approve job** | Evidence review · email record · approve & close · send-back warning | The closeout gate. "Numbers on this job" card (container no. — office; seal no. — driver, at Confirm pickup, now editable per §8 Q1; a line stating ticket numbers are photographed, not keyed). All **9 of 9** stage photos, grouped and labelled by step. The **already-sent** customer email rendered in full — template reworded per §8 Q2 (resolved): no ticket-number literals, "Container returned and chassis returned; 9 photos are attached." Send-back carries the warning: the customer was already told the job is complete. |
| W-04a | `W7-list` | Drivers | List | `.mini-av`, `.tag-act` / `.tag-inact`. |
| W-04b | `W8-profile-history` `W8-confirm` | Driver detail | Profile + history · **Deactivate confirm** | Confirm is a `.modal` over `.scrim-bg`. |
| W-04c | `W9-modal` | Add driver | Modal | Drivers are **added by an admin, never self-registered**. |
| W-09a | `W10-inbox` | Messages | Inbox + open thread | Two-pane: `.thread` list + bubbles. |
| W-11 | `W11-charts-export` | Reports | Charts + CSV/Excel export | `.bars` + `.donut` + `.legend` + `.kpi`. **Tokenised CSS, no chart library.** Legend values tabular. |
| W-09b | `W12-list` | Notifications | List | `.notif-row`. |
| W-12 | `W13-team` | Roles & access | Team | Members table + `.perm` capability lists. **Five role labels, three distinct capability sets** — see §6.6. |
| W-03a | `W14-list` | Customers | List | Row `.togg` = per-customer completion-email opt-in. |
| W-03b | `W15-profile-jobs` | Customer detail | Profile + jobs + notification prefs | |
| W-03c | `W16-modal` | Add customer | Modal | Also reachable inline from W4's "+ Add a new customer". |
| W-03d | `W17-units` | Fleet — units | Trucks + chassis | `.unitchip` + `.oos`. |
| W-03e | `W18-out-of-service` | Fleet unit detail | **Out of service** — defect banner, inspection history | Reads the driver's defect note, **quoted and attributed, never editable**. This is the legal record of why a unit went out of service. |
| W-10a | `W19-pay-periods` | Payroll — pay periods | Weekly / bi-weekly, hold banner, KPIs | Hold rule stated literally in an info toast. |
| W-10b | `W20-detail-by-driver` | Payroll — period detail | Grouped by driver, leg-level lines | `.paygrp` / `.payline`. Amounts editable **here only** (web), never on mobile. |
| W-10c | `W21-confirm` `W21-paid` | Payroll — mark as paid | Confirm · **Paid (date + reference)** | Records that a payment happened **elsewhere**. Never moves money, never collects bank or card details. |

**Every list, form and auth screen ships error, loading and empty states.** The 30 frames already contain them for W1, W3 and W4 — port those; for W7, W10, W12, W14, W17, W19 reuse the same `.skel` / `.empty-w` / `.toast-err` patterns rather than inventing new ones.

---

## 6 · Cross-cutting work

### 6.1 The job state machine (M-06) — build this once, in `data/mock/jobStateMachine.ts`

```
PENDING ──① PRE-TRIP (12/12 pass) ──▶ IN PROGRESS
        └─ any defect ─▶ BLOCKED + unit flagged out of service (defect REQUIRES a note)
IN PROGRESS ──② CONFIRM PICKUP (2 photos + seal no.)
            ──③ CONFIRM LOAD    (3 photos)
            ──④ CONFIRM DELIVERY(4 photos) ──▶ AWAITING APPROVAL
                                                 └─ customer email fires HERE, on driver SUBMIT
AWAITING APPROVAL ──admin approve (W22)──▶ DONE ──▶ each leg accrues to its driver's payroll
                  └─ admin send back ────▶ IN PROGRESS (customer was already told — warn)
```

Non-negotiable invariants, enforced in the machine, not in the screens:
- **Drivers can never set DONE.** Admin only.
- **OVERDUE is derived, never set** — past due and not Done.
- A step's primary button is **visible and locked** (`opacity:.45` + `lock` icon + "n of m" count beneath) until every slot is filled. **Never hidden, never removed.**
- **Deleting a photo re-opens the step** — the slot goes blank, the button re-locks. The confirm sheet must say so.
- A defect `✗` with no note is an invalid state and must be rejected at the machine boundary.
- Photo slots are individually labelled and ordered. **Never render an unlabelled thumbnail grid** — the office must be able to see *which* shot is missing.

The admin mock reflects the same statuses **read-only**. Two separate implementations of one written spec; put the spec in a shared `STATE_MACHINE.md` comment block at the top of both files so they cannot drift silently.

### 6.2 Photo capture / delete / confirm — shared logic (mobile)

One `usePhotoSlot(jobId, step, slotIndex)` hook backing `PhotoSlot`:
- **Blank** → dashed border, `camera` glyph, `plus-circle` mark, copy starts "Tap to capture". **No delete control** — nothing to remove.
- **Uploading** → `.thumb` with `.ov` percentage overlay. **No delete** — not yet uploaded.
- **Captured** → thumbnail, solid border, `check-circle-2` mark, `.pdel` badge.
- `.pdel` is a **22px badge in the top-right corner of the thumbnail**, not a trailing button — a trailing control steals ~38px from the text column and wraps the label at 393px. This is a deliberate layout decision; do not "improve" it.
- Delete **always confirms first**: bottom sheet, danger *Delete photo* + *Cancel*. Deleting evidence re-opens a gate, so it never happens on one tap.
- **The admin never gets a delete control.** A `.pdel` rendered inside W5 or W22 is a bug.

### 6.3 Keyboard handling — per screen (mobile)

Only seven mobile frames contain a real text control. Handle each explicitly; do not apply one blanket `KeyboardAvoidingView`.

| Screen | Control | Required behaviour |
|---|---|---|
| `M2` Login | 2 × `input` (email, password + eye) | `KeyboardAvoidingView` `padding` on iOS / `height` on Android. Email → `keyboardType="email-address"`, `autoCapitalize="none"`, `returnKeyType="next"` → password → `secureTextEntry`, `returnKeyType="go"` submits. |
| `M3` Reset password | 1 × `input` | Same. The screen is short; scroll is not needed, but the CTA must stay visible above the keyboard. |
| `M16` Change password | 3 × `input`, all `.haseye` | Scroll to the focused field. `returnKeyType` chains current → new → confirm. |
| `M19` Defect note | `textarea`, **required** | Docked under the failed `.insp` row. On focus, scroll the row **plus its note** into view as one unit — they read as one card. Multiline, no return-key submit. |
| `M10` Upload work | `textarea` | Multiline notes field under the dropzone. Scroll into view on focus. |
| `M12` Job chat | `.chatbar` compose | The compose bar is **pinned to the bottom of `.scr`** and must ride the keyboard. Message list stays scrolled to the newest item as the keyboard opens. |
| `M13` Job notes | `.chatbar` compose | Identical to M12. |
| `M20` Seal number | `input` inside `.evid` (§8 Q1, resolved) | Short field, same pattern as M3. `returnKeyType="done"`, dismisses keyboard, does not submit the step — the step button is a separate tap. |

Every screen with a fixed `.btnbar` (M7, M10, M19, M20, M21, M22, M23, M25) must keep that bar above the keyboard when a field is focused, or the locked-CTA affordance disappears at exactly the moment it matters.

### 6.4 Scroll regions — what scrolls, what does not

**Mobile.** `.scr` is `position:absolute; inset:0; flex-column; overflow:hidden` — the frame never scrolls. Exactly one child, `.scrl` (`flex:1; overflow-y:auto`), scrolls. Everything else is fixed chrome:
- `.sbar` (54px status bar) and `.island` — fixed overlay, `z-index` 90/100.
- `.topbar` — fixed, `padding: 50px 18px 12px` (the 50px absorbs the status bar). `.topbar.lg` = `56px 18px 10px`, 30px title, **no bottom border**.
- `.tbar` — fixed 84px, `z-index` 80.
- `.btnbar` — fixed bottom, `padding: 14px 18px 20px`, own top hairline.
- `.chatbar` — fixed bottom of `.scr`, rides the keyboard.
- `.hind` (home indicator) — fixed, `z-index` 100.
- `.sheet` + `.scrim-bg` — `z-index` 90/95, above everything except the indicator.

Content padding is per-screen and carried inline in the gallery (e.g. M20's `.scrl` is `padding:16px 18px 96px` — the 96px clears the `.btnbar`). **Read it off each frame.**

**Admin.** `.web` is `overflow:hidden`. `.side` and `.tbar-w` are fixed. `.content` (`flex:1; overflow-y:auto; padding:26px 28px 40px`) is the **only** scrolling region, with a visible 8px `--border` scrollbar thumb. Inside a modal, `.modal-b` scrolls while `.modal-h` and `.modal-f` stay fixed — that is what makes W4 "one scrolling card". `.drawer` is 480px, right-anchored, full height.

### 6.5 Responsive behaviour (admin web)

**The gallery contains zero `@media` queries.** The design is a fixed 1440×1024 artboard. Recommended default, applied unless the client says otherwise:

- Build the shell as **fluid, not fixed**: `.side` stays 240px, `.tbar-w` stays 64px, `.content` takes the remainder. At 1440 this is pixel-identical to the artboard; above 1440 the content column simply widens, which is what every card, table and grid in the CSS already does (they are `flex`/`grid`, not fixed-width).
- Set `min-width: 1280px` on `.web` with a horizontal scrollbar below that. There is no tablet or mobile admin design and inventing one is scope creep.
- Two components carry real fixed widths and must keep them: `.modal` (640px) and `.drawer` (480px).
- `.kpi-row` and `.grid-2` already reflow via `grid-template-columns` — leave them alone.

Flagged as §8 Q4 because "pixel-for-pixel at 1440×1024" and "responsive" are in tension and only the client can settle it.

### 6.6 RBAC — visible and disabled, never hidden

Five role labels resolve to **three** capability sets. W13 renders exactly three permission blocks; the PDF's five-row table collapses the same way.

| Capability | Admin / Manager | Assistant Manager | Project Manager / Dispatcher |
|---|:--:|:--:|:--:|
| Approve & close jobs | ✔ | ✔ | ✘ |
| Create & assign job cards | ✔ | ✔ | ✔ |
| Update job details & status | ✔ | ✔ | ✔ |
| Message drivers | ✔ | ✔ | ✔ |
| Manage customers & fleet | ✔ | ✔ | ✘ |
| Add & deactivate drivers | ✔ | ✘ | ✘ |
| Manage team & roles | ✔ | ✘ | ✘ |
| Payroll — view | ✔ | ✔ (view only) | ✘ |
| Payroll — mark as paid | ✔ | ✘ | ✘ |
| View reports & export | ✔ | ✔ | ✘ |

Implementation:
- `lib/rbac.ts` — one `can(role, capability): boolean`. A plain object map. No policy engine.
- `<RoleGate cap="approve">` wraps the control, **renders it either way**, and applies `opacity:.45` + `pointer-events:none` + a `lock` icon when blocked. It **never returns null**. A blocked action that disappears is a bug — `W5-dispatcher-view-rbac` is the reference rendering.
- Drivers are a sixth role, mobile-only, with a fixed transition set: `Pending → In Progress → Awaiting approval`. They can never close a job or edit a price.

### 6.7 Money rendering

One `Money` component per project. Every rendered amount goes through it. It applies `font-variant-numeric: tabular-nums` and `--text` ink. **Never green, never amber.** Payment state lives in a `.spill` pill next to the number, never in the colour of the number. This is a QA gate (§7) and it is the easiest one to fail by accident — a `--st-done` green total on a Paid row would slip through review.

### 6.8 Chat and notification badge logic

- **Threads are job-scoped.** `M27` / `W10` list threads, each bound to a job. The Chat tab always opens the thread **list**, never a single thread.
- `.unread` `.bdg` on a thread row; the Chat tab icon carries a dot when any thread is unread; the Alerts tab carries a dot when any notification is unread. Same derivation, one selector each, in the mock store.
- Admin: `.bell` `.dot` in `.tbar-w`.
- Opening a thread clears its unread flag, which must recompute the tab badge — one derived selector, not two independent counters.
- **Notification triggers** (§8 of the PDF) live in the mock layer, fired by the state machine, so they stay correct when the real API arrives:
  - **Driver:** job assigned · job updated · new message from admin · overdue-job reminder · closeout approved · pay period paid · unit taken out of service on your job.
  - **Admin:** driver updated status · driver uploaded photos · driver added a note · pre-trip inspection failed (unit out of service) · closeout submitted for approval · pay period ready to mark as paid.
  - **Customer:** exactly one outbound email — *Job completed*. Fires on **driver submit**, not admin approval. Per-customer opt-in on W15/W16, per-job toggle on W4, record shown on W22.

### 6.9 The leg-split validator (W-06)

Legs (Pickup / Loading / Delivery) each carry an **editable amount and its own driver** — one job can pay three different people. Legs must total the job price. A mismatch is a validation error that **states the numbers**:

> "Legs total $130.00 but the job price is $120.00 — they must match before you can create the job."

Plus the inline `.errmsg`: "$10.00 over-allocated across the three legs." Both strings are in `W4-validation-error` verbatim. **Job price appears on every variant** — never ship a create-job card without a price. Mobile renders `.legrow` **read-only**; drivers never edit a price.

---

## 7 · Verification checklist — re-run after every change

This is the PDF §12.3 gate list turned into a runnable checklist. Run it against both projects at the end of each phase, not just at the end of the build.

**Mechanical (grep / script — automate these in a `verify` npm script):**

```bash
# 1. No blur, no glass — expect 0
grep -rn "backdropFilter\|backdrop-filter\|blur(" src/ | wc -l

# 2. No hardcoded hex outside the token file — expect 0
grep -rn "#[0-9a-fA-F]\{3,8\}" src/ --include=*.ts --include=*.tsx --include=*.css \
  | grep -v "theme/tokens.ts" | grep -v "tokens.css" \
  | grep -vi "#fff\|#ffffff\|#000\|#000000"

# 3. No scope creep — expect 0
grep -rniE "stripe|checkout|invoice|\bbid\b|rating|book now|card number|payout" src/

# 4. Deferred empty-pickup must not render — expect 0 in JSX
grep -rn "jtype.*emt\|Empty pickup\|booking.?no" src/

# 5. Every amount goes through Money — no raw dollar strings in JSX
grep -rn '\$[0-9]' src/ --include=*.tsx | grep -v "Money.tsx" | grep -v "fixtures"

# 6. Icon names must be in the 63-name set
grep -rho "lucide-[a-z-]*\|icon=\"[a-z0-9-]*\"" src/ | sort -u
```

**Visual / behavioural (manual, per frame):**

| # | Gate | Expected |
|---|---|---|
| 1 | **Contrast** | Body ≥ 4.5:1, UI/large ≥ 3:1. **No exceptions.** Amber-as-text = zero occurrences (`--amber-ink` only). `--muted` never used as copy. |
| 2 | **Surface audit** | No `backdrop-filter`, no `blur(`, no photo scrims behind text. Photos are bounded thumbnails inside solid cards. |
| 3 | **Token check** | Zero hex literals outside the token file, except `#fff` / `#000` device chrome. |
| 4 | **Scope check** | No bidding, offers, public job feed, star ratings, reviews, "Book Now", hourly-rate shopping, services catalog, customer-facing payments, public sign-up. |
| 5 | **Money check** | Every amount carries `.money` (tabular). No amount coloured green or amber. Payment state in a pill only. |
| 6 | **Gate check** | No screen shows a job started without its pre-trip passed. No Submit enabled without its evidence. Deleting a photo re-locks its step. A defect with no note is rejected. |
| 7 | **State check** | Every admin list, form and auth screen has **error, loading and empty** variants and each is reachable from the mock. |
| 8 | **Photo-slot check** | Every evidence photo is in a **labelled** slot. Zero unlabelled thumbnail grids in the capture flow. Nine required photos, 2 + 3 + 4, seal photographed twice and never collapsed. |
| 9 | **RBAC check** | Every blocked action renders **visible + disabled + lock icon**. Zero blocked actions hidden or unmounted. |
| 10 | **Admin read-only check** | Zero `.pdel` delete controls in any admin frame. Zero editable defect notes. |
| 11 | **Flow check** | Every navigation target from the demo graph resolves. Every screen has an inbound and an outbound edge except `M1-launch`. |
| 12 | **Type check** | `tsc --noEmit` clean, strict mode. No `any` on repository boundaries. |
| 13 | **Console check** | Clean — no errors, no undefined handlers, no missing-icon warnings. |
| 14 | **Tab-bar check** | Five tabs, fixed, on exactly the nine root frames. Earnings is not a tab. |
| 15 | **Sidebar check** | Nine items in the fixed order. Active item = `--sel` blue fill, white text. **Never amber.** Fleet uses `container`, not `truck`. |

---

## 8 · Open questions — need a human decision

### RESOLVED — decided 2026-08-21, build to these

**Q1 · Seal number input. RESOLVED → inline editable field.**
M20's `.evid` "Seal no." row becomes a real controlled text input. The Confirm Pickup primary button unlocks only at **2 photos AND a non-empty seal number**. Treat it as a short keyboard case, same pattern as M3 (see §6.3, updated below).

**Q2 · Completion email ticket numbers. RESOLVED → drop them.**
W22's email template no longer renders `J1-…` / `CR-…` literals. Reword to: *"Container returned and chassis returned; 9 photos are attached."* No new capture fields, no change to Confirm Delivery.

**Q3 · RN font strategy. RESOLVED → bundle Inter + Outfit on both iOS and Android.**
Overrides the plan's earlier per-platform recommendation. Mobile then matches `admin-web` exactly at the cost of not looking like a native SF Pro app on iOS — accepted trade-off. Bundle the full weight set (Inter 400/500/600/700, Outfit 500/600/700/800/900) for **both** platforms in `assets/fonts/`.

**Q4 · Admin layout. RESOLVED → fluid shell, min-width 1280px.**
As recommended in §6.5: `.side` 240px + `.tbar-w` 64px fixed, `.content` takes the remainder, `min-width:1280px` on `.web` below which it horizontal-scrolls. `.modal` (640px) and `.drawer` (480px) keep fixed widths. No further action needed — §6.5 already describes the build.

### NON-BLOCKING — defaults assumed, change on request

**Q5 · Driver document deletion policy.** (PDF §11.2) Drivers can delete any **photo** they upload. Their own **PDFs** on M8 show only a download control.
*Assumed default:* photos deletable by the driver, documents not. This is what the frames show; keeping it means zero work.

**Q6 · `M9` Status update sheet appears to be dead.** The flow graph shows `M9-sheet` with **no inbound edge** from any frame — its only `data-goto` reference is its own state-cycling pill. M7's actions go to M4, M12, M8 and M19; nothing opens M9. Since driver status is derived entirely from the four-step flow (§7.1: `Pending → In Progress → Awaiting approval`), a manual status picker may be vestigial.
*Assumed default:* **do not build M9.** It costs nothing to add later and building a manual status setter risks contradicting the evidence gates. Flag on the QA pass rather than silently dropping it.
*(All other flow-graph orphans — `M2-error`, `M3-link-sent`, `M4-empty`, `M14-empty`, `M17-empty`, `W1-*`, `W3-loading`, `W3-empty`, `W4-validation-error`, `W5-dispatcher-view-rbac` — are state variants reached via the gallery state pill. Expected and correct.)*

**Q7 · Jobs — In Progress and Completed have no empty frame.** Only `M4-empty` (Pending) was designed.
*Assumed default:* reuse the same `.empty` component with per-tab copy. Do not invent a new visual.

**Q8 · Logout sheet drops the tab bar.** `M15-confirm` renders without `.tbar` although it overlays the Profile tab.
*Assumed default:* keep the tab bar mounted behind the scrim (real-app behaviour). It is 42%-opacity-visible either way; unmounting it causes a layout jump.

**Q9 · Placeholder imagery.** All 49 photos are Unsplash stock. The nine evidence shots — the "seal in hand" frames especially — must be swapped for real job photos before this goes to the client as final. (PDF §11.2.)

---

## 9 · Agent assignment

Roster read from `~/.claude/agents/`. No project-scoped agents exist.

| Task group | Agent | Why |
|---|---|---|
| S-01 tokens, S-02 fixtures, S-03 contracts (mobile copy) | `rn-developer` | Owns the mobile files. |
| S-01 tokens, S-03 contracts (web copy) | **direct / general-purpose** | No Next.js agent exists. |
| M-01 … M-10 — all 39 mobile frames | `rn-developer` | RN CLI specialist; explicitly covers "port an HTML design frame into pixel-perfect screens" and owns scaffolding, navigation, Zustand and native module wiring. Single owner for the whole mobile track. |
| W-01 … W-12 — all 30 admin frames | **direct / general-purpose** | **No agent covers Next.js/React web.** The `rn-*` roster is React Native / native mobile only; `ui-ux-designer` produces designs, not production React. Execute these inline. |
| Mobile QA gate (§7 against `mobile-app/`) | `rn-qa-tester` | Owns test plans, edge cases, empty/error/offline verification. Its Android/iOS test tooling maps cleanly onto RN. |
| Mobile code review gate | `rn-code-reviewer` | Pre-merge quality gate for the mobile track. |
| Admin QA + review gate | **direct / general-purpose** | Same gap. Run the §7 checklist manually. |

**Considered and rejected:**
- `ui-ux-designer` — the design is finished and is the spec. Re-designing anything is a scope violation.
- `rn-app-architect` — the architecture is eight one-method-per-verb interfaces and a folder layout, both specified above. An ADR pass would be ceremony.
- `rn-research-engineer` — no unknowns worth a spike. Every library choice here is forced by a stated requirement.
- `rn-release-engineer` — signing, CI and store submission are not in this scope. Bring it in the day a build is needed.
- `rn-tech-lead` / `rn-delivery-orchestrator` — only if the user wants the whole thing run on autopilot; otherwise pure routing overhead on a two-track plan.
- `native-android-developer` — this is RN CLI, not Kotlin/Compose. Only relevant if a native module becomes necessary, which nothing in the design requires.

**Parallelism.** After Phase 0 the two tracks share **zero files**. `rn-developer` can run the entire mobile track while the admin track runs inline, in the same message. Within the mobile track, M-06 (state machine) is strictly serial before M-07; within the admin track, W-03 (customers + fleet) is strictly serial before W-06 (create job needs those dropdowns). Everything else inside a phase is independent.

---

## 10 · Pushback

Three things worth saying before anyone starts:

1. **Do not add Tailwind to `admin-web`.** The deliverable is 1,100 lines of finished, token-driven CSS that already renders the target. Translating it into utility classes is a week of work whose best possible outcome is "looks the same". Copy the stylesheet.

2. **Do not build a generic "form engine", "table engine" or "permission engine".** There are three mobile forms and roughly six admin modals; there is one table style; there are ten capabilities across three role tiers. A plain object map and `useState` beat every abstraction here, and each abstraction is a place for pixel drift to hide.

3. **The riskiest thing in this plan is not code, it is Q1 and Q2.** The seal-number input does not exist, and the customer email renders two numbers the app never captures. Both are cheap to fix now and expensive to fix after the capture flow is built and the client has seen a demo email. Get those answered before Phase 3.
