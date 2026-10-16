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

   model.data is saved as JSON under the single key "motorcatalog" after
   every change. Missing, broken or wrongly shaped data is ignored, and
   the app starts empty (docs/design/data-model.md, Storage).
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

export const STORAGE_KEY = "motorcatalog"
const DATA_VERSION = 1
const LISTS = ["profiles", "cars", "serviceEntries", "tasks"]

const isProfile = (p) => typeof p?.id === "string" && typeof p.name === "string"
const isCar = (c) => typeof c?.id === "string" && typeof c.profileId === "string"

// The saved data, or null when it is missing, broken or the wrong shape.
// An active id that matches no profile is dropped, so the picker shows.
export function loadData() {
	let data
	try {
		data = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY))
	} catch {
		return null
	}
	if (data?.version !== DATA_VERSION) return null
	if (!LISTS.every((name) => Array.isArray(data[name]))) return null
	if (!data.profiles.every(isProfile) || !data.cars.every(isCar)) return null
	const active = data.profiles.some((p) => p.id === data.activeProfileId)
	return {
		version: DATA_VERSION,
		activeProfileId: active ? data.activeProfileId : null,
		...Object.fromEntries(LISTS.map((name) => [name, data[name]])),
	}
}

// A write that fails (private mode, storage full) is swallowed: the model
// still holds the data for the open page.
function saveData(data) {
	try {
		globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
	} catch {}
}

