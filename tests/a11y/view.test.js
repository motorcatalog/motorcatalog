/* ======================================================================
   tests/a11y/view.test.js: Layer 1 component accessibility tests
   Renders the real view into a jsdom document and asserts axe-core finds
   no violations. Copy this shape for every view you add: render it with
   representative (synthetic) state, then assert on axeComponent(mount).
   Layer 1 catches missing names, labels, roles and broken structure.
   The Pa11y scan (.pa11yci.json) catches contrast and document-level
   issues on the built page in a real browser. Neither layer checks
   keyboard order, focus handling or whether labels make sense. Test
   those by hand before shipping a view (tests/e2e covers the pickers).
   ====================================================================== */

import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { createTranslator } from "../../i18n/index.js"
import {
	carFormHints,
	carHistory,
	euInspectionStatus,
	resolvePreferences,
} from "../../src/controller/controller.js"
import { bundles, FALLBACK_LANG } from "../../src/locales/index.js"
import { model as initialModel } from "../../src/model/model.js"
import { createView } from "../../src/view/view.js"
import { MULTI_CURRENCY } from "../fixtures.js"
import { axeComponent, createMount } from "./axe-helper.js"

const i18n = createTranslator(bundles, { fallback: FALLBACK_LANG })

// Synthetic screen: the language under test is chosen, the rest is System.
function screenFor(lang) {
	const model = structuredClone(initialModel)
	model.app.preferences.chosen.lang = lang
	model.app.preferences.system = { lang: "nb", theme: "dark", currency: "NOK" }
	return { model, derived: { ...resolvePreferences(model.app.preferences), cars: [] } }
}

let dom
afterEach(() => dom?.close())

for (const lang of Object.keys(bundles)) {
	test(`view renders without axe violations (${lang})`, async () => {
		dom = createMount(lang)
		const view = createView({ header: dom.header, main: dom.mount }, i18n, MULTI_CURRENCY)
		const { model, derived } = screenFor(lang)
		view.renderHeader(model, derived)
		view.render(model, derived)
		assert.deepEqual(await axeComponent(dom.body), [])
	})
}

// The open list is part of the page: scan with each picker open in turn.
for (const name of ["lang", "theme", "currency"]) {
	test(`the ${name} picker open has no axe violations`, async () => {
		dom = createMount("en")
		const view = createView({ header: dom.header, main: dom.mount }, i18n, MULTI_CURRENCY)
		const { model, derived } = screenFor("en")
		view.renderHeader(model, derived)
		view.render(model, derived)
		const details = dom.header.querySelector(`details[data-picker="${name}"]`)
		details.open = true
		assert.ok(details.querySelectorAll(".picker-row").length > 1)
		assert.deepEqual(await axeComponent(dom.body), [])
	})
}

