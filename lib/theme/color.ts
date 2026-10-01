/**
 * # Ulmara — "Warm Ink"
 *
 * The palette replaces a Stripe-violet-on-blue-black scheme that read as a
 * generic SaaS dashboard: `#635BFF` on `#0D0F17`, a saturated accent glowing
 * against a cool near-black, with white overlays and heavy elevation on top.
 * That is the "near-black plus one neon accent" look, and it is the single
 * biggest reason the previous design did not feel like a product with its own
 * point of view.
 *
 * ## The reasoning
 *
 * Ulmara removes complexity. A 42-character address becomes a 10-digit Account
 * ID. The visual system takes the same approach: earn character from **warm
 * neutrals and one matte accent** rather than from saturation and glow.
 *
 * Three constraints decided the hue, and they are worth stating because they
 * are the reason it is *not* an obvious choice:
 *
 * 1. **The accent cannot be red.** Red means "destructive" and "failed
 *    transfer". A wallet whose brand colour is its own error colour is unusable.
 * 2. **The accent cannot be green.** Green means "received" and "success". The
 *    previous design already leaned on green/red arrow chips in transaction
 *    rows; a green brand would make every one of them ambiguous.
 * 3. **The accent cannot be an electric blue or violet.** That is what every
 *    fintech and SaaS template ships, and it is what the app looked like before.
 *
 * What is left is the deep, warm, desaturated end of the violet family —
 * **aubergine** — which is unmistakably not a status colour, not a crypto
 * colour, and not a template. It sits well on warm paper, and it is dark enough
 * to carry white text at AA contrast while still reading as a colour rather than
 * as black.
 *
 * The base is a **warm** neutral ramp — paper `#FBF9F6` over espresso ink
 * `#2A2724` — rather than the blue-greys (`#F7F8FC` / `#171827`) the app used
 * before. Warmth is what separates a considered financial document from a
 * dashboard, and it is free: it costs no saturation and no contrast.
 *
 * Dark mode is a **warm charcoal**, not a black void, so the identity survives
 * the switch instead of becoming a different product.
 */

export interface ThemeColors {
  /* --- identity ------------------------------------------------------- */
  /** Deep aubergine. The one accent. Primary actions, current selection, the Account ID. */
  primary: string;
  primaryHover: string;
  primaryPressed: string;
  /** Tint for selected chips and quiet accent backgrounds. */
  primaryLight: string;
  primarySoft: string;

  /* --- surfaces ------------------------------------------------------- */
  /** The page. Warm off-white. */
  background: string;
  /** Cards, sheets, list groups. */
  surface: string;
  /** Quiet fills: chips, inputs at rest, secondary buttons. */
  surfaceElevated: string;

  /* --- ink ----------------------------------------------------------- */
  /** Warm espresso near-black. Every primary piece of text. */
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Monospace body colour — a warm grey, not pure ink, so hashes stay quieter than prose. */
  code: string;

  /* --- rules --------------------------------------------------------- */
  /**
   * Container edges: card outlines, sheet edges, decorative grouping.
   *
   * Deliberately subtle. WCAG 1.4.11 requires 3:1 for the boundary of a
   * *control* whose edge is how you identify it, not for a container that is
   * merely a box. A card is not a control, and pushing a hairline to 3:1 would
   * turn every rule in the app into a heavy outline.
   */
  border: string;
  /**
   * Control boundaries: inputs, switches, selected chips.
   *
   * These carry the 3:1 requirement, because on a text field the outline is
   * the only thing that delineates the control 2014 the fill sits within about
   * 1.05:1 of the page. See components/ui/Input.tsx.
   */
  borderControl: string;
  /**
   * Separator between list rows. Purely decorative: WCAG 1.4.11 does not apply
   * to decorative separation, and the rows remain legible without it. Reported
   * by scripts/audit-contrast.mjs for honesty, but not gated.
   */
  divider: string;

