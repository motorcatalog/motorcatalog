/* ======================================================================
   src/app.js — APP WIRING
   Connects model, view, and controller. Rarely edited — day-to-day work
   happens in src/model, src/view, and src/controller.
   ====================================================================== */

import { createTranslator } from "../i18n/index.js"
import { createController, readPreferences } from "./controller/controller.js"
import { bundles, FALLBACK_LANG } from "./locales/index.js"
import { config, createModel } from "./model/model.js"
import { createView } from "./view/view.js"

export function createApp() {
	// If you rename the root elements in index.html, update them here once.
	const header = document.getElementById("header")
	const main = document.getElementById("main")
	if (!header || !main) throw new Error("Missing #header or #main element in index.html")

	const i18n = createTranslator(bundles, { fallback: FALLBACK_LANG })
	const { chosen, system } = readPreferences({ i18n, config })
	const model = createModel({ chosen, system, languages: i18n.languages })
	const view = createView({ header, main }, i18n)
	const controller = createController({ model, view, i18n })

	controller.init()
}
