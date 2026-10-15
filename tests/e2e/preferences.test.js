/* ======================================================================
   tests/e2e/preferences.test.js — the preference model in a real browser
   Vite serves the scaffold in-process and Puppeteer (installed by pa11y-ci)
   drives Chrome. Each test gets a fresh browser context: no stored keys,
   its own prefers-color-scheme. Run with `npm run test:e2e`; `npm test`
   includes it. Needs the Chrome that `npm install` fetches (README,
   Accessibility).
   ====================================================================== */

import assert from "node:assert/strict"
import { resolve } from "node:path"
import { after, before, test } from "node:test"
import puppeteer from "puppeteer"
import { createServer } from "vite"
import nb from "../../src/locales/nb.json" with { type: "json" }

const ROOT = resolve(import.meta.dirname, "../..")
const TRIGGER = (name) => `details[data-picker="${name}"] > summary`
const ROW = (name, attr, value) => `details[data-picker="${name}"] .picker-row[${attr}="${value}"]`

let server
let browser
let origin

before(async () => {
	server = await createServer({ root: ROOT, logLevel: "silent", server: { port: 4317 } })
	await server.listen()
	origin = server.resolvedUrls.local[0]
	browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] })
})

after(async () => {
	await browser?.close()
	await server?.close()
})

// A page in a fresh context. `stored` is written before any page script
// runs, so the inline head snippet and the controller see it as a reload would.
async function open({ scheme = "light", stored = {}, context, viewport } = {}) {
	context ??= await browser.createBrowserContext()
	const page = await context.newPage()
	if (viewport) await page.setViewport(viewport)
	await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }])
	await page.evaluateOnNewDocument((items) => {
		for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value)
	}, stored)
	await page.goto(origin, { waitUntil: "networkidle0" })
	await page.waitForSelector("#main h1")
	// Headless Chrome freezes a background tab and sends keys to the front
	// one, so every page is fronted when it is opened and before it is used.
	await page.bringToFront()
	return { context, page }
}

const theme = (page) => page.evaluate(() => document.documentElement.dataset.theme)
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key)
const storedKeys = (page) => page.evaluate(() => Object.keys(localStorage).sort())
const focused = (page) =>
	page.evaluate(() => {
		const el = document.activeElement
		const picker = el?.closest("details[data-picker]")?.dataset.picker ?? ""
		return `${picker}:${el?.tagName.toLowerCase()}${el?.className ? `.${el.className.split(" ")[0]}` : ""}`
	})
const isOpen = (page, name) => page.$eval(`details[data-picker="${name}"]`, (d) => d.open)

async function choose(page, name, attr, value) {
	await page.click(TRIGGER(name))
	await page.waitForSelector(ROW(name, attr, value), { visible: true })
	await page.click(ROW(name, attr, value))
}

test("a fresh profile with prefers-color-scheme: light and no key renders light", async () => {
	const { page } = await open({ scheme: "light" })
	assert.equal(await theme(page), "light")
	assert.equal(await stored(page, "theme"), null)
	assert.equal(await storedKeys(page).then((keys) => keys.length), 0)
	assert.equal(
		await page.$eval(`${TRIGGER("theme")} .sr-only`, (el) => el.textContent),
		"Theme: System (Light)"
	)
})

test("a stored 'dark' renders dark even though the OS prefers light", async () => {
	const { page } = await open({ scheme: "light", stored: { theme: "dark" } })
	assert.equal(await theme(page), "dark")
	assert.equal(
		await page.$eval(`${TRIGGER("theme")} .sr-only`, (el) => el.textContent),
		"Theme: Dark"
	)
	assert.equal(
		await page.$eval(ROW("theme", "data-value", "dark"), (el) => el.getAttribute("aria-current")),
		"true"
	)
})

test("choosing System removes the key and the page follows the OS again", async () => {
	const { page } = await open({ scheme: "light", stored: { theme: "dark" } })
	await choose(page, "theme", "data-value", "")
	assert.equal(await stored(page, "theme"), null)
	assert.equal(await theme(page), "light")
	// Focus is back on the trigger, whose new name is the result of the press.
	assert.equal(await focused(page), "theme:summary.btn")
	assert.equal(
		await page.$eval(`${TRIGGER("theme")} .sr-only`, (el) => el.textContent),
		"Theme: System (Light)"
	)
})

test("a stored 'no' and a stored 'system' are removed on first read", async () => {
	const { page } = await open({
		scheme: "light",
		stored: { lang: "no", theme: "system", currency: "SEK" },
	})
	assert.deepEqual(await storedKeys(page), [])
	assert.equal(await theme(page), "light")
	assert.equal(await page.$eval("html", (el) => el.lang), "en") // Chrome's default navigator.languages
	assert.equal(
		await page.$eval(ROW("lang", "data-lang", ""), (el) => el.getAttribute("aria-current")),
		"true"
	)
})

test("a second page in the same context flips theme when the first clears the key", async () => {
	const { context, page: first } = await open({ scheme: "light", stored: { theme: "dark" } })
	const { page: second } = await open({ scheme: "light", context })
	assert.equal(await theme(second), "dark")
	// Headless Chrome freezes a background tab; each page is fronted before use.
	await first.bringToFront()
	await choose(first, "theme", "data-value", "")
	await second.bringToFront()
	await second.waitForFunction(() => document.documentElement.dataset.theme === "light")
	assert.equal(await theme(second), "light")
	assert.equal(
		await second.$eval(ROW("theme", "data-value", ""), (el) => el.getAttribute("aria-current")),
		"true"
	)
})

