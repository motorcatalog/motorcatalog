/* ======================================================================
   src/view/view.js: VIEW
   Renders HTML from the model and forwards user actions to the controller.
   It only reads the model. No timers.
   Interactive elements carry data-action (click), data-submit (form) or
   data-input (typing), e.g. <button data-action="add">; bindActions
   routes them by name.
   Every user-facing string goes through t(), never a literal.
   Every string goes through esc() before it lands in innerHTML, Intl
   output included. Never concatenate raw.

   Both render functions take (model, derived). `derived` holds what the
   controller worked out from the model, such as the lang, theme and
   currency in use and the active profile. Two roots: the header
   (wordmark, the preference pickers and the active profile) is drawn by
   renderHeader() and only when one of those changes; the page in
   model.app.page is render().
   ====================================================================== */

import { icon } from "../../design-system/components/icons.js"
import { MAKES } from "../data/models.js"

const THEME_OPTIONS = ["light", "dark"]

// The wordmark is a name, not text to translate: Motor in the text colour,
// Catalog in brass (docs/brand/README.md).
const WORDMARK = ["Motor", "Catalog"]

// Text to HTML-safe text. Used for every string that goes into innerHTML.
export function escapeHtml(text) {
	return String(text).replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
	)
}

// The flag files ship with the design-system bundle. new URL() with
// import.meta.url lets Vite copy them into the production build.
function flagUrl(cc) {
	return new URL(`../../design-system/assets/flags/${cc}.svg`, import.meta.url).href
}

