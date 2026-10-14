/* ======================================================================
   tests/controller.test.js — the controller owns the three stored keys
   localStorage and document are stubbed so the controller runs under
   node's built-in runner. The view is a recorder: it never renders.
   ====================================================================== */

import assert from "node:assert/strict"
import { afterEach, beforeEach, test } from "node:test"
import { createTranslator } from "../i18n/index.js"
import { createController, readPreferences } from "../src/controller/controller.js"
import { bundles, FALLBACK_LANG } from "../src/locales/index.js"
import { createModel } from "../src/model/model.js"
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

function fakeView() {
	const view = {
		renders: 0,
		headerRenders: 0,
		focused: [],
		handlers: {},
		render: () => view.renders++,
		renderHeader: () => view.headerRenders++,
		focusPicker: (name) => view.focused.push(name),
		bindActions: (handlers) => Object.assign(view.handlers, handlers),
	}
	return view
}

// Boots a controller the way app.js does, against the stubbed storage.
function boot(storage) {
	Object.defineProperty(globalThis, "localStorage", {
		value: storage,
		configurable: true,
		writable: true,
	})
	const { chosen, system } = readPreferences({
		i18n,
		config: MULTI_CURRENCY,
		languages: ["nb-NO", "en"],
	})
	const model = createModel({ chosen, system, languages: i18n.languages })
	const view = fakeView()
	createController({ model, view, i18n }).init()
	return { model, view }
}

// Node 22+ defines localStorage as a getter that warns when read, so the
// globals are swapped as property descriptors, never read.
const GLOBALS = ["localStorage", "document", "addEventListener", "removeEventListener"]
const saved = {}
beforeEach(() => {
	for (const name of GLOBALS) saved[name] = Object.getOwnPropertyDescriptor(globalThis, name)
	globalThis.document = { documentElement: { lang: "", dataset: {} }, title: "" }
	globalThis.addEventListener = () => {}
	globalThis.removeEventListener = () => {}
})
afterEach(() => {
	for (const name of GLOBALS) {
		if (saved[name]) Object.defineProperty(globalThis, name, saved[name])
		else delete globalThis[name]
	}
})

test("first load resolves every preference from the browser when nothing is stored", () => {
	const { model } = boot(fakeStorage())
	assert.deepEqual(model.state.chosen, { lang: null, theme: null, currency: null })
	assert.equal(model.state.lang, "nb")
	assert.equal(model.state.theme, "dark") // no matchMedia in node: the DS default
	assert.equal(model.state.currency, "NOK")
	assert.equal(globalThis.document.documentElement.lang, "nb")
	assert.equal(globalThis.document.documentElement.dataset.theme, "dark")
	assert.equal(globalThis.document.title, bundles.nb["app.title"])
})

test("a stored 'no' and a stored 'system' are invalid and removed on first read", () => {
	const storage = fakeStorage({ lang: "no", theme: "system", currency: "EUR" })
	const { model } = boot(storage)
	assert.deepEqual(storage.removed.sort(), ["lang", "theme"])
	assert.deepEqual(storage.items, { currency: "EUR" })
	assert.equal(model.state.chosen.lang, null)
	assert.equal(model.state.chosen.theme, null)
	assert.equal(model.state.currency, "EUR")
})

test("a choice is written to its key and the model resolves to it", () => {
	const storage = fakeStorage()
	const { model, view } = boot(storage)
	view.handlers["set-theme"](null, { dataset: { value: "light" } })
	view.handlers["set-lang"](null, { dataset: { lang: "en" } })
	assert.deepEqual(storage.items, { theme: "light", lang: "en" })
	assert.equal(model.state.theme, "light")
	assert.equal(model.state.lang, "en")
	assert.equal(globalThis.document.documentElement.dataset.theme, "light")
	assert.equal(globalThis.document.documentElement.lang, "en")
})

test("the System row removes the key instead of storing 'system'", () => {
	const storage = fakeStorage({ currency: "USD" })
	const { model, view } = boot(storage)
	view.handlers["set-currency"](null, { dataset: { currency: "" } })
	assert.deepEqual(storage.removed, ["currency"])
	assert.deepEqual(storage.items, {})
	assert.equal(model.state.chosen.currency, null)
	assert.equal(model.state.currency, "NOK")
})

test("when setItem throws the model still holds the choice and nothing else throws", () => {
	const storage = fakeStorage({}, { throwOnSet: true })
	const { model, view } = boot(storage)
	assert.doesNotThrow(() => view.handlers["set-theme"](null, { dataset: { value: "dark" } }))
	assert.equal(model.state.chosen.theme, "dark")
	assert.equal(model.state.theme, "dark")
	assert.deepEqual(storage.items, {})
})

test("after a choice focus returns to the trigger of the picker that was used", () => {
	const { view } = boot(fakeStorage())
	view.handlers["set-currency"](null, { dataset: { currency: "EUR" } })
	view.handlers["set-lang"](null, { dataset: { lang: "nb" } }) // already active: still refocused
	assert.deepEqual(view.focused, ["currency", "lang"])
})

test("the header re-renders only when a preference changes", () => {
	const { model, view } = boot(fakeStorage())
	assert.equal(view.headerRenders, 1)
	model.notify() // unrelated state update
	model.notify()
	assert.equal(view.headerRenders, 1)
	assert.equal(view.renders, 3)
	view.handlers["set-theme"](null, { dataset: { value: "light" } })
	assert.equal(view.headerRenders, 2)
	model.setSystem("theme", "light") // what System resolves to is shown on a row
	assert.equal(view.headerRenders, 3)
})
