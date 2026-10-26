/* ======================================================================
   tests/controller.test.js: the controller owns the model, the three
   preference keys and the saved data under "motorcatalog"
   localStorage, document, matchMedia and window listeners are stubbed
   so the controller runs under node's built-in runner. The view is a
   recorder: it never renders. Every test works on a clone of the model,
   never the imported object.
   ====================================================================== */

import assert from "node:assert/strict"
import { afterEach, beforeEach, test } from "node:test"
import { createTranslator } from "../i18n/index.js"
import { config } from "../src/config.js"
import {
	carFormHints,
	carHistory,
	createController,
	loadData,
	resolveCountry,
	resolvePreferences,
	STORAGE_KEY,
	suggestedModels,
	systemCurrency,
	typedCarInput,
	validateCar,
	validateProfileName,
	validateServiceEntry,
} from "../src/controller/controller.js"
import { PLATES } from "../src/data/plates.js"
import { bundles, FALLBACK_LANG } from "../src/locales/index.js"
import { model as initialModel } from "../src/model/model.js"
import { MULTI_CURRENCY } from "./fixtures.js"

const i18n = createTranslator(bundles, { fallback: FALLBACK_LANG })

// A localStorage that records what the controller does to it and can be
// told to refuse writes, the way Safari private mode does.
function fakeStorage(items = {}, { throwOnSet = false } = {}) {
	const removed = []
	return {
		items,
		removed,
		getItem: (key) => items[key] ?? null,
		setItem(key, value) {
			if (throwOnSet) throw new Error("QuotaExceededError")
			items[key] = value
		},
		removeItem(key) {
			delete items[key]
			removed.push(key)
		},
	}
}

// Records what the controller asks of the view. `derived` is what the
// last render() was handed.
function fakeView() {
	const view = {
		renders: 0,
		headerRenders: 0,
		focused: [],
		headings: 0,
		fields: [],
		corrected: [],
		carForms: [],
		handlers: {},
		derived: null,
		render(_model, derived) {
			view.renders++
			view.derived = derived
		},
		renderHeader: () => view.headerRenders++,
		focusPicker: (name) => view.focused.push(name),
		focusHeading: () => view.headings++,
		focusField: (id) => view.fields.push(id),
		setFieldValue: (_input, value, caret) => view.corrected.push({ value, caret }),
		updateCarForm: (hints) => view.carForms.push(hints),
		bindActions: (handlers) => Object.assign(view.handlers, handlers),
	}
	return view
}

// A prefers-color-scheme query the test can flip, the way the OS does.
// Install it before boot() so the controller sees it.
function fakeColorScheme() {
	const query = {
		matches: false,
		listeners: [],
		addEventListener: (_type, fn) => query.listeners.push(fn),
		removeEventListener() {},
	}
	globalThis.matchMedia = () => query
	return {
		flip(light) {
			query.matches = light
			for (const fn of query.listeners) fn()
		},
	}
}

// Window listeners the controller adds, so a test can fire a "storage"
// event the way another tab's write does.
let windowListeners = []
function storageEvent(key) {
	for (const [type, fn] of windowListeners) if (type === "storage") fn({ key })
}

// Boots a controller the way app.js does, on a clone of the model.
function boot(storage) {
	Object.defineProperty(globalThis, "localStorage", {
		value: storage,
		configurable: true,
		writable: true,
	})
	const model = structuredClone(initialModel)
	const view = fakeView()
	const controller = createController({
		model,
		view,
		i18n,
		config: MULTI_CURRENCY,
		languages: ["nb-NO", "en"],
	})
	controller.init()
	return { model, view, controller }
}

// Node 22+ defines localStorage as a getter that warns when read, so the
// globals are swapped as property descriptors, never read.
const GLOBALS = [
	"localStorage",
	"document",
	"addEventListener",
	"removeEventListener",
	"matchMedia",
	"history",
	"location",
]
const saved = {}
beforeEach(() => {
	for (const name of GLOBALS) saved[name] = Object.getOwnPropertyDescriptor(globalThis, name)
	windowListeners = []
	globalThis.document = { documentElement: { lang: "", dataset: {} }, title: "" }
	globalThis.addEventListener = (type, fn) => windowListeners.push([type, fn])
	globalThis.removeEventListener = () => {}
})
afterEach(() => {
	for (const name of GLOBALS) {
		if (saved[name]) Object.defineProperty(globalThis, name, saved[name])
		else delete globalThis[name]
	}
})

test("first load resolves every preference from the browser when nothing is stored", () => {
	const { model, view } = boot(fakeStorage())
	assert.deepEqual(model.app.preferences.chosen, { lang: null, theme: null, currency: null })
	assert.deepEqual(view.derived, {
		lang: "nb",
		theme: "dark",
		currency: "NOK",
		profile: null,
		cars: [],
	}) // no matchMedia: the DS default
	assert.equal(globalThis.document.documentElement.lang, "nb")
	assert.equal(globalThis.document.documentElement.dataset.theme, "dark")
	assert.equal(globalThis.document.title, bundles.nb["app.title"])
})

test("a stored 'no' and a stored 'system' are invalid and removed on first read", () => {
	const storage = fakeStorage({ lang: "no", theme: "system", currency: "EUR" })
	const { model, view } = boot(storage)
	assert.deepEqual(storage.removed.sort(), ["lang", "theme"])
	assert.deepEqual(storage.items, { currency: "EUR" })
	assert.equal(model.app.preferences.chosen.lang, null)
	assert.equal(model.app.preferences.chosen.theme, null)
	assert.equal(view.derived.currency, "EUR")
})

test("a choice is written to its key and the view gets the resolved value", () => {
	const storage = fakeStorage()
	const { view } = boot(storage)
	view.handlers["set-theme"](null, { dataset: { value: "light" } })
	view.handlers["set-lang"](null, { dataset: { lang: "en" } })
	assert.deepEqual(storage.items, { theme: "light", lang: "en" })
	assert.equal(view.derived.theme, "light")
	assert.equal(view.derived.lang, "en")
	assert.equal(globalThis.document.documentElement.dataset.theme, "light")
	assert.equal(globalThis.document.documentElement.lang, "en")
})

