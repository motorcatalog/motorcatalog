/* ======================================================================
   tests/view.test.js: the header and the pages render the model
   The view is rendered into jsdom (already a dev dependency for the
   a11y tests) and the markup is asserted on. Axe runs over the same
   markup in tests/a11y/view.test.js.
   ====================================================================== */

import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { JSDOM } from "jsdom"
import { createTranslator } from "../i18n/index.js"
import { config } from "../src/config.js"
import { carFormHints, carHistory, resolvePreferences } from "../src/controller/controller.js"
import { MAKES } from "../src/data/models.js"
import { PLATES } from "../src/data/plates.js"
import { bundles, FALLBACK_LANG } from "../src/locales/index.js"
import { model as initialModel } from "../src/model/model.js"
import { createView, escapeHtml } from "../src/view/view.js"
import { MULTI_CURRENCY } from "./fixtures.js"

const i18n = createTranslator(bundles, { fallback: FALLBACK_LANG })

let dom
afterEach(() => dom?.window.close())

// What the controller hands the view: a clone of the model with these
// choices and system values, and the derived values worked out from them.
// `profiles` are names (ids p0, p1, ...), `active` the index of the active one.
// `cars` are saved cars, `car` what is typed into the car form and
// `carErrors` its errors.
function screen({
	chosen = {},
	system = {},
	page = "profiles",
	profiles = [],
	active = null,
	name = "",
	error = null,
	cars = [],
	car = {},
	carErrors = null,
} = {}) {
	const model = structuredClone(initialModel)
	Object.assign(model.app.preferences.chosen, chosen)
	Object.assign(
		model.app.preferences.system,
		{ lang: "nb", theme: "dark", currency: "NOK" },
		system
	)
	model.app.page = page
	model.data.profiles = profiles.map((profileName, i) => ({ id: `p${i}`, name: profileName }))
	model.data.activeProfileId = active === null ? null : `p${active}`
	model.inputs.profile.name = name
	if (error) model.inputs.errors = { name: error }
	if (carErrors) model.inputs.errors = carErrors
	Object.assign(model.inputs.car, car)
	model.data.cars = cars
	const profile = model.data.profiles.find((p) => p.id === model.data.activeProfileId) ?? null
	const profileCars = cars.filter((c) => c.profileId === model.data.activeProfileId)
	return {
		model,
		derived: carFormDerived(model, {
			...resolvePreferences(model.app.preferences),
			profile,
			cars: profileCars,
		}),
	}
}

// The controller adds the car form's hints while that page is open.
function carFormDerived(model, derived) {
	if (model.app.page === "carForm") derived.carForm = carFormHints(model.inputs.car, derived.lang)
	return derived
}

// `offer` is the config the view is built with: three currencies by
// default so the hidden currency picker stays covered.
function mount({ model, derived }, { translator = i18n, offer = MULTI_CURRENCY } = {}) {
	dom = new JSDOM(
		`<!doctype html><html lang="en"><body><header id="header"></header><main id="main"></main></body></html>`
	)
	const { document } = dom.window
	const roots = { header: document.getElementById("header"), main: document.getElementById("main") }
	const view = createView(roots, translator, offer)
	view.renderHeader(model, derived)
	view.render(model, derived)
	return { ...roots, view }
}

// Freezes every object in the tree, so any write throws in strict mode.
function deepFreeze(value) {
	if (value && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze(child)
		Object.freeze(value)
	}
	return value
}

test("escapeHtml neutralises the five HTML characters", () => {
	assert.equal(
		escapeHtml(`<a href="x" title='y'>&</a>`),
		"&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;"
	)
})

test("the header renders the three pickers in the order language, theme, currency", () => {
	const { header } = mount(screen())
	const names = [...header.querySelectorAll("details[data-picker]")].map((d) => d.dataset.picker)
	assert.deepEqual(names, ["lang", "theme", "currency"])
})

test("the currency picker renders only when the project offers more than one currency", () => {
	const { header } = mount(screen(), { offer: config })
	assert.equal(header.querySelector('[data-picker="currency"]'), null)
	assert.ok(header.querySelector('[data-picker="lang"]'))
	assert.ok(header.querySelector('[data-picker="theme"]'))
})

test("the language picker renders only when there is more than one bundle", () => {
	const { header } = mount(screen({ system: { lang: "en" } }), {
		translator: createTranslator({ en: bundles.en }),
	})
	assert.equal(header.querySelector('[data-picker="lang"]'), null)
})