// The trimmed name and an error text key, or null when the name is fine.
// Names are compared without case, so "Malin" and "malin" can't both exist.
export function validateProfileName(input, profiles, max) {
	const name = input.trim()
	const taken = (p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase()
	let error = null
	if (name === "") error = "profile.error.required"
	else if (name.length > max) error = "profile.error.tooLong"
	else if (profiles.some(taken)) error = "profile.error.taken"
	return { name, error }
}

const WHOLE_NUMBER = /^\d+$/
// 17 letters and digits. I, O and Q are never used, so they can't be
// mistaken for 1 and 0.
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/

// The typed car form as a car to store, and an error text key per field
// that is wrong. Errors come in form order, so the first one is the field
// to focus. Empty optional text is stored as null, never "".
export function validateCar(inputs, { fuels, nicknameMax, yearMin, yearMax }) {
	const optional = (value) => value.trim() || null
	const car = {
		nickname: optional(inputs.nickname),
		make: inputs.make.trim(),
		model: inputs.model.trim(),
		year: Number(inputs.year.trim()),
		regNumber: inputs.regNumber.replace(/\s/g, "").toUpperCase(),
		vin: optional(inputs.vin)?.toUpperCase() ?? null,
		fuel: inputs.fuel,
		engine: optional(inputs.engine),
		mileage: Number(inputs.mileage.trim()),
		euInspectionDue: optional(inputs.euInspectionDue),
	}
	const valid = {
		nickname: car.nickname === null || car.nickname.length <= nicknameMax,
		make: car.make !== "",
		model: car.model !== "",
		year: WHOLE_NUMBER.test(inputs.year.trim()) && car.year >= yearMin && car.year <= yearMax,
		regNumber: car.regNumber !== "",
		vin: car.vin === null || VIN.test(car.vin),
		fuel: fuels.includes(car.fuel),
		mileage: WHOLE_NUMBER.test(inputs.mileage.trim()) && Number.isSafeInteger(car.mileage),
	}
	const errors = Object.fromEntries(
		Object.keys(valid)
			.filter((field) => !valid[field])
			.map((field) => [field, `car.error.${field}`])
	)
	return { car, errors }
}

const activeProfile = ({ profiles, activeProfileId }) =>
	profiles.find((p) => p.id === activeProfileId) ?? null

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
	// The empty forms, taken before anything is typed, so a page change can
	// start every form afresh.
	const blankInputs = structuredClone(model.inputs)

	function init() {
		model.app.preferences = readPreferences({ i18n, config, languages })
		const saved = loadData()
		if (saved) model.data = saved
		model.app.page = model.data.activeProfileId ? "garage" : "profiles"

		view.bindActions({
			"set-lang": (_event, target) => choose("lang", target.dataset.lang),
			"set-theme": (_event, target) => choose("theme", target.dataset.value),
			"set-currency": (_event, target) => choose("currency", target.dataset.currency),
			"profile-name": (_event, target) => {
				model.inputs.profile.name = target.value // no redraw while typing
			},
			"create-profile": createProfile,
			"choose-profile": (_event, target) => chooseProfile(target.dataset.id),
			"switch-profile": () => setActiveProfile(null),
			"add-car": () => {
				clearInputs()
				go("carForm")
			},
			"car-input": (_event, target) => {
				const { field } = target.dataset
				if (Object.hasOwn(model.inputs.car, field)) model.inputs.car[field] = target.value
			},
			"save-car": saveCar,
			"cancel-car": () => {
				clearInputs()
				go("garage")
			},
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
		const derived = {
			...resolvePreferences(model.app.preferences),
			profile: activeProfile(model.data),
			cars: model.data.cars.filter((c) => c.profileId === model.data.activeProfileId),
		}
		view.render(model, derived)
		syncHeader(derived)
		syncDocument(derived)
	}

	// A new page: draw it, then move focus to its heading so a screen
	// reader announces where the user landed.
	function go(page) {
		model.app.page = page
		render()
		view.focusHeading()
	}

	// The profile form was submitted. An invalid name stays on the page
	// with its error, and focus goes back to the field.
	function createProfile() {
		const { name, error } = validateProfileName(
			model.inputs.profile.name,
			model.data.profiles,
			config.profileNameMax
		)
		if (error) {
			model.inputs.errors = { name: error }
			render()
			view.focusField("profile-name")
			return
		}
		const profile = { id: crypto.randomUUID(), name }
		model.data.profiles.push(profile)
		setActiveProfile(profile.id)
	}

	function chooseProfile(id) {
		if (model.data.profiles.some((p) => p.id === id)) setActiveProfile(id)
	}

	// A profile id opens its garage; null opens the picker. Either way the
	// forms start empty next time.
	function setActiveProfile(id) {
		model.data.activeProfileId = id
		saveData(model.data)
		clearInputs()
		go(id ? "garage" : "profiles")
	}

	function clearInputs() {
		model.inputs = structuredClone(blankInputs)
	}

	// The car form was submitted. A car with errors stays on the form with
	// what was typed, and focus goes to the first field with an error.
	function saveCar() {
		const profileId = model.data.activeProfileId
		if (!profileId) return
		const { car, errors } = validateCar(model.inputs.car, {
			fuels: config.fuels,
			nicknameMax: config.carNicknameMax,
			yearMin: config.carYearMin,
			yearMax: new Date().getFullYear() + 1,
		})
		const fields = Object.keys(errors)
		if (fields.length > 0) {
			model.inputs.errors = errors
			render()
			view.focusField(`car-${fields[0]}`)
			return
		}
		model.data.cars.push({ id: crypto.randomUUID(), profileId, ...car })
		saveData(model.data)
		clearInputs()
		go("garage")
	}

	// An explicit choice, or "" / null for the System row. A repeat of the
	// current choice changes nothing, so nothing is redrawn.
	function setPreference(name, value) {
		const next = value === "" || value === undefined ? null : value
		const { chosen, system } = model.app.preferences
		if (next === chosen[name]) return
		chosen[name] = next
		// The OS theme is only watched while no theme is chosen, so it is
		// read again here in case it changed in the meantime.
		if (name === "theme") system.theme = systemTheme()
		render()
	}

	// The live system value changed (the OS switched theme). The OS is only
	// watched while no theme is chosen; setPreference catches up on the rest.
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

	// The header holds the pickers and the active profile. It is re-rendered
	// only when one of the three preferences (or what System resolves to)
	// or the active profile changes, so unrelated updates never tear an
	// open picker down.
	function syncHeader(derived) {
		const { chosen, system } = model.app.preferences
		const key = JSON.stringify([
			...PREFERENCES.map((name) => [chosen[name], system[name]]),
			derived.profile && [derived.profile.id, derived.profile.name],
		])
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
