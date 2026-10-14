/* workbench-lib: i18n v2.1.0 — extracted; edit in the workbench, not here */
/* ======================================================================
   i18n — translate UI strings from flat key → string bundles.

   Pure and DOM-free on purpose: it never touches localStorage, navigator
   or document. The project keeps the current language in its model and
   persists it in its controller; this module only turns (lang, key) into
   a string, so it tests in node and never fights the MVC split.

   Bundles are project content, not library content:
     { en: { "app.title": "Timer", "items.one": "{count} item", "items.other": "{count} items" },
       nb: { ... } }

   Interpolated vars are NOT escaped — t() returns plain text. Escape before
   innerHTML, or set it with textContent.

   Language names and money come from Intl, so no bundle carries a language
   name or a price string: the browser already knows "norsk bokmål" and
   where "kr" goes.
   ====================================================================== */

const PLACEHOLDER_RE = /\{(\w+)\}/g

// "no" is the macrolanguage tag and names neither written form; "nn" readers
// get Bokmål when no Nynorsk bundle exists, the closest thing there is.
const DEFAULT_ALIASES = { no: "nb", nn: "nb" }

function interpolate(text, vars) {
	return text.replace(PLACEHOLDER_RE, (match, name) => (name in vars ? String(vars[name]) : match))
}

export function createTranslator(bundles, { fallback = "en", aliases = {} } = {}) {
	const languages = Object.keys(bundles)
	if (!languages.includes(fallback)) {
		throw new Error(`i18n: fallback language "${fallback}" has no bundle`)
	}
	const aliasMap = { ...DEFAULT_ALIASES, ...aliases }

	// A raw string for the key, or null. Falls through to the fallback bundle
	// so a half-translated language still renders — in the fallback tongue,
	// never as a blank.
	function lookup(lang, key) {
		return bundles[lang]?.[key] ?? bundles[fallback][key] ?? null
	}

	// Missing keys come back as the key itself: visible in the UI, easy to grep.
	function t(lang, key, vars = {}) {
		const text = lookup(lang, key)
		return text === null ? key : interpolate(text, vars)
	}

	// Picks "<key>.<category>" by the language's own plural rules — Norwegian
	// and English have one/other, Ukrainian one/few/many/other — and falls
	// back to "<key>.other" so a bundle only needs the forms its language uses.
	// The count is always available as {count}.
	function plural(lang, key, count, vars = {}) {
		const category = new Intl.PluralRules(lang).select(count)
		const chosen = lookup(lang, `${key}.${category}`) !== null ? `${key}.${category}` : `${key}.other`
		return t(lang, chosen, { count, ...vars })
	}

	// Maps whatever the environment offers ("de-AT", "NB", ["en-GB", "nb"],
	// null) to a bundled language, or the fallback. Candidates are strings or
	// arrays in priority order; the controller feeds it the stored choice
	// first, then navigator.languages. The region is stripped, and an alias
	// applies only when the plain tag has no bundle of its own.
	function resolveLang(...candidates) {
		for (const candidate of candidates.flat(Number.POSITIVE_INFINITY)) {
			if (typeof candidate !== "string") continue
			const short = candidate.toLowerCase().split("-")[0]
			if (languages.includes(short)) return short
			const alias = aliasMap[short]
			if (languages.includes(alias)) return alias
		}
		return fallback
	}

	// "Norsk bokmål" for the picker row; displayName("nb", "en") gives
	// "Norwegian Bokmål" for an admin screen. CLDR autonyms are lower-case
	// in some languages, so the first letter is upper-cased for row text.
	function displayName(lang, inLang = lang) {
		const name = new Intl.DisplayNames([inLang], { type: "language" }).of(lang)
		return name.charAt(0).toLocaleUpperCase(inLang) + name.slice(1)
	}

	// The language chooses separators and symbol placement, the currency the
	// symbol. "symbol" gives "kr" at home and "NOK" abroad; narrowSymbol would
	// collapse NOK, SEK and DKK to "kr" the moment two of them meet.
	// stripWhole drops ",00" from a whole amount ("949 kr") and keeps a real
	// fraction ("949,50 kr"). Nothing is rounded.
	function money(lang, amount, currency, { stripWhole = false } = {}) {
		const options = { style: "currency", currency, currencyDisplay: "symbol" }
		if (stripWhole) options.trailingZeroDisplay = "stripIfInteger"
		return new Intl.NumberFormat(lang, options).format(amount)
	}

	return { t, plural, resolveLang, displayName, money, languages, fallback }
}
