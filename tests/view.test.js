/* ======================================================================
   tests/view.test.js — the header renders what the model offers
   The view is rendered into jsdom (already a dev dependency for the
   a11y tests) and the markup is asserted on. Axe runs over the same
   markup in tests/a11y/view.test.js.
   ====================================================================== */

import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { JSDOM } from "jsdom"
import { createTranslator } from "../i18n/index.js"
import { bundles, FALLBACK_LANG } from "../src/locales/index.js"
import { config, createModel } from "../src/model/model.js"
import { createView, escapeHtml } from "../src/view/view.js"
import { MULTI_CURRENCY } from "./fixtures.js"

const i18n = createTranslator(bundles, { fallback: FALLBACK_LANG })

let dom
afterEach(() => dom?.window.close())

function mount(state) {
	dom = new JSDOM(
		`<!doctype html><html lang="en"><body><header id="header"></header><main id="main"></main></body></html>`
	)
	const { document } = dom.window
	const roots = { header: document.getElementById("header"), main: document.getElementById("main") }
	const view = createView(roots, i18n)
	view.renderHeader(state)
	view.render(state)
	return { ...roots, view }
}

function state({ chosen = {}, system = {}, languages = ["en", "nb"], currencies } = {}) {
	const model = createModel({
		chosen,
		system: { lang: "nb", theme: "dark", currency: "NOK", ...system },
		languages,
	})
	model.state.config = currencies ? { ...config, currencies } : MULTI_CURRENCY
	return model.state
}

test("escapeHtml neutralises the five HTML characters", () => {
	assert.equal(
		escapeHtml(`<a href="x" title='y'>&</a>`),
		"&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;"
	)
})

test("the header renders the three pickers in the order language, theme, currency", () => {
	const { header } = mount(state())
	const names = [...header.querySelectorAll("details[data-picker]")].map((d) => d.dataset.picker)
	assert.deepEqual(names, ["lang", "theme", "currency"])
})

test("the currency picker renders only when the project offers more than one currency", () => {
	const { header } = mount(state({ currencies: ["NOK"] }))
	assert.equal(header.querySelector('[data-picker="currency"]'), null)
	assert.ok(header.querySelector('[data-picker="lang"]'))
	assert.ok(header.querySelector('[data-picker="theme"]'))
})

test("the language picker renders only when there is more than one bundle", () => {
	const { header } = mount(state({ languages: ["en"], system: { lang: "en" } }))
	assert.equal(header.querySelector('[data-picker="lang"]'), null)
})

test("language rows: System first with an empty data-lang, every row carries lang, the active row aria-current", () => {
	const { header } = mount(state({ chosen: { lang: "en" }, system: { lang: "nb" } }))
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
	const { header } = mount(state({ system: { lang: "nb", theme: "light", currency: "EUR" } }))
	const first = (name) => header.querySelector(`[data-picker="${name}"] .picker-row`)
	assert.equal(first("lang").textContent.trim(), "System (Norsk bokmål)")
	assert.equal(first("theme").textContent.trim(), "System (Lyst)") // UI language is nb
	assert.equal(first("currency").textContent.trim(), "System (EUR)")
	for (const name of ["lang", "theme", "currency"])
		assert.ok(first(name).hasAttribute("aria-current"))
})

test("the theme trigger shows the sun when light resolves and the moon when dark does", () => {
	const light = mount(state({ chosen: { theme: "light" } }))
	assert.ok(light.header.querySelector('[data-picker="theme"] summary svg circle'))
	dom.window.close()
	const dark = mount(state({ system: { theme: "dark" } }))
	assert.equal(dark.header.querySelector('[data-picker="theme"] summary svg circle'), null)
})

test("currency rows carry a decorative flag, the ISO code and the Intl name; the trigger shows the active flag", () => {
	const { header } = mount(state({ chosen: { currency: "USD", lang: "en" } }))
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

test("the example price is rendered with money(): the language sets the format, the currency the symbol", () => {
	const nb = mount(state({ chosen: { lang: "nb", currency: "NOK" } }))
	assert.ok(nb.main.textContent.includes(i18n.money("nb", 949, "NOK")))
	dom.window.close()
	const en = mount(state({ chosen: { lang: "en", currency: "EUR" } }))
	assert.ok(en.main.textContent.includes(i18n.money("en", 949, "EUR")))
})

test("a bundle string with markup is rendered as text, not as HTML", () => {
	const hostile = createTranslator({ en: { ...bundles.en, "app.title": "<b>x</b>" } })
	dom = new JSDOM(
		`<!doctype html><html><body><header id="header"></header><main id="main"></main></body></html>`
	)
	const { document } = dom.window
	const view = createView(
		{ header: document.getElementById("header"), main: document.getElementById("main") },
		hostile
	)
	view.render(state({ chosen: { lang: "en" } }))
	assert.equal(document.querySelector("main b"), null)
	assert.equal(document.querySelector("main h1").textContent, "<b>x</b>")
})
