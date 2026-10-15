/* ======================================================================
   tests/e2e/profiles.test.js: profiles in a real browser (#7)
   Create a profile, reload, switch. Same harness as preferences.test.js:
   Vite in-process, Puppeteer drives Chrome, a fresh browser context per
   test. Its own port, because node --test runs test files in parallel.
   ====================================================================== */

import assert from "node:assert/strict"
import { resolve } from "node:path"
import { after, before, test } from "node:test"
import puppeteer from "puppeteer"
import { createServer } from "vite"
import en from "../../src/locales/en.json" with { type: "json" }

const ROOT = resolve(import.meta.dirname, "../..")

let server
let browser
let origin

before(async () => {
	server = await createServer({ root: ROOT, logLevel: "silent", server: { port: 4318 } })
	await server.listen()
	origin = server.resolvedUrls.local[0]
	browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] })
})

after(async () => {
	await browser?.close()
	await server?.close()
})

// A fresh page in English, so the asserted text is the en bundle's.
async function open() {
	const context = await browser.createBrowserContext()
	const page = await context.newPage()
	await page.evaluateOnNewDocument(() => localStorage.setItem("lang", "en"))
	await page.goto(origin, { waitUntil: "networkidle0" })
	await page.waitForSelector("#main h1")
	await page.bringToFront()
	return page
}

const h1 = (page) => page.$eval("#main h1", (el) => el.textContent.trim())
const focusedId = (page) =>
	page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName.toLowerCase())

async function create(page, name) {
	await page.click("#profile-name", { count: 3 })
	await page.keyboard.press("Backspace")
	if (name) await page.type("#profile-name", name)
	await page.keyboard.press("Enter")
}

test("a profile created on the welcome page is still selected after a reload", async () => {
	const page = await open()
	assert.equal(await h1(page), en["welcome.title"])
	await create(page, "Malin")
	await page.waitForFunction(
		(title) => document.querySelector("#main h1")?.textContent === title,
		{},
		en["garage.title"]
	)
	assert.equal(await focusedId(page), "h1")
	assert.equal(await page.$eval(".header-profile-name", (el) => el.textContent), "Malin")
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("motorcatalog")))
	assert.equal(saved.profiles[0].name, "Malin")
	assert.equal(saved.activeProfileId, saved.profiles[0].id)

	await page.reload({ waitUntil: "networkidle0" })
	assert.equal(await h1(page), en["garage.title"])
	assert.equal(await page.$eval(".header-profile-name", (el) => el.textContent), "Malin")
	await page.browserContext().close()
})

test("an empty name shows the error as text and keeps focus on the field", async () => {
	const page = await open()
	await create(page, "   ")
	await page.waitForSelector("#profile-name-error")
	assert.equal(
		await page.$eval("#profile-name-error", (el) => el.textContent),
		en["profile.error.required"]
	)
	assert.equal(await focusedId(page), "profile-name")
	assert.equal(await page.$eval("#profile-name", (el) => el.getAttribute("aria-invalid")), "true")
	assert.equal(await page.evaluate(() => localStorage.getItem("motorcatalog")), null)
	await page.browserContext().close()
})

test("Switch profile opens the picker, and a second profile can be added and chosen", async () => {
	const page = await open()
	await create(page, "Malin")
	await page.waitForSelector("[data-action='switch-profile']")
	await page.click("[data-action='switch-profile']")
	await page.waitForFunction(
		(title) => document.querySelector("#main h1")?.textContent === title,
		{},
		en["profiles.title"]
	)
	assert.equal(await focusedId(page), "h1")
	assert.equal(await page.$(".header-profile"), null)

	await create(page, "Rune")
	await page.waitForSelector(".header-profile-name")
	assert.equal(await page.$eval(".header-profile-name", (el) => el.textContent), "Rune")

	await page.click("[data-action='switch-profile']")
	await page.waitForSelector("[data-action='choose-profile']")
	const names = await page.$$eval("[data-action='choose-profile']", (els) =>
		els.map((el) => el.textContent)
	)
	assert.deepEqual(names, ["Malin", "Rune"])
	await page.click("[data-action='choose-profile']") // Malin
	await page.waitForSelector(".header-profile-name")
	assert.equal(await page.$eval(".header-profile-name", (el) => el.textContent), "Malin")

	await page.reload({ waitUntil: "networkidle0" })
	assert.equal(await page.$eval(".header-profile-name", (el) => el.textContent), "Malin")
	await page.browserContext().close()
})