export function createView({ header, main }, i18n, config) {
	const esc = escapeHtml

	// Autonym with an upper-cased first letter; the code when the browser
	// has no Intl.DisplayNames.
	function langName(code) {
		return typeof Intl.DisplayNames === "function" ? i18n.displayName(code) : code
	}

	function currencyName(code, lang) {
		if (typeof Intl.DisplayNames !== "function") return code
		return new Intl.DisplayNames([lang], { type: "currency" }).of(code) || code
	}

	// One function per page, picked by model.app.page. Every page opens with
	// an h1 that takes focus (tabindex="-1") when the controller moves to it.
	const PAGES = {
		profiles: profilesPage,
		garage: garagePage,
		carForm: carFormPage,
		car: carPage,
		history: serviceHistoryPage,
		serviceForm: serviceFormPage,
	}

	// The last render's translator, for updates made without a redraw.
	let translate = (key) => key

	function render(model, derived) {
		const t = (key, vars) => i18n.t(derived.lang, key, vars)
		translate = t
		const page = PAGES[model.app.page] ?? garagePage
		main.innerHTML = page(model, derived, t)
	}

	// The welcome page on a first visit; the picker once profiles exist.
	// The create form is on both, so a second person can be added. Export
	// is on both too: it is the one page reachable with no data.
	function profilesPage(model, _derived, t) {
		const { profiles } = model.data
		if (profiles.length === 0) {
			return `
				<h1 tabindex="-1">${esc(t("welcome.title"))}</h1>
				<p class="text-muted-foreground">${esc(t("welcome.intro"))}</p>
				${profileForm(model, t)}
				${exportSection(t)}`
		}
		const buttons = profiles.map(
			(p) =>
				`<li><button class="btn btn-full" type="button" data-action="choose-profile" data-id="${esc(p.id)}">${esc(p.name)}</button></li>`
		)
		return `
			<h1 tabindex="-1">${esc(t("profiles.title"))}</h1>
			<ul class="profile-list stack stack-sm" role="list">${buttons.join("")}</ul>
			${profileForm(model, t, t("profiles.new"))}
			${exportSection(t)}`
	}

	// The file holds every profile on the device, not only one, so Export
	// sits under its own heading after the profiles.
	function exportSection(t) {
		return `
			<section class="profile-export stack stack-sm" aria-labelledby="export-title">
				<h2 id="export-title" class="text-lg">${esc(t("export.title"))}</h2>
				<p class="text-muted-foreground">${esc(t("export.text"))}</p>
				<div><button class="btn" type="button" data-action="export-data">${downloadIcon()}<span>${esc(t("export.button"))}</span></button></div>
			</section>`
	}

	// novalidate: the error is our own text under the field, not the
	// browser's bubble. maxlength stops typing at the limit; the controller
	// still checks it, since a value can arrive by other ways.
	function profileForm(model, t, heading) {
		const error = model.inputs.errors.name
		const errorId = "profile-name-error"
		const invalid = error ? ` aria-invalid="true" aria-describedby="${errorId}"` : ""
		return `
			<form class="stack" data-submit="create-profile" novalidate>
				${heading ? `<h2 class="text-lg">${esc(heading)}</h2>` : ""}
				<div class="field">
					<label class="label" for="profile-name">${esc(t("profile.name"))}</label>
					<input class="input" id="profile-name" name="name" type="text" autocomplete="off" required
						maxlength="${config.profileNameMax}" data-input="profile-name"
						value="${esc(model.inputs.profile.name)}"${invalid} />
					${error ? `<p class="field-error" id="${errorId}">${esc(t(error, { max: config.profileNameMax }))}</p>` : ""}
				</div>
				<div><button class="btn btn-primary" type="submit">${esc(t("profile.create"))}</button></div>
			</form>`
	}

	// derived.cars is the active profile's cars, one card each, in the
	// order they were added. With none, a short line says so.
	function garagePage(_model, derived, t) {
		const { cars } = derived
		const km = new Intl.NumberFormat(derived.lang)
		return `
			<div class="cluster-between">
				<h1 tabindex="-1">${esc(t("garage.title"))}</h1>
				<button class="btn btn-primary" type="button" data-action="add-car">${icon("plus")}<span>${esc(t("garage.addCar"))}</span></button>
			</div>
			${
				cars.length === 0
					? `<p class="garage-empty text-muted-foreground">${esc(t("garage.empty"))}</p>`
					: `<ul class="car-list" role="list">${cars.map((car) => carCard(car, derived, t, km)).join("")}</ul>`
			}`
	}

	// The car pages read the selected car and its history from derived. A
	// car that is gone (deleted, or another profile's) gets a short page
	// with a way home instead of a blank one.
	function carMissing(t) {
		return `
			<button class="btn btn-ghost car-back" type="button" data-action="back-garage">${backIcon()}<span>${esc(t("car.backToGarage"))}</span></button>
			<h1 tabindex="-1">${esc(t("car.notFound"))}</h1>`
	}

	const carTitle = (car) => car.nickname ?? `${car.make} ${car.model}`

	// The facts and the two stat cards from the car detail mockup, the
	// shortcut to the service history, then Edit and Delete. Delete opens
	// the dialog under them, which is part of the page from the start.
	function carPage(_model, derived, t) {
		const car = derived.selectedCar
		if (!car) return carMissing(t)
		const km = new Intl.NumberFormat(derived.lang).format(car.mileage)
		const inspection = car.euInspectionDue
			? formatDate(car.euInspectionDue, derived.lang)
			: t("car.noInspectionDate")
		const fact = (label, value) => `<div><dt>${esc(t(label))}</dt><dd>${esc(value)}</dd></div>`
		const quickFacts = [
			["car.year", String(car.year)],
			["car.fuel", t(`fuel.${car.fuel}`)],
			["car.detail.regNumber", car.regNumber],
			...(car.vin ? [["car.detail.vin", car.vin]] : []),
			...(car.engine ? [["car.detail.engine", car.engine]] : []),
		]
		const stat = (iconHtml, label, value, { unit = "", valueClass = "", after = "" } = {}) => `
				<div class="card car-stat-card">
					${iconHtml}
					<div class="stat"><span class="stat-label">${esc(t(label))}</span> <span class="stat-value ${valueClass}">${esc(value)}</span>${unit ? ` <span class="car-stat-unit">${esc(unit)}</span>` : ""}${after ? ` ${after}` : ""}</div>
				</div>`
		const total = formatMoney(derived.history.totalCost, derived.lang)
		return `
			<button class="btn btn-ghost car-back" type="button" data-action="back-garage">${backIcon()}<span>${esc(t("car.backToGarage"))}</span></button>
			<section class="car-detail-hero" aria-labelledby="car-detail-title">
				<div class="car-detail-art" aria-hidden="true">${vehicleIcon()}</div>
				<div class="car-detail-heading">
					<h1 id="car-detail-title" class="${car.nickname ? "car-detail-title-nickname" : ""}" tabindex="-1">${esc(carTitle(car))}</h1>
					${car.nickname ? `<p class="car-detail-subtitle">${esc(`${car.make} ${car.model}`)}</p>` : ""}
				</div>
			</section>
			<dl class="car-detail-quick-facts">
				${quickFacts.map(([label, value]) => fact(label, value)).join("")}
			</dl>
			<div class="car-detail-stats">
				${stat(meterIcon(), "car.odometer", km, { unit: t("car.kilometres") })}
				${stat(icon("calendar"), "car.euInspection", inspection, {
					valueClass: "car-inspection-value",
					after: euStatus(derived.euStatus[car.id], t),
				})}
			</div>
			<a class="card car-link" href="#history-${esc(car.id)}" data-action="open-history" data-id="${esc(car.id)}">
				${icon("calendar")}<span class="car-link-copy"><strong>${esc(t("car.serviceRecords"))}</strong> <span>${esc(t("car.totalSpent", { cost: total }))}</span></span>
			</a>
			<div class="cluster car-actions">
				<button class="btn" type="button" data-action="edit-car">${editIcon()}<span>${esc(t("car.edit"))}</span></button>
				<button class="btn btn-danger" type="button" data-action="delete-car">${deleteIcon()}<span>${esc(t("car.delete"))}</span></button>
			</div>
			${deleteDialog(car, t)}`
	}

	// A native <dialog>, so the browser keeps focus inside it, closes it on
	// Escape and hands focus back to Delete. Focus starts on Cancel, the
	// safe choice. Cancel sits in a method="dialog" form, which closes the
	// dialog without the controller: nothing changes, so nothing renders.
	function deleteDialog(car, t) {
		return `
			<dialog class="modal car-delete-dialog" id="delete-car-dialog" aria-labelledby="delete-car-title" aria-describedby="delete-car-text">
				<h2 id="delete-car-title">${esc(t("car.deleteDialog.title", { car: carTitle(car) }))}</h2>
				<p id="delete-car-text" class="text-muted-foreground">${esc(t("car.deleteDialog.text"))}</p>
				<div class="cluster car-delete-actions">
					<button class="btn btn-danger" type="button" data-action="confirm-delete-car">${esc(t("car.delete"))}</button>
					<form method="dialog"><button class="btn" type="submit" autofocus>${esc(t("car.cancel"))}</button></form>
				</div>
			</dialog>`
	}

	// derived.history holds what the filter shows, newest first. The empty
	// line tells "no entries yet" apart from "none in this filter".
	function serviceHistoryPage(model, derived, t) {
		const car = derived.selectedCar
		if (!car) return carMissing(t)
		const { count, shown, totalCost } = derived.history
		const filters = ["all", ...config.serviceCategories]
		const option = (filter) =>
			`<option value="${filter}"${model.app.historyFilter === filter ? " selected" : ""}>${esc(t(`history.filter.${filter}`))}</option>`
		return `
			<button class="btn btn-ghost car-back" type="button" data-action="back-car">${backIcon()}<span>${esc(t("history.backToCar", { car: carTitle(car) }))}</span></button>
			<h1 class="history-title" tabindex="-1">${esc(t("history.title"))}</h1>
			<p class="history-intro text-muted-foreground">${esc(t("history.intro"))}</p>
			<p class="card history-total"><span>${esc(t("history.totalSpent"))}</span> <strong>${esc(formatMoney(totalCost, derived.lang))}</strong></p>
			<div class="history-controls">
				<div class="field history-filter-field">
					<label class="sr-only" for="history-filter">${esc(t("history.filter.label"))}</label>
					<select class="select" id="history-filter" name="filter" data-change="history-filter">${filters.map(option).join("")}</select>
				</div>
				<button class="btn btn-primary history-register" type="button" data-action="register-service">${icon("plus")}<span>${esc(t("history.register"))}</span></button>
			</div>
			${
				shown.length
					? `<ul class="history-list" role="list">${shown.map((entry) => serviceHistoryEntry(entry, derived, t)).join("")}</ul>`
					: `<p class="history-empty text-muted-foreground">${esc(t(count ? "history.noMatches" : "history.empty"))}</p>`
			}`
	}

	function serviceFormPage(model, derived, t) {
		const car = derived.selectedCar
		if (!car) return carMissing(t)
		const makeModel = `${car.make} ${car.model}`
		const carName = car.nickname ? `${car.nickname} · ${makeModel}` : makeModel
		const vars = { maxKm: new Intl.NumberFormat(derived.lang).format(config.carMileageMax) }
		const field = (name, options) => serviceEntryField(model, t, name, { ...options, vars })
		return `
			<button class="btn btn-ghost car-back" type="button" data-action="cancel-service-entry">${backIcon()}<span>${esc(t("service.backToHistory"))}</span></button>
			<h1 class="service-form-title" tabindex="-1">${esc(t("service.formTitle"))}</h1>
			<p class="service-form-car text-muted-foreground">${esc(t("service.carSummary", { car: carName, year: car.year }))}</p>
			<form class="stack service-form" data-submit="save-service-entry" novalidate>
				${field("category", { type: "select", required: true })}
				${field("title", {
					required: true,
					attrs: `placeholder="${esc(t("service.placeholder.title"))}" autocomplete="off"`,
				})}
				${field("date", { type: "date", required: true, attrs: `max="${esc(derived.today)}"` })}
				${field("mileage", {
					type: "number",
					required: true,
					attrs: `min="0" max="${config.carMileageMax}" step="1" inputmode="numeric"`,
				})}
				${field("cost", {
					type: "number",
					required: true,
					attrs: 'min="0" step="1" inputmode="numeric"',
				})}
				${field("workshop", {
					attrs: `placeholder="${esc(t("service.placeholder.workshop"))}" autocomplete="organization"`,
				})}
				${field("notes", {
					type: "textarea",
					attrs: `placeholder="${esc(t("service.placeholder.notes"))}"`,
				})}
				<div class="cluster service-form-actions">
					<button class="btn btn-primary" type="submit">${esc(t("service.save"))}</button>
					<button class="btn btn-ghost" type="button" data-action="cancel-service-entry">${esc(t("car.cancel"))}</button>
				</div>
			</form>`
	}

	// One labelled field, the same shape as carField. Every change goes to
	// the controller as "service-entry-input" with the field's name, so the
	// form needs no redraw while typing. Optional fields say so in the label.
	function serviceEntryField(
		model,
		t,
		name,
		{ type = "text", required = false, attrs = "", vars }
	) {
		const id = `service-${name}`
		const error = model.inputs.errors[name]
		const errorId = `${id}-error`
		const value = model.inputs.serviceEntry[name]
		const shared = [
			`id="${id}" name="${name}" data-input="service-entry-input" data-field="${name}"`,
			required ? "required" : "",
			error ? `aria-invalid="true" aria-describedby="${errorId}"` : "",
			attrs,
		].join(" ")
		const option = (category) =>
			`<option value="${category}"${value === category ? " selected" : ""}>${esc(t(`service.category.${category}`))}</option>`
		let control
		if (type === "select") {
			control = `<select class="select" ${shared}>${config.serviceCategories.map(option).join("")}</select>`
		} else if (type === "textarea") {
			control = `<textarea class="textarea" ${shared}>${esc(value)}</textarea>`
		} else {
			control = `<input class="input" type="${type}" ${shared} value="${esc(value)}" />`
		}
		const label = t(name === "title" ? "service.workTitle" : `service.${name}`)
		const optional = required
			? ""
			: ` <span class="text-muted-foreground">(${esc(t("service.optional"))})</span>`
		return `
			<div class="field">
				<label class="label" for="${id}">${esc(label)}${optional}</label>
				${control}
				${error ? `<p class="field-error" id="${errorId}">${esc(t(error, vars))}</p>` : ""}
			</div>`
	}

	function serviceHistoryEntry(entry, derived, t) {
		const km = new Intl.NumberFormat(derived.lang).format(entry.mileage)
		const cost = formatMoney(entry.cost, derived.lang)
		return `
			<li class="history-entry">
				<time class="history-date" datetime="${esc(entry.date)}">${esc(formatDate(entry.date, derived.lang))}</time>
				<div class="history-entry-details">
					<div class="history-entry-heading">
						<h2>${esc(entry.title)}</h2>
						<span class="badge history-category">${esc(t(`history.filter.${entry.category}`))}</span>
					</div>
					<p class="history-entry-mileage">${esc(t("history.km", { km }))}</p>
					${entry.workshop ? `<p class="history-entry-workshop">${esc(t("history.workshop", { workshop: entry.workshop }))}</p>` : ""}
					<p class="history-entry-cost">${esc(t("history.cost", { cost }))}</p>
					${entry.notes ? `<p class="history-entry-notes text-muted-foreground">${esc(entry.notes)}</p>` : ""}
				</div>
			</li>`
	}

	// An EU-kontroll status as text with an icon, never colour alone. The
	// controller works it out; none means the car has no date.
	const EU_STATUS_ICONS = {
		ok: () => icon("check", { size: 16 }),
		dueSoon: clockIcon,
		overdue: warningIcon,
	}

	function euStatus(status, t) {
		if (!status) return ""
		return `<span class="eu-status" data-status="${status}">${EU_STATUS_ICONS[status]()}<span>${esc(t(`euStatus.${status}`))}</span></span>`
	}

	// Costs are stored as whole kroner in the base currency. The language
	// decides the layout: "NOK 1,200" in English, "1 200 kr" in Norwegian.
	function formatMoney(amount, lang) {
		return new Intl.NumberFormat(lang, {
			style: "currency",
			currency: config.baseCurrency,
			currencyDisplay: "symbol",
			maximumFractionDigits: 0,
		}).format(amount)
	}

	// A stored YYYY-MM-DD in the chosen language, with a four-digit year
	// and the month as a word, so 03.04 and 04.03 can't be mixed up.
	function formatDate(value, lang) {
		const date = new Date(`${value}T00:00:00`)
		return Number.isNaN(date.getTime())
			? value
			: new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(date)
	}

	function backIcon() {
		return '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>'
	}

	function meterIcon() {
		return '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4.7 18a9 9 0 1 1 14.6 0"/><path d="m12 13 4-4M6.5 18h11"/><circle cx="12" cy="13" r="1"/></svg>'
	}

	function editIcon() {
		return '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
	}

	function deleteIcon() {
		return '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
	}

	function clockIcon() {
		return '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
	}

	function warningIcon() {
		return '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4M12 17h.01"/></svg>'
	}

	function downloadIcon() {
		return '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 4v11m-5-5 5 5 5-5"/><path d="M5 20h14"/></svg>'
	}

	function vehicleIcon() {
		return '<svg class="icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m5 11 1.6-4.1A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.4L19 11l1.5 1.4v5.1h-17v-5.1L5 11Z"/><path d="M4 11h16M7 17.5v1.5m10-1.5v1.5"/><circle cx="7.5" cy="14.5" r=".8"/><circle cx="16.5" cy="14.5" r=".8"/></svg>'
	}

	// One car. The title is the card's only link, and main.css stretches it
	// over the whole card, so a screen reader hears the car's name and not
	// every line of the card. A nickname takes the title, and make and model
	// move to the line under it. The VIN and the EU-kontroll show only when
	// set, each on its own row under the registration number and the odometer.
	function carCard(car, derived, t, km) {
		const status = derived.euStatus[car.id]
		const makeModel = `${car.make} ${car.model}`
		const fact = (label, value, cls = "") =>
			`<div${cls && ` class="${cls}"`}><dt>${esc(t(label))}</dt><dd>${esc(value)}</dd></div>`
		return `
			<li class="card card-hover car-card">
				<h2 class="car-card-title"><a href="#car-${esc(car.id)}" data-action="open-car" data-id="${esc(car.id)}">${esc(car.nickname ?? makeModel)}</a></h2>
				${car.nickname ? `<p class="car-card-make">${esc(makeModel)}</p>` : ""}
				<p class="car-card-meta">${esc(t("garage.yearFuel", { year: car.year, fuel: t(`fuel.${car.fuel}`) }))}</p>
				<dl class="car-card-facts">
					${fact("garage.regNumber", car.regNumber)}
					${fact("garage.mileage", t("garage.km", { km: km.format(car.mileage) }))}
					${car.vin ? fact("garage.vin", car.vin, "car-card-vin") : ""}
					${status ? euFact(car, status, derived.lang, t) : ""}
				</dl>
			</li>`
	}

	function euFact(car, status, lang, t) {
		return `
			<div class="car-card-eu">
				<dt>${esc(t("car.euInspection"))}</dt>
				<dd><time datetime="${esc(car.euInspectionDue)}">${esc(formatDate(car.euInspectionDue, lang))}</time> ${euStatus(status, t)}</dd>
			</div>`
	}

	// The car form's fields in form order (docs/design/data-model.md, Car).
	// The labels of optional fields say "(optional)", so only the required
	// ones carry the required attribute. Year and odometer are text with a
	// number keyboard: type="number" lets "e", "+", "-" and "." through, and
	// the controller keeps them to digits as they are typed. Every field but
	// fuel and the date shows a short example until something is typed
	// (car.placeholder.*). A date input draws its own day, month and year.
	// The label stays above it, so the field is still named once it is filled.
	const CAR_FIELDS = [
		{ name: "nickname", attrs: `maxlength="${config.carNicknameMax}"` },
		{ name: "make", required: true, attrs: 'list="car-makes"' },
		{ name: "model", required: true, attrs: 'list="car-models"' },
		{ name: "year", required: true, attrs: 'inputmode="numeric"' },
		{ name: "regCountry", required: true, attrs: 'list="car-countries" spellcheck="false"' },
		{ name: "regNumber", required: true, attrs: 'autocapitalize="characters" spellcheck="false"' },
		{ name: "vin", attrs: 'maxlength="17" autocapitalize="characters" spellcheck="false"' },
		{ name: "fuel", type: "select" },
		{ name: "engine" },
		{ name: "mileage", required: true, attrs: 'inputmode="numeric"' },
		{ name: "euInspectionDue", type: "date" },
	]

	// novalidate: each error is our own text under its field, the same way
	// as on the profile form. The same form edits a saved car while
	// inputs.editingId names it.
	function carFormPage(model, derived, t) {
		const title = model.inputs.editingId ? "carForm.editTitle" : "carForm.title"
		return `
			<h1 tabindex="-1">${esc(t(title))}</h1>
			<form class="stack" data-submit="save-car" novalidate>
				${CAR_FIELDS.map((field) => carField(model, derived, t, field)).join("")}
				${datalist("car-makes", MAKES)}
				${datalist("car-models", derived.carForm.models)}
				${datalist(
					"car-countries",
					derived.carForm.countries.map((c) => c.name)
				)}
				<div class="cluster">
					<button class="btn btn-primary" type="submit">${esc(t("car.save"))}</button>
					<button class="btn" type="button" data-action="cancel-car">${esc(t("car.cancel"))}</button>
				</div>
			</form>`
	}

	// The registration number's example follows the chosen country, and
	// has none until a country matches.
	function placeholder(t, name, plate) {
		if (name !== "regNumber") return t(`car.placeholder.${name}`)
		return plate ? t("car.placeholder.regNumber", { example: plate.example }) : ""
	}

	// Suggestions for an <input list>. The browser filters them as the
	// user types, and any other value can still be typed.
	function datalist(id, values) {
		return `<datalist id="${id}">${datalistOptions(values)}</datalist>`
	}

	function datalistOptions(values) {
		return values.map((value) => `<option value="${esc(value)}"></option>`).join("")
	}

	// One labelled field. Every keystroke goes to the controller as
	// "car-input" with the field's name, so the form needs no redraw.
	function carField(model, derived, t, { name, type = "text", required = false, attrs = "" }) {
		const { country, plate } = derived.carForm
		const id = `car-${name}`
		// A country is kept as its code once it matches, and shown by name.
		const value = name === "regCountry" && country ? country.name : model.inputs.car[name]
		const error = model.inputs.errors[name]
		const errorId = `${id}-error`
		const shared = [
			`id="${id}" name="${name}" data-input="car-input" data-field="${name}"`,
			required ? "required" : "",
			error ? `aria-invalid="true" aria-describedby="${errorId}"` : "",
			attrs,
		].join(" ")
		const control =
			type === "select"
				? `<select class="select" ${shared}>${config.fuels
						.map(
							(fuel) =>
								`<option value="${esc(fuel)}"${fuel === value ? " selected" : ""}>${esc(t(`fuel.${fuel}`))}</option>`
						)
						.join("")}</select>`
				: `<input class="input" type="${type}" autocomplete="off" ${shared} value="${esc(value)}"${
						type === "date" ? "" : ` placeholder="${esc(placeholder(t, name, plate))}"`
					} />`
		const vars = {
			max: config.carNicknameMax,
			min: config.carYearMin,
			maxKm: new Intl.NumberFormat(derived.lang).format(config.carMileageMax),
			country: country?.name,
			plateMin: plate?.min,
			plateMax: plate?.max,
		}
		return `
			<div class="field">
				<label class="label" for="${id}">${esc(t(`car.${name}`))}</label>
				${control}
				${error ? `<p class="field-error" id="${errorId}">${esc(t(error, vars))}</p>` : ""}
			</div>`
	}

	// One row of a picker. The label sits in one span so text around a <span lang>
	// stays a single flex item. The active row carries aria-current and the check
	// icon; `attrs` is what the controller reads, already HTML-safe.
	function pickerRow({ attrs, active, lang, lead = "", label }) {
		return `<li><button class="picker-row" type="button" ${attrs}${lang ? ` lang="${esc(lang)}"` : ""}${
			active ? ' aria-current="true"' : ""
		}>${lead}<span>${label}</span>${active ? icon("check") : ""}</button></li>`
	}

	// One picker: an icon-only trigger that names itself in a .sr-only span,
	// and the list under it. components/picker.js adds the keyboard rules.
	function picker({ name, triggerIcon, triggerName, listLabel, rows }) {
		return `
			<details class="picker" data-picker="${name}">
				<summary class="btn icon-btn">${triggerIcon}<span class="sr-only">${esc(triggerName)}</span></summary>
				<ul class="picker-list" aria-label="${esc(listLabel)}">${rows.join("")}</ul>
			</details>`
	}

	function flag(currency, flags) {
		return `<img class="picker-flag" alt="" src="${esc(flagUrl(flags[currency]))}" />`
	}

	// "System ({value})" with the value already rendered as HTML.
	function systemLabel(t, valueHtml) {
		return esc(t("picker.system")).replace("{value}", valueHtml)
	}

	function languagePicker({ chosen, system }, derived, t) {
		const systemName = `<span lang="${esc(system.lang)}">${esc(langName(system.lang))}</span>`
		const rows = [
			pickerRow({
				attrs: 'data-action="set-lang" data-lang=""',
				active: chosen.lang === null,
				label: systemLabel(t, systemName),
			}),
			...i18n.languages.map((code) =>
				pickerRow({
					attrs: `data-action="set-lang" data-lang="${esc(code)}"`,
					lang: code,
					active: chosen.lang === code,
					label: esc(langName(code)),
				})
			),
		]
		const current = chosen.lang
			? langName(derived.lang)
			: t("picker.system", { value: langName(system.lang) })
		return picker({
			name: "lang",
			triggerIcon: icon("globe"),
			triggerName: `${t("picker.language")}: ${current}`,
			listLabel: t("picker.language"),
			rows,
		})
	}

	function themePicker({ chosen, system }, derived, t) {
		const label = (theme) => t(`theme.${theme}`)
		const rows = [
			pickerRow({
				attrs: 'data-action="set-theme" data-value=""',
				active: chosen.theme === null,
				label: systemLabel(t, esc(label(system.theme))),
			}),
			...THEME_OPTIONS.map((theme) =>
				pickerRow({
					attrs: `data-action="set-theme" data-value="${theme}"`,
					active: chosen.theme === theme,
					label: esc(label(theme)),
				})
			),
		]
		const current = chosen.theme
			? label(derived.theme)
			: t("picker.system", { value: label(system.theme) })
		return picker({
			name: "theme",
			triggerIcon: icon(derived.theme === "light" ? "sun" : "moon"),
			triggerName: `${t("picker.theme")}: ${current}`,
			listLabel: t("picker.theme"),
			rows,
		})
	}

	function currencyPicker({ chosen, system }, derived, t) {
		const rows = [
			pickerRow({
				attrs: 'data-action="set-currency" data-currency=""',
				active: chosen.currency === null,
				label: systemLabel(t, esc(system.currency)),
			}),
			...config.currencies.map((code) =>
				pickerRow({
					attrs: `data-action="set-currency" data-currency="${esc(code)}"`,
					active: chosen.currency === code,
					lead: `${flag(code, config.flags)}<span class="picker-code">${esc(code)}</span>`,
					label: esc(currencyName(code, derived.lang)),
				})
			),
		]
		const current = chosen.currency
			? derived.currency
			: t("picker.system", { value: system.currency })
		return picker({
			name: "currency",
			triggerIcon: flag(derived.currency, config.flags),
			triggerName: `${t("picker.currency")}: ${current}`,
			listLabel: t("picker.currency"),
			rows,
		})
	}

	// The wordmark and the pickers, right-aligned, in the order language,
	// theme, currency. A picker renders only when there is a choice to make.
	function renderHeader(model, derived) {
		const t = (key, vars) => i18n.t(derived.lang, key, vars)
		const { preferences } = model.app
		const pickers = [
			i18n.languages.length > 1 ? languagePicker(preferences, derived, t) : "",
			THEME_OPTIONS.length > 1 ? themePicker(preferences, derived, t) : "",
			config.currencies.length > 1 ? currencyPicker(preferences, derived, t) : "",
		]
		header.innerHTML = `
			<div class="cluster-between">
				<span class="brand font-heading text-xl font-medium">${esc(WORDMARK[0])}<span class="text-brass">${esc(WORDMARK[1])}</span></span>
				<div class="cluster cluster-sm">${pickers.join("")}</div>
			</div>
			${derived.profile ? profileRow(derived.profile, t) : ""}
		`
	}

	// A second row under the wordmark, so the pickers keep their place on a
	// phone. The label is set apart from the name by size and ink.
	function profileRow(profile, t) {
		return `
			<div class="header-profile cluster-between">
				<p class="header-profile-text">
					<span class="header-profile-label">${esc(t("profile.label"))}</span>
					<span class="header-profile-name">${esc(profile.name)}</span>
				</p>
				<button class="btn" type="button" data-action="switch-profile">${esc(t("profile.switch"))}</button>
			</div>`
	}

	// After a choice the header is re-rendered, so focus is put back on the
	// trigger of the picker that was used.
	function focusPicker(name) {
		header.querySelector(`details[data-picker="${name}"] > summary`)?.focus()
	}

	// After a page change: the new page's heading, so it is announced.
	function focusHeading() {
		main.querySelector("h1")?.focus()
	}

	// After a failed submit: the field with the error.
	function focusField(id) {
		main.querySelector(`#${id}`)?.focus()
	}

	// Delete on the car page: the dialog opens as a modal, and the browser
	// moves focus to its autofocus button.
	function openDialog(id) {
		main.querySelector(`#${id}`)?.showModal()
	}

	// Confirm in the dialog: closed before the page changes under it.
	function closeDialog(id) {
		main.querySelector(`#${id}`)?.close()
	}

	// Export: the file goes to the browser as a download through a hidden
	// link that lives only for the click. The link reads its blob URL when
	// it is clicked, so the URL can be revoked straight after.
	function downloadFile({ name, type, text }) {
		const url = URL.createObjectURL(new Blob([text], { type }))
		const link = main.ownerDocument.createElement("a")
		link.href = url
		link.download = name
		link.hidden = true
		main.append(link)
		link.click()
		link.remove()
		URL.revokeObjectURL(url)
	}

	// A new make or country while the car form is open: the model
	// suggestions and the plate example change without a redraw, so
	// nothing typed and no focus is lost.
	function updateCarForm({ models, plate }) {
		const list = main.querySelector("#car-models")
		if (list) list.innerHTML = datalistOptions(models)
		const reg = main.querySelector("#car-regNumber")
		if (reg) reg.placeholder = placeholder(translate, "regNumber", plate)
	}

	// A field whose typed value the controller fixed (a letter in the year,
	// say). The caret goes back where the controller says, not to the end.
	function setFieldValue(input, value, caret) {
		input.value = value
		input.setSelectionRange(caret, caret)
	}

	// One delegated listener per event type and root. Each type has its own
	// attribute, so a click on a submit button never fires the form's action:
	//   <button data-action="x">  click
	//   <form data-submit="x">    submit (the page never reloads)
	//   <input data-input="x">    every keystroke
	// handlers = { name: (event, target) => {} }
	const EVENTS = { click: "action", submit: "submit", input: "input", change: "change" }

	function bindActions(handlers) {
		for (const root of [header, main]) {
			for (const [type, attr] of Object.entries(EVENTS)) {
				root.addEventListener(type, (event) => {
					const target = event.target.closest(`[data-${attr}]`)
					if (!target) return
					if (type === "submit") event.preventDefault()
					handlers[target.dataset[attr]]?.(event, target)
				})
			}
		}
	}

	return {
		render,
		renderHeader,
		focusPicker,
		focusHeading,
		focusField,
		openDialog,
		closeDialog,
		downloadFile,
		setFieldValue,
		updateCarForm,
		bindActions,
	}
}
