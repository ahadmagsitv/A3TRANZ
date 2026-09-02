#!/usr/bin/env bash
# IMPLEMENTATION_PLAN §7 — the mechanical half of the QA gate.
# Every check must report 0. Run it after every change, not just at the end.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
check() { # check <name> <count that must be 0>
  if [ "$2" -eq 0 ]; then
    printf '  ok   %s\n' "$1"
  else
    printf '  FAIL %s (%s hits)\n' "$1" "$2"
    fail=1
  fi
}

echo "§7 mechanical checks"

check "1 no blur / glass" \
  "$(grep -rn 'backdropFilter\|backdrop-filter\|blur(' src/ | wc -l | tr -d ' ')"

check "2 no hex outside theme/tokens.ts" \
  "$(grep -rn '#[0-9a-fA-F]\{3,8\}' --include='*.ts' --include='*.tsx' src/ \
     | grep -v 'theme/tokens.ts' \
     | grep -vi '#fff\|#ffffff\|#000\|#000000' | wc -l | tr -d ' ')"

check "3 no scope creep" \
  "$(grep -rniE 'stripe|checkout|invoice|\bbid\b|rating|book now|card number|payout' src/ \
     | wc -l | tr -d ' ')"

# `.jtype.emt` may be named in a comment (JobTypeChip explains why it is
# deferred); it must never appear inside JSX.
check "4 deferred empty-pickup never renders" \
  "$(grep -rn 'jtype.*emt\|Empty pickup\|booking.\?no' --include='*.tsx' src/ \
     | grep '<' | wc -l | tr -d ' ')"

check "5 every amount goes through Money" \
  "$(grep -rn '\$[0-9]' --include='*.tsx' src/ | grep -v 'Money.tsx' | wc -l | tr -d ' ')"

echo "  --   6 lucide glyphs in use (must all be in the §1.4 63-name set):"
python3 - <<'PY'
import re, pathlib
names = set()
for p in pathlib.Path('src').rglob('*.ts*'):
    for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*'lucide-react-native'", p.read_text()):
        for part in m.group(1).split(','):
            part = part.strip().removeprefix('type ').strip()
            if part and part != 'LucideIcon':
                names.add(part)
print('       ' + ' '.join(sorted(names)))
PY

echo
echo "typecheck"
if npx tsc --noEmit; then
  echo "  ok   tsc --noEmit clean (strict)"
else
  fail=1
fi

exit $fail
