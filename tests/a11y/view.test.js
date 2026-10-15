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
import { resolvePreferences } from "../../src/controller/controller.js"
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
	return { model, derived: resolvePreferences(model.app.preferences) }
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

// Every page the profile story adds, with the header row for the active
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
}

for (const [name, { page, profiles, active, error }] of Object.entries(PAGES)) {
	test(`${name} has no axe violations`, async () => {
		dom = createMount("en")
		const view = createView({ header: dom.header, main: dom.mount }, i18n, MULTI_CURRENCY)
		const { model, derived } = screenFor("en")
		model.app.page = page
		model.data.profiles = profiles.map((n, i) => ({ id: `p${i}`, name: n }))
		model.data.activeProfileId = active === null ? null : `p${active}`
		if (error) model.inputs.errors = { name: error }
		derived.profile = model.data.profiles[active] ?? null
		view.renderHeader(model, derived)
		view.render(model, derived)
		assert.ok(dom.mount.querySelector("h1"))
		assert.deepEqual(await axeComponent(dom.body), [])
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
