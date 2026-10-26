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
// `lists` seeds cars, service entries and tasks; empty by default.
async function openGarage(lists = {}) {
	const context = await browser.createBrowserContext()
	const page = await context.newPage()
	await page.evaluateOnNewDocument((seed) => {
		localStorage.setItem("lang", "en")
		if (localStorage.getItem("motorcatalog")) return // keep what a test saved
		const data = { version: 1, activeProfileId: "p0", profiles: [{ id: "p0", name: "Malin" }] }
		localStorage.setItem(
			"motorcatalog",
			JSON.stringify({ ...data, cars: [], serviceEntries: [], tasks: [], ...seed })
		)
	}, lists)
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
	assert.equal(await page.$eval("#main .garage-empty", (el) => el.textContent), en["garage.empty"])
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
	assert.equal(await page.$("#main .garage-empty"), null) // no longer empty
	const card = (selector) =>
		page.$eval(`#main .car-card ${selector}`, (el) => el.textContent.trim())
	assert.equal(await card("h2 a"), "Volvo V70")
	assert.equal(await card("dl > div:last-child dd"), "184,000 km")

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

/* ----------------------------------------------------------------------
   Edit and delete a car (#25). Two saved cars, each with one service
   entry and one task, so a delete can be seen to take only its own.
   ---------------------------------------------------------------------- */

const CAR = {
	profileId: "p0",
	nickname: null,
	make: "Volvo",
	model: "V70",
	year: 2008,
	regCountry: "NO",
	regNumber: "AB12345",
	vin: null,
	fuel: "diesel",
	engine: null,
	mileage: 184000,
	euInspectionDue: null,
}
const entry = (id, carId) => ({
	id,
	carId,
	category: "service",
	title: "Oil change",
	date: "2026-01-10",
	mileage: 180000,
	cost: 1450,
	workshop: null,
	notes: null,
})
const RECORDS = {
	cars: [
		{ ...CAR, id: "c0" },
		{ ...CAR, id: "c1", make: "Toyota", model: "Corolla" },
	],
	serviceEntries: [entry("e0", "c0"), entry("e1", "c1")],
	tasks: [
		{ id: "t0", carId: "c0", title: "Change tyres" },
		{ id: "t1", carId: "c1", title: "Wash" },
	],
}

const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("motorcatalog")))
const ids = (list) => list.map((item) => item.id)
const dialogOpen = (page) => page.$eval("#delete-car-dialog", (el) => el.open)
const focusedText = (page) => page.evaluate(() => document.activeElement?.textContent.trim())
const h1Text = (page) => page.$eval("#main h1", (el) => el.textContent.trim())

async function openVolvo() {
	const page = await openGarage(RECORDS)
	await page.click("[data-action='open-car'][data-id='c0']")
	await waitForH1(page, "Volvo V70")
	return page
}

async function openEdit(page) {
	await page.click("[data-action='edit-car']")
	await waitForH1(page, en["carForm.editTitle"])
}

test("Edit opens the filled form, and Save updates the car and returns to its page", async () => {
	const page = await openVolvo()
	await openEdit(page)
	assert.equal(await focusedId(page), "h1")
	assert.equal(new URL(page.url()).hash, "#edit-car-c0")
	const value = (id) => page.$eval(id, (el) => el.value)
	assert.equal(await value("#car-make"), "Volvo")
	assert.equal(await value("#car-regCountry"), "Norway")
	assert.equal(await value("#car-regNumber"), "AB12345")
	assert.equal(await value("#car-fuel"), "diesel")
	assert.equal(await value("#car-mileage"), "184000")

	await page.click("#car-mileage", { count: 3 })
	await page.keyboard.type("150000") // lower than before, which only an edit allows
	await page.click("form button[type='submit']")
	await waitForH1(page, "Volvo V70")
	assert.equal(await focusedId(page), "car-detail-title")
	assert.equal(new URL(page.url()).hash, "#car-c0")
	assert.equal((await saved(page)).cars[0].mileage, 150000)
	const odometer = await page.$eval("#main .car-stat-card", (el) => el.textContent)
	assert.match(odometer, /150,000/)
	await page.browserContext().close()
})

test("Cancel on the edit form returns to the car page and saves nothing", async () => {
	const page = await openVolvo()
	await openEdit(page)
	await page.click("#car-make", { count: 3 })
	await page.keyboard.type("Saab")
	await page.click("[data-action='cancel-car']")
	await waitForH1(page, "Volvo V70")
	assert.equal((await saved(page)).cars[0].make, "Volvo")
	await openEdit(page)
	assert.equal(await page.$eval("#car-make", (el) => el.value), "Volvo") // filled afresh
	await page.browserContext().close()
})

