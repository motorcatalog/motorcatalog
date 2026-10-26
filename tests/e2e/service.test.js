/* ======================================================================
   tests/e2e/service.test.js: a car's pages in a real browser
   Car details (#21), service history (#23) and registering a service
   (#22), with the browser's own Back button and a reload. Same harness
   as cars.test.js, on its own port.
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
	server = await createServer({ root: ROOT, logLevel: "silent", server: { port: 4320 } })
	await server.listen()
	origin = server.resolvedUrls.local[0]
	browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] })
})

after(async () => {
	await browser?.close()
	await server?.close()
})

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
	euInspectionDue: "2027-03-01",
}

// A fresh page in English on the garage, with two cars and no history.
async function openGarage() {
	const context = await browser.createBrowserContext()
	const page = await context.newPage()
	// Reduced motion makes the design system scroll instantly. On Linux the
	// smooth scroll to the focused heading after a page change can still be
	// running when Puppeteer clicks, so the click lands on another row.
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
	await page.evaluateOnNewDocument((car) => {
		localStorage.setItem("lang", "en")
		if (localStorage.getItem("motorcatalog")) return // keep what a test saved
		localStorage.setItem(
			"motorcatalog",
			JSON.stringify({
				version: 1,
				activeProfileId: "p0",
				profiles: [{ id: "p0", name: "Malin" }],
				cars: [
					{ ...car, id: "c0" },
					{ ...car, id: "c1", make: "Toyota", model: "Corolla" },
				],
				serviceEntries: [],
				tasks: [],
			})
		)
	}, CAR)
	await page.goto(origin, { waitUntil: "networkidle0" })
	await page.waitForSelector("#main h1")
	await page.bringToFront()
	return page
}

const h1 = (page) => page.$eval("#main h1", (el) => el.textContent.trim())
const waitForH1 = (page, title) =>
	page.waitForFunction(
		(t) => document.querySelector("#main h1")?.textContent.trim() === t,
		{},
		title
	)
const focusedId = (page) =>
	page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName.toLowerCase())
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("motorcatalog")))

async function openCar(page, id, title) {
	await page.click(`[data-action='open-car'][data-id='${id}']`)
	await waitForH1(page, title)
}

async function openHistory(page) {
	await page.click("[data-action='open-history']")
	await waitForH1(page, en["history.title"])
}

test("a car opens from its card, and Back to garage and the browser's Back both return", async () => {
	const page = await openGarage()
	await openCar(page, "c0", "Volvo V70")
	assert.equal(await focusedId(page), "car-detail-title")
	assert.equal(new URL(page.url()).hash, "#car-c0")
	await page.click("[data-action='back-garage']")
	await waitForH1(page, en["garage.title"])
	await openCar(page, "c0", "Volvo V70")
	await page.goBack()
	await waitForH1(page, en["garage.title"])
	await page.goForward()
	await waitForH1(page, "Volvo V70")
	await page.browserContext().close()
})

test("a reload keeps the open page, and Back to garage then opens the garage", async () => {
	const page = await openGarage()
	await openCar(page, "c0", "Volvo V70")
	await page.reload({ waitUntil: "networkidle0" })
	assert.equal(await h1(page), "Volvo V70")
	await page.click("[data-action='back-garage']")
	await waitForH1(page, en["garage.title"])
	await openCar(page, "c1", "Toyota Corolla")
	await page.click("[data-action='back-garage']")
	await waitForH1(page, en["garage.title"]) // not the car opened before the reload
	await page.browserContext().close()
})

test("a service is registered from the history, listed there and raises the odometer", async () => {
	const page = await openGarage()
	await openCar(page, "c0", "Volvo V70")
	await openHistory(page)
	assert.equal(
		await page.$eval("#main .history-empty", (el) => el.textContent),
		en["history.empty"]
	)
	await page.click("[data-action='register-service']")
	await waitForH1(page, en["service.formTitle"])
	assert.equal(await focusedId(page), "h1")
	await page.select("#service-category", "repair")
	await page.type("#service-title", "Brake pads")
	await page.$eval("#service-date", (el) => {
		el.value = "2026-03-14"
		el.dispatchEvent(new Event("input", { bubbles: true }))
	})
	await page.type("#service-mileage", "190000")
	await page.type("#service-cost", "2450")
	await page.type("#service-notes", "Front axle")
	await page.click("form button[type='submit']")
	await waitForH1(page, en["history.title"])
	assert.equal(await focusedId(page), "h1")

	const data = await saved(page)
	assert.equal(data.serviceEntries.length, 1)
	const [entry] = data.serviceEntries
	assert.equal(entry.category, "repair")
	assert.equal(entry.workshop, null)
	assert.equal(data.cars[0].mileage, 190000)
	const row = (selector) =>
		page.$eval(`.history-list li ${selector}`, (el) => el.textContent.trim())
	assert.equal(await row("h2"), "Brake pads")
	assert.equal(await row("time"), "Mar 14, 2026")
	assert.equal(await row(".history-entry-notes"), "Front axle")

	await page.click("[data-action='back-car']")
	await waitForH1(page, "Volvo V70")
	const odometer = await page.$eval(".car-stat-card .stat-value", (el) => el.textContent)
	assert.equal(odometer, "190,000")
	await page.browserContext().close()
})

test("an empty service form shows each error and focuses the first; Cancel saves nothing", async () => {
	const page = await openGarage()
	await openCar(page, "c0", "Volvo V70")
	await openHistory(page)
	await page.click("[data-action='register-service']")
	await waitForH1(page, en["service.formTitle"])
	await page.click("form button[type='submit']")
	await page.waitForSelector("#service-title-error")
	assert.equal(await focusedId(page), "service-title")
	for (const field of ["date", "mileage", "cost"]) {
		assert.ok(await page.$(`#service-${field}-error`), `${field} has no error`)
	}
	await page.type("#service-title", "Not saved")
	await page.click("form [data-action='cancel-service-entry']")
	await waitForH1(page, en["history.title"])
	assert.deepEqual((await saved(page)).serviceEntries, [])
	await page.browserContext().close()
})

test("Register service fits a tablet screen with each label beside its field, and a phone keeps labels on top", async () => {
	const page = await openGarage()
	await page.setViewport({ width: 721, height: 1015 })
	await openCar(page, "c0", "Volvo V70")
	await openHistory(page)
	await page.click("[data-action='register-service']")
	await waitForH1(page, en["service.formTitle"])
	// A textarea's label lines up with its first line, the rest with the
	// middle of their control: both are 22 px down from the control's top.
	const layout = () =>
		page.evaluate(() => ({
			fits: document.documentElement.scrollHeight <= innerHeight,
			rows: [...document.querySelectorAll(".split-form .field")].map((field) => {
				const label = field.querySelector("label")
				const control = field.querySelector("input, select, textarea").getBoundingClientRect()
				const text = label.getBoundingClientRect()
				const padding = Number.parseFloat(getComputedStyle(label).paddingTop)
				const lineMiddle = text.top + padding + (text.height - padding) / 2
				return {
					beside: text.right <= control.left,
					offset: Math.abs(lineMiddle - (control.top + 22)),
				}
			}),
		}))
	const tablet = await layout()
	assert.ok(tablet.fits, "the whole form fits without scrolling")
	assert.equal(tablet.rows.length, 7)
	for (const row of tablet.rows) {
		assert.ok(row.beside && row.offset < 1, "the label sits beside its field, on its first line")
	}

	await page.setViewport({ width: 375, height: 812 })
	const phone = await layout()
	assert.ok(phone.rows.every((row) => !row.beside))
	await page.browserContext().close()
})