test("the System row removes the key instead of storing 'system'", () => {
	const storage = fakeStorage({ currency: "USD" })
	const { model, view } = boot(storage)
	view.handlers["set-currency"](null, { dataset: { currency: "" } })
	assert.deepEqual(storage.removed, ["currency"])
	assert.deepEqual(storage.items, {})
	assert.equal(model.app.preferences.chosen.currency, null)
	assert.equal(view.derived.currency, "NOK")
})

test("when setItem throws the model still holds the choice and nothing else throws", () => {
	const storage = fakeStorage({}, { throwOnSet: true })
	const { model, view } = boot(storage)
	assert.doesNotThrow(() => view.handlers["set-theme"](null, { dataset: { value: "dark" } }))
	assert.equal(model.app.preferences.chosen.theme, "dark")
	assert.equal(view.derived.theme, "dark")
	assert.deepEqual(storage.items, {})
})

test("after a choice focus returns to the trigger of the picker that was used", () => {
	const { view } = boot(fakeStorage())
	view.handlers["set-currency"](null, { dataset: { currency: "EUR" } })
	view.handlers["set-lang"](null, { dataset: { lang: "nb" } }) // already active: still refocused
	assert.deepEqual(view.focused, ["currency", "lang"])
})

test("choosing the row that is already active renders nothing new but still refocuses", () => {
	const { view } = boot(fakeStorage())
	assert.equal(view.renders, 1)
	view.handlers["set-lang"](null, { dataset: { lang: "" } }) // System is already active
	assert.equal(view.renders, 1)
	assert.deepEqual(view.focused, ["lang"])
})

test("the header re-renders only when a preference changes", () => {
	const scheme = fakeColorScheme()
	const { view, controller } = boot(fakeStorage())
	assert.equal(view.headerRenders, 1)
	controller.render() // unrelated model update
	controller.render()
	assert.equal(view.headerRenders, 1)
	assert.equal(view.renders, 3)
	scheme.flip(true) // what System resolves to is shown on a row
	assert.equal(view.headerRenders, 2)
	view.handlers["set-theme"](null, { dataset: { value: "dark" } })
	assert.equal(view.headerRenders, 3)
})

test("an OS theme change shows through while nothing is chosen, and not once a theme is chosen", () => {
	const scheme = fakeColorScheme()
	const { model, view } = boot(fakeStorage())
	scheme.flip(true)
	assert.equal(model.app.preferences.system.theme, "light")
	assert.equal(view.derived.theme, "light")
	assert.equal(globalThis.document.documentElement.dataset.theme, "light")
	view.handlers["set-theme"](null, { dataset: { value: "dark" } })
	scheme.flip(false)
	scheme.flip(true)
	assert.equal(view.derived.theme, "dark")
})

test("another tab clearing the theme key falls back to the system theme", () => {
	const storage = fakeStorage({ theme: "light" })
	const { model, view } = boot(storage)
	assert.equal(view.derived.theme, "light")
	delete storage.items.theme
	storageEvent("theme")
	assert.equal(model.app.preferences.chosen.theme, null)
	assert.equal(view.derived.theme, "dark")
})

test("the System row uses the OS theme of now, even if the OS changed while a theme was chosen", () => {
	const scheme = fakeColorScheme()
	const { view } = boot(fakeStorage())
	view.handlers["set-theme"](null, { dataset: { value: "dark" } })
	scheme.flip(true) // not reported: a theme is chosen
	view.handlers["set-theme"](null, { dataset: { value: "" } })
	assert.equal(view.derived.theme, "light")
	assert.equal(globalThis.document.documentElement.dataset.theme, "light")
})

test("another tab clearing the theme key uses the OS theme of now, even if the OS changed meanwhile", () => {
	const scheme = fakeColorScheme()
	const storage = fakeStorage({ theme: "dark" })
	const { view } = boot(storage)
	scheme.flip(true) // not reported: a theme is stored
	delete storage.items.theme
	storageEvent("theme")
	assert.equal(view.derived.theme, "light")
})

test("resolvePreferences uses the choice, and the system value where nothing is chosen", () => {
	const derived = resolvePreferences({
		chosen: { lang: "en", theme: null, currency: null },
		system: { lang: "nb", theme: "light", currency: "EUR" },
	})
	assert.deepEqual(derived, { lang: "en", theme: "light", currency: "EUR" })
})

test("systemCurrency takes the region of the first entry that maps to a currency", () => {
	assert.equal(systemCurrency(["nb-NO", "en"], MULTI_CURRENCY), "NOK")
	assert.equal(systemCurrency(["en", "de-DE"], MULTI_CURRENCY), "EUR")
	assert.equal(systemCurrency(["en-US"], MULTI_CURRENCY), "USD")
})

test("systemCurrency falls back to the base currency when no region is mapped", () => {
	assert.equal(systemCurrency(["en-GB", "sv-SE"], config), "NOK")
	assert.equal(systemCurrency(["en"], config), "NOK")
	assert.equal(systemCurrency(undefined, config), "NOK")
})

test("the region table only maps to currencies the project offers", () => {
	for (const currency of Object.values(config.regions)) {
		assert.ok(config.currencies.includes(currency), `${currency} is not in config.currencies`)
	}
	for (const currency of config.currencies) {
		assert.ok(config.flags[currency], `${currency} has no flag`)
	}
})

// ---- Profiles and saved data (#7) ----

// Saved data as the app writes it: one profile per name, ids p0, p1, ...
// `active` is the index of the active profile, or null.
function dataWith(names, active = 0) {
	return JSON.stringify({
		version: 1,
		activeProfileId: active === null ? null : `p${active}`,
		profiles: names.map((name, i) => ({ id: `p${i}`, name })),
		cars: [],
		serviceEntries: [],
		tasks: [],
	})
}

// What the user does: type into the name field, then submit the form.
function createProfile(view, name) {
	view.handlers["profile-name"](null, { value: name })
	view.handlers["create-profile"](null, {})
}

const storedData = (storage) => JSON.parse(storage.items[STORAGE_KEY])

function loadFrom(items) {
	Object.defineProperty(globalThis, "localStorage", {
		value: fakeStorage(items),
		configurable: true,
		writable: true,
	})
	return loadData()
}

