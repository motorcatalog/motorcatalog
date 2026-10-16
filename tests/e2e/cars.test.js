/* ======================================================================
   tests/e2e/cars.test.js: adding a car in a real browser (#8)
   Same harness as profiles.test.js: Vite in-process, Puppeteer drives
   Chrome, a fresh browser context per test. Its own port, because
   node --test runs test files in parallel.
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
	server = await createServer({ root: ROOT, logLevel: "silent", server: { port: 4319 } })
	await server.listen()
	origin = server.resolvedUrls.local[0]
	browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] })
})

after(async () => {
	await browser?.close()
	await server?.close()
})

// A fresh page in English with one profile, so it opens on the garage.
async function openGarage() {
	const context = await browser.createBrowserContext()
	const page = await context.newPage()
	await page.evaluateOnNewDocument(() => {
		localStorage.setItem("lang", "en")
		if (localStorage.getItem("motorcatalog")) return // keep what a test saved
		const data = { version: 1, activeProfileId: "p0", profiles: [{ id: "p0", name: "Malin" }] }
		localStorage.setItem(
			"motorcatalog",
			JSON.stringify({ ...data, cars: [], serviceEntries: [], tasks: [] })
		)
	})
	await page.goto(origin, { waitUntil: "networkidle0" })
	await page.waitForSelector("#main h1")
	await page.bringToFront()
	return page
}

const waitForH1 = (page, title) =>
	page.waitForFunction((t) => document.querySelector("#main h1")?.textContent === t, {}, title)
const focusedId = (page) =>
	page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName.toLowerCase())
const savedCars = (page) =>
	page.evaluate(() => JSON.parse(localStorage.getItem("motorcatalog")).cars)

async function openForm(page) {
	await page.click("[data-action='add-car']")
	await waitForH1(page, en["carForm.title"])
}

test("a car added from the garage is saved to the profile and kept after a reload", async () => {
	const page = await openGarage()
	assert.equal(await page.$eval("#main h1 + p", (el) => el.textContent), en["garage.empty"])
	await openForm(page)
	assert.equal(await focusedId(page), "h1")
	await page.type("#car-make", "Volvo")
	await page.type("#car-model", "V70")
	await page.type("#car-year", "2008")
	await page.type("#car-regNumber", "ab 12345")
	await page.select("#car-fuel", "diesel")
	await page.type("#car-mileage", "184000")
	await page.click("form button[type='submit']")
	await waitForH1(page, en["garage.title"])
	assert.equal(await focusedId(page), "h1")

	const [car] = await savedCars(page)
	assert.equal(car.profileId, "p0")
	assert.equal(car.regNumber, "AB12345")
	assert.equal(car.fuel, "diesel")
	assert.equal(car.mileage, 184000)
	assert.equal(car.vin, null)
	assert.equal(await page.$("#main h1 + p"), null) // no longer empty

	await page.reload({ waitUntil: "networkidle0" })
	assert.equal((await savedCars(page)).length, 1)
	await page.browserContext().close()
})

test("an empty form shows each error as text and focuses the first field with one", async () => {
	const page = await openGarage()
	await openForm(page)
	await page.click("form button[type='submit']")
	await page.waitForSelector("#car-make-error")
	assert.equal(await page.$eval("#car-make-error", (el) => el.textContent), en["car.error.make"])
	assert.equal(await page.$eval("#car-make", (el) => el.getAttribute("aria-invalid")), "true")
	assert.equal(await focusedId(page), "car-make")
	for (const field of ["model", "year", "regNumber", "mileage"]) {
		assert.ok(await page.$(`#car-${field}-error`), `${field} has no error`)
	}
	assert.deepEqual(await savedCars(page), [])
	await page.browserContext().close()
})

test("Cancel returns to the garage and saves nothing", async () => {
	const page = await openGarage()
	await openForm(page)
	await page.type("#car-make", "Saab")
	await page.click("[data-action='cancel-car']")
	await waitForH1(page, en["garage.title"])
	assert.deepEqual(await savedCars(page), [])
	await openForm(page)
	assert.equal(await page.$eval("#car-make", (el) => el.value), "") // starts afresh
	await page.browserContext().close()
})

test("fields fix what is typed in place and keep the caret", async () => {
	const page = await openGarage()
	await openForm(page)
	const value = (id) => page.$eval(id, (el) => el.value)
	await page.type("#car-nickname", "helgebilen")
	await page.type("#car-make", "mercedes-benz")
	await page.type("#car-regNumber", "ab 12345")
	await page.type("#car-year", "20e1.5")
	await page.type("#car-mileage", "1 000 000 000")
	assert.equal(await value("#car-nickname"), "Helgebilen")
	assert.equal(await value("#car-make"), "mercedes-benz")
	assert.equal(await value("#car-regNumber"), "AB 12345")
	assert.equal(await value("#car-year"), "2015")
	assert.equal(await value("#car-mileage"), "10000000")

	// A rejected key in the middle of the year leaves the caret where it was.
	await page.focus("#car-year")
	await page.keyboard.press("Home")
	await page.keyboard.press("ArrowRight")
	await page.keyboard.type("x")
	assert.equal(await value("#car-year"), "2015")
	assert.equal(await page.$eval("#car-year", (el) => el.selectionStart), 1)

	// A new make and country change the model suggestions and plate example.
	const placeholder = () => page.$eval("#car-regNumber", (el) => el.placeholder)
	const norway = await placeholder()
	await page.click("#car-regCountry", { count: 3 })
	await page.keyboard.type("Sweden")
	assert.notEqual(await placeholder(), norway)
	assert.match(await placeholder(), /^e\.g\. /)
	await page.click("#car-make", { count: 3 })
	await page.keyboard.type("Mercedes-Benz")
	const models = await page.$$eval("#car-models option", (os) => os.map((o) => o.value))
	assert.ok(models.includes("C63 AMG"))
	await page.browserContext().close()
})
