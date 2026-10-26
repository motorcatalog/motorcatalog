/* ======================================================================
   tests/brand-icons.test.js: the app icons are the brand icons
   docs/brand/ is the source of truth. Vite only serves public/, so the
   icons are copied there. This test fails when a copy drifts or the
   manifest points at a file that is not there. After a logo change, copy
   the files from docs/brand/ into public/ again.
   ====================================================================== */

import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { test } from "node:test"

const ICONS = [
	"favicon.ico",
	"favicon.svg",
	"apple-touch-icon.png",
	"icon-192.png",
	"icon-512.png",
	"icon-maskable-192.png",
	"icon-maskable-512.png",
]

const root = new URL("../", import.meta.url)
const read = (path) => readFileSync(new URL(path, root))

for (const name of ICONS) {
	test(`public/${name} is identical to docs/brand/${name}`, () => {
		assert.ok(read(`public/${name}`).equals(read(`docs/brand/${name}`)))
	})
}

// Paths are relative to the manifest, so the app also installs from a
// sub-path such as motorcatalog.github.io/motorcatalog/.
test("every manifest icon exists, and no entry mixes any and maskable", () => {
	const manifest = JSON.parse(read("public/manifest.webmanifest"))
	assert.equal(manifest.start_url, "./")
	for (const icon of manifest.icons) {
		assert.ok(!icon.src.startsWith("/"), `${icon.src} is not relative`)
		assert.ok(existsSync(new URL(`public/${icon.src}`, root)), `${icon.src} is missing`)
		assert.ok(["any", "maskable"].includes(icon.purpose), `${icon.src}: ${icon.purpose}`)
	}
})
