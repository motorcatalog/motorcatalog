/* ======================================================================
   tests/e2e/profiles.test.js: profiles in a real browser (#7)
   Create a profile, reload, switch, export (#26). Same harness as preferences.test.js:
   Vite in-process, Puppeteer drives Chrome, a fresh browser context per
   test. Its own port, because node --test runs test files in parallel.
   ====================================================================== */

import assert from "node:assert/strict"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
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
// `downloadPath` is where the browser saves downloads without asking.
async function open({ downloadPath } = {}) {
	const context = await browser.createBrowserContext(
		downloadPath ? { downloadBehavior: { policy: "allow", downloadPath } } : {}
	)
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

// The first finished JSON download in `dir`. Chrome writes to a
// .crdownload file first, but on Windows the final name can show up
// before its content is written, so a file only counts once it parses.
async function nextDownload(dir, timeout = 5000) {
	const end = Date.now() + timeout
	while (Date.now() < end) {
		const done = (await readdir(dir)).filter((f) => !f.endsWith(".crdownload"))
		for (const name of done) {
			const text = await readFile(join(dir, name), "utf8")
			try {
				JSON.parse(text)
				return { name, text }
			} catch {} // still being written
		}
		await new Promise((r) => setTimeout(r, 50))
	}
	throw new Error(`no complete download in ${dir} after ${timeout} ms`)
}

test("Export downloads a dated JSON file with the version, empty at first and then with every profile", async () => {
	const dir = await mkdtemp(join(tmpdir(), "motorcatalog-export-"))
	try {
		const page = await open({ downloadPath: dir })
		// The local date in the browser, the one the file is named by.
		const today = await page.evaluate(() => {
			const d = new Date()
			const pad = (n) => String(n).padStart(2, "0")
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
		})
		await page.click("[data-action='export-data']")
		const empty = await nextDownload(dir)
		assert.equal(empty.name, `motorcatalog-${today}.json`)
		assert.deepEqual(JSON.parse(empty.text), {
			version: 1,
			activeProfileId: null,
			profiles: [],
			cars: [],
			serviceEntries: [],
			tasks: [],
		})
		assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), "export-data")
		await rm(join(dir, empty.name)) // the next file gets the same name

		await create(page, "Malin")
		await page.waitForSelector("[data-action='switch-profile']")
		await page.click("[data-action='switch-profile']")
		await create(page, "Rune")
		await page.waitForSelector("[data-action='switch-profile']")
		await page.click("[data-action='switch-profile']")
		await page.waitForSelector("[data-action='export-data']")
		await page.click("[data-action='export-data']")
		const filled = await nextDownload(dir)
		assert.equal(filled.name, `motorcatalog-${today}.json`)
		const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("motorcatalog")))
		assert.deepEqual(JSON.parse(filled.text), saved)
		assert.deepEqual(
			saved.profiles.map((p) => p.name),
			["Malin", "Rune"]
		)
		await page.browserContext().close()
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})