test("loadData is null when nothing is saved, the JSON is broken or the shape is wrong", () => {
	const valid = JSON.parse(dataWith(["Malin"]))
	const variant = (changes) => ({ [STORAGE_KEY]: JSON.stringify({ ...valid, ...changes }) })
	assert.equal(loadFrom({}), null)
	assert.equal(loadFrom({ [STORAGE_KEY]: "{not json" }), null)
	assert.equal(loadFrom({ [STORAGE_KEY]: "null" }), null)
	assert.equal(loadFrom(variant({ version: 2 })), null)
	assert.equal(loadFrom(variant({ cars: {} })), null)
	assert.equal(loadFrom(variant({ profiles: [null] })), null)
	assert.equal(loadFrom(variant({ profiles: [{ id: 1, name: "Malin" }] })), null)
	assert.equal(loadFrom(variant({ cars: [null] })), null)
	assert.equal(loadFrom(variant({ cars: [{ id: "c0" }] })), null) // no profileId
})

test("loadData keeps valid data and drops an active id that matches no profile", () => {
	assert.deepEqual(
		loadFrom({ [STORAGE_KEY]: dataWith(["Malin"]) }),
		JSON.parse(dataWith(["Malin"]))
	)
	const stale = { ...JSON.parse(dataWith(["Malin"])), activeProfileId: "gone" }
	assert.equal(loadFrom({ [STORAGE_KEY]: JSON.stringify(stale) }).activeProfileId, null)
})

test("validateProfileName trims, requires a name, caps it at 40 and refuses a taken name in any case", () => {
	const profiles = [{ id: "p0", name: "Malin" }]
	const check = (name) => validateProfileName(name, profiles, config.profileNameMax)
	assert.equal(config.profileNameMax, 40)
	assert.deepEqual(check("  Rune  "), { name: "Rune", error: null })
	assert.equal(check("   ").error, "profile.error.required")
	assert.equal(check("a".repeat(40)).error, null)
	assert.equal(check("a".repeat(41)).error, "profile.error.tooLong")
	assert.equal(check(" malin ").error, "profile.error.taken")
})

test("a first visit with nothing saved opens the profiles page and writes nothing", () => {
	const storage = fakeStorage()
	const { model, view } = boot(storage)
	assert.equal(model.app.page, "profiles")
	assert.equal(view.derived.profile, null)
	assert.deepEqual(storage.items, {})
})

test("broken saved data still starts the app, on the profiles page with empty data", () => {
	const { model } = boot(fakeStorage({ [STORAGE_KEY]: "{oops" }))
	assert.equal(model.app.page, "profiles")
	assert.deepEqual(model.data, initialModel.data)
})

test("creating a profile saves it, makes it active and opens the garage", () => {
	const storage = fakeStorage()
	const { model, view } = boot(storage)
	createProfile(view, "  Malin ")
	assert.equal(model.data.profiles.length, 1)
	assert.equal(model.data.profiles[0].name, "Malin")
	assert.match(model.data.profiles[0].id, /^[0-9a-f-]{36}$/)
	assert.equal(model.data.activeProfileId, model.data.profiles[0].id)
	assert.deepEqual(storedData(storage), model.data)
	assert.equal(model.app.page, "garage")
	assert.equal(view.derived.profile.name, "Malin")
	assert.equal(model.inputs.profile.name, "")
	assert.equal(view.headings, 1)
})

test("typing into the name field updates the input without a redraw", () => {
	const { model, view } = boot(fakeStorage())
	view.handlers["profile-name"](null, { value: "Ma" })
	assert.equal(model.inputs.profile.name, "Ma")
	assert.equal(view.renders, 1)
})

test("a profile name gets a capital first letter as it is typed", () => {
	const { model, view } = boot(fakeStorage())
	view.handlers["profile-name"](null, { value: "malin", selectionStart: 5 })
	assert.equal(model.inputs.profile.name, "Malin")
	assert.deepEqual(view.corrected, [{ value: "Malin", caret: 5 }])
})

test("an empty name shows an error, saves nothing and puts focus on the field", () => {
	const storage = fakeStorage()
	const { model, view } = boot(storage)
	createProfile(view, "   ")
	assert.deepEqual(model.inputs.errors, { name: "profile.error.required" })
	assert.deepEqual(model.data.profiles, [])
	assert.equal(model.app.page, "profiles")
	assert.deepEqual(storage.items, {})
	assert.deepEqual(view.fields, ["profile-name"])
	createProfile(view, "Malin") // a valid name clears the error
	assert.deepEqual(model.inputs.errors, {})
})

test("the chosen profile is still selected after a reload", () => {
	const { model, view } = boot(fakeStorage({ [STORAGE_KEY]: dataWith(["Malin", "Rune"], 1) }))
	assert.equal(model.app.page, "garage")
	assert.equal(view.derived.profile.name, "Rune")
})

test("choosing a profile makes it active, saves it and opens the garage", () => {
	const storage = fakeStorage({ [STORAGE_KEY]: dataWith(["Malin", "Rune"], null) })
	const { model, view } = boot(storage)
	assert.equal(model.app.page, "profiles")
	view.handlers["choose-profile"](null, { dataset: { id: "p1" } })
	assert.equal(model.data.activeProfileId, "p1")
	assert.equal(storedData(storage).activeProfileId, "p1")
	assert.equal(model.app.page, "garage")
	assert.equal(view.headings, 1)
})

test("choosing an id that matches no profile changes nothing", () => {
	const { model, view } = boot(fakeStorage({ [STORAGE_KEY]: dataWith(["Malin"], null) }))
	view.handlers["choose-profile"](null, { dataset: { id: "gone" } })
	assert.equal(model.data.activeProfileId, null)
	assert.equal(model.app.page, "profiles")
})

test("Switch profile clears the active profile, saves that and opens the picker", () => {
	const storage = fakeStorage({ [STORAGE_KEY]: dataWith(["Malin", "Rune"], 0) })
	const { model, view } = boot(storage)
	const before = view.headerRenders
	view.handlers["switch-profile"]()
	assert.equal(model.data.activeProfileId, null)
	assert.equal(storedData(storage).activeProfileId, null)
	assert.equal(model.app.page, "profiles")
	assert.equal(view.derived.profile, null)
	assert.equal(view.headerRenders, before + 1) // the header drops the name and the button
	assert.equal(view.headings, 1)
})

