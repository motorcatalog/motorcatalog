// Preference storage and the theme model: the DOM-touching half of the locale
// standard (docs/specs/2026-10-01-locale-standard.md, section 5). The pure
// parts (language aliases, display names, money) live in libraries/i18n.
//
// One rule for every preference: value = stored key (if valid) ?? system value.
// System is the absence of the key, never a stored "system" string, so a user
// who clears site data lands on System for free. Storage can fail (Safari
// private mode throws on setItem, a user can disable storage entirely); every
// helper catches and behaves as System. No message is shown: nothing the user
// asked for has failed, and the model still holds the choice for the open page.
//
// Usage (an ES module, imported by a controller):
//   import { readPreference, writePreference, initTheme, THEMES } from "./design-system/theme/preferences.js";
//   const theme = readPreference("theme", THEMES);     // "light" | "dark" | null
//   writePreference("theme", "");                      // the System row: removes the key
//   const stop = initTheme();                          // apply + follow the OS and other tabs

export const THEMES = Object.freeze(["light", "dark"]);

const LIGHT_QUERY = "(prefers-color-scheme: light)";

// One accessor so a Node test can stub globalThis.localStorage, and so a
// browser that throws on the property itself (storage disabled) reads as absent.
function storage() {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

// The stored value when it is one of `valid`, otherwise null. Anything else
// (an old "no", a typo, a value from another project on the same origin) is
// removed on first read, so an existing key always holds a real option.
export function readPreference(key, valid) {
	const store = storage();
	if (!store) return null;
	try {
		const value = store.getItem(key);
		if (value === null) return null;
		if (valid.includes(value)) return value;
		store.removeItem(key);
		return null;
	} catch {
		return null;
	}
}

// Stores a choice, or removes the key for "" or null (the System row).
export function writePreference(key, value) {
	const store = storage();
	if (!store) return;
	try {
		if (value === "" || value === null || value === undefined) store.removeItem(key);
		else store.setItem(key, value);
	} catch {
		// Storage refused the write; the model keeps the choice for this page.
	}
}

function lightQuery() {
	return typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(LIGHT_QUERY) : null;
}

// Dark when the query is unsupported, matching the DS default.
export function systemTheme() {
	return lightQuery()?.matches ? "light" : "dark";
}

// Sets data-theme from the stored value, or the system value when none.
export function applyTheme(stored) {
	document.documentElement.dataset.theme = stored ?? systemTheme();
}

// Follows prefers-color-scheme while no key is stored. Returns an unsubscribe.
export function watchSystemTheme(onChange) {
	const query = lightQuery();
	if (!query) return () => {};
	const handler = () => {
		if (readPreference("theme", THEMES) === null) onChange(systemTheme());
	};
	query.addEventListener("change", handler);
	return () => query.removeEventListener("change", handler);
}

// Re-applies when another tab changes or clears the theme key (a null key is
// a storage.clear()). Returns an unsubscribe.
export function watchStorage(onChange) {
	const handler = (event) => {
		if (event.key === "theme" || event.key === null) onChange(readPreference("theme", THEMES));
	};
	globalThis.addEventListener("storage", handler);
	return () => globalThis.removeEventListener("storage", handler);
}

// The convenience most apps want: apply once, then keep following the OS and
// other tabs. The inline head snippet already set the first paint; this keeps
// it right afterwards. Returns one unsubscribe for both watchers.
export function initTheme() {
	applyTheme(readPreference("theme", THEMES));
	const stopSystem = watchSystemTheme(() => applyTheme(null));
	const stopStorage = watchStorage((stored) => applyTheme(stored));
	return () => {
		stopSystem();
		stopStorage();
	};
}