test("language rows: System first with an empty data-lang, every row carries lang, the active row aria-current", () => {
	const { header } = mount(screen({ chosen: { lang: "en" }, system: { lang: "nb" } }))
	const rows = [...header.querySelectorAll('[data-picker="lang"] .picker-row')]
	assert.equal(rows[0].dataset.lang, "")
	assert.equal(rows[0].querySelector("span[lang]").getAttribute("lang"), "nb")
	assert.equal(rows[0].textContent.trim(), "System (Norsk bokmål)")
	assert.deepEqual(
		rows.slice(1).map((row) => [row.dataset.lang, row.getAttribute("lang")]),
		[
			["en", "en"],
			["nb", "nb"],
		]
	)
	assert.equal(header.querySelector('[data-picker="lang"] [aria-current]').dataset.lang, "en")
	assert.equal(
		header.querySelector('[data-picker="lang"] summary .sr-only').textContent,
		"Language: English"
	)
})

test("the System row of each picker says what System resolves to right now", () => {
	const { header } = mount(screen({ system: { lang: "nb", theme: "light", currency: "EUR" } }))
	const first = (name) => header.querySelector(`[data-picker="${name}"] .picker-row`)
	assert.equal(first("lang").textContent.trim(), "System (Norsk bokmål)")
	assert.equal(first("theme").textContent.trim(), "System (Lyst)") // UI language is nb
	assert.equal(first("currency").textContent.trim(), "System (EUR)")
	for (const name of ["lang", "theme", "currency"])
		assert.ok(first(name).hasAttribute("aria-current"))
})

test("the theme trigger shows the sun when light resolves and the moon when dark does", () => {
	const light = mount(screen({ chosen: { theme: "light" } }))
	assert.ok(light.header.querySelector('[data-picker="theme"] summary svg circle'))
	dom.window.close()
	const dark = mount(screen({ system: { theme: "dark" } }))
	assert.equal(dark.header.querySelector('[data-picker="theme"] summary svg circle'), null)
})

test("currency rows carry a decorative flag, the ISO code and the Intl name; the trigger shows the active flag", () => {
	const { header } = mount(screen({ chosen: { currency: "USD", lang: "en" } }))
	const rows = [...header.querySelectorAll('[data-picker="currency"] .picker-row')].slice(1)
	for (const row of rows) {
		const img = row.querySelector("img.picker-flag")
		assert.equal(img.getAttribute("alt"), "")
		assert.match(
			img.getAttribute("src"),
			new RegExp(`/flags/${MULTI_CURRENCY.flags[row.dataset.currency]}\\.svg$`)
		)
	}
	assert.deepEqual(
		rows.map((row) => row.querySelector(".picker-code").textContent),
		MULTI_CURRENCY.currencies
	)
	assert.equal(rows[2].textContent.trim(), "USDUS Dollar")
	assert.match(
		header.querySelector('[data-picker="currency"] summary img').getAttribute("src"),
		/\/flags\/us\.svg$/
	)
})

test("a bundle string with markup is rendered as text, not as HTML", () => {
	const hostile = createTranslator({ en: { ...bundles.en, "welcome.title": "<b>x</b>" } })
	dom = new JSDOM(
		`<!doctype html><html><body><header id="header"></header><main id="main"></main></body></html>`
	)
	const { document } = dom.window
	const view = createView(
		{ header: document.getElementById("header"), main: document.getElementById("main") },
		hostile,
		MULTI_CURRENCY
	)
	const { model, derived } = screen({ chosen: { lang: "en" } })
	view.render(model, derived)
	assert.equal(document.querySelector("main b"), null)
	assert.equal(document.querySelector("main h1").textContent, "<b>x</b>")
})

test("the view only reads the model: a deep-frozen model renders without throwing", () => {
	const { model, derived } = screen({ chosen: { lang: "en" } })
	deepFreeze(model)
	// The guard itself goes red: a write to the frozen model throws.
	assert.throws(() => {
		model.app.preferences.chosen.lang = "nb"
	}, TypeError)
	assert.doesNotThrow(() => mount({ model, derived }))
})

// ---- Profiles and the garage (#7) ----

const en = { chosen: { lang: "en" } }
const text = (el) => el?.textContent.trim()