test("leaving the profiles page clears a half-typed name and its error", () => {
	const { model, view } = boot(fakeStorage({ [STORAGE_KEY]: dataWith(["Malin"], null) }))
	createProfile(view, "malin") // taken
	assert.deepEqual(model.inputs.errors, { name: "profile.error.taken" })
	view.handlers["choose-profile"](null, { dataset: { id: "p0" } })
	assert.equal(model.inputs.profile.name, "")
	assert.deepEqual(model.inputs.errors, {})
})

test("when setItem throws a new profile still works for the open page", () => {
	const { model, view } = boot(fakeStorage({}, { throwOnSet: true }))
	assert.doesNotThrow(() => createProfile(view, "Malin"))
	assert.equal(model.app.page, "garage")
	assert.equal(view.derived.profile.name, "Malin")
})

// ---- Add a car (#8) ----

// A car form filled in the way a user would, before any cleaning up.
const TYPED = Object.freeze({
	nickname: "  Svarten ",
	make: " Volvo ",
	model: "V70",
	year: "2008",
	regCountry: "NO",
	regNumber: "ab 12345",
	vin: "yv1sw58d482712345",
	fuel: "diesel",
	engine: "2.4 D5",
	mileage: "184000",
	euInspectionDue: "",
})
const RULES = {
	fuels: config.fuels,
	nicknameMax: 40,
	yearMin: 1900,
	yearMax: 2027,
	mileageMax: 10_000_000,
}

test("validateCar cleans up a valid car: trims, capitals, numbers and null for empty", () => {
	const { car, errors } = validateCar(TYPED, RULES)
	assert.deepEqual(errors, {})
	assert.deepEqual(car, {
		nickname: "Svarten",
		make: "Volvo",
		model: "V70",
		year: 2008,
		regCountry: "NO",
		regNumber: "AB12345",
		vin: "YV1SW58D482712345",
		fuel: "diesel",
		engine: "2.4 D5",
		mileage: 184000,
		euInspectionDue: null,
	})
	const bare = validateCar({ ...TYPED, nickname: " ", vin: "", engine: "  " }, RULES).car
	assert.equal(bare.nickname, null)
	assert.equal(bare.vin, null)
	assert.equal(bare.engine, null)
})

test("validateCar requires make, model and registration number", () => {
	const { errors } = validateCar({ ...TYPED, make: " ", model: "", regNumber: "  " }, RULES)
	assert.deepEqual(errors, {
		make: "car.error.make",
		model: "car.error.model",
		regNumber: "car.error.regNumber",
	})
})

test("validateCar takes a whole year from 1900 to next year", () => {
	for (const year of ["1900", "2027"])
		assert.deepEqual(validateCar({ ...TYPED, year }, RULES).errors, {})
	for (const year of ["", "1899", "2028", "2008.5", "abc"]) {
		assert.deepEqual(
			validateCar({ ...TYPED, year }, RULES).errors,
			{ year: "car.error.year" },
			year
		)
	}
})

test("validateCar takes the odometer as whole km from 0", () => {
	assert.equal(validateCar({ ...TYPED, mileage: "0" }, RULES).car.mileage, 0)
	for (const mileage of ["", "-1", "12.5", "1e3", "abc"]) {
		assert.deepEqual(
			validateCar({ ...TYPED, mileage }, RULES).errors,
			{ mileage: "car.error.mileage" },
			mileage
		)
	}
})

test("validateCar caps the odometer at 10 000 000 km", () => {
	assert.deepEqual(validateCar({ ...TYPED, mileage: "10000000" }, RULES).errors, {})
	assert.deepEqual(validateCar({ ...TYPED, mileage: "10000001" }, RULES).errors, {
		mileage: "car.error.mileage",
	})
})

test("typedCarInput gives nickname and engine a capital first letter, and leaves make and model alone", () => {
	assert.equal(typedCarInput("nickname", " helgebilen"), " Helgebilen")
	assert.equal(typedCarInput("engine", "v8 biturbo"), "V8 biturbo")
	assert.equal(typedCarInput("engine", "4.0 v8"), "4.0 v8")
	assert.equal(typedCarInput("nickname", "ærfuglen"), "Ærfuglen")
	assert.equal(typedCarInput("make", "e-tron"), "e-tron")
	assert.equal(typedCarInput("model", "iX"), "iX")
})

test("typedCarInput shows registration number and VIN in capitals", () => {
	assert.equal(typedCarInput("regNumber", "ab 12345"), "AB 12345")
	assert.equal(typedCarInput("vin", "wdd2050871f123456"), "WDD2050871F123456")
})

test("typedCarInput keeps digits only: four for the year, eight for the odometer", () => {
	assert.equal(typedCarInput("year", "20e1+5"), "2015")
	assert.equal(typedCarInput("year", "20155"), "2015")
	assert.equal(typedCarInput("mileage", "1 000 000"), "1000000")
	assert.equal(typedCarInput("mileage", "-12.5"), "125")
	assert.equal(typedCarInput("mileage", "123456789"), "12345678")
	assert.equal(typedCarInput("fuel", "diesel"), "diesel")
})

test("validateCar takes a country with a plate rule, and a plate that fits it", () => {
	assert.deepEqual(validateCar({ ...TYPED, regCountry: "Nor" }, RULES).errors, {
		regCountry: "car.error.regCountry",
	})
	const { min, max } = PLATES.NO
	for (const regNumber of ["A".repeat(min - 1), "A".repeat(max + 1)].filter(Boolean)) {
		assert.deepEqual(
			validateCar({ ...TYPED, regNumber }, RULES).errors,
			{ regNumber: "car.error.regNumberLength" },
			regNumber
		)
	}
	assert.equal(validateCar({ ...TYPED, regNumber: "ab-12 345" }, RULES).car.regNumber, "AB12345")
})

test("typedCarInput keeps a plate to its country's characters and length, separators aside", () => {
	const { max } = PLATES.NO
	assert.equal(typedCarInput("regNumber", "ab-12 345!", "NO"), "AB-12 345")
	const long = typedCarInput("regNumber", "1".repeat(max + 3), "NO")
	assert.equal(long, "1".repeat(max))
	assert.equal(typedCarInput("regNumber", "ab 12", null), "AB 12") // no country yet
})

