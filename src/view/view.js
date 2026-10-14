/* ======================================================================
   src/view/view.js — VIEW
   Renders HTML from state and forwards user actions to the controller.
   No state mutation. No timers.
   Interactive elements carry a data-action attribute
   (e.g. <button data-action="add">); bindActions routes them by name.
   Every user-facing string goes through t() — never a literal.
   Every string goes through esc() before it lands in innerHTML, Intl
   output included — never concatenate raw.

   Two roots: the header (wordmark + the three preference pickers) is
   rendered by renderHeader(state) and only when a preference changes;
   everything else is render(state).
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

export function createView({ header, main }, i18n) {
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

	function render(state) {
		const t = (key, vars) => i18n.t(state.lang, key, vars)

		// An example price: data is { amount, currency }, never a price string.
		// The language picks separators and symbol placement, the currency the symbol.
		const price = { amount: 949, currency: state.currency }

		main.innerHTML = `
			<h1>${esc(t("app.title"))}</h1>
			<p class="text-muted-foreground">${esc(t("app.tagline"))}</p>
			<p><strong>${esc(t("price.example"))}:</strong> ${esc(i18n.money(state.lang, price.amount, price.currency))}</p>
		`
		// build the rest of the UI from state here
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

	function languagePicker(state, t) {
		const { chosen, system, languages } = state
		const systemName = `<span lang="${esc(system.lang)}">${esc(langName(system.lang))}</span>`
		const rows = [
			pickerRow({
				attrs: 'data-action="set-lang" data-lang=""',
				active: chosen.lang === null,
				label: systemLabel(t, systemName),
			}),
			...languages.map((code) =>
				pickerRow({
					attrs: `data-action="set-lang" data-lang="${esc(code)}"`,
					lang: code,
					active: chosen.lang === code,
					label: esc(langName(code)),
				})
			),
		]
		const current = chosen.lang
			? langName(state.lang)
			: t("picker.system", { value: langName(system.lang) })
		return picker({
			name: "lang",
			triggerIcon: icon("globe"),
			triggerName: `${t("picker.language")}: ${current}`,
			listLabel: t("picker.language"),
			rows,
		})
	}

	function themePicker(state, t) {
		const { chosen, system } = state
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
			? label(state.theme)
			: t("picker.system", { value: label(system.theme) })
		return picker({
			name: "theme",
			triggerIcon: icon(state.theme === "light" ? "sun" : "moon"),
			triggerName: `${t("picker.theme")}: ${current}`,
			listLabel: t("picker.theme"),
			rows,
		})
	}

	function currencyPicker(state, t) {
		const { chosen, system, config } = state
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
					label: esc(currencyName(code, state.lang)),
				})
			),
		]
		const current = chosen.currency
			? state.currency
			: t("picker.system", { value: system.currency })
		return picker({
			name: "currency",
			triggerIcon: flag(state.currency, config.flags),
			triggerName: `${t("picker.currency")}: ${current}`,
			listLabel: t("picker.currency"),
			rows,
		})
	}

	// The wordmark and the pickers, right-aligned, in the order language,
	// theme, currency. A picker renders only when there is a choice to make.
	function renderHeader(state) {
		const t = (key, vars) => i18n.t(state.lang, key, vars)
		const pickers = [
			state.languages.length > 1 ? languagePicker(state, t) : "",
			THEME_OPTIONS.length > 1 ? themePicker(state, t) : "",
			state.config.currencies.length > 1 ? currencyPicker(state, t) : "",
		]
		header.innerHTML = `
			<div class="cluster-between">
				<span class="brand font-heading text-xl font-medium">${esc(WORDMARK[0])}<span class="text-brass">${esc(WORDMARK[1])}</span></span>
				<div class="cluster cluster-sm">${pickers.join("")}</div>
			</div>
		`
	}

	// After a choice the header is re-rendered, so focus is put back on the
	// trigger of the picker that was used.
	function focusPicker(name) {
		header.querySelector(`details[data-picker="${name}"] > summary`)?.focus()
	}

	// One delegated listener per root; handlers = { actionName: (event, target) => {} }
	function bindActions(handlers) {
		for (const root of [header, main]) {
			root.addEventListener("click", (event) => {
				const target = event.target.closest("[data-action]")
				if (!target) return
				handlers[target.dataset.action]?.(event, target)
			})
		}
	}

	return { render, renderHeader, focusPicker, bindActions }
}