test("a first visit shows the welcome page: a heading, a short intro and the create form", () => {
	const { main } = mount(screen(en))
	const h1 = main.querySelector("h1")
	assert.equal(text(h1), bundles.en["welcome.title"])
	assert.equal(h1.getAttribute("tabindex"), "-1")
	assert.equal(text(main.querySelector("h1 + p")), bundles.en["welcome.intro"])
	assert.equal(main.querySelector("[data-action='choose-profile']"), null)
	assert.equal(main.querySelector("h2"), null)
	const form = main.querySelector("form[data-submit='create-profile']")
	assert.ok(form.hasAttribute("novalidate"))
	const input = form.querySelector("#profile-name")
	assert.equal(text(form.querySelector("label[for='profile-name']")), bundles.en["profile.name"])
	assert.equal(input.getAttribute("maxlength"), "40")
	assert.ok(input.required)
	assert.equal(input.dataset.input, "profile-name")
	assert.equal(input.hasAttribute("aria-invalid"), false)
	const submit = form.querySelector("button[type='submit']")
	assert.ok(submit.classList.contains("btn-primary"))
	assert.equal(text(submit), bundles.en["profile.create"])
})

test("with profiles the page lists one button per profile, then the form under its own heading", () => {
	const { main } = mount(screen({ ...en, profiles: ["Malin", "Rune"] }))
	assert.equal(text(main.querySelector("h1")), bundles.en["profiles.title"])
	const buttons = [...main.querySelectorAll("[data-action='choose-profile']")]
	assert.deepEqual(
		buttons.map((b) => [b.dataset.id, text(b), b.type]),
		[
			["p0", "Malin", "button"],
			["p1", "Rune", "button"],
		]
	)
	const form = main.querySelector("form[data-submit='create-profile']")
	assert.equal(text(form.querySelector("h2")), bundles.en["profiles.new"])
})

test("an error shows as text tied to the field, and the typed name is kept", () => {
	const { main } = mount(screen({ ...en, name: "  ", error: "profile.error.required" }))
	const input = main.querySelector("#profile-name")
	assert.equal(input.getAttribute("aria-invalid"), "true")
	const error = main.querySelector(`#${input.getAttribute("aria-describedby")}`)
	assert.equal(text(error), bundles.en["profile.error.required"])
	assert.equal(input.value, "  ")
})

test("the too-long error names the limit from config", () => {
	const { main } = mount(screen({ ...en, error: "profile.error.tooLong" }))
	assert.match(text(main.querySelector("#profile-name-error")), /\b40\b/)
})

test("a profile name with markup is rendered as text, not as HTML", () => {
	const { main } = mount(screen({ ...en, profiles: ["<b>x</b>"] }))
	assert.equal(main.querySelector("b"), null)
	assert.equal(text(main.querySelector("[data-action='choose-profile']")), "<b>x</b>")
	dom.window.close()
	const { header } = mount(screen({ ...en, page: "garage", profiles: ["<b>x</b>"], active: 0 }))
	assert.equal(header.querySelector("b"), null)
	assert.equal(text(header.querySelector(".header-profile-name")), "<b>x</b>")
})

// A saved car as the car form stores it, owned by profile p0.
const VOLVO = {
	id: "c0",
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
}

// The facts on a card as label and value pairs.
const facts = (card) =>
	[...card.querySelectorAll("dt")].map((dt) => [text(dt), text(dt.nextElementSibling)])

function garage(lang, cars) {
	return mount(screen({ chosen: { lang }, page: "garage", profiles: ["Malin"], active: 0, cars }))
		.main
}

test("the garage has its heading, Add car and an empty line until the profile has a car", () => {
	const { main } = mount(screen({ ...en, page: "garage", profiles: ["Malin"], active: 0 }))
	const h1 = main.querySelector("h1")
	assert.equal(text(h1), bundles.en["garage.title"])
	assert.equal(h1.getAttribute("tabindex"), "-1")
	assert.equal(text(main.querySelector(".garage-empty")), bundles.en["garage.empty"])
	assert.equal(text(main.querySelector("[data-action='add-car']")), bundles.en["garage.addCar"])
	assert.equal(main.querySelector(".car-list"), null)
	assert.equal(main.querySelector("form"), null)

	const someoneElses = [{ ...VOLVO, profileId: "p1" }]
	const other = mount(
		screen({ ...en, page: "garage", profiles: ["Malin", "Rune"], active: 0, cars: someoneElses })
	)
	assert.equal(text(other.main.querySelector(".garage-empty")), bundles.en["garage.empty"])
	assert.equal(other.main.querySelector(".car-card"), null)
	const own = mount(
		screen({ ...en, page: "garage", profiles: ["Malin"], active: 0, cars: [VOLVO] })
	)
	assert.equal(own.main.querySelector(".garage-empty"), null)
	assert.ok(own.main.querySelector("[data-action='add-car']"))
})

