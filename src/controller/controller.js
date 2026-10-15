/* ======================================================================
   src/controller/controller.js: CONTROLLER
   The only code that changes the model. It handles view actions, updates
   the model, then calls render(). It owns any timers and never writes
   HTML: that is the view's job.

   Derived values (for now the lang, theme and currency in use) are
   worked out on every render and handed to the view beside the model.
   They are never stored, so they never go stale.

   The controller is the only layer that touches localStorage, and it does
   so through design-system/theme/preferences.js: the three keys "lang",
   "theme" and "currency" hold a real option or nothing (System). A write
   that fails (Safari private mode) is swallowed there, and the model
   keeps the choice for the open page.
   ====================================================================== */

import {
	applyTheme,
	readPreference,
	systemTheme,
	THEMES,
	watchStorage,
	watchSystemTheme,
	writePreference,
} from "../../design-system/theme/preferences.js"

export const PREFERENCES = Object.freeze(["lang", "theme", "currency"])

// The currency of the first navigator.languages entry whose region is in the
// table; the base currency when no entry carries a mapped region.
export function systemCurrency(languages, { regions, baseCurrency }) {
	for (const tag of languages ?? []) {
		const region = String(tag).split("-")[1]
		const currency = region && regions[region.toUpperCase()]
		if (currency) return currency
	}
	return baseCurrency
}

// The value in use per preference: the choice, or System's value.
export function resolvePreferences({ chosen, system }) {
	return Object.fromEntries(PREFERENCES.map((name) => [name, chosen[name] ?? system[name]]))
}

// Read once per page load: the stored choice per preference (null when
// absent or invalid; an invalid value is removed) and what System resolves
// to right now. Language and currency are not re-read mid-session.
export function readPreferences({ i18n, config, languages = navigator.languages }) {
	return {
		chosen: {
			lang: readPreference("lang", i18n.languages),
			theme: readPreference("theme", THEMES),
			currency: readPreference("currency", config.currencies),
		},
		system: {
			lang: i18n.resolveLang(languages),
			theme: systemTheme(),
			currency: systemCurrency(languages, config),
		},
	}
}

// `languages` defaults to navigator.languages; tests pass their own.
export function createController({ model, view, i18n, config, languages }) {
	let headerKey = null

	function init() {
		model.app.preferences = readPreferences({ i18n, config, languages })

		view.bindActions({
			"set-lang": (_event, target) => choose("lang", target.dataset.lang),
			"set-theme": (_event, target) => choose("theme", target.dataset.value),
			"set-currency": (_event, target) => choose("currency", target.dataset.currency),
			// actionName: (event, target) => { change model, then render() }
		})

		// While no theme key is stored the page follows the OS. Another tab
		// changing or clearing the key is applied here too. Both go through
		// the model so the header re-renders with the right icon and row.
		watchSystemTheme((theme) => setSystem("theme", theme))
		watchStorage((stored) => setPreference("theme", stored))

		render() // first render
	}

	// Every change to the model ends here: work out the derived values,
	// then redraw.
	function render() {
		const derived = resolvePreferences(model.app.preferences)
		view.render(model, derived)
		syncHeader(derived)
		syncDocument(derived)
	}

	// An explicit choice, or "" / null for the System row. A repeat of the
	// current choice changes nothing, so nothing is redrawn.
	function setPreference(name, value) {
		const next = value === "" || value === undefined ? null : value
		const { chosen } = model.app.preferences
		if (next === chosen[name]) return
		chosen[name] = next
		render()
	}

	// The live system value changed (the OS switched theme). It only shows
	// while nothing is chosen, but the System row names it either way.
	function setSystem(name, value) {
		const { system } = model.app.preferences
		if (value === system[name]) return
		system[name] = value
		render()
	}

	// A picker row was chosen. "" is the System row and removes the key.
	// The model is updated last, so a storage failure never loses the choice.
	// Focus returns to the trigger of the picker that was used: its new name
	// is the audible result of the press.
	function choose(name, value) {
		writePreference(name, value)
		setPreference(name, value)
		view.focusPicker(name)
	}

	// The header holds the pickers and is re-rendered only when one of the
	// three preferences (or what System resolves to) changes, so unrelated
	// updates never tear an open picker down.
	function syncHeader(derived) {
		const { chosen, system } = model.app.preferences
		const key = JSON.stringify(PREFERENCES.map((name) => [chosen[name], system[name]]))
		if (key === headerKey) return
		headerKey = key
		view.renderHeader(model, derived)
	}

	// Document-level, not HTML: screen readers pick their voice from <html lang>,
	// the tab title should read in the active language, and the theme lives on
	// <html data-theme> where the tokens read it.
	function syncDocument({ lang, theme }) {
		document.documentElement.lang = lang
		document.title = i18n.t(lang, "app.title")
		applyTheme(theme)
	}

	return { init, render }
}
