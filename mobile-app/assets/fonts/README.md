# Bundled fonts

Nine real TTF binaries, per IMPLEMENTATION_PLAN §1.3 and §8 Q3 (resolved —
bundle for **both** iOS and Android so mobile matches `admin-web` exactly).

| File | Token | Used for |
|---|---|---|
| `Inter-Regular.ttf` | `--f` 400 | body copy |
| `Inter-Medium.ttf` | `--f` 500 | secondary copy, metadata |
| `Inter-SemiBold.ttf` | `--f` 600 | labels, buttons, row titles |
| `Inter-Bold.ttf` | `--f` 700 | pills, emphasis |
| `Outfit-Medium.ttf` | `--fd` 500 | — |
| `Outfit-SemiBold.ttf` | `--fd` 600 | — |
| `Outfit-Bold.ttf` | `--fd` 700 | chips, small display |
| `Outfit-ExtraBold.ttf` | `--fd` 800 | `.topbar h1`, `.card-h h3`, `.stat-n` |
| `Outfit-Black.ttf` | `--fd` 900 | `.money-lg`, board titles |

Sources: Inter v4.1 (rsms/inter, OFL) · Outfit (Outfitio/Outfit-Fonts, OFL).

Every file's PostScript name equals its filename, so a single `fontFamily`
string (e.g. `'Inter-SemiBold'`) resolves on both platforms. Reference them
through `src/theme/typography.ts` — never type a family string in a component.

## Re-linking after a clean checkout

```bash
npx react-native-asset
```

This copies them into `android/app/src/main/assets/fonts/` and registers them in
`ios/A3TranzDriver/Info.plist` under `UIAppFonts`. Both are committed, so a
normal build needs no extra step.
