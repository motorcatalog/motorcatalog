/* ======================================================================
   tests/model.test.js — model tests
   The model is DOM-free, so it tests with node's built-in runner alone —
   no extra packages. Real projects add model methods (addItem, setFilter…)
   that mutate state and call notify(); test those the same way: call the
   method, assert on what subscribers receive.
   ====================================================================== */

import assert from "node:assert/strict"
import { test } from "node:test"
import { config } from "../src/config.js"
import { createModel, systemCurrency } from "../src/model/model.js"
import { MULTI_CURRENCY } from "./fixtures.js"

const system = { lang: "nb", theme: "dark", currency: "NOK" }

function model(chosen = {}) {
	return createModel({ chosen, system, languages: ["en", "nb"] })
}

test("notify calls every subscriber with the state", () => {
	const m = model()
	const seen = []
	m.subscribe((state) => seen.push(state))
	m.subscribe((state) => seen.push(state))
	m.notify()
	assert.equal(seen.length, 2)
	assert.equal(seen[0], m.state)
})

test("state changes are visible to subscribers on the next notify", () => {
	const m = model()
	let rendered = null
	m.subscribe((state) => {
		rendered = { ...state }
	})
	// In a real project this mutation lives inside a model method that
	// ends with notify() — the mechanism under test is the same.
	m.state.count = 1
	m.notify()
	assert.equal(rendered.count, 1)
})

test("subscribers added later are not called for past notifies", () => {
	const m = model()
	let calls = 0
	m.notify()
	m.subscribe(() => {
		calls++
	})
	assert.equal(calls, 0)
	m.notify()
	assert.equal(calls, 1)
})

test("with nothing chosen every preference resolves to its system value", () => {
	const { state } = model()
	assert.deepEqual(state.chosen, { lang: null, theme: null, currency: null })
	assert.equal(state.lang, "nb")
	assert.equal(state.theme, "dark")
	assert.equal(state.currency, "NOK")
})

test("setPreference stores the choice, resolves it and notifies once; a repeat is a no-op", () => {
	const m = model()
	let calls = 0
	m.subscribe(() => {
		calls++
	})
	m.setPreference("lang", "en")
	m.setPreference("lang", "en")
	assert.equal(m.state.chosen.lang, "en")
	assert.equal(m.state.lang, "en")
	assert.equal(calls, 1)
})

test("the System row (an empty value) clears the choice and falls back to the system value", () => {
	const m = model({ theme: "light" })
	assert.equal(m.state.theme, "light")
	m.setPreference("theme", "")
	assert.equal(m.state.chosen.theme, null)
	assert.equal(m.state.theme, "dark")
})

test("a system change shows through only while nothing is chosen", () => {
	const m = model()
	m.setSystem("theme", "light")
	assert.equal(m.state.theme, "light")
	m.setPreference("theme", "dark")
	m.setSystem("theme", "light")
	assert.equal(m.state.theme, "dark")
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