test("choosing a language stores it, switches <html lang> and the page text", async () => {
	const { page } = await open()
	await choose(page, "lang", "data-lang", "nb")
	assert.equal(await stored(page, "lang"), "nb")
	assert.equal(await page.$eval("html", (el) => el.lang), "nb")
	assert.equal(await page.$eval("#main h1", (el) => el.textContent), nb["welcome.title"])
	assert.equal(await page.$eval("#main h1 + p", (el) => el.textContent), nb["welcome.intro"])
	assert.equal(await focused(page), "lang:summary.btn")
})

test("keyboard walk: Tab to trigger, Enter opens on the active row, arrows wrap, Escape returns focus, Tab out closes", async () => {
	const { page } = await open({ stored: { lang: "nb" } })
	const walk = []
	const step = async (label) =>
		walk.push(`${label} -> focus ${await focused(page)}, lang open ${await isOpen(page, "lang")}`)
	// The toggle event is a queued task: wait until it has focused a row
	// before sending the next key, as a person's next keystroke would.
	const openWithEnter = async () => {
		await page.keyboard.press("Enter")
		await page.waitForFunction(() => document.activeElement?.classList.contains("picker-row"))
	}

	await page.keyboard.press("Tab") // the skip link
	await page.keyboard.press("Tab")
	await step("Tab, Tab")
	assert.equal(await focused(page), "lang:summary.btn")

	await openWithEnter()
	await step("Enter")
	assert.equal(await isOpen(page, "lang"), true)
	assert.equal(
		await page.evaluate(() => document.activeElement.getAttribute("aria-current")),
		"true"
	)
	assert.equal(await page.evaluate(() => document.activeElement.dataset.lang), "nb")

	await page.keyboard.press("ArrowDown") // nb is the last row: wraps to System
	await step("ArrowDown")
	assert.equal(await page.evaluate(() => document.activeElement.dataset.lang), "")
	await page.keyboard.press("ArrowUp") // wraps back to the last row
	await step("ArrowUp")
	assert.equal(await page.evaluate(() => document.activeElement.dataset.lang), "nb")

	await page.keyboard.press("Escape")
	await step("Escape")
	assert.equal(await isOpen(page, "lang"), false)
	assert.equal(await focused(page), "lang:summary.btn")

	await openWithEnter()
	await page.keyboard.press("Tab") // Tab leaves the last row: focus moves on, the picker closes
	await step("Enter, Tab")
	assert.equal(await isOpen(page, "lang"), false)
	assert.equal(await focused(page), "theme:summary.btn")

	await openWithEnter()
	await page.keyboard.press("ArrowDown")
	await page.keyboard.press("Enter") // chooses Light from the keyboard
	await step("Enter, ArrowDown, Enter")
	assert.equal(await stored(page, "theme"), "light")
	assert.equal(await focused(page), "theme:summary.btn")
	console.log(`keyboard walk:\n  ${walk.join("\n  ")}`)
})

test("at 320px the header has no horizontal scroll, triggers are 44px on one bottom edge and open lists stay in view", async () => {
	const { page } = await open({ viewport: { width: 320, height: 640 } })
	const metrics = await page.evaluate(() => {
		const box = (el) => {
			const r = el.getBoundingClientRect()
			return {
				left: r.left,
				right: r.right,
				top: r.top,
				bottom: r.bottom,
				width: r.width,
				height: r.height,
			}
		}
		return {
			scrollWidth: document.documentElement.scrollWidth,
			header: box(document.getElementById("header")),
			triggers: [...document.querySelectorAll("details[data-picker] > summary")].map(box),
		}
	})
	assert.ok(metrics.scrollWidth <= 320, `scrollWidth ${metrics.scrollWidth}`)
	assert.equal(metrics.triggers.length, 2)
	for (const t of metrics.triggers) {
		assert.ok(t.width >= 44 && t.height >= 44, `trigger ${t.width}x${t.height}`)
		assert.equal(t.bottom, metrics.triggers[0].bottom)
	}
	const lists = {}
	for (const name of ["lang", "theme"]) {
		await page.click(TRIGGER(name))
		await page.waitForSelector(`details[data-picker="${name}"] .picker-list`, { visible: true })
		lists[name] = await page.evaluate((n) => {
			const list = document.querySelector(`details[data-picker="${n}"] .picker-list`)
			const r = list.getBoundingClientRect()
			const rows = [...list.querySelectorAll(".picker-row")].map(
				(row) => row.getBoundingClientRect().height
			)
			return { left: r.left, right: r.right, minRow: Math.min(...rows) }
		}, name)
		assert.ok(
			lists[name].left >= 0 && lists[name].right <= 320,
			`${name} list ${JSON.stringify(lists[name])}`
		)
		assert.ok(lists[name].minRow >= 44, `${name} shortest row ${lists[name].minRow}`)
		await page.keyboard.press("Escape")
	}
	console.log(
		`320px: scrollWidth ${metrics.scrollWidth}, header ${JSON.stringify(metrics.header)}, triggers ${JSON.stringify(metrics.triggers)}, lists ${JSON.stringify(lists)}`
	)
})
