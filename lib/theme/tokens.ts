/**
 * Ulmara design tokens — the single source of truth for spacing, radii,
 * typography, motion and hit targets.
 *
 * ## Why this file exists
 *
 * The audit that preceded this redesign found **22 distinct `borderRadius`
 * values** and **21 distinct `fontSize` values** across 40 screens, plus roughly
 * 30 hardcoded hex colours that ignored the theme entirely. That is not a style
 * problem, it is a *system* problem: with no scale to draw from, every screen
 * invents its own numbers, and the result cannot look coherent no matter how
 * many screens are individually restyled.
 *
 * So the scale comes first, and the screens are migrated onto it.
 *
 * ## The underlying idea
 *
 * Ulmara's entire product is the *removal* of complexity — a 10-digit Account ID
 * instead of a 42-character address. The visual system follows the same logic:
 * remove everything that is not load-bearing, and let a small set of decisions
 * carry the whole identity. Depth comes from surface contrast and hairline rules,
 * never from shadows or gradients. There is exactly one accent colour and it is
 * reserved for the things that matter: the primary action, the current
 * selection, and the Account ID.
 */

/* -------------------------------------------------------------------------- */
/* Spacing — 4pt base                                                          */
/* -------------------------------------------------------------------------- */

export const space = {
  /** 4 — hairline nudges, icon-to-label gaps */
  xs: 4,
  /** 8 — gaps inside a single control (icon ↔ text) */
  sm: 8,
  /** 12 — gaps between related rows, list padding */
  md: 12,
  /** 16 — the default gap between blocks */
  lg: 16,
  /** 24 — screen gutter, and the gap between page sections */
  xl: 24,
  /** 32 — separation between major page sections */
  xxl: 32,
  /** 48 — breathing room above a bottom-anchored action on a tall screen */
  xxxl: 48,
} as const;

/**
 * Horizontal page gutter.
 *
 * 24 rather than the 18–28 that individual screens were using. It is wide
 * enough that content reads as a page rather than a stretched list, and narrow
 * enough to leave a comfortable one-handed column on a large phone.
 */
export const gutter = space.xl;

/** Maximum width for readable text columns. Phones never reach this; tablets do. */
export const contentMaxWidth = 560;

/* -------------------------------------------------------------------------- */
/* Radii — five steps, replacing 22 arbitrary values                          */
/* -------------------------------------------------------------------------- */

export const radius = {
  /** 8 — small chips, status badges, the copy pill */
  chip: 8,
  /** 12 — inputs and buttons. The workhorse. */
  control: 12,
  /** 16 — cards and list groups */
  card: 16,
  /** 22 — bottom sheets and modals */
  sheet: 22,
  /** 999 — fully rounded pills and avatars */
  pill: 999,
} as const;

/* -------------------------------------------------------------------------- */
/* Type scale — eight steps, replacing 21 arbitrary sizes                      */
/* -------------------------------------------------------------------------- */

export const font = {
  /** Serif display face. See lib/theme/fonts.ts. */
  display: 'Newsreader_600SemiBold',
  displayMedium: 'Newsreader_500Medium',
  /** Sans UI face. Carries every numeral in the app. */
  sans: 'Manrope_400Regular',
  sansMedium: 'Manrope_500Medium',
  sansSemiBold: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
  /** System monospace — addresses, hashes, seed phrases. Never for prose. */
  mono: 'monospace',
} as const;

export type TypeStep = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
};

/**
 * The scale.
 *
 * `amount` is deliberately the largest type in the app and the only place a
 * serif is used for a *number*: the balance is the single most important thing
 * on the Home screen and must be readable at arm's length, at a glance, without
 * a tap. It is the product's reason for existing.
 *
 * ## The hero tier
 *
 * Five screens need type larger than `amount` or between two named steps: the
 * Welcome promise, the Account ID on its own screen, the asset amount in a
 * detail sheet, the keypad digits, and the OTP boxes. Those are *deliberate
 * display sizes*, not accidental one-offs — the first version of this file
 * simply omitted them, which produced magic numbers scattered across five
 * files and an audit rule that could not tell a decision from a typo.
 *
 * They are named here instead, and `scripts/audit-design.mjs` allows exactly
 * these values. If a sixth hero size is ever needed it should be added here and
 * argued for, not typed into a screen.
 */
