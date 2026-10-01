#!/usr/bin/env node
/**
 * WCAG 2.1 contrast verification for the Ulmara palette.
 *
 * Run with `npm run audit:contrast`. Wired into the pre-commit hook and CI.
 *
 * ## Why this exists
 *
 * A previous audit asserted the palette "passes contrast" without ever
 * computing a ratio. Running this immediately found 12 real failures, including
 * `textMuted` at 2.92:1 on the light background — used for 12px caption text,
 * the worst case in the app. The claim was wrong and is now checked.
 *
 * ## It imports the real module
 *
 * `lib/theme/color.ts` has no runtime imports, so it is loaded directly via
 * Node's type stripping. The values checked are the exact values the app
 * renders, not a copy that can drift.
 *
 * ## `border` vs `borderControl`
 *
 * WCAG 1.4.11 requires 3:1 for the boundary of a *control* whose edge is how
 * you identify it. It does not apply to a decorative separator or a container
 * that is merely a box. Rather than force every hairline in the app to 3:1 —
 * which would turn each rule into a heavy grey outline and undo the design —
 * the palette carries two tokens:
 *
 *   - `borderControl` — inputs, switches, selectable chips, secondary buttons.
 *     Gated at 3:1. On a text field the fill sits ~1.05:1 from the page, so the
 *     outline is doing all the work of saying "this is a control".
 *   - `border` — card and sheet outlines. Container decoration.
 *   - `divider` — the hairline between list rows. Purely decorative, exempt
 *     under 1.4.11. Reported below for honesty, not gated.
 *
 * Thresholds are AA: 4.5:1 body text, 3.0:1 large text and non-text indicators.
 */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const { lightTheme, darkTheme } = await import(
  pathToFileURL(join(process.cwd(), 'lib/theme/color.ts')).href
);