test("resolveCountry matches a code or a name in the language or English, in any case", () => {
	assert.equal(resolveCountry("norway", "en"), "NO")
	assert.equal(resolveCountry("Norge", "nb"), "NO")
	assert.equal(resolveCountry("Sweden", "nb"), "SE")
	assert.equal(resolveCountry("se", "en"), "SE")
	assert.equal(resolveCountry("Nor", "en"), null)
})

test("suggestedModels finds a make without case, and nothing for an unknown one", () => {
	assert.ok(suggestedModels(" mercedes-benz ").includes("C63 AMG"))
	assert.deepEqual(suggestedModels("Trabant 601"), [])
	assert.equal(carFormHints({ make: "", regCountry: "NO" }, "en").plate.example, PLATES.NO.example)
	assert.equal(carFormHints({ make: "", regCountry: "x" }, "en").plate, null)
})

test("validateCar takes a VIN of 17 letters and digits without I, O or Q", () => {
	for (const vin of [
		"YV1SW58D48271234",
		"YV1SW58D4827123456",
		"YV1SW58D48271234I",
		"YV1SW58D4827-2345",
	]) {
		assert.deepEqual(validateCar({ ...TYPED, vin }, RULES).errors, { vin: "car.error.vin" }, vin)
	}
})

test("validateCar caps the nickname and only takes a fuel from the list", () => {
	const long = validateCar({ ...TYPED, nickname: "x".repeat(41) }, RULES)
	assert.deepEqual(long.errors, { nickname: "car.error.nickname" })
	assert.deepEqual(validateCar({ ...TYPED, nickname: "x".repeat(40) }, RULES).errors, {})
	assert.deepEqual(validateCar({ ...TYPED, fuel: "coal" }, RULES).errors, {
		fuel: "car.error.fuel",
	})
})

// What the user does: type every field, then submit the car form.
function fillCar(view, values) {
	for (const [field, value] of Object.entries(values)) {
		if (field !== "euInspectionDue") view.handlers["car-input"](null, { dataset: { field }, value })
	}
}

test("Add car opens an empty car form and puts focus on its heading", () => {
	const { model, view } = boot(fakeStorage({ [STORAGE_KEY]: dataWith(["Malin"]) }))
	view.handlers["add-car"]()
	assert.equal(model.app.page, "carForm")
	assert.equal(view.headings, 1)
	assert.deepEqual(model.inputs.car, initialModel.inputs.car)
})

test("typing into a car field updates the input without a redraw", () => {
	const { model, view } = boot(fakeStorage({ [STORAGE_KEY]: dataWith(["Malin"]) }))
	view.handlers["add-car"]()
	const renders = view.renders
	view.handlers["car-input"](null, { dataset: { field: "make" }, value: "Vol" })
	assert.equal(model.inputs.car.make, "Vol")
	assert.equal(view.renders, renders)
	view.handlers["car-input"](null, { dataset: { field: "nope" }, value: "x" }) // unknown field
	assert.equal("nope" in model.inputs.car, false)
})

test("a typed character a field can't hold is fixed in place, with the caret kept", () => {
	const { model, view } = boot(fakeStorage({ [STORAGE_KEY]: dataWith(["Malin"]) }))
	view.handlers["add-car"]()
	view.handlers["car-input"](null, { dataset: { field: "make" }, value: "e-tron" })
	assert.deepEqual(view.corrected, []) // nothing to fix, so the field is left alone
	view.handlers["car-input"](null, {
		dataset: { field: "year" },
		value: "20e15",
		selectionStart: 3,
	})
	assert.equal(model.inputs.car.year, "2015")
	assert.deepEqual(view.corrected, [{ value: "2015", caret: 2 }])
})

test("a typed make or country updates the model suggestions and plate example in place", () => {
	const { model, view } = boot(fakeStorage({ [STORAGE_KEY]: dataWith(["Malin"]) }))
	view.handlers["add-car"]()
	const renders = view.renders
	view.handlers["car-input"](null, { dataset: { field: "make" }, value: "Mercedes-Benz" })
	assert.ok(view.carForms.at(-1).models.includes("C63 AMG"))
	view.handlers["car-input"](null, { dataset: { field: "regCountry" }, value: "Swe" })
	assert.equal(model.inputs.car.regCountry, "Swe")
	assert.equal(view.carForms.at(-1).plate, null)
	view.handlers["car-input"](null, { dataset: { field: "regCountry" }, value: "Sweden" })
	assert.equal(model.inputs.car.regCountry, "SE")
	assert.equal(view.carForms.at(-1).plate.example, PLATES.SE.example)
	view.handlers["car-input"](null, { dataset: { field: "year" }, value: "2015" })
	assert.equal(view.carForms.length, 3) // other fields leave the hints alone
	assert.equal(view.renders, renders)
})

test("saving a valid car adds it to the active profile, saves it and opens the garage", () => {
	const storage = fakeStorage({ [STORAGE_KEY]: dataWith(["Malin", "Rune"], 1) })
	const { model, view } = boot(storage)
	view.handlers["add-car"]()
	fillCar(view, TYPED)
	view.handlers["save-car"]()
	assert.equal(model.data.cars.length, 1)
	const [car] = model.data.cars
	assert.match(car.id, /^[0-9a-f-]{36}$/)
	assert.equal(car.profileId, "p1")
	assert.equal(car.regNumber, "AB12345")
	assert.deepEqual(storedData(storage), model.data)
	assert.equal(model.app.page, "garage")
	assert.deepEqual(view.derived.cars, [car])
	assert.deepEqual(model.inputs.car, initialModel.inputs.car)
	assert.equal(view.headings, 2)
})

test("an invalid car shows its errors, saves nothing and focuses the first field with an error", () => {
	const storage = fakeStorage({ [STORAGE_KEY]: dataWith(["Malin"]) })
	const { model, view } = boot(storage)
	view.handlers["add-car"]()
	fillCar(view, { ...TYPED, make: "", year: "1800" })
	view.handlers["save-car"]()
	assert.deepEqual(model.inputs.errors, { make: "car.error.make", year: "car.error.year" })
	assert.deepEqual(model.data.cars, [])
	assert.equal(storage.items[STORAGE_KEY], dataWith(["Malin"]))
	assert.equal(model.app.page, "carForm")
	assert.deepEqual(view.fields, ["car-make"])
	assert.equal(model.inputs.car.model, "V70") // what was typed stays
})

