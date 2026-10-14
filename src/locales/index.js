/* ======================================================================
   src/locales/index.js — UI STRINGS
   One JSON bundle per language, flat "section.key" → string. Every bundle
   carries the same keys (tests/locales.test.js enforces it). To add a
   language: copy en.json, translate every value, register it below.
   ====================================================================== */

import en from "./en.json" with { type: "json" }
import nb from "./nb.json" with { type: "json" }

export const bundles = { en, nb }
export const FALLBACK_LANG = "en"