test("a car card shows make and model, year and fuel, the registration number and the odometer", () => {
	const main = garage("en", [VOLVO])
	const cards = main.querySelectorAll(".car-list > li.car-card")
	assert.equal(cards.length, 1)
	const [card] = cards
	assert.equal(text(card.querySelector("h2")), "Volvo V70")
	assert.equal(card.querySelector(".car-card-make"), null) // no nickname, no second line
	assert.equal(text(card.querySelector(".car-card-meta")), "2008 · Diesel")
	assert.deepEqual(facts(card), [
		[bundles.en["garage.regNumber"], "AB12345"],
		[bundles.en["garage.mileage"], "184,000 km"],
	])
})

test("a nickname is the card title, with make and model under it", () => {
	const card = garage("en", [{ ...VOLVO, nickname: "Weekend car" }]).querySelector(".car-card")
	assert.equal(text(card.querySelector("h2")), "Weekend car")
	assert.equal(text(card.querySelector(".car-card-make")), "Volvo V70")
})

test("a VIN shows with the registration number, and nothing shows without one", () => {
	const vin = "YV1SW61R021234567"
	const card = garage("en", [{ ...VOLVO, vin }]).querySelector(".car-card")
	assert.deepEqual(facts(card), [
		[bundles.en["garage.regNumber"], "AB12345"],
		[bundles.en["garage.mileage"], "184,000 km"],
		[bundles.en["garage.vin"], vin],
	])
	const without = garage("en", [VOLVO]).querySelector(".car-card")
	assert.ok(!facts(without).some(([label]) => label === bundles.en["garage.vin"]))
})

test("the card follows the chosen language, numbers included", () => {
	const card = garage("nb", [VOLVO]).querySelector(".car-card")
	assert.equal(text(card.querySelector(".car-card-meta")), "2008 · Diesel")
	const [, odometer] = facts(card)
	assert.equal(odometer[0], bundles.nb["garage.mileage"])
	// Norwegian groups thousands with a no-break space.
	assert.equal(odometer[1], "184 000 km")
	assert.equal(
		text(garage("nb", [{ ...VOLVO, fuel: "petrol" }]).querySelector(".car-card-meta")),
		"2008 · Bensin"
	)
})

test("each card is one link that names the car, in the order the cars were added", () => {
	const saab = { ...VOLVO, id: "c1", make: "Saab", model: "9-3", nickname: "Old faithful" }
	const main = garage("en", [VOLVO, saab])
	const cards = [...main.querySelectorAll(".car-card")]
	assert.equal(cards.length, 2)
	for (const card of cards) assert.equal(card.querySelectorAll("a, button").length, 1)
	const links = cards.map((card) => card.querySelector("a"))
	assert.deepEqual(
		links.map((a) => [text(a), a.dataset.action, a.dataset.id, a.getAttribute("href")]),
		[
			["Volvo V70", "open-car", "c0", "#car-c0"],
			["Old faithful", "open-car", "c1", "#car-c1"],
		]
	)
})

test("a card escapes what the user typed", () => {
	const card = garage("en", [
		{ ...VOLVO, nickname: "<b>x</b>", make: "<i>M</i>", vin: null },
	]).querySelector(".car-card")
	assert.equal(card.querySelector("b, i"), null)
	assert.equal(text(card.querySelector("h2")), "<b>x</b>")
	assert.equal(text(card.querySelector(".car-card-make")), "<i>M</i> V70")
})

