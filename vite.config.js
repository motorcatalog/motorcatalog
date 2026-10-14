/* ======================================================================
   vite.config.js
   The Tailwind plugin compiles src/styles/index.css.
   - base: only needed when deploying (e.g., GitHub Pages base path).
   ====================================================================== */

import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [tailwindcss()],
	// If you deploy to GitHub Pages under a repo name, set:
	// base: '/your-repo-name/',
})
