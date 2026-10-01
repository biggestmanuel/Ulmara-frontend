#!/usr/bin/env node
/**
 * Design-system and accessibility conformance check.
 *
 * Run with `npm run audit:design`. It exists to make the redesign
 * *unenforceable-by-accident*: every rule below corresponds to a class of defect
 * that was present in the pre-redesign app and would otherwise only be caught by
 * a human happening to open the right file.
 *
 * It is a separate script rather than an ESLint rule on purpose. ESLint cannot
 * see a theme that a file *should* be using, and these checks are partly
 * structural (does this file import the kit at all?) rather than syntactic. It
 * also fails the build, so a regression cannot be merged quietly.
 *
 * Exits non-zero on any failure.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const DIRS = ['app', 'components'];

// Files allowed to contain literal colours, with the reason. Anything else must
// read from the theme — a hardcoded hex is a value that silently ignores dark
// mode, which is how the old app ended up with 21 off-theme colours.
//
// A QR *plate* is a genuine exception: `react-native-qrcode-svg` draws black
// modules and needs a white background to be scannable, and inverting it for
// dark mode makes the code unreadable to a camera. That is a hardware
// constraint, not a styling shortcut, so it is allowlisted with the reason
// rather than "fixed".
const COLOUR_ALLOWLIST = new Map([
  ['lib/theme/color.ts', 'defines the palettes'],
  ['lib/theme/tokens.ts', 'defines the scales'],
  ['app/receive/index.tsx', 'QR plate must be white for scanner contrast'],
  ['app/receive/payment-request.tsx', 'QR plate must be white for scanner contrast'],
  ['components/transaction/ReceiptCard.tsx', 'receipt QR plate must be white for scanner contrast'],
  ['components/ui/CodeBoxes.tsx', 'code boxes are an input affordance, not chrome'],
]);

/** Colours that are legitimately literal white (a label on an accent fill). */
const WHITE_ALLOWED = new Set(['app/send/index.tsx']);

/**
 * Files exempt from the type/radius scales, with the reason.
 *
 * `ReceiptCard` is not a screen: it is a **document that gets exported as a
 * PNG** and pasted into a chat window, an email, or an exchange's support
 * ticket. It is read by people who have never seen this app and by systems that
 * do not know it exists, so it carries its own compact typographic scale
 * (9/10/14/18/32) rather than the app's UI scale. Binding it to `body`/`label`
 * would make the receipt worse for the audience that actually receives it.
 */
const SCALE_EXEMPT = new Map([
  ['components/transaction/ReceiptCard.tsx', 'exported receipt image; its own document scale'],
]);

const failures = [];
const notes = [];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(join(ROOT, d)));
const rel = (f) => relative(ROOT, f).split(sep).join('/');

let hardcodedColours = 0;
let unlabelledControls = 0;
let offScaleRadii = 0;
let offScaleType = 0;
let textGlyphIcons = 0;
let handRolledModals = 0;