test("the car form has a label per field, marks the required ones and lists the fuels", () => {
	const { main } = mount(screen({ ...en, page: "carForm", profiles: ["Malin"], active: 0 }))
	assert.equal(text(main.querySelector("h1")), bundles.en["carForm.title"])
	const fields = [...main.querySelectorAll("[data-input='car-input']")]
	assert.deepEqual(
		fields.map((el) => el.dataset.field),
		[
			"nickname",
			"make",
			"model",
			"year",
			"regCountry",
			"regNumber",
			"vin",
			"fuel",
			"engine",
			"mileage",
		]
	)
	for (const el of fields) {
		assert.equal(
			text(main.querySelector(`label[for="${el.id}"]`)),
			bundles.en[`car.${el.dataset.field}`]
		)
	}
	const required = fields.filter((el) => el.required).map((el) => el.dataset.field)
	assert.deepEqual(required, ["make", "model", "year", "regCountry", "regNumber", "mileage"])
	const fuels = [...main.querySelectorAll("#car-fuel option")].map((o) => o.value)
	assert.deepEqual(fuels, config.fuels)
	assert.equal(main.querySelector("#car-fuel").value, "petrol")
	for (const id of ["#car-year", "#car-mileage"]) {
		assert.equal(main.querySelector(id).type, "text", id)
		assert.equal(main.querySelector(id).inputMode, "numeric", id)
	}
	assert.equal(main.querySelector("form button[type='submit']").textContent, bundles.en["car.save"])
	assert.equal(text(main.querySelector("[data-action='cancel-car']")), bundles.en["car.cancel"])
})

test("the car form keeps what was typed and shows each error under its field", () => {
	const { main } = mount(
		screen({
			...en,
			page: "carForm",
			profiles: ["Malin"],
			active: 0,
			car: { model: "V70", fuel: "diesel", nickname: "<b>x</b>" },
			carErrors: {
				make: "car.error.make",
				nickname: "car.error.nickname",
				mileage: "car.error.mileage",
			},
		})
	)
	assert.equal(main.querySelector("#car-model").value, "V70")
	assert.equal(main.querySelector("#car-fuel").value, "diesel")
	assert.equal(main.querySelector("#car-nickname").value, "<b>x</b>")
	assert.equal(main.querySelector("b"), null)
	const make = main.querySelector("#car-make")
	assert.equal(make.getAttribute("aria-invalid"), "true")
	assert.equal(make.getAttribute("aria-describedby"), "car-make-error")
	assert.equal(text(main.querySelector("#car-make-error")), bundles.en["car.error.make"])
	assert.equal(
		text(main.querySelector("#car-nickname-error")),
		bundles.en["car.error.nickname"].replace("{max}", "40")
	)
	assert.equal(
		text(main.querySelector("#car-mileage-error")),
		bundles.en["car.error.mileage"].replace("{maxKm}", "10,000,000")
	)
	assert.equal(main.querySelector("#car-model").hasAttribute("aria-invalid"), false)
})

test("every car field but fuel shows a short example inside it until something is typed", () => {
	const { main } = mount(screen({ ...en, page: "carForm", profiles: ["Malin"], active: 0 }))
	for (const el of main.querySelectorAll("input[data-input='car-input']")) {
		const { field } = el.dataset
		if (field !== "regNumber")
			assert.equal(el.placeholder, bundles.en[`car.placeholder.${field}`], field)
		assert.match(el.placeholder, /^e\.g\. /, field)
	}
	assert.equal(main.querySelector("#car-regNumber").placeholder, `e.g. ${PLATES.NO.example}`)
	assert.equal(main.querySelector("#car-make").placeholder, "e.g. Mercedes-Benz")
	assert.equal(main.querySelector("#car-model").placeholder, "e.g. C63 AMG")
	assert.equal(main.querySelector(".help"), null)
})

test("make suggests the built-in list of makes", () => {
	const { main } = mount(screen({ ...en, page: "carForm", profiles: ["Malin"], active: 0 }))
	const list = main.querySelector(
		`datalist#${main.querySelector("#car-make").getAttribute("list")}`
	)
	const makes = [...list.querySelectorAll("option")].map((o) => o.value)
	assert.deepEqual(makes, MAKES)
	assert.ok(makes.includes("Mercedes-Benz"))
})

// The values in a field's <datalist>.
const suggestions = (main, id) =>
	[...main.querySelector(`datalist#${main.querySelector(id).getAttribute("list")}`).options].map(
		(o) => o.value
	)

test("model suggests the models of the typed make, and none before a make is known", () => {
	const form = { ...en, page: "carForm", profiles: ["Malin"], active: 0 }
	assert.deepEqual(suggestions(mount(screen(form)).main, "#car-model"), [])
	const { main } = mount(screen({ ...form, car: { make: "mercedes-benz" } }))
	assert.ok(suggestions(main, "#car-model").includes("C63 AMG"))
})

