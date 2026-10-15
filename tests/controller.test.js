/* ======================================================================
   tests/controller.test.js: the controller owns the model and the
   three stored keys
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
	createController,
	resolvePreferences,
	systemCurrency,
} from "../src/controller/controller.js"
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
		handlers: {},
		derived: null,
		render(_model, derived) {
			view.renders++
			view.derived = derived
		},
		renderHeader: () => view.headerRenders++,
		focusPicker: (name) => view.focused.push(name),
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
	assert.deepEqual(view.derived, { lang: "nb", theme: "dark", currency: "NOK" }) // no matchMedia: the DS default
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