for (const file of files) {
  const key = rel(file);
  const src = readFileSync(file, 'utf8');

  // --- 1. hardcoded hex colours -------------------------------------------
  if (!COLOUR_ALLOWLIST.has(key)) {
    const hits = src.match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
    // Strip comment lines first: prose about the old palette is not a value.
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join('\n');
    const real = (code.match(/#[0-9A-Fa-f]{6}\b/g) ?? []).filter(
      (h) => !(WHITE_ALLOWED.has(key) && h.toUpperCase() === '#FFFFFF')
    );
    if (real.length) {
      hardcodedColours += real.length;
      failures.push(
        `${key}: ${real.length} hardcoded colour(s) outside the theme (${[...new Set(real)]
          .slice(0, 4)
          .join(', ')}). Read from useThemeStore().colors.`
      );
    }
    void hits;
  }

  // --- 2. interactive elements without an accessible name -----------------
  // A Pressable/Touchable is a control; without a label a screen reader
  // announces only "button". This is counted per file as a *candidate* — a
  // label may legitimately live on a child — but a file with many more controls
  // than labels is the signature of the pre-redesign problem.
  const controls = (src.match(/<Pressable\b|<Touchable\b/g) ?? []).length;
  const labels = (src.match(/accessibilityLabel/g) ?? []).length;
  if (controls > 0 && labels < controls) {
    unlabelledControls += controls - labels;
    failures.push(
      `${key}: ${controls} control(s) but only ${labels} accessibilityLabel(s). ` +
        'Every interactive element needs a name.'
    );
  }

  // --- 3. radii and font sizes off the shared scale ------------------------
  // The pre-redesign app had 22 radii and 21 font sizes. The scales live in
  // lib/theme/tokens.ts; anything else is a one-off.
  const scaleExempt = SCALE_EXEMPT.has(key);

  const radii = [...new Set((src.match(/borderRadius:\s*(\d+)/g) ?? [])
    .map((r) => Number(r.replace(/\D/g, ''))))]
    .filter((r) => ![0, 2, 4, 8, 12, 16, 22, 999, 36].includes(r));
  if (radii.length && !scaleExempt) {
    offScaleRadii += radii.length;
    failures.push(
      `${key}: borderRadius off the scale (${radii.join(', ')}). Use radius.chip / control / card / sheet / pill.`
    );
  }

  // The eight-step type scale, plus the documented hero tier. `1` is allowed
  // because a transparent overlay input needs a 1pt glyph box to keep its caret
  // off the visible digits.
  const TYPE_SCALE = new Set([
    // hero tier — see `heroType` in lib/theme/tokens.ts
    24, 26, 32, 34, 36,
    // the base scale
    0, 1, 11, 12, 13, 15, 17, 21, 28, 44,
  ]);
  const sizes = [...new Set((src.match(/fontSize:\s*(\d+)/g) ?? [])
    .map((f) => Number(f.replace(/\D/g, ''))))]
    .filter((n) => !TYPE_SCALE.has(n));
  if (sizes.length && !scaleExempt) {
    offScaleType += sizes.length;
    failures.push(
      `${key}: fontSize off the scale (${sizes.join(', ')}). Use a Typography variant, or add a step to lib/theme/tokens.ts deliberately.`
    );
  }

  // --- 4. text glyphs used as icons ---------------------------------------
  // '‹' as a back arrow, '→' as a chevron: these are unlabelled, unstyleable,
  // and render at a different weight to every icon beside them.
  const glyphs = src.match(/>\s*[‹›←→×✕]\s*</g) ?? [];
  if (glyphs.length) {
    textGlyphIcons += glyphs.length;
    failures.push(
      `${key}: ${glyphs.length} text glyph(s) used as UI icons. Use an Ionicons glyph inside a named control.`
    );
  }

  // --- 5. hand-rolled modals ----------------------------------------------
  if (/<Modal\b/.test(src) && !key.endsWith('components/ui/Sheet.tsx') && !key.endsWith('components/ui/CopyToast.tsx')) {
    handRolledModals += 1;
    failures.push(
      `${key}: hand-rolled <Modal>. Use the shared Sheet — it provides a focus-trapping container, a named close control, and Android back handling.`
    );
  }
}

// --- 6. every screen should be on the shared kit ---------------------------
const screens = files.filter((f) => /app\/.*\.tsx$/.test(rel(f)) && !/_layout\.tsx$/.test(rel(f)));
const offKit = screens.filter((f) => !readFileSync(f, 'utf8').includes('components/ui'));
if (offKit.length) {
  for (const f of offKit) {
    failures.push(
      `${rel(f)}: screen does not import components/ui. Screens are built from the shared primitives.`
    );
  }
}

// --- 7. Project-level invariants: deep-link scheme and the web base URL -------
// Both were verified by hand and then forgotten; neither is visible from a
// single file, which is exactly the kind of thing that rots.

const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo ?? {};
const linksSrc = readFileSync(join(ROOT, 'constants/links.ts'), 'utf8');

const schemeInLinks = linksSrc.match(/DEFAULT_SCHEME\s*=\s*'([^']+)'/)?.[1];
if (appJson.scheme && schemeInLinks && appJson.scheme !== schemeInLinks) {
  failures.push(
    `app.json scheme "${appJson.scheme}" does not match constants/links.ts DEFAULT_SCHEME ` +
      `"${schemeInLinks}". Deep links and the QR payload would disagree.`
  );
}

if (appJson.scheme === 'avora' || String(appJson.slug ?? '').startsWith('avora')) {
  failures.push('app.json still carries the pre-rename "avora" identifiers.');
}
if (String(appJson.name ?? '') !== 'Ulmara') {
  failures.push(`app.json name is "${appJson.name}", expected "Ulmara".`);
}

// No scattered host literals. `constants/links.ts` is the single source.
for (const f of files) {
  const key = rel(f);
  if (key === 'constants/links.ts' || key === 'scripts/audit-design.mjs') continue;
  const body = readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n');
  const hits = body.match(/https?:\/\/(ulmara|avora)\.[a-z]+/g);
  if (hits) {
    failures.push(
      `${key}: hardcoded host ${[...new Set(hits)].join(', ')}. ` +
        'Build URLs from constants/links.ts so the domain is changed in one place.'
    );
  }
}

console.log('=== design conformance ===');
console.log(`  screens/components scanned   ${files.length}`);
console.log(`  hardcoded colours            ${hardcodedColours}`);
console.log(`  controls missing a label     ${unlabelledControls}`);
console.log(`  off-scale radii              ${offScaleRadii}`);
console.log(`  off-scale font sizes        ${offScaleType}`);
console.log(`  text glyphs as icons         ${textGlyphIcons}`);
console.log(`  hand-rolled modals           ${handRolledModals}`);
console.log(`  screens off the kit          ${offKit.length}`);
console.log('');

if (failures.length === 0) {
  console.log('PASS — every screen is on the shared design system.');
  process.exit(0);
}

console.log(`FAIL — ${failures.length} issue(s):`);
for (const f of failures) console.log(`  - ${f}`);
if (notes.length) {
  console.log('');
  for (const n of notes) console.log(`  note: ${n}`);
}
process.exit(1);
