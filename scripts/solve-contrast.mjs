#!/usr/bin/env node
/**
 * Resolves the light-theme ink ramp so that all three tiers clear AA *and*
 * remain visibly distinct.
 *
 * The tension: `textSecondary` already sat at 5.56:1, which leaves almost no
 * room below it for a third, lighter tier that still clears 4.5:1. Solving for
 * `textMuted` alone produced #69635C — within one hex step of `textSecondary`
 * (#6B6459), which would collapse two distinct roles into one.
 *
 * So the *mid* tier is darkened deliberately, to open space underneath it.
 * Targets: secondary ~7:1 (a clear step below textPrimary's 14:1), muted
 * >= 4.5:1 with margin, and a luminance gap between them.
 */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const { lightTheme, darkTheme } = await import(
  pathToFileURL(join(process.cwd(), 'lib/theme/color.ts')).href
);

const srgbToLinear = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); const [hi, lo] = x > y ? [x, y] : [y, x]; return (hi + 0.05) / (lo + 0.05); };
const toHex = (rgb) => '#' + rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('').toUpperCase();

function solveToward(fg, backgrounds, target, toward) {
  const rgb = [1, 3, 5].map((i) => parseInt(fg.slice(i, i + 2), 16));
  for (let step = 0; step <= 100; step += 1) {
    const t = step / 100;
    const mixed = toward === 'dark' ? rgb.map((c) => c * (1 - t)) : rgb.map((c) => c + (255 - c) * t);
    const hex = toHex(mixed);
    if (backgrounds.every((bg) => ratio(hex, bg) >= target)) return hex;
  }
  return null;
}

const SURFACES = ['background', 'surface', 'surfaceElevated', 'primaryLight'];

for (const mode of ['light', 'dark']) {
  const theme = mode === 'light' ? lightTheme : darkTheme;
  const bgs = SURFACES.map((k) => theme[k]);
  const toward = mode === 'light' ? 'dark' : 'light';

  // Push the mid tier down first, to create headroom.
  const secondaryTarget = mode === 'light' ? 7.2 : 7.2;
  const secondary = solveToward(theme.textSecondary, bgs, secondaryTarget, toward);

  // Then find the lightest muted that still clears AA against every surface.
  const muted = solveToward(theme.textMuted, bgs, 4.9, toward);

  console.log(`--- ${mode} ---`);
  for (const [name, value] of [['textSecondary', secondary], ['textMuted', muted]]) {
    if (!value) { console.log(`  ${name}: unreachable`); continue; }
    const per = SURFACES.map((k, i) => `${k}=${ratio(value, bgs[i]).toFixed(2)}`).join('  ');
    console.log(`  ${name.padEnd(14)} ${value}   ${per}`);
  }
  if (secondary && muted) {
    const gap = lum(secondary) - lum(muted);
    console.log(`  luminance gap secondary-muted: ${gap.toFixed(4)}  ${gap > 0.01 ? '(distinct)' : '(TOO CLOSE)'}`);
  }
}
