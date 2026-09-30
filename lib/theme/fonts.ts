import { useFonts } from 'expo-font';
import {
  Newsreader_500Medium,
  Newsreader_600SemiBold,
} from '@expo-google-fonts/newsreader';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';

/**
 * # Typography
 *
 * ## Why load real fonts at all
 *
 * `expo-font` was already installed and configured in `app.json` — but no font
 * was ever loaded, so every glyph in the app came from the OS default. That
 * single fact capped how distinctive the product could ever look, and it is why
 * the previous design read as a template: it was Roboto/SF with a purple accent,
 * which is the default combination of every fintech app ever shipped.
 *
 * ## The pairing
 *
 * **Newsreader** (serif) for display type — screen titles, section headings and
 * the balance figure. A serif is the register of a bank statement, a receipt, a
 * ledger page. Using it *only* for display is what makes it read as a
 * considered financial document rather than as a "heritage banking" costume,
 * and it is the strongest single signal that this is a money product rather than
 * a crypto dashboard. It is deliberately never used for controls, body copy, or
 * anything a user has to scan in a list.
 *
 * **Manrope** (geometric sans) for everything else, including every numeral. It
 * has unusually well-behaved tabular figures, which matters more here than in
 * most apps: the balance ticks live, the Account ID is read character by
 * character, and amounts sit in tight columns in asset rows. Proportional
 * figures in those places cause visible layout jitter as values change.
 *
 * **System monospace** for addresses, hashes and seed phrases — already the
 * existing convention in this codebase, and correct: those are code-like values
 * where digit confusion is a genuine risk.
 *
 * ## Failure behaviour
 *
 * If the fonts fail to load the app still renders — `useUlmaraFonts` reports the
 * error and the layout continues. The tokens name font families that will not
 * resolve, so the platform falls back to its default: ugly, but not broken. A
 * wallet that cannot show you your balance is worse than one with the wrong
 * typeface.
 *
 * The family names in `tokens.ts` must match these keys exactly, which is why
 * they are all `Family_Weight` rather than bare weight names.
 */
export function useUlmaraFonts() {
  const [loaded, error] = useFonts({
    Newsreader_500Medium,
    Newsreader_600SemiBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (error) {
    // Surfaced once and loudly, because it silently degrades the whole visual
    // identity. Deliberately not thrown — see above.
    console.warn('[theme] custom fonts failed to load, falling back to system type', error);
  }

  return { fontsLoaded: loaded, fontError: error ?? null };
}
