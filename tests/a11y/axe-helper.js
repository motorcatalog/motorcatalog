/* ======================================================================
   tests/a11y/axe-helper.js — Layer 1 accessibility helpers
   Renders into a jsdom document and runs axe-core on a fragment with the
   PAGE-LEVEL rules disabled. A component test checks the fragment's own
   accessibility (roles, names, labels, structure); whole-document rules
   (lang, title, single main landmark, region, bypass, one h1) belong to
   Layer 2 — the Pa11y scan in .pa11yci.json checks the real built page.
   This is intentional scoping, not suppression.
   ====================================================================== */

import axe from "axe-core"
import { JSDOM } from "jsdom"

const PAGE_LEVEL_RULES = {
	region: { enabled: false },
	"landmark-one-main": { enabled: false },
	"page-has-heading-one": { enabled: false },
	"html-has-lang": { enabled: false },
	"document-title": { enabled: false },
	bypass: { enabled: false },
	// jsdom has no layout engine, so colour contrast cannot be measured here.
	// Pa11y measures it in a real browser.
	"color-contrast": { enabled: false },
}

// A fresh document per test. `header` and `mount` mirror the app shell's
// <header id="header"> and <main id="main">, so the view can be rendered
// exactly as it is in index.html; `body` scans both at once.
export function createMount(lang = "en") {
	const dom = new JSDOM(
		`<!doctype html><html lang="${lang}"><head><title>test</title></head>` +
			`<body><header id="header"></header><main id="main"></main></body></html>`,
		{ runScripts: "outside-only" }
	)
	// axe must run inside the document's own window, so it is injected the
	// same way Pa11y injects it into a browser page.
	dom.window.eval(axe.source)
	const { document } = dom.window
	return {
		body: document.body,
		header: document.getElementById("header"),
		mount: document.getElementById("main"),
		close: () => dom.window.close(),
	}
}

// Returns axe violations for the node, trimmed to what a failure needs to
// show: the rule id, the help text and the offending selectors. An empty
// array means no violations.
export async function axeComponent(node) {
	const { axe: axeInWindow } = node.ownerDocument.defaultView
	const { violations } = await axeInWindow.run(node, { rules: PAGE_LEVEL_RULES })
	// Array.from copies out of the jsdom realm, so assert.deepEqual compares
	// plain arrays instead of failing on a foreign Array prototype.
	return Array.from(violations, ({ id, help, nodes }) => ({
		id,
		help,
		targets: Array.from(nodes, (n) => n.target.join(" ")),
	}))
}