export const heroType = {
  /** 36/42 — the Welcome promise, one line above the fold. */
  hero: { fontSize: 36, lineHeight: 42, letterSpacing: -0.8 },
  /** 34/40 — a large amount in a detail sheet. */
  heroSm: { fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  /** 32/40 — the Account ID when it is the entire screen. */
  figure: { fontSize: 32, lineHeight: 40, letterSpacing: 1.5 },
  /** 26/32 — keypad digits. Large enough to hit, quiet enough to read. */
  key: { fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  /** 24/30 — a single digit in an OTP box. */
  digit: { fontSize: 24, lineHeight: 30, letterSpacing: 0 },
} as const;

export const type = {
  /** 44/48 — the balance. Serif, tight tracking, the visual anchor of Home. */
  amount: {
    fontFamily: font.display,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.2,
  },
  /** 30/36 — a smaller amount, for asset rows and receipt totals. */
  amountSm: {
    fontFamily: font.sansBold,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  /** 28/34 — screen titles (serif). */
  title: {
    fontFamily: font.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
  },
  /** 21/27 — section headings (serif). */
  heading: {
    fontFamily: font.displayMedium,
    fontSize: 21,
    lineHeight: 27,
    letterSpacing: -0.2,
  },
  /** 17/22 — the largest sans. Row titles, button labels. */
  titleSm: {
    fontFamily: font.sansBold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  /** 15/21 — body copy. */
  body: {
    fontFamily: font.sans,
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0,
  },
  /** 13/17 — form labels, secondary UI text. */
  label: {
    fontFamily: font.sansSemiBold,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 0.1,
  },
  /** 12/16 — metadata, timestamps, helper text. */
  caption: {
    fontFamily: font.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
  /** 13/19 — addresses, hashes, seed phrases. */
  code: {
    fontFamily: font.mono,
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: 0,
  },
  /** 11/14 — badges and dense table headers. */
  micro: {
    fontFamily: font.sansBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
  },
} satisfies Record<string, TypeStep>;

/**
 * Numerals that must not shift width as they change.
 *
 * Balances, amounts, token quantities and the Account ID all tick live. With
 * proportional figures the layout visibly jitters on every price update, which
 * on a screen you check many times a day reads as sloppiness. `tabular-nums` is
 * the fix; it is ignored harmlessly by platforms that lack it.
 */
export const tabularNums = { fontVariant: ['tabular-nums' as const] };

/* -------------------------------------------------------------------------- */
/* Layout constants                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Control height.
 *
 * 56 was already the value used by `Input` and `Button`, so this is not a new
 * number — it is the one that was already right, now stated once. Comfortably
 * above the 44pt iOS / 48dp Android minimums.
 */
export const controlHeight = 56;

/** Minimum size for any icon-only control. Enforced by `IconButton`. */
export const touchTarget = 44;

/** Standard `hitSlop` for controls whose visual box is smaller than the target. */
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** Hairline width that renders as a true 1px rule on both platforms. */
export const hairline = 1;

/* -------------------------------------------------------------------------- */
/* Motion                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Durations. Deliberately short — this is a utility used many times a day, and
 * slow transitions make a fast product feel sluggish.
 */
export const duration = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

/**
 * Reduced-motion policy.
 *
 * The audit found **no reduced-motion handling anywhere in the app**. This is
 * the single place that decides whether a transition is allowed to run, so
 * individual components never have to think about it. Everything that animates
 * must consult it (see `lib/hooks/useReducedMotion.ts`).
 */
export const motion = {
  scale: {
    pressed: 0.97,
    pressedSubtle: 0.99,
  },
} as const;