// Two cars as the car form saves them: one plain, one with a nickname and a VIN.
const CAR = {
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
const CARS = [
	{ ...CAR, id: "c0" },
	{
		...CAR,
		id: "c1",
		nickname: "Weekend car",
		vin: "YV1SW61R021234567",
		engine: "2.4 D5",
		euInspectionDue: "2026-10-01", // overdue, the one status in colour
	},
]

// Two entries for the second car: one bare, one with every optional field.
const ENTRIES = [
	{
		id: "e0",
		carId: "c1",
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
		carId: "c1",
		category: "repair",
		title: "Brake pads",
		date: "2026-03-14",
		mileage: 182500,
		cost: 2450,
		workshop: "Bilverksted AS",
		notes: "Front axle",
	},
]

// Every page the profile, car and service stories add, with the header row for the active
// profile where there is one.
const PAGES = {
	"the welcome page": { page: "profiles", profiles: [], active: null },
	"the profile picker": { page: "profiles", profiles: ["Malin", "Rune"], active: null },
	"the form with an error": {
		page: "profiles",
		profiles: [],
		active: null,
		error: "profile.error.required",
	},
	"the garage with an active profile": { page: "garage", profiles: ["Malin"], active: 0 },
	"the garage with cars": { page: "garage", profiles: ["Malin"], active: 0, cars: CARS },
	"the car form": { page: "carForm", profiles: ["Malin"], active: 0 },
	"the car form with errors": {
		page: "carForm",
		profiles: ["Malin"],
		active: 0,
		errors: { make: "car.error.make", year: "car.error.year", vin: "car.error.vin" },
	},
	"a car page": { page: "car", profiles: ["Malin"], active: 0, cars: CARS, selected: "c0" },
	"a car page with a nickname, VIN and history": {
		page: "car",
		profiles: ["Malin"],
		active: 0,
		cars: CARS,
		selected: "c1",
	},
	"an empty service history": {
		page: "history",
		profiles: ["Malin"],
		active: 0,
		cars: CARS,
		selected: "c0",
	},
	"a service history with entries": {
		page: "history",
		profiles: ["Malin"],
		active: 0,
		cars: CARS,
		selected: "c1",
	},
	"the service form": {
		page: "serviceForm",
		profiles: ["Malin"],
		active: 0,
		cars: CARS,
		selected: "c0",
	},
	"the service form with errors": {
		page: "serviceForm",
		profiles: ["Malin"],
		active: 0,
		cars: CARS,
		selected: "c0",
		errors: { title: "service.error.title", date: "service.error.dateFuture" },
	},
	"the car form while editing": {
		page: "carForm",
		profiles: ["Malin"],
		active: 0,
		cars: CARS,
		editing: "c0",
	},
	"a car page with the delete dialog open": {
		page: "car",
		profiles: ["Malin"],
		active: 0,
		cars: CARS,
		selected: "c1",
		dialog: "delete-car-dialog",
	},
	"a car page for a car that is gone": {
		page: "car",
		profiles: ["Malin"],
		active: 0,
		selected: "x",
	},
}

for (const [
	name,
	{ page, profiles, active, error, errors, cars = [], selected, editing = null, dialog },
] of Object.entries(PAGES)) {
	test(`${name} has no axe violations`, async () => {
		dom = createMount("en")
		const view = createView({ header: dom.header, main: dom.mount }, i18n, MULTI_CURRENCY)
		const { model, derived } = screenFor("en")
		model.app.page = page
		model.data.profiles = profiles.map((n, i) => ({ id: `p${i}`, name: n }))
		model.data.activeProfileId = active === null ? null : `p${active}`
		if (error) model.inputs.errors = { name: error }
		if (errors) model.inputs.errors = errors
		model.inputs.editingId = editing
		derived.profile = model.data.profiles[active] ?? null
		derived.cars = cars
		derived.euStatus = Object.fromEntries(
			cars.map((c) => [c.id, euInspectionStatus(c.euInspectionDue, "2026-10-26", 3)])
		)
		if (page === "carForm") derived.carForm = carFormHints(model.inputs.car, derived.lang)
		if (selected) {
			model.app.selectedCarId = selected
			derived.selectedCar = cars.find((car) => car.id === selected) ?? null
			derived.history = carHistory(ENTRIES, selected)
			derived.today = "2026-10-26"
		}
		view.renderHeader(model, derived)
		view.render(model, derived)
		// jsdom has no showModal(), so an open dialog is set by hand.
		if (dialog) dom.mount.querySelector(`#${dialog}`).setAttribute("open", "")
		assert.ok(dom.mount.querySelector("h1"))
		assert.deepEqual(await axeComponent(dom.body), [])
	})
}

// Export sits on both profiles pages (#26). Its button carries an icon,
// so the name it gets from its text is checked in every language.
for (const lang of Object.keys(bundles)) {
	test(`the Export section has no axe violations and a named button (${lang})`, async () => {
		dom = createMount(lang)
		const view = createView({ header: dom.header, main: dom.mount }, i18n, MULTI_CURRENCY)
		const { model, derived } = screenFor(lang)
		model.app.page = "profiles"
		view.renderHeader(model, derived)
		view.render(model, derived)
		const button = dom.mount.querySelector(".profile-export [data-action='export-data']")
		assert.equal(button.textContent.trim(), bundles[lang]["export.button"])
		assert.deepEqual(await axeComponent(dom.mount.querySelector(".profile-export")), [])
	})
}

// Proves the harness reports real problems instead of passing silently.
// A visible glyph counts as text, so the icon is hidden from assistive
// technology the way a real icon would be; the button then has no name.
test("an icon-only button with no accessible name is reported", async () => {
	dom = createMount()
	dom.mount.innerHTML = `<button type="button"><span aria-hidden="true">&#9881;</span></button>`
	const violations = await axeComponent(dom.mount)
	assert.deepEqual(
		violations.map((v) => v.id),
		["button-name"]
	)
})