// ---------------------------------------------------------------------------
// WCAG 2.1 maths
// ---------------------------------------------------------------------------

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function lum(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contrast(fgHex, bgHex) {
  const a = lum(fgHex);
  const c = lum(bgHex);
  const [hi, lo] = a > c ? [a, c] : [c, a];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// The pairs the app actually renders.
// ---------------------------------------------------------------------------

const TEXT = 'text';
const LARGE = 'large';
const UI = 'ui';

const PAIRS = [
  // body copy
  { fg: 'textPrimary', bg: 'background', kind: TEXT, use: 'body copy on the page' },
  { fg: 'textPrimary', bg: 'surface', kind: TEXT, use: 'body copy in a card/sheet' },
  { fg: 'textPrimary', bg: 'surfaceElevated', kind: TEXT, use: 'body copy on an elevated fill' },
  { fg: 'textSecondary', bg: 'background', kind: TEXT, use: 'secondary text on the page' },
  { fg: 'textSecondary', bg: 'surface', kind: TEXT, use: 'secondary text in a card' },
  { fg: 'textSecondary', bg: 'surfaceElevated', kind: TEXT, use: 'secondary text on a raised fill' },
  { fg: 'textMuted', bg: 'background', kind: TEXT, use: 'muted captions on the page' },
  { fg: 'textMuted', bg: 'surface', kind: TEXT, use: 'muted captions in a card' },
  { fg: 'textMuted', bg: 'surfaceElevated', kind: TEXT, use: 'muted captions on a raised fill' },
  { fg: 'code', bg: 'surface', kind: TEXT, use: 'monospace addresses and hashes' },
  { fg: 'code', bg: 'surfaceElevated', kind: TEXT, use: 'monospace on a chip' },
  { fg: 'primary', bg: 'primaryLight', kind: TEXT, use: 'selected chip label' },
  { fg: 'textSecondary', bg: 'primaryLight', kind: TEXT, use: 'secondary on the selected chip' },
  { fg: 'textMuted', bg: 'primaryLight', kind: TEXT, use: 'muted on the selected chip' },

  // display type (>= 24px, or >= 18.66px bold)
  { fg: 'textPrimary', bg: 'background', kind: LARGE, use: 'the balance figure' },
  { fg: 'primary', bg: 'background', kind: LARGE, use: 'a large accent value' },

  // the primary button
  { fg: 'onPrimary', bg: 'primary', kind: TEXT, use: 'primary button label' },

  // semantic status text on its own tint
  { fg: 'error', bg: 'errorTint', kind: TEXT, use: 'inline error message' },
  { fg: 'success', bg: 'successTint', kind: TEXT, use: 'success confirmation' },
  { fg: 'warning', bg: 'warningTint', kind: TEXT, use: 'warning strip' },
  { fg: 'primary', bg: 'primaryLight', kind: TEXT, use: 'accent text in a tinted notice' },
  { fg: 'error', bg: 'background', kind: TEXT, use: 'error text on the page' },
  { fg: 'success', bg: 'background', kind: TEXT, use: 'success text on the page' },
  { fg: 'warning', bg: 'background', kind: TEXT, use: 'warning text on the page' },
  { fg: 'error', bg: 'surface', kind: TEXT, use: 'error text in a card' },
  { fg: 'success', bg: 'surface', kind: TEXT, use: 'success text in a card' },

  // --- control boundaries: 3:1 (WCAG 1.4.11) ------------------------------
  { fg: 'borderControl', bg: 'background', kind: UI, use: 'text input outline' },
  { fg: 'borderControl', bg: 'surface', kind: UI, use: 'input outline inside a card' },
  { fg: 'borderControl', bg: 'surfaceElevated', kind: UI, use: 'secondary button outline' },
  { fg: 'primary', bg: 'background', kind: UI, use: 'focus ring' },
  { fg: 'primary', bg: 'surface', kind: UI, use: 'focus ring inside a card' },
  { fg: 'primary', bg: 'surfaceElevated', kind: UI, use: 'focus ring on a raised fill' },
  { fg: 'primary', bg: 'primaryLight', kind: UI, use: 'selected chip outline' },
  { fg: 'error', bg: 'background', kind: UI, use: 'invalid input outline' },
  { fg: 'error', bg: 'errorTint', kind: UI, use: 'invalid outline on its tint' },
  { fg: 'success', bg: 'background', kind: UI, use: 'success indicator' },
  { fg: 'borderControl', bg: 'primaryLight', kind: UI, use: 'chip outline on the selected tint' },
];

const THRESHOLD = { text: 4.5, large: 3.0, ui: 3.0 };

// ---------------------------------------------------------------------------

let failures = 0;
let checks = 0;
const lines = [];

for (const mode of ['light', 'dark']) {
  const p = mode === 'light' ? lightTheme : darkTheme;
  for (const pair of PAIRS) {
    const fg = p[pair.fg];
    const bg = p[pair.bg];
    if (typeof fg !== 'string' || typeof bg !== 'string') {
      lines.push(`  FAIL  ${mode.padEnd(5)}  ${pair.fg} on ${pair.bg}`.padEnd(64) + 'token missing');
      failures++; checks++;
      continue;
    }
    const r = contrast(fg, bg);
    const min = THRESHOLD[pair.kind];
    checks++;
    const ok = r >= min;
    if (!ok) failures++;
    lines.push(
      `  ${ok ? 'pass' : 'FAIL'}  ${mode.padEnd(5)}  ` +
        `${pair.fg} on ${pair.bg}`.padEnd(32) +
        `${r.toFixed(2).padStart(6)}:1  (min ${min})  ${pair.use}`
    );
  }
}

console.log('=== WCAG 2.1 AA contrast — live values from lib/theme/color.ts ===');
console.log(lines.join('\n'));
console.log('');
console.log(`  ${checks} rendered combinations across both themes, ${failures} failing`);
console.log('');
console.log('  not gated (decorative under 1.4.11, reported for honesty):');
for (const mode of ['light', 'dark']) {
  const p = mode === 'light' ? lightTheme : darkTheme;
  console.log(
    `    ${mode.padEnd(5)} divider on surface = ${contrast(p.divider, p.surface).toFixed(2)}:1` +
    `   |   border (container) on surface = ${contrast(p.border, p.surface).toFixed(2)}:1`
  );
}

if (failures > 0) {
  console.log('');
  console.log('FAIL — fix the token or the usage; do not lower the threshold.');
  process.exit(1);
}
console.log('');
console.log('PASS — every rendered foreground/background pair meets AA.');