  /* --- semantics ----------------------------------------------------- */
  /** Money in. */
  success: string;
  warning: string;
  /** Reserved for failures that are the user's problem to fix. */
  error: string;
  info: string;
  /** Low-alpha washes for badges and status chips. See Badge for why these are
   *  explicit values rather than string-concatenated alpha. */
  successTint: string;
  warningTint: string;
  errorTint: string;

  /* --- shared -------------------------------------------------------- */
  /** Text and icons drawn on top of `primary` (was hardcoded `#FFFFFF` in ~30 places). */
  onPrimary: string;
  /** Modal / sheet backdrop. */
  scrim: string;
}

const shared = {
  /** Text and icons drawn on top of `primary` (was hardcoded `#FFFFFF` in ~30 places). */
  onPrimary: '#FFFFFF',
  /** Modal / sheet backdrop. */
  scrim: 'rgba(24, 20, 18, 0.55)',
} as const;

export const lightTheme: ThemeColors = {
  /* --- identity ------------------------------------------------------- */
  /** Deep aubergine. The one accent. Primary actions, current selection, the Account ID. */
  primary: '#4A2D5C',
  primaryHover: '#3E244E',
  primaryPressed: '#331D41',
  /** Tint for selected chips and quiet accent backgrounds. */
  primaryLight: '#EFE9F2',
  primarySoft: '#F6F2F8',

  /* --- surfaces ------------------------------------------------------- */
  /** The page. Warm off-white. */
  background: '#FBF9F6',
  /** Cards, sheets, list groups. */
  surface: '#FFFFFF',
  /** Quiet fills: chips, inputs at rest, secondary buttons. */
  surfaceElevated: '#F3EFE9',

  /* --- ink ----------------------------------------------------------- */
  /** Warm espresso near-black. Every primary piece of text. */
  textPrimary: '#2A2724',
  textSecondary: '#504B43',
  textMuted: '#69635C',
  code: '#57514A',

  /* --- rules --------------------------------------------------------- */
  border: '#E7E1D8',
  borderControl: '#888077',
  divider: '#EFE9E0',

  /* --- semantics ----------------------------------------------------- */
  success: '#2F6B45',
  /** Money out is *not* an error — it is neutral, with a directional icon. */
  warning: '#83600F',
  /** Reserved for failures that are the user's problem to fix. */
  error: '#A63D22',
  info: '#4A2D5C',
  successTint: '#E4EFE8',
  warningTint: '#F3EADA',
  errorTint: '#F6E5E0',

  ...shared,
};

export const darkTheme: ThemeColors = {
  /* --- identity ------------------------------------------------------- */
  /** The same aubergine hue, lifted for contrast on charcoal. */
  primary: '#B591C9',
  primaryHover: '#C7A6D8',
  primaryPressed: '#A57CBC',
  primaryLight: '#2A2033',
  primarySoft: '#221A29',

  /* --- surfaces ------------------------------------------------------- */
  /** Warm charcoal, not black. */
  background: '#141311',
  surface: '#1D1B19',
  surfaceElevated: '#262320',

  /* --- ink ----------------------------------------------------------- */
  /** Warm off-white text on warm charcoal. */
  textPrimary: '#F4F0EA',
  textSecondary: '#B5AEA3',
  textMuted: '#979087',
  code: '#C9C2B7',

  /* --- rules --------------------------------------------------------- */
  border: '#2C2926',
  borderControl: '#877F74',
  divider: '#232120',

  /* --- semantics ----------------------------------------------------- */
  success: '#6BBF8C',
  warning: '#D9A441',
  error: '#E08A6B',
  info: '#B591C9',
  successTint: '#1C2C22',
  warningTint: '#302718',
  errorTint: '#31211C',

  ...shared,
  /** In dark mode the accent is light, so ink sits on it rather than white. */
  onPrimary: '#1A1220',
  scrim: 'rgba(0, 0, 0, 0.66)',
};

/** Kept for callers that used the previous export name. */
export const colorScheme = { light: lightTheme, dark: darkTheme } as const;