test("the country field starts on Norway, by name, and suggests every country with a plate rule", () => {
	const { main } = mount(screen({ ...en, page: "carForm", profiles: ["Malin"], active: 0 }))
	assert.equal(main.querySelector("#car-regCountry").value, "Norway")
	const countries = suggestions(main, "#car-regCountry")
	assert.equal(countries.length, Object.keys(PLATES).length)
	assert.ok(countries.includes("Sweden"))
	const typed = mount(
		screen({ ...en, page: "carForm", profiles: ["Malin"], active: 0, car: { regCountry: "Nor" } })
	)
	assert.equal(typed.main.querySelector("#car-regCountry").value, "Nor")
	assert.equal(typed.main.querySelector("#car-regNumber").placeholder, "")
})

test("a plate that doesn't fit its country says the country and the lengths", () => {
	const { main } = mount(
		screen({
			...en,
			page: "carForm",
			profiles: ["Malin"],
			active: 0,
			carErrors: { regNumber: "car.error.regNumberLength" },
		})
	)
	const { min, max } = PLATES.NO
	assert.equal(
		text(main.querySelector("#car-regNumber-error")),
		`A registration number from Norway has ${min} to ${max} letters and digits.`
	)
})

test("the header shows the active profile and Switch profile, and neither without one", () => {
	const withProfile = mount(screen({ ...en, page: "garage", profiles: ["Malin"], active: 0 }))
	const row = withProfile.header.querySelector(".header-profile")
	assert.equal(text(row.querySelector(".header-profile-label")), bundles.en["profile.label"])
	assert.equal(text(row.querySelector(".header-profile-name")), "Malin")
	const button = row.querySelector("button[data-action='switch-profile']")
	assert.equal(button.type, "button")
	assert.equal(text(button), bundles.en["profile.switch"])
	dom.window.close()
	const without = mount(screen(en))
	assert.equal(without.header.querySelector(".header-profile"), null)
	assert.equal(without.header.querySelector("[data-action='switch-profile']"), null)
})

test("bindActions routes clicks, form submits and typing by their own attributes", () => {
	const { main, view } = mount(screen({ ...en, profiles: ["Malin"] }))
	const calls = []
	view.bindActions({
		"choose-profile": (_event, target) => calls.push(["choose", target.dataset.id]),
		"create-profile": (event) => calls.push(["create", event.defaultPrevented]),
		"profile-name": (_event, target) => calls.push(["type", target.value]),
	})
	main.querySelector("[data-action='choose-profile']").click()
	const input = main.querySelector("#profile-name")
	input.value = "Rune"
	input.dispatchEvent(new dom.window.Event("input", { bubbles: true }))
	main.querySelector("button[type='submit']").click() // one submit, and no click action
	assert.deepEqual(calls, [
		["choose", "p0"],
		["type", "Rune"],
		["create", true],
	])
})

test("focusHeading and focusField move focus inside main", () => {
	const { main, view } = mount(screen(en))
	view.focusHeading()
	assert.equal(dom.window.document.activeElement, main.querySelector("h1"))
	view.focusField("profile-name")
	assert.equal(dom.window.document.activeElement, main.querySelector("#profile-name"))
})

/* ----------------------------------------------------------------------
   A car's pages: details (#21), service history (#23) and the service
   form (#22). carScreen hands the view what the controller derives.
   ---------------------------------------------------------------------- */

const SAVED_CAR = Object.freeze({
	id: "c0",
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
	euInspectionDue: "2027-03-01",
})

const ENTRIES = Object.freeze([
	{
		id: "e0",
		carId: "c0",
		category: "service",
		title: "Oil change",
		date: "2025-05-01",
		mileage: 170000,
		cost: 1450,
		workshop: null,
		notes: null,
	},
	{
		id: "e1",
		carId: "c0",
		category: "repair",
		title: "Brake pads",
		date: "2026-03-14",
		mileage: 182500,
		cost: 2450,
		workshop: "Bilverksted AS",
		notes: "Front axle",
	},
])

function carScreen({
	page = "car",
	lang = "en",
	car = SAVED_CAR,
	entries = ENTRIES,
	filter = "all",
	inputs = {},
	errors = {},
} = {}) {
	const { model, derived } = screen({
		page,
		chosen: { lang },
		profiles: ["Malin"],
		active: 0,
		cars: car ? [car] : [],
	})
	model.app.selectedCarId = SAVED_CAR.id
	model.app.historyFilter = filter
	model.data.serviceEntries = entries
	Object.assign(model.inputs.serviceEntry, inputs)
	model.inputs.errors = errors
	derived.selectedCar = car
	derived.history = carHistory(entries, SAVED_CAR.id, filter)
	derived.today = "2026-10-26"
	return { model, derived }
}