test("Delete asks in a dialog that names the car and starts on Cancel; Escape and Cancel change nothing", async () => {
	const page = await openVolvo()
	const before = await saved(page)
	await page.click("[data-action='delete-car']")
	assert.equal(await dialogOpen(page), true)
	assert.equal(await page.$eval("#delete-car-title", (el) => el.textContent), "Delete Volvo V70?")
	assert.equal(await focusedText(page), en["car.cancel"])

	await page.keyboard.press("Escape")
	assert.equal(await dialogOpen(page), false)
	assert.deepEqual(await saved(page), before)

	await page.click("[data-action='delete-car']")
	await page.click("#delete-car-dialog form[method='dialog'] button")
	assert.equal(await dialogOpen(page), false)
	assert.equal(await focusedText(page), en["car.delete"]) // back on the Delete button
	assert.deepEqual(await saved(page), before)
	assert.equal(await h1Text(page), "Volvo V70")
	await page.browserContext().close()
})

test("Confirm deletes the car with its records and returns to the garage, and nothing leads back", async () => {
	const page = await openVolvo()
	await page.click("[data-action='delete-car']")
	await page.click("[data-action='confirm-delete-car']")
	await waitForH1(page, en["garage.title"])
	assert.equal(await focusedId(page), "h1")
	const data = await saved(page)
	assert.deepEqual(ids(data.cars), ["c1"])
	assert.deepEqual(ids(data.serviceEntries), ["e1"])
	assert.deepEqual(ids(data.tasks), ["t1"])
	assert.equal((await page.$$("#main .car-card")).length, 1)

	await page.goForward() // onto the deleted car's old entry
	assert.equal(await h1Text(page), en["garage.title"])
	await page.reload({ waitUntil: "networkidle0" })
	await waitForH1(page, en["garage.title"])
	assert.equal(new URL(page.url()).hash, "")
	await page.browserContext().close()
})

/* ----------------------------------------------------------------------
   Mark the EU-kontroll done (#43). The Volvo's date is a month ahead of
   today, so it starts due soon whatever day the tests run.
   ---------------------------------------------------------------------- */