test("Cancel returns to the garage without saving and empties the form", () => {
	const storage = fakeStorage({ [STORAGE_KEY]: dataWith(["Malin"]) })
	const { model, view } = boot(storage)
	view.handlers["add-car"]()
	fillCar(view, { ...TYPED, make: "" })
	view.handlers["save-car"]()
	view.handlers["cancel-car"]()
	assert.equal(model.app.page, "garage")
	assert.deepEqual(model.data.cars, [])
	assert.deepEqual(model.inputs.car, initialModel.inputs.car)
	assert.deepEqual(model.inputs.errors, {})
})

test("the garage only hands the view the active profile's cars", () => {
	const saved = JSON.parse(dataWith(["Malin", "Rune"], 0))
	saved.cars = [
		{ id: "c0", profileId: "p0", make: "Volvo" },
		{ id: "c1", profileId: "p1", make: "Saab" },
	]
	const { view } = boot(fakeStorage({ [STORAGE_KEY]: JSON.stringify(saved) }))
	assert.deepEqual(
		view.derived.cars.map((c) => c.id),
		["c0"]
	)
})

test("opening a car card selects the car and keeps the link from changing the URL", () => {
	const saved = JSON.parse(dataWith(["Malin", "Rune"], 0))
	saved.cars = [
		{ id: "c0", profileId: "p0", make: "Volvo" },
		{ id: "c1", profileId: "p1", make: "Saab" },
	]
	const { model, view } = boot(fakeStorage({ [STORAGE_KEY]: JSON.stringify(saved) }))
	let prevented = 0
	const click = { preventDefault: () => prevented++ }
	view.handlers["open-car"](click, { dataset: { id: "c0" } })
	assert.equal(model.app.selectedCarId, "c0")
	assert.equal(prevented, 1)
	view.handlers["open-car"](click, { dataset: { id: "c1" } }) // another profile's car
	view.handlers["open-car"](click, { dataset: { id: "nope" } })
	assert.equal(model.app.selectedCarId, "c0")
})

test("a car can't be saved without an active profile", () => {
	const { model, view } = boot(fakeStorage({ [STORAGE_KEY]: dataWith(["Malin"], null) }))
	fillCar(view, TYPED)
	view.handlers["save-car"]()
	assert.deepEqual(model.data.cars, [])
})

/* ----------------------------------------------------------------------
   A car's pages: details (#21), service history (#23) and the service
   form (#22). Every visit is a browser history entry, so these tests
   drive a fake history whose back() fires popstate at once.
   ---------------------------------------------------------------------- */

function fakeHistory(state = null) {
	const entries = [{ state, url: "/" }]
	let index = 0
	const history = {
		entries,
		get state() {
			return entries[index].state
		},
		get index() {
			return index
		},
		pushState(next, _title, url) {
			entries.splice(index + 1)
			entries.push({ state: structuredClone(next), url })
			index++
		},
		replaceState(next, _title, url) {
			entries[index] = { state: next, url }
		},
		back() {
			if (index > 0) move(-1)
		},
		forward() {
			if (index < entries.length - 1) move(1)
		},
	}
	function move(step) {
		index += step
		for (const [type, fn] of windowListeners) if (type === "popstate") fn({ state: history.state })
	}
	globalThis.history = history
	globalThis.location = { pathname: "/", search: "", hash: "" }
	return history
}

// A reload: the page's listeners go, the history and the storage stay.
function reload(storage) {
	windowListeners = []
	return boot(storage)
}

const SAVED_CAR = Object.freeze({
	profileId: "p0",
	nickname: null,
	make: "Volvo",
	model: "V70",
	year: 2008,
	regCountry: "NO",
	regNumber: "AB12345",
	vin: null,
	fuel: "diesel",
	engine: null,
	mileage: 184000,
	euInspectionDue: null,
})

// Malin (active) owns c0 and c1, Rune owns c9.
function garageWith(entries = []) {
	const data = JSON.parse(dataWith(["Malin", "Rune"], 0))
	data.cars = [
		{ ...SAVED_CAR, id: "c0" },
		{ ...SAVED_CAR, id: "c1", make: "Toyota", model: "Corolla" },
		{ ...SAVED_CAR, id: "c9", profileId: "p1" },
	]
	data.serviceEntries = entries
	return fakeStorage({ [STORAGE_KEY]: JSON.stringify(data) })
}

const entryOn = (id, date, { category = "service", cost = 1000, carId = "c0" } = {}) => ({
	id,
	carId,
	category,
	title: `Work ${id}`,
	date,
	mileage: 180000,
	cost,
	workshop: null,
	notes: null,
})

const CLICK = Object.freeze({ preventDefault() {} })
const openCar = (view, id) => view.handlers["open-car"](CLICK, { dataset: { id } })
const openHistory = (view, id) => view.handlers["open-history"](CLICK, { dataset: { id } })

function fillService(view, values) {
	for (const [field, value] of Object.entries(values)) {
		view.handlers["service-entry-input"](null, { dataset: { field }, value })
	}
}

const SERVICE = Object.freeze({
	category: "repair",
	title: "  New brake pads ",
	date: "2026-03-14",
	mileage: "190000",
	cost: "2450",
	workshop: "  ",
	notes: " Front axle ",
})

const LIMITS = Object.freeze({ mileageMax: config.carMileageMax, today: "2026-10-26" })

test("validateServiceEntry trims the text, stores numbers and empty optional text as null", () => {
	const { entry, errors } = validateServiceEntry(SERVICE, LIMITS)
	assert.deepEqual(errors, {})
	assert.deepEqual(entry, {
		category: "repair",
		title: "New brake pads",
		date: "2026-03-14",
		mileage: 190000,
		cost: 2450,
		workshop: null,
		notes: "Front axle",
	})
})

test("validateServiceEntry needs the type of work, a date, the odometer and the cost, in form order", () => {
	const empty = { ...SERVICE, title: " ", date: "", mileage: "", cost: "" }
	const { errors } = validateServiceEntry(empty, LIMITS)
	assert.deepEqual(errors, {
		title: "service.error.title",
		date: "service.error.dateRequired",
		mileage: "service.error.mileage",
		cost: "service.error.cost",
	})
	assert.deepEqual(Object.keys(errors), ["title", "date", "mileage", "cost"])
})

