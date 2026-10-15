/* ======================================================================
   src/model/model.js — MODEL
   State and data only. No DOM. No timers.
   Change state through methods here, then call notify() so the view
   re-renders.

   The three preferences (lang, theme, currency) follow one rule:
   value = chosen (if any) ?? system. "System" is the absence of a choice
   (null here, no key in storage), never a stored "system" string. The
   controller reads and writes storage; this model only holds the values.
   ====================================================================== */

import { config } from "../config.js"

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

// `chosen`: the stored choice per preference or null (System).
// `system`: what System resolves to right now, per preference.
export function createModel({ chosen, system, languages }) {
	const subscribers = []

	const state = {
		chosen: { lang: null, theme: null, currency: null, ...chosen },
		system: { ...system },
		languages, // bundle keys from src/locales, in picker order
		config,
		// Resolved values the view renders with. Kept in sync by resolve().
		lang: null,
		theme: null,
		currency: null,
		// project state goes here
	}
	resolve()

	function resolve() {
		for (const name of PREFERENCES) state[name] = state.chosen[name] ?? state.system[name]
	}

	function subscribe(fn) {
		subscribers.push(fn)
	}

	function notify() {
		for (const fn of subscribers) fn(state)
	}

	// An explicit choice, or "" / null for the System row.
	function setPreference(name, value) {
		const next = value === "" || value === undefined ? null : value
		if (next === state.chosen[name]) return
		state.chosen[name] = next
		resolve()
		notify()
	}

	// The live system value changed (the OS switched theme, another tab
	// cleared the key). Only matters to the view while nothing is chosen.
	function setSystem(name, value) {
		if (value === state.system[name]) return
		state.system[name] = value
		resolve()
		notify()
	}

	return { subscribe, notify, state, setPreference, setSystem }
}
