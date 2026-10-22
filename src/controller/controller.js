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
import { SERVICE_CATEGORIES } from "../config.js"
import { MODELS } from "../data/models.js"
import { PLATES } from "../data/plates.js"

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

// What a car field holds while it is typed, so the user sees the rule at
// once. Make and model are left alone: names like "e-tron" and "iX" start
// in lower case. Spaces in the registration number go when it is saved.
const capitalFirst = (value) => value.replace(/^\s*\p{L}/u, (start) => start.toLocaleUpperCase())
const CAPITALS = (value) => value.toLocaleUpperCase()
const DIGITS = (max) => (value) => value.replace(/\D/g, "").slice(0, max)
const TYPED_RULES = {
	nickname: capitalFirst,
	engine: capitalFirst,
	vin: CAPITALS,
	year: DIGITS(4),
	mileage: DIGITS(8), // 10 000 000 has eight digits
}

// `regCountry` is the country code the registration number follows.
export function typedCarInput(field, value, regCountry = null) {
	if (field === "regNumber") return typedRegNumber(value, regCountry)
	return TYPED_RULES[field]?.(value) ?? value
}

// Spaces and hyphens only set a plate's parts apart, so they are kept
// while typing, never counted and dropped on save.
const PLATE_SEPARATOR = /[\s-]/
const plateChar = (rule) => new RegExp(`^[A-Z0-9${rule.letters}]$`, "u")

// A registration number in capitals. With a known country, only the
// characters its plates use are kept, up to its longest plate.
function typedRegNumber(value, regCountry) {
	const upper = value.toLocaleUpperCase()
	const rule = PLATES[regCountry]
	if (!rule) return upper
	const allowed = plateChar(rule)
	let count = 0
	let out = ""
	for (const char of upper) {
		if (PLATE_SEPARATOR.test(char)) out += char
		else if (allowed.test(char) && count < rule.max) {
			out += char
			count++
		}
	}
	return out
}

// Whether a registration number, without separators, is as long as the
// country's plates and uses only their characters. No rule, no check.
function plateFits(regNumber, rule) {
	if (!rule) return true
	const chars = [...regNumber]
	const allowed = plateChar(rule)
	return chars.length >= rule.min && chars.length <= rule.max && chars.every((c) => allowed.test(c))
}

// The countries with a plate rule, named in `lang` and sorted the way
// that language sorts.
export function countryList(lang) {
	const names = new Intl.DisplayNames([lang], { type: "region" })
	const collator = new Intl.Collator(lang)
	return Object.keys(PLATES)
		.map((code) => ({ code, name: names.of(code) }))
		.sort((a, b) => collator.compare(a.name, b.name))
}

// The country code for what was typed: a code we know, or a country name
// in `lang` or English, in any case. Null while it matches nothing.
export function resolveCountry(text, lang) {
	const typed = text.trim().toLocaleLowerCase()
	if (Object.hasOwn(PLATES, typed.toUpperCase())) return typed.toUpperCase()
	for (const language of [lang, "en"]) {
		const match = countryList(language).find((c) => c.name.toLocaleLowerCase() === typed)
		if (match) return match.code
	}
	return null
}

// The models we know for a make, matched without case, or none.
export function suggestedModels(make) {
	const typed = make.trim().toLocaleLowerCase()
	const key = Object.keys(MODELS).find((name) => name.toLocaleLowerCase() === typed)
	return key ? MODELS[key] : []
}

// What the car form shows besides the typed values: the countries to
// pick from, the models for the typed make, and the chosen country's
// name, plate example and plate length.
export function carFormHints(inputs, lang) {
	const countries = countryList(lang)
	const rule = PLATES[inputs.regCountry] ?? null
	return {
		countries,
		models: suggestedModels(inputs.make),
		country: countries.find((c) => c.code === inputs.regCountry) ?? null,
		plate: rule && { min: rule.min, max: rule.max, example: rule.example },
	}
}

// The typed car form as a car to store, and an error text key per field
// that is wrong. Errors come in form order, so the first one is the field
// to focus. Empty optional text is stored as null, never "".
export function validateCar(inputs, { fuels, nicknameMax, yearMin, yearMax, mileageMax }) {
	const optional = (value) => value.trim() || null
	const car = {
		nickname: optional(inputs.nickname),
		make: inputs.make.trim(),
		model: inputs.model.trim(),
		year: Number(inputs.year.trim()),
		regCountry: inputs.regCountry,
		regNumber: inputs.regNumber.replace(/[\s-]/g, "").toLocaleUpperCase(),
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
		regCountry: Object.hasOwn(PLATES, car.regCountry),
		regNumber:
			car.regNumber !== "" &&
			(plateFits(car.regNumber, PLATES[car.regCountry]) || "car.error.regNumberLength"),
		vin: car.vin === null || VIN.test(car.vin),
		fuel: fuels.includes(car.fuel),
		mileage: WHOLE_NUMBER.test(inputs.mileage.trim()) && car.mileage <= mileageMax,
	}
	// A field is true when fine, false for its usual error, or another key.
	const errors = Object.fromEntries(
		Object.entries(valid)
			.filter(([, ok]) => ok !== true)
			.map(([field, ok]) => [field, ok || `car.error.${field}`])
	)
	return { car, errors }
}

