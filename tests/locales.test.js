/* ======================================================================
   tests/locales.test.js: every bundle carries the same keys
   A key added to one language and forgotten in another renders as the
   raw key in the UI. This catches it before anyone sees it. Two more
   checks from the locale standard: no bundle hard-codes a price (prices
   go through money() so the active language and currency decide the
   format), and every bundle carries the keys the pickers render.
   ====================================================================== */

import assert from "node:assert/strict"
import { test } from "node:test"
import { bundles, FALLBACK_LANG } from "../src/locales/index.js"

const reference = Object.keys(bundles[FALLBACK_LANG]).sort()

// Reserved by the design-system pickers (locale standard § 7.2).
const PICKER_KEYS = [
	"picker.language",
	"picker.theme",
	"picker.currency",
	"picker.system",
	"theme.light",
	"theme.dark",
]

// A digit next to a currency symbol or ISO code. Add the code when a project adds a currency.
const CURRENCY = "(?:kr|€|\\$|£|zł|₴|NOK|SEK|DKK|EUR|USD|GBP|PLN|UAH|CHF|ISK)"
const PRICE_PATTERN = new RegExp(`\\d\\s?${CURRENCY}(?!\\p{L})|${CURRENCY}\\s?\\d`, "iu")
const looksLikePrice = (value) => PRICE_PATTERN.test(value)

test("price check: rejects hard-coded prices and accepts a placeholder", () => {
	assert.equal(looksLikePrice("949 kr"), true)
	assert.equal(looksLikePrice("NOK 949"), true)
	assert.equal(looksLikePrice("949,00 kr"), true)
	assert.equal(looksLikePrice("$5"), true)
	assert.equal(looksLikePrice("{price}"), false)
	assert.equal(looksLikePrice("Example price: {price}"), false)
	assert.equal(looksLikePrice("3 krones"), false)
})

for (const [lang, bundle] of Object.entries(bundles)) {
	test(`locales/${lang}.json has exactly the ${FALLBACK_LANG} keys`, () => {
		assert.deepEqual(Object.keys(bundle).sort(), reference)
	})

	test(`locales/${lang}.json has no empty strings`, () => {
		const empty = Object.entries(bundle).filter(([, value]) => value.trim() === "")
		assert.deepEqual(empty, [])
	})

	test(`locales/${lang}.json has no hard-coded prices`, () => {
		const prices = Object.entries(bundle).filter(([, value]) => looksLikePrice(value))
		assert.deepEqual(prices, [])
	})

	test(`locales/${lang}.json carries the reserved picker keys`, () => {
		const absent = PICKER_KEYS.filter((key) => !(key in bundle))
		assert.deepEqual(absent, [])
	})
}