function monthsAhead(months) {
	const date = new Date()
	date.setDate(15) // a day every month has
	date.setMonth(date.getMonth() + months)
	const pad = (n) => String(n).padStart(2, "0")
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-15`
}

const EU_DUE = monthsAhead(1)
const EU_NEXT = monthsAhead(25)

async function openVolvoWithEu() {
	const cars = RECORDS.cars.map((car) =>
		car.id === "c0" ? { ...car, euInspectionDue: EU_DUE } : car
	)
	const page = await openGarage({ ...RECORDS, cars })
	await page.click("[data-action='open-car'][data-id='c0']")
	await waitForH1(page, "Volvo V70")
	return page
}

const euDialogOpen = (page) => page.$eval("#eu-done-dialog", (el) => el.open)
const euStatus = (page) => page.$eval("#main .eu-status", (el) => el.dataset.status)
const setNextDue = (page, value) =>
	page.$eval(
		"#eu-done-nextDue",
		(el, v) => {
			el.value = v
			el.dispatchEvent(new Event("input", { bubbles: true }))
		},
		value
	)

test("Mark done suggests the old date plus two years, and Save stores it and updates the status", async () => {
	const page = await openVolvoWithEu()
	assert.equal(await euStatus(page), "dueSoon")
	await page.click("#mark-eu-done")
	assert.equal(await euDialogOpen(page), true)
	assert.equal(await focusedId(page), "eu-done-nextDue")
	assert.equal(await page.$eval("#eu-done-nextDue", (el) => el.value), EU_NEXT)

	await page.click("#eu-done-dialog button[type='submit'][form='eu-done-form']")
	await page.waitForFunction(() => !document.querySelector("#eu-done-dialog")?.open)
	assert.equal(await focusedId(page), "mark-eu-done")
	assert.equal((await saved(page)).cars[0].euInspectionDue, EU_NEXT)
	assert.equal(await euStatus(page), "ok")

	await page.reload({ waitUntil: "networkidle0" })
	await waitForH1(page, "Volvo V70")
	assert.equal(await euStatus(page), "ok")
	await page.browserContext().close()
})

test("Mark done saves a date the user changed, and Enter in the field saves too", async () => {
	const page = await openVolvoWithEu()
	await page.click("#mark-eu-done")
	await setNextDue(page, "2028-06-01")
	await page.focus("#eu-done-nextDue")
	await page.keyboard.press("Enter")
	await page.waitForFunction(() => !document.querySelector("#eu-done-dialog")?.open)
	assert.equal((await saved(page)).cars[0].euInspectionDue, "2028-06-01")
	await page.browserContext().close()
})

test("An empty date shows an error in the open dialog; Escape and Cancel change nothing", async () => {
	const page = await openVolvoWithEu()
	const before = await saved(page)
	await page.click("#mark-eu-done")
	await setNextDue(page, "")
	await page.click("#eu-done-dialog button[type='submit'][form='eu-done-form']")
	await page.waitForSelector("#eu-done-nextDue-error")
	assert.equal(
		await page.$eval("#eu-done-nextDue-error", (el) => el.textContent),
		en["car.error.euDoneRequired"]
	)
	assert.equal(await euDialogOpen(page), true)
	assert.equal(await focusedId(page), "eu-done-nextDue")
	assert.deepEqual(await saved(page), before)

	await page.keyboard.press("Escape")
	assert.equal(await euDialogOpen(page), false)
	assert.equal(await focusedId(page), "mark-eu-done")

	await page.click("#mark-eu-done")
	assert.equal(await page.$("#eu-done-nextDue-error"), null) // opens afresh
	await page.click("#eu-done-dialog form[method='dialog'] button")
	assert.equal(await euDialogOpen(page), false)
	assert.deepEqual(await saved(page), before)
	await page.browserContext().close()
})

test("A car with no EU-kontroll date has no Mark done button", async () => {
	const page = await openVolvo()
	assert.equal(await page.$("#mark-eu-done"), null)
	assert.equal(await page.$("#eu-done-dialog"), null)
	await page.browserContext().close()
})

/* ----------------------------------------------------------------------
   EU-kontroll reminders on the garage (#42). EU_DUE is under three
   months off, so the Volvo always has a reminder due.
   ---------------------------------------------------------------------- */

async function garageWithEu(fields = {}) {
	const cars = RECORDS.cars.map((car) =>
		car.id === "c0" ? { ...car, euInspectionDue: EU_DUE, ...fields } : car
	)
	return openGarage({ ...RECORDS, cars })
}

const reminderTexts = (page) =>
	page.$$eval("#main .eu-reminder p", (ps) =>
		ps.map((p) => p.textContent.replace(/\s+/g, " ").trim())
	)

test("The garage lists the due reminder, and Dismiss hides it, also after a reload", async () => {
	const page = await garageWithEu()
	const [text] = await reminderTexts(page)
	assert.match(text, /^Volvo V70 EU inspection /)
	assert.equal((await reminderTexts(page)).length, 1) // the Toyota has no date

	await page.click("#dismiss-eu-c0")
	assert.equal(await page.$("#main .eu-reminders"), null)
	assert.equal(await focusedId(page), "h1")
	assert.match((await saved(page)).cars[0].euReminderDismissed, /^\d{4}-\d{2}-\d{2}$/)
	await page.reload({ waitUntil: "networkidle0" })
	await waitForH1(page, en["garage.title"])
	assert.equal(await page.$("#main .eu-reminders"), null)
	await page.browserContext().close()
})

test("A reminder's car name opens the car, and Mark done clears a dismissed reminder", async () => {
	const page = await garageWithEu({ euReminderDismissed: "2999-01-01" }) // hidden for now
	assert.equal(await page.$("#main .eu-reminders"), null)
	await page.click("[data-action='open-car'][data-id='c0']")
	await waitForH1(page, "Volvo V70")
	await page.click("#mark-eu-done")
	await setNextDue(page, EU_DUE) // the same date, so only the clearing differs
	await page.click("#eu-done-dialog button[type='submit'][form='eu-done-form']")
	await page.waitForFunction(() => !document.querySelector("#eu-done-dialog")?.open)
	assert.equal((await saved(page)).cars[0].euReminderDismissed, null)

	await page.click("[data-action='back-garage']")
	await waitForH1(page, en["garage.title"])
	assert.equal((await reminderTexts(page)).length, 1)
	await page.click("#main .eu-reminder a")
	await waitForH1(page, "Volvo V70")
	await page.browserContext().close()
})