function localDateString(date = new Date()) {
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${date.getFullYear()}-${month}-${day}`
}

function isValidDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
	const date = new Date(`${value}T00:00:00Z`)
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

// A service form as a saved entry, plus an error key for each invalid field.
// The keys are in form order, so the first one is the field to focus.
export function validateServiceEntry(inputs, today = localDateString()) {
	const title = inputs.title.trim()
	const date = inputs.date.trim()
	const mileageText = inputs.mileage.trim()
	const costText = inputs.cost.trim()
	const mileage = Number(mileageText)
	const cost = Number(costText)
	const entry = {
		category: inputs.category,
		title,
		date,
		mileage,
		cost,
		workshop: inputs.workshop.trim() || null,
		notes: inputs.notes.trim() || null,
	}
	const dateError =
		date === ""
			? "service.error.dateRequired"
			: !isValidDate(date)
				? "service.error.dateInvalid"
				: date > today
					? "service.error.dateFuture"
					: true
	const valid = {
		category: SERVICE_CATEGORIES.includes(entry.category),
		title: title !== "",
		date: dateError,
		mileage: WHOLE_NUMBER.test(mileageText) && Number.isSafeInteger(mileage),
		cost: WHOLE_NUMBER.test(costText) && Number.isSafeInteger(cost),
	}
	const errors = Object.fromEntries(
		Object.entries(valid)
			.filter(([, ok]) => ok !== true)
			.map(([field, ok]) => [field, ok || `service.error.${field}`])
	)
	return { entry, errors }
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
				model.inputs.profile.name = fixTyped(target, capitalFirst) // no redraw while typing
			},
			"create-profile": createProfile,
			"choose-profile": (_event, target) => chooseProfile(target.dataset.id),
			"switch-profile": () => setActiveProfile(null),
			"add-car": () => {
				clearInputs()
				go("carForm")
			},
			// The country is kept as its code once the typed name matches
			// one. A new make or country changes the model suggestions and
			// the plate example, so those are updated in place.
			"car-input": (_event, target) => {
				const { field } = target.dataset
				const car = model.inputs.car
				if (!Object.hasOwn(car, field)) return
				const { lang } = resolvePreferences(model.app.preferences)
				if (field === "regCountry")
					car.regCountry = resolveCountry(target.value, lang) ?? target.value
				else car[field] = fixTyped(target, (value) => typedCarInput(field, value, car.regCountry))
				if (field === "make" || field === "regCountry") view.updateCarForm(carFormHints(car, lang))
			},
			"save-car": saveCar,
			"open-car": (event, target) => {
				event.preventDefault()
				openCar(target.dataset.id)
			},
			"open-history": (event, target) => {
				event.preventDefault()
				openHistory(target.dataset.id)
			},
			"register-service": registerService,
			"save-service-entry": saveServiceEntry,
			"cancel-service-entry": cancelServiceEntry,
			"service-entry-input": (_event, target) => {
				const { field } = target.dataset
				if (Object.hasOwn(model.inputs.serviceEntry, field)) {
					model.inputs.serviceEntry[field] = target.value
				}
			},
			"service-entry-category": (_event, target) => {
				if (SERVICE_CATEGORIES.includes(target.value)) {
					model.inputs.serviceEntry.category = target.value
				}
			},
			"back-garage": backToGarage,
			"back-car": backToCar,
			"history-filter": (_event, target) => setHistoryFilter(target.value),
			"cancel-car": () => {
				clearInputs()
				go("garage")
			},
			// actionName: (event, target) => { change model, then render() }
		})
		globalThis.addEventListener?.("popstate", handlePopState)

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
		derived.selectedCar = derived.cars.find((car) => car.id === model.app.selectedCarId) ?? null
		derived.totalServiceCost = model.data.serviceEntries
			.filter((entry) => entry.carId === model.app.selectedCarId)
			.reduce((total, entry) => total + entry.cost, 0)
		if (model.app.page === "history") {
			const carHistory = model.data.serviceEntries.filter(
				(entry) => entry.carId === model.app.selectedCarId
			)
			derived.hasHistoryEntries = carHistory.length > 0
			derived.history = carHistory
				.filter(
					(entry) => model.app.historyFilter === "all" || entry.category === model.app.historyFilter
				)
				.sort((a, b) => b.date.localeCompare(a.date))
		}
		if (model.app.page === "serviceForm") derived.today = localDateString()
		if (model.app.page === "carForm") derived.carForm = carFormHints(model.inputs.car, derived.lang)
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

	// What a field holds after `rule`. A character the field can't hold is
	// fixed in place, and the caret stays after the same typed text, so a
	// key pressed mid-field doesn't throw it to the end.
	function fixTyped(target, rule) {
		const value = rule(target.value)
		if (value !== target.value) {
			const caret = rule(target.value.slice(0, target.selectionStart ?? undefined)).length
			view.setFieldValue(target, value, caret)
		}
		return value
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
			mileageMax: config.carMileageMax,
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

	function registerService() {
		openServiceForm(model.app.selectedCarId)
	}

	function openServiceForm(carId, { pushHistory = true } = {}) {
		const car = model.data.cars.find(
			(candidate) => candidate.id === carId && candidate.profileId === model.data.activeProfileId
		)
		if (!car) return
		model.app.selectedCarId = carId
		clearServiceEntryInputs()
		if (pushHistory && globalThis.history?.pushState) {
			globalThis.history.pushState(
				{ ...(globalThis.history.state ?? {}), motorCatalogPage: "serviceForm", carId },
				"",
				`#register-service-${carId}`
			)
		}
		go("serviceForm")
	}

	function clearServiceEntryInputs() {
		model.inputs.serviceEntry = structuredClone(blankInputs.serviceEntry)
		model.inputs.errors = {}
	}

	function cancelServiceEntry() {
		clearServiceEntryInputs()
		if (
			globalThis.history?.state?.motorCatalogPage === "serviceForm" &&
			typeof globalThis.history.back === "function"
		) {
			globalThis.history.back()
			return
		}
		go("history")
	}

	function saveServiceEntry() {
		const car = model.data.cars.find(
			(candidate) =>
				candidate.id === model.app.selectedCarId &&
				candidate.profileId === model.data.activeProfileId
		)
		if (!car) return
		const { entry, errors } = validateServiceEntry(model.inputs.serviceEntry)
		const fields = Object.keys(errors)
		if (fields.length > 0) {
			model.inputs.errors = errors
			render()
			view.focusField(`service-${fields[0]}`)
			return
		}
		model.data.serviceEntries.push({ id: crypto.randomUUID(), carId: car.id, ...entry })
		if (entry.mileage > car.mileage) car.mileage = entry.mileage
		saveData(model.data)
		model.app.historyFilter = "all"
		clearServiceEntryInputs()
		if (
			globalThis.history?.state?.motorCatalogPage === "serviceForm" &&
			typeof globalThis.history.back === "function"
		) {
			globalThis.history.back()
			return
		}
		go("history")
	}

	// A car card opens its detail page. Only the active profile's own cars
	// can be selected; a history entry lets the browser back button return.
	function openCar(id, { pushHistory = true } = {}) {
		const own = model.data.cars.some(
			(c) => c.id === id && c.profileId === model.data.activeProfileId
		)
		if (!own) return
		model.app.selectedCarId = id
		if (pushHistory && globalThis.history?.pushState) {
			globalThis.history.pushState(
				{ ...(globalThis.history.state ?? {}), motorCatalogPage: "car", carId: id },
				"",
				`#car-${id}`
			)
		}
		go("car")
	}

	function backToGarage() {
		if (globalThis.history?.state?.motorCatalogPage === "car") {
			globalThis.history.back()
			return
		}
		model.app.selectedCarId = null
		go("garage")
	}

	function openHistory(id, { pushHistory = true } = {}) {
		const car = model.data.cars.find(
			(candidate) => candidate.id === id && candidate.profileId === model.data.activeProfileId
		)
		if (!car) return
		model.app.selectedCarId = id
		if (pushHistory && globalThis.history?.pushState) {
			globalThis.history.pushState(
				{ ...(globalThis.history.state ?? {}), motorCatalogPage: "history", carId: id },
				"",
				`#history-${id}`
			)
		}
		go("history")
	}

	function backToCar() {
		if (globalThis.history?.state?.motorCatalogPage === "history") {
			globalThis.history.back()
			return
		}
		if (model.data.cars.some((car) => car.id === model.app.selectedCarId)) {
			go("car")
			return
		}
		model.app.selectedCarId = null
		go("garage")
	}

	function setHistoryFilter(filter) {
		if (!["all", ...config.serviceCategories].includes(filter)) return
		if (model.app.historyFilter === filter) return
		model.app.historyFilter = filter
		render()
		view.focusField("history-filter")
	}

	function handlePopState(event) {
		const entry = event.state
		if (entry?.motorCatalogPage === "serviceForm") {
			openServiceForm(entry.carId, { pushHistory: false })
			return
		}
		if (entry?.motorCatalogPage === "history") {
			openHistory(entry.carId, { pushHistory: false })
			return
		}
		if (entry?.motorCatalogPage === "car") {
			openCar(entry.carId, { pushHistory: false })
			return
		}
		if (model.app.page === "serviceForm") {
			clearServiceEntryInputs()
			if (model.data.cars.some((car) => car.id === model.app.selectedCarId)) {
				go("history")
				return
			}
		}
		if (model.app.page === "history") {
			if (model.data.cars.some((car) => car.id === model.app.selectedCarId)) {
				go("car")
				return
			}
		}
		if (model.app.page === "car") {
			model.app.selectedCarId = null
			go("garage")
		}
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
