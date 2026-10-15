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
	const PAGES = { profiles: profilesPage, garage: garagePage }

	function render(model, derived) {
		const t = (key, vars) => i18n.t(derived.lang, key, vars)
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

	// Cars arrive with #8 and #9; until then the garage says it is empty.
	function garagePage(_model, _derived, t) {
		return `
			<h1 tabindex="-1">${esc(t("garage.title"))}</h1>
			<p class="text-muted-foreground">${esc(t("garage.empty"))}</p>`
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

	// One delegated listener per event type and root. Each type has its own
	// attribute, so a click on a submit button never fires the form's action:
	//   <button data-action="x">  click
	//   <form data-submit="x">    submit (the page never reloads)
	//   <input data-input="x">    every keystroke
	// handlers = { name: (event, target) => {} }
	const EVENTS = { click: "action", submit: "submit", input: "input" }

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

	return { render, renderHeader, focusPicker, focusHeading, focusField, bindActions }
}
