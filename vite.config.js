/* ======================================================================
   vite.config.js
   The Tailwind plugin compiles src/styles/index.css.
   - base "./": every built URL is relative, so the same build runs on
     GitHub Pages under /motorcatalog/ and on localhost.
   ====================================================================== */

import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [tailwindcss()],
	base: "./",
})
