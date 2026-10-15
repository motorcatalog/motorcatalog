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
import { resolvePreferences } from "../src/controller/controller.js"
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
function screen({
	chosen = {},
	system = {},
	page = "profiles",
	profiles = [],
	active = null,
	name = "",
	error = null,
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
	const profile = model.data.profiles.find((p) => p.id === model.data.activeProfileId) ?? null
	return { model, derived: { ...resolvePreferences(model.app.preferences), profile } }
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

test("the garage has its heading and an empty line until cars arrive", () => {
	const { main } = mount(screen({ ...en, page: "garage", profiles: ["Malin"], active: 0 }))
	const h1 = main.querySelector("h1")
	assert.equal(text(h1), bundles.en["garage.title"])
	assert.equal(h1.getAttribute("tabindex"), "-1")
	assert.equal(text(main.querySelector("h1 + p")), bundles.en["garage.empty"])
	assert.equal(main.querySelector("form"), null)
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