// Text with every run of spaces as one, since the markup wraps lines.
const words = (el) => el.textContent.replace(/\s+/g, " ").trim()
const carFacts = (main) => Object.fromEntries(facts(main.querySelector(".car-detail-quick-facts")))

test("the car page shows make and model as the title, and the facts without empty ones", () => {
	const { main } = mount(carScreen())
	assert.equal(words(main.querySelector("h1")), "Volvo V70")
	assert.equal(main.querySelector("h1").getAttribute("tabindex"), "-1")
	assert.equal(main.querySelector(".car-detail-subtitle"), null)
	assert.deepEqual(carFacts(main), {
		Year: "2008",
		Fuel: "Diesel",
		"Registration number": "AB12345",
	})
})

test("a nickname takes the title with make and model under it, and VIN and engine show when set", () => {
	const car = { ...SAVED_CAR, nickname: "Svarten", vin: "YV1SW58D482712345", engine: "2.4 D5" }
	const { main } = mount(carScreen({ car }))
	assert.equal(words(main.querySelector("h1")), "Svarten")
	assert.equal(words(main.querySelector(".car-detail-subtitle")), "Volvo V70")
	assert.equal(carFacts(main).VIN, "YV1SW58D482712345")
	assert.equal(carFacts(main).Engine, "2.4 D5")
})

test("the stat cards show the odometer in km and the EU-kontroll date in the chosen language", () => {
	const stats = (lang, car) =>
		[...mount(carScreen({ lang, car })).main.querySelectorAll(".car-stat-card")].map(words)
	assert.deepEqual(stats("en"), ["Odometer 184,000 km", "EU inspection Mar 1, 2027"])
	const [odometer, inspection] = stats("nb")
	assert.match(odometer, /184\s000 km$/)
	assert.match(inspection, /1\. mars 2027$/)
	const [, noDate] = stats("en", { ...SAVED_CAR, euInspectionDue: null })
	assert.equal(noDate, "EU inspection No date set")
})

test("the car page links to its service history with the total spent, and has no dead ends", () => {
	const { main } = mount(carScreen())
	const link = main.querySelector("[data-action='open-history']")
	assert.equal(link.tagName, "A")
	assert.equal(link.getAttribute("href"), "#history-c0")
	assert.equal(link.dataset.id, "c0")
	assert.equal(words(link), "Service records Total spent: NOK 3,900")
	const controls = [...main.querySelectorAll("a, button")].map((el) => el.dataset.action)
	assert.deepEqual(controls, ["back-garage", "open-history"]) // no edit, no "coming soon"
})

test("the history lists entries newest first with date, work, km, workshop, cost and notes", () => {
	const { main } = mount(carScreen({ page: "history" }))
	assert.equal(words(main.querySelector("h1")), "Service history")
	assert.equal(words(main.querySelector("[data-action='back-car']")), "Back to Volvo V70")
	assert.equal(
		words(main.querySelector(".history-total")),
		"Total spent on service records NOK 3,900"
	)
	const items = [...main.querySelectorAll(".history-list > li")]
	assert.deepEqual(
		items.map((li) => words(li.querySelector("h2"))),
		["Brake pads", "Oil change"]
	)
	const [newest, oldest] = items
	assert.equal(newest.querySelector("time").getAttribute("datetime"), "2026-03-14")
	assert.equal(words(newest.querySelector("time")), "Mar 14, 2026")
	assert.equal(words(newest.querySelector(".history-category")), "Repair")
	assert.equal(words(newest.querySelector(".history-entry-mileage")), "182,500 km")
	assert.equal(words(newest.querySelector(".history-entry-workshop")), "Workshop: Bilverksted AS")
	assert.equal(words(newest.querySelector(".history-entry-cost")), "Cost: NOK 2,450")
	assert.equal(words(newest.querySelector(".history-entry-notes")), "Front axle")
	assert.equal(oldest.querySelector(".history-entry-workshop"), null)
	assert.equal(oldest.querySelector(".history-entry-notes"), null)
})

test("history dates and costs follow the chosen language", () => {
	const { main } = mount(carScreen({ page: "history", lang: "nb" }))
	const newest = main.querySelector(".history-list > li")
	assert.equal(words(newest.querySelector("time")), "14. mars 2026")
	assert.match(words(newest.querySelector(".history-entry-cost")), /^Kostnad: 2\s450 kr$/)
})

