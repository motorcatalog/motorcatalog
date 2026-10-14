/* ======================================================================
   i18n — type declarations for index.js, so TypeScript projects get a
   checked contract without the library itself being TypeScript.

   Types come from the bundles passed in: languages are the bundle names,
   and keys are the keys every bundle shares. With JSON bundles imported
   as modules, a mistyped key in t() is a compile error, not a raw key in
   the UI.
   ====================================================================== */

export type Bundle = Record<string, string>

export type Vars = Record<string, string | number>

export interface MoneyOptions {
	/** Drop the fraction digits from a whole amount: "949 kr", while 949.5 stays "949,50 kr". Chrome 106, Firefox 116, Safari 15.4. */
	stripWhole?: boolean
}

export interface Translator<Lang extends string = string, Key extends string = string> {
	/** The string for `key` in `lang`, then in the fallback, then the key itself. `{vars}` are interpolated, never escaped. */
	t(lang: Lang, key: Key, vars?: Vars): string
	/** Picks `<key>.<category>` by the language's plural rules, falling back to `<key>.other`. `{count}` is always set. */
	plural(lang: Lang, key: string, count: number, vars?: Vars): string
	/**
	 * The first candidate that maps to a bundled language, else the fallback. Candidates are
	 * strings or arrays in priority order ("nb-NO", ["en-GB", "nb"], null); the region is
	 * stripped and an alias (`no` → `nb`) applies when the plain tag has no bundle.
	 */
	resolveLang(...candidates: unknown[]): Lang
	/** The language's own name with an upper-cased first letter ("Norsk bokmål"), or its name in `inLang`. */
	displayName(lang: Lang, inLang?: string): string
	/** `amount` in `currency` (ISO 4217) by `lang`'s rules, full symbol: "949,00 kr" for nb, "NOK 949.00" for en. `{ stripWhole: true }` gives "949 kr". */
	money(lang: Lang, amount: number, currency: string, options?: MoneyOptions): string
	readonly languages: Lang[]
	readonly fallback: Lang
}

export function createTranslator<Bundles extends Record<string, Bundle>>(
	bundles: Bundles,
	options?: {
		fallback?: Extract<keyof Bundles, string>
		/** Extends the default `{ no: "nb", nn: "nb" }`; a target without a bundle is skipped. */
		aliases?: Record<string, string>
	}
): Translator<Extract<keyof Bundles, string>, Extract<keyof Bundles[keyof Bundles], string>>