test("validateServiceEntry takes a real date up to today, never one in the future", () => {
	const dateError = (date) => validateServiceEntry({ ...SERVICE, date }, LIMITS).errors.date
	assert.equal(dateError("2026-10-26"), undefined) // today
	assert.equal(dateError("2026-10-27"), "service.error.dateFuture")
	assert.equal(dateError("2026-02-30"), "service.error.dateInvalid")
	assert.equal(dateError("14.03.2026"), "service.error.dateInvalid")
})

test("validateServiceEntry takes whole numbers from 0, the odometer up to the car form's limit", () => {
	const error = (field, value) =>
		validateServiceEntry({ ...SERVICE, [field]: value }, LIMITS).errors
	for (const value of ["-1", "1.5", "1e3", "abc", "12 000"]) {
		assert.deepEqual(error("mileage", value), { mileage: "service.error.mileage" }, value)
		assert.deepEqual(error("cost", value), { cost: "service.error.cost" }, value)
	}
	assert.deepEqual(error("mileage", "0"), {})
	assert.deepEqual(error("cost", "0"), {})
	assert.deepEqual(error("mileage", String(config.carMileageMax)), {})
	assert.deepEqual(error("mileage", String(config.carMileageMax + 1)), {
		mileage: "service.error.mileage",
	})
	assert.deepEqual(error("category", "tyres"), { category: "service.error.category" })
})

test("carHistory keeps one car's entries, totals them and shows the filtered ones newest first", () => {
	const entries = [
		entryOn("a", "2025-05-01", { cost: 500 }),
		entryOn("b", "2026-01-10", { category: "repair", cost: 2000 }),
		entryOn("c", "2026-01-10", { cost: 300 }), // same day as b, added later
		entryOn("x", "2026-06-01", { carId: "c1", cost: 9999 }),
	]
	const all = carHistory(entries, "c0")
	assert.equal(all.count, 3)
	assert.equal(all.totalCost, 2800)
	assert.deepEqual(
		all.shown.map((e) => e.id),
		["c", "b", "a"]
	)
	const repairs = carHistory(entries, "c0", "repair")
	assert.equal(repairs.count, 3) // the count is the car's, not the filter's
	assert.deepEqual(
		repairs.shown.map((e) => e.id),
		["b"]
	)
	assert.deepEqual(carHistory(entries, "c0", "other").shown, [])
	assert.deepEqual(
		entries.map((e) => e.id),
		["a", "b", "c", "x"]
	) // never sorted in place
})

test("a car card opens its page, focuses the heading and adds a history entry", () => {
	const history = fakeHistory()
	const { model, view } = boot(garageWith([entryOn("a", "2026-01-10", { cost: 1200 })]))
	openCar(view, "c0")
	assert.equal(model.app.page, "car")
	assert.equal(model.app.selectedCarId, "c0")
	assert.equal(view.headings, 1)
	assert.equal(view.derived.selectedCar.id, "c0")
	assert.equal(view.derived.history.totalCost, 1200)
	assert.deepEqual(history.entries.at(-1), { state: { page: "car", carId: "c0" }, url: "#car-c0" })
})

test("another profile's car or an unknown id opens nothing and adds no history entry", () => {
	const history = fakeHistory()
	const { model, view } = boot(garageWith())
	openCar(view, "c9")
	openCar(view, "nope")
	assert.equal(model.app.page, "garage")
	assert.equal(history.entries.length, 1)
	assert.equal(view.headings, 0)
})

test("Back to garage goes back in the browser history, the same as the browser's Back", () => {
	const history = fakeHistory()
	const { model, view } = boot(garageWith())
	openCar(view, "c0")
	view.handlers["back-garage"]()
	assert.equal(model.app.page, "garage")
	assert.equal(model.app.selectedCarId, null)
	assert.equal(history.index, 0)
	history.forward()
	assert.equal(model.app.page, "car") // Forward opens it again
	history.back()
	assert.equal(model.app.page, "garage")
	assert.equal(view.headings, 4)
})

test("without a history entry of their own, the back links open their page directly", () => {
	const { model, view } = boot(garageWith()) // no history API at all
	openCar(view, "c0")
	openHistory(view, "c0")
	view.handlers["back-car"]()
	assert.equal(model.app.page, "car")
	view.handlers["back-garage"]()
	assert.equal(model.app.page, "garage")
	assert.equal(model.app.selectedCarId, null)
})

test("after a reload, Back to garage opens the garage and not a car opened before the reload", () => {
	const history = fakeHistory()
	const storage = garageWith()
	openCar(boot(storage).view, "c0")
	const { model, view } = reload(storage)
	assert.equal(model.app.page, "car") // the reload keeps the page
	assert.equal(model.app.selectedCarId, "c0")
	view.handlers["back-garage"]()
	assert.equal(model.app.page, "garage")
	openCar(view, "c1")
	view.handlers["back-garage"]()
	assert.equal(model.app.page, "garage")
	assert.equal(history.index, 0)
})

test("a reload on a page for a car that is gone opens the garage and drops the stale entry", () => {
	const history = fakeHistory({ page: "history", carId: "deleted" })
	globalThis.location = { pathname: "/app/", search: "?x=1", hash: "#history-deleted" }
	const { model } = boot(garageWith())
	assert.equal(model.app.page, "garage")
	assert.deepEqual(history.entries[0], { state: null, url: "/app/?x=1" })
})

test("a history entry for another profile's car, reached with Back, leaves for the garage", () => {
	const history = fakeHistory({ page: "car", carId: "c9" })
	history.pushState({ page: "car", carId: "c0" }, "", "#car-c0")
	const { model } = boot(garageWith())
	assert.equal(model.app.page, "car")
	history.back()
	assert.equal(model.app.page, "garage")
	assert.equal(model.app.selectedCarId, null)
})

test("the car page links to the history, and its back link returns to the car", () => {
	const history = fakeHistory()
	const { model, view } = boot(garageWith())
	openCar(view, "c0")
	openHistory(view, "c0")
	assert.equal(model.app.page, "history")
	assert.equal(history.entries.at(-1).url, "#history-c0")
	view.handlers["back-car"]()
	assert.equal(model.app.page, "car")
	assert.equal(model.app.selectedCarId, "c0")
	assert.equal(history.index, 1)
})