test("the history filter is a labelled select with All first and the current filter selected", () => {
	const { main } = mount(carScreen({ page: "history", filter: "repair" }))
	const select = main.querySelector("select#history-filter")
	assert.equal(select.dataset.change, "history-filter")
	assert.ok(main.querySelector("label[for='history-filter']").textContent.trim())
	assert.deepEqual(
		[...select.options].map((o) => o.value),
		["all", "service", "repair", "other"]
	)
	assert.equal(select.value, "repair")
	assert.deepEqual([...main.querySelectorAll(".history-list h2")].map(words), ["Brake pads"])
})

test("an empty history says so, tells an empty filter apart and always offers Register service", () => {
	const empty = mount(carScreen({ page: "history", entries: [] })).main
	assert.equal(words(empty.querySelector(".history-empty")), "No service records yet.")
	assert.ok(empty.querySelector("[data-action='register-service']"))
	dom.window.close()
	const filtered = mount(carScreen({ page: "history", filter: "other" })).main
	assert.equal(words(filtered.querySelector(".history-empty")), "No records match this filter.")
	assert.ok(filtered.querySelector("[data-action='register-service']"))
})

test("text typed into a service entry is shown as text, never as HTML", () => {
	const entries = [{ ...ENTRIES[1], title: "<img src=x onerror=alert(1)>", notes: "<b>bold</b>" }]
	const { main } = mount(carScreen({ page: "history", entries }))
	assert.equal(main.querySelector(".history-list img, .history-list b"), null)
	assert.equal(words(main.querySelector(".history-list h2")), "<img src=x onerror=alert(1)>")
})

test("the service form has every field in order, labelled, with optional ones marked", () => {
	const { main } = mount(carScreen({ page: "serviceForm" }))
	assert.equal(words(main.querySelector("h1")), "Register service")
	assert.equal(words(main.querySelector(".service-form-car")), "Volvo V70 · 2008")
	const fields = [...main.querySelectorAll("form [data-field]")]
	assert.deepEqual(
		fields.map((el) => el.dataset.field),
		["category", "title", "date", "mileage", "cost", "workshop", "notes"]
	)
	for (const el of fields) {
		assert.equal(el.dataset.input, "service-entry-input")
		assert.ok(main.querySelector(`label[for='${el.id}']`), `${el.id} has no label`)
	}
	const optional = fields
		.filter((el) => words(main.querySelector(`label[for='${el.id}']`)).endsWith("(optional)"))
		.map((el) => el.dataset.field)
	assert.deepEqual(optional, ["workshop", "notes"])
	assert.deepEqual(
		[...main.querySelector("#service-category").options].map((o) => o.value),
		["service", "repair", "other"]
	)
	assert.equal(main.querySelector("#service-date").type, "date")
	assert.equal(main.querySelector("#service-date").max, "2026-10-26")
	assert.equal(main.querySelector("#service-date").getAttribute("lang"), null)
	assert.equal(main.querySelector("#service-mileage").max, String(config.carMileageMax))
	assert.equal(main.querySelector("form").dataset.submit, "save-service-entry")
})

test("service form errors sit under their fields and are tied to them, with what was typed kept", () => {
	const errors = { title: "service.error.title", mileage: "service.error.mileage" }
	const inputs = { category: "repair", mileage: "-3", notes: "Front axle" }
	const { main } = mount(carScreen({ page: "serviceForm", errors, inputs }))
	assert.equal(main.querySelector("#service-title").getAttribute("aria-invalid"), "true")
	assert.equal(
		main.querySelector("#service-title").getAttribute("aria-describedby"),
		"service-title-error"
	)
	assert.equal(words(main.querySelector("#service-title-error")), "Enter the type of work.")
	assert.equal(
		words(main.querySelector("#service-mileage-error")),
		"Enter the odometer in whole km, from 0 to 10,000,000."
	)
	assert.equal(main.querySelector("#service-date").getAttribute("aria-invalid"), null)
	assert.equal(main.querySelector("#service-category").value, "repair")
	assert.equal(main.querySelector("#service-mileage").value, "-3")
	assert.equal(main.querySelector("#service-notes").value, "Front axle")
})

test("every car page has a way home when its car is gone", () => {
	for (const page of ["car", "history", "serviceForm"]) {
		const { main } = mount(carScreen({ page, car: null }))
		assert.equal(words(main.querySelector("h1")), "Car not found", page)
		assert.ok(main.querySelector("[data-action='back-garage']"), page)
		dom.window.close()
	}
})
