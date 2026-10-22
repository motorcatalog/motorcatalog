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
	// The create form is on both, so a second person can be added.
	function profilesPage(model, _derived, t) {
		const { profiles } = model.data
		if (profiles.length === 0) {
			return `
				<h1 tabindex="-1">${esc(t("welcome.title"))}</h1>
				<p class="text-muted-foreground">${esc(t("welcome.intro"))}</p>
				${profileForm(model, t)}`
		}
		const buttons = profiles.map(
			(p) =>
				`<li><button class="btn btn-full" type="button" data-action="choose-profile" data-id="${esc(p.id)}">${esc(p.name)}</button></li>`
		)
		return `
			<h1 tabindex="-1">${esc(t("profiles.title"))}</h1>
			<ul class="profile-list stack stack-sm" role="list">${buttons.join("")}</ul>
			${profileForm(model, t, t("profiles.new"))}`
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
					: `<ul class="car-list" role="list">${cars.map((car) => carCard(car, t, km)).join("")}</ul>`
			}`
	}

	// The detail view reads the selected car from derived state. The header is
	// outside #main, so the shared banner and profile controls remain visible.
	function carPage(_model, derived, t) {
		const car = derived.selectedCar
		if (!car) {
			return `
				<button class="btn btn-ghost" type="button" data-action="back-garage">${backIcon()}<span>${esc(t("car.backToGarage"))}</span></button>
				<h1 tabindex="-1">${esc(t("car.notFound"))}</h1>`
		}
		const title = car.nickname ?? `${car.make} ${car.model}`
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
		return `
			<button class="btn btn-ghost car-back" type="button" data-action="back-garage">${backIcon()}<span>${esc(t("car.backToGarage"))}</span></button>
			<section class="car-detail-hero" aria-labelledby="car-detail-title">
				<div class="car-detail-art" aria-hidden="true">${vehicleIcon()}</div>
				<div class="car-detail-heading">
					<h1 id="car-detail-title" class="${car.nickname ? "car-detail-title-nickname" : ""}" tabindex="-1">${esc(title)}</h1>
					${car.nickname ? `<p class="car-detail-subtitle">${esc(`${car.make} ${car.model}`)}</p>` : ""}
				</div>
			</section>
			<dl class="car-detail-quick-facts">
				${quickFacts.map(([label, value]) => fact(label, value)).join("")}
			</dl>
			<div class="car-detail-stats">
				<section class="card car-stat-card" aria-label="${esc(t("car.odometer"))}">
					${meterIcon()}
					<div class="stat"><span class="stat-label">${esc(t("car.odometer"))}</span><span class="stat-value">${esc(km)}</span><span class="car-stat-unit">${esc(t("car.kilometres"))}</span></div>
				</section>
				<section class="card car-stat-card" aria-label="${esc(t("car.euInspection"))}">
					${icon("calendar")}
					<div class="stat"><span class="stat-label">${esc(t("car.euInspection"))}</span><span class="stat-value car-inspection-value">${esc(inspection)}</span></div>
				</section>
			</div>
			<div class="car-future-cards">
				<a class="card car-future-card car-future-link" href="#history-${esc(car.id)}" data-action="open-history" data-id="${esc(car.id)}">
					${icon("calendar")}<span class="car-future-copy"><strong>${esc(t("car.serviceRecords"))}</strong><span>${esc(t("car.openServiceRecords"))}</span></span>
				</a>
				<div class="card car-future-card">
					${icon("check")}<span class="car-future-copy"><strong>${esc(t("car.maintenance"))}</strong><span>${esc(t("car.comingSoon"))}</span></span>
				</div>
			</div>`
	}

	function serviceHistoryPage(_model, derived, t) {
		const car = derived.selectedCar
		if (!car) {
			return `
				<button class="btn btn-ghost car-back" type="button" data-action="back-garage">${backIcon()}<span>${esc(t("car.backToGarage"))}</span></button>
				<h1 tabindex="-1">${esc(t("car.notFound"))}</h1>`
		}
		const title = car.nickname ?? `${car.make} ${car.model}`
		const filters = ["all", "service", "repair", "other"]
		const entries = derived.history.map((entry) => serviceHistoryEntry(entry, derived, t)).join("")
		const emptyMessage = derived.hasHistoryEntries ? t("history.noMatches") : t("history.empty")
		return `
			<button class="btn btn-ghost car-back" type="button" data-action="back-car">${backIcon()}<span>${esc(t("history.backToCar", { car: title }))}</span></button>
			<h1 class="history-title" tabindex="-1">${esc(t("history.title"))}</h1>
			<p class="history-intro text-muted-foreground">${esc(t("history.intro"))}</p>
			<div class="history-controls">
				<div class="field history-filter-field">
					<label class="sr-only" for="history-filter">${esc(t("history.filter.label"))}</label>
					<select class="select" id="history-filter" name="filter" data-change="history-filter">
						${filters.map((filter) => `<option value="${filter}"${_model.app.historyFilter === filter ? " selected" : ""}>${esc(t(`history.filter.${filter}`))}</option>`).join("")}
					</select>
				</div>
				<button class="btn btn-primary history-register" type="button">${icon("plus")}<span>${esc(t("history.register"))}</span></button>
			</div>
			${
				derived.history.length
					? `<ul class="history-list" role="list">${entries}</ul>`
					: `<p class="history-empty text-muted-foreground" role="status">${esc(emptyMessage)}</p>`
			}`
	}

	function serviceHistoryEntry(entry, derived, t) {
		const km = new Intl.NumberFormat(derived.lang).format(entry.mileage)
		const cost = new Intl.NumberFormat(derived.lang, {
			style: "currency",
			currency: derived.currency,
			maximumFractionDigits: 0,
		}).format(entry.cost)
		return `
			<li class="history-entry">
				<time class="history-date" datetime="${esc(entry.date)}">${esc(formatHistoryDate(entry.date, derived.lang))}</time>
				<div class="history-entry-details">
					<div class="history-entry-heading">
						<h2>${esc(entry.title)}</h2>
						<span class="badge history-category">${esc(t(`history.filter.${entry.category}`))}</span>
					</div>
					<p class="history-entry-mileage">${esc(t("history.km", { km }))}</p>
					${entry.workshop ? `<p class="history-entry-workshop">${esc(t("history.workshop", { workshop: entry.workshop }))}</p>` : ""}
					<p class="history-entry-cost">${esc(t("history.cost", { cost }))}</p>
				</div>
			</li>`
	}

	function formatHistoryDate(value, lang) {
		const date = new Date(`${value}T00:00:00`)
		return Number.isNaN(date.getTime())
			? value
			: new Intl.DateTimeFormat(lang, { day: "2-digit", month: "2-digit", year: "numeric" }).format(
					date
				)
	}

	function formatDate(value, lang) {
		const date = new Date(`${value}T00:00:00`)
		return Number.isNaN(date.getTime())
			? value
			: new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }).format(
					date
				)
	}

	function backIcon() {
		return '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>'
	}

	function meterIcon() {
		return '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4.7 18a9 9 0 1 1 14.6 0"/><path d="m12 13 4-4M6.5 18h11"/><circle cx="12" cy="13" r="1"/></svg>'
	}

	function vehicleIcon() {
		return '<svg class="icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m5 11 1.6-4.1A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.4L19 11l1.5 1.4v5.1h-17v-5.1L5 11Z"/><path d="M4 11h16M7 17.5v1.5m10-1.5v1.5"/><circle cx="7.5" cy="14.5" r=".8"/><circle cx="16.5" cy="14.5" r=".8"/></svg>'
	}

	// One car. The title is the card's only link, and main.css stretches it
	// over the whole card, so a screen reader hears the car's name and not
	// every line of the card. A nickname takes the title, and make and model
	// move to the line under it. The VIN shows only when there is one, on
	// its own row under the registration number and the odometer.
	function carCard(car, t, km) {
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
				</dl>
			</li>`
	}

	// The car form's fields in form order (docs/design/data-model.md, Car).
	// The labels of optional fields say "(optional)", so only the required
	// ones carry the required attribute. Year and odometer are text with a
	// number keyboard: type="number" lets "e", "+", "-" and "." through, and
	// the controller keeps them to digits as they are typed. Every field but
	// fuel shows a short example until something is typed (car.placeholder.*).
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
	]

	// novalidate: each error is our own text under its field, the same way
	// as on the profile form.
	function carFormPage(model, derived, t) {
		return `
			<h1 tabindex="-1">${esc(t("carForm.title"))}</h1>
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
				: `<input class="input" type="${type}" autocomplete="off" ${shared} value="${esc(value)}"
						placeholder="${esc(placeholder(t, name, plate))}" />`
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
		setFieldValue,
		updateCarForm,
		bindActions,
	}
}
