/* ======================================================================
   tests/a11y/view.test.js — Layer 1: component accessibility tests
   Renders the real view into a jsdom document and asserts axe-core finds
   no violations. Copy this shape for every view you add: render it with
   representative (synthetic) state, then assert on axeComponent(mount).
   Layer 1 catches missing names, labels, roles and broken structure.
   The Pa11y scan (.pa11yci.json) catches contrast and document-level
   issues on the built page in a real browser. Neither layer checks
   keyboard order, focus handling or whether labels make sense — test
   those by hand before shipping a view (tests/e2e covers the pickers).
   ====================================================================== */

import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { createTranslator } from "../../i18n/index.js"
import { bundles, FALLBACK_LANG } from "../../src/locales/index.js"
import { createModel } from "../../src/model/model.js"
import { createView } from "../../src/view/view.js"
import { MULTI_CURRENCY } from "../fixtures.js"
import { axeComponent, createMount } from "./axe-helper.js"

const i18n = createTranslator(bundles, { fallback: FALLBACK_LANG })

// Synthetic state: the language under test is chosen, the rest is System.
function stateFor(lang) {
	const { state } = createModel({
		chosen: { lang },
		system: { lang: "nb", theme: "dark", currency: "NOK" },
		languages: i18n.languages,
	})
	state.config = MULTI_CURRENCY
	return state
}

let dom
afterEach(() => dom?.close())

for (const lang of Object.keys(bundles)) {
	test(`view renders without axe violations (${lang})`, async () => {
		dom = createMount(lang)
		const view = createView({ header: dom.header, main: dom.mount }, i18n)
		view.renderHeader(stateFor(lang))
		view.render(stateFor(lang))
		assert.deepEqual(await axeComponent(dom.body), [])
	})
}

// The open list is part of the page: scan with each picker open in turn.
for (const name of ["lang", "theme", "currency"]) {
	test(`the ${name} picker open has no axe violations`, async () => {
		dom = createMount("en")
		const view = createView({ header: dom.header, main: dom.mount }, i18n)
		view.renderHeader(stateFor("en"))
		view.render(stateFor("en"))
		const details = dom.header.querySelector(`details[data-picker="${name}"]`)
		details.open = true
		assert.ok(details.querySelectorAll(".picker-row").length > 1)
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
