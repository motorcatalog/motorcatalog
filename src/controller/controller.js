/* ======================================================================
   src/controller/controller.js — CONTROLLER
   Behavior: handles view actions, updates the model, owns any timers.
   Never writes HTML — that's the view's job.

   The controller is the only layer that touches localStorage, and it does
   so through design-system/theme/preferences.js: the three keys "lang",
   "theme" and "currency" hold a real option or nothing (System). A write
   that fails (Safari private mode) is swallowed there; the model keeps
   the choice for the open page.
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
import { PREFERENCES, systemCurrency } from "../model/model.js"

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

export function createController({ model, view, i18n }) {
	let headerKey = null

	function init() {
		model.subscribe((state) => view.render(state))
		model.subscribe(syncHeader)
		model.subscribe(syncDocument)

		view.bindActions({
			"set-lang": (_event, target) => choose("lang", target.dataset.lang),
			"set-theme": (_event, target) => choose("theme", target.dataset.value),
			"set-currency": (_event, target) => choose("currency", target.dataset.currency),
			// actionName: (event, target) => { update model state, then model.notify() }
		})

		// While no theme key is stored the page follows the OS; another tab
		// changing or clearing the key is applied here too. Both go through
		// the model so the header re-renders with the right icon and row.
		watchSystemTheme((theme) => model.setSystem("theme", theme))
		watchStorage((stored) => model.setPreference("theme", stored))

		model.notify() // first render
	}

	// A picker row was chosen. "" is the System row and removes the key.
	// The model is updated last, so a storage failure never loses the choice.
	// Focus returns to the trigger of the picker that was used: its new name
	// is the audible result of the press.
	function choose(name, value) {
		writePreference(name, value)
		model.setPreference(name, value)
		view.focusPicker(name)
	}

	// The header holds the pickers and is re-rendered only when one of the
	// three preferences (or what System resolves to) changes, so unrelated
	// state updates never tear an open picker down.
	function syncHeader(state) {
		const key = JSON.stringify(PREFERENCES.map((name) => [state.chosen[name], state.system[name]]))
		if (key === headerKey) return
		headerKey = key
		view.renderHeader(state)
	}

	// Document-level, not HTML: screen readers pick their voice from <html lang>,
	// the tab title should read in the active language, and the theme lives on
	// <html data-theme> where the tokens read it.
	function syncDocument(state) {
		document.documentElement.lang = state.lang
		document.title = i18n.t(state.lang, "app.title")
		applyTheme(state.theme)
	}

	return { init }
}