test("the history filter redraws the list, keeps focus on the select and ignores unknown values", () => {
	fakeHistory()
	const entries = [entryOn("a", "2025-05-01"), entryOn("b", "2026-01-10", { category: "repair" })]
	const { model, view } = boot(garageWith(entries))
	openHistory(view, "c0")
	const renders = view.renders
	view.handlers["history-filter"](null, { value: "repair" })
	assert.equal(model.app.historyFilter, "repair")
	assert.deepEqual(
		view.derived.history.shown.map((e) => e.id),
		["b"]
	)
	assert.deepEqual(view.fields, ["history-filter"])
	view.handlers["history-filter"](null, { value: "repair" }) // the same filter again
	view.handlers["history-filter"](null, { value: "tyres" })
	assert.equal(view.renders, renders + 1)
	assert.equal(model.app.historyFilter, "repair")
	openHistory(view, "c1") // another car starts unfiltered
	assert.equal(model.app.historyFilter, "all")
})

test("Register service opens an empty form, and typing fills it without a redraw", () => {
	const history = fakeHistory()
	const { model, view } = boot(garageWith())
	openHistory(view, "c0")
	view.handlers["register-service"]()
	assert.equal(model.app.page, "serviceForm")
	assert.equal(history.entries.at(-1).url, "#register-service-c0")
	assert.deepEqual(model.inputs.serviceEntry, initialModel.inputs.serviceEntry)
	assert.match(view.derived.today, /^\d{4}-\d{2}-\d{2}$/)
	const renders = view.renders
	fillService(view, { title: "Oil change", nope: "ignored" })
	assert.equal(model.inputs.serviceEntry.title, "Oil change")
	assert.equal(Object.hasOwn(model.inputs.serviceEntry, "nope"), false)
	assert.equal(view.renders, renders)
})

test("saving a service adds the entry, raises the odometer and returns to the unfiltered history", () => {
	const history = fakeHistory()
	const storage = garageWith()
	const { model, view } = boot(storage)
	openHistory(view, "c0")
	view.handlers["history-filter"](null, { value: "other" })
	view.handlers["register-service"]()
	fillService(view, SERVICE)
	view.handlers["save-service-entry"]()
	const [entry] = model.data.serviceEntries
	assert.match(entry.id, /^[0-9a-f-]{36}$/)
	assert.equal(entry.carId, "c0")
	assert.equal(entry.title, "New brake pads")
	assert.equal(entry.workshop, null)
	assert.equal(model.data.cars[0].mileage, 190000)
	assert.deepEqual(storedData(storage), model.data)
	assert.equal(model.app.page, "history")
	assert.equal(model.app.historyFilter, "all")
	assert.deepEqual(
		view.derived.history.shown.map((e) => e.id),
		[entry.id]
	)
	assert.deepEqual(model.inputs.serviceEntry, initialModel.inputs.serviceEntry)
	assert.equal(history.index, 1) // the form's entry was left with Back
})

test("an older service entry never lowers the car's odometer", () => {
	fakeHistory()
	const { model, view } = boot(garageWith())
	openHistory(view, "c0")
	view.handlers["register-service"]()
	fillService(view, { ...SERVICE, mileage: "150000" })
	view.handlers["save-service-entry"]()
	assert.equal(model.data.serviceEntries.length, 1)
	assert.equal(model.data.cars[0].mileage, 184000)
})

test("an invalid service shows its errors, keeps what was typed and focuses the first field with one", () => {
	fakeHistory()
	const storage = garageWith()
	const { model, view } = boot(storage)
	openHistory(view, "c0")
	view.handlers["register-service"]()
	fillService(view, { ...SERVICE, title: "", cost: "-5" })
	view.handlers["save-service-entry"]()
	assert.deepEqual(model.inputs.errors, {
		title: "service.error.title",
		cost: "service.error.cost",
	})
	assert.deepEqual(view.fields, ["service-title"])
	assert.equal(model.app.page, "serviceForm")
	assert.equal(model.inputs.serviceEntry.notes, SERVICE.notes)
	assert.deepEqual(model.data.serviceEntries, [])
	assert.deepEqual(storedData(storage).serviceEntries, [])
})

test("Cancel leaves the form without saving, and the form starts empty next time", () => {
	const history = fakeHistory()
	const { model, view } = boot(garageWith())
	openHistory(view, "c0")
	view.handlers["register-service"]()
	fillService(view, { ...SERVICE, title: "" })
	view.handlers["save-service-entry"]()
	view.handlers["cancel-service-entry"]()
	assert.equal(model.app.page, "history")
	assert.equal(history.index, 1)
	assert.deepEqual(model.data.serviceEntries, [])
	assert.deepEqual(model.inputs.errors, {})
	view.handlers["register-service"]()
	assert.deepEqual(model.inputs.serviceEntry, initialModel.inputs.serviceEntry)
})

test("a service can't be saved for a car the active profile doesn't own", () => {
	fakeHistory()
	const { model, view } = boot(garageWith())
	model.app.selectedCarId = "c9"
	fillService(view, SERVICE)
	view.handlers["save-service-entry"]()
	assert.deepEqual(model.data.serviceEntries, [])
})

test("switching profile forgets the selected car", () => {
	fakeHistory()
	const { model, view } = boot(garageWith())
	openCar(view, "c0")
	view.handlers["switch-profile"]()
	assert.equal(model.app.page, "profiles")
	assert.equal(model.app.selectedCarId, null)
})

test("switching profile drops the car page's history entry, so a reload opens the garage", () => {
	const history = fakeHistory()
	const storage = garageWith()
	const { view } = boot(storage)
	openCar(view, "c0")
	view.handlers["switch-profile"]()
	view.handlers["choose-profile"](null, { dataset: { id: "p0" } })
	assert.deepEqual(history.state, null)
	const { model } = reload(storage)
	assert.equal(model.app.page, "garage")
})

test("a second press on a back link before the browser has gone back is ignored", () => {
	const history = fakeHistory()
	let backs = 0
	history.back = () => backs++ // the real back() lands later, in a popstate
	const { model, view } = boot(garageWith())
	openHistory(view, "c0")
	view.handlers["register-service"]()
	view.handlers["cancel-service-entry"]()
	view.handlers["cancel-service-entry"]()
	assert.equal(backs, 1)
	assert.equal(model.app.page, "serviceForm") // still waiting for popstate
})
