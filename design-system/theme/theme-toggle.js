/*
 * Theme control: click handler plus the two listeners that keep System live.
 * The initial theme is set by the inline <head> snippet to avoid a flash
 * (theme/theme-init-snippet.html).
 *
 * Markup: any element with data-theme-set="light" | "dark" | "system".
 * "system" removes the stored key and applies prefers-color-scheme; while no
 * key is stored the page keeps following the OS, and a change in another tab
 * is applied here too.
 *
 * This is a classic script (loaded via <script src>), so it cannot import
 * theme/preferences.js; the few lines of read, write and resolve logic are
 * repeated here on purpose and must stay in step with that module.
 *
 * [data-theme-toggle] (cycle light and dark) is kept for consumers that have
 * not migrated. Deprecated since 3.8.0, removed in DS 4.0.0; logs nothing.
 */
(function () {
	var THEMES = ["light", "dark"];
	var LIGHT_QUERY = "(prefers-color-scheme: light)";

	function systemTheme() {
		return typeof matchMedia === "function" && matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
	}
	function stored() {
		try {
			var value = localStorage.getItem("theme");
			return THEMES.indexOf(value) === -1 ? null : value;
		} catch (e) {
			return null;
		}
	}
	function write(value) {
		try {
			if (value) localStorage.setItem("theme", value);
			else localStorage.removeItem("theme");
		} catch (e) {
			// Storage refused; the page still shows the choice.
		}
	}
	function apply(value) {
		document.documentElement.dataset.theme = value || systemTheme();
	}

	document.addEventListener("click", function (event) {
		var set = event.target.closest("[data-theme-set]");
		if (set) {
			var next = set.dataset.themeSet;
			if (next === "system" || next === "") {
				write(null);
				apply(null);
			} else if (THEMES.indexOf(next) !== -1) {
				write(next);
				apply(next);
			}
			return;
		}

		// Deprecated path: [data-theme-toggle] cycles light and dark.
		var toggle = event.target.closest("[data-theme-toggle]");
		if (!toggle) return;
		var flipped = document.documentElement.dataset.theme === "light" ? "dark" : "light";
		write(flipped);
		apply(flipped);
	});

	// Follow the OS while no key is stored.
	if (typeof matchMedia === "function") {
		var query = matchMedia(LIGHT_QUERY);
		if (typeof query.addEventListener === "function") {
			query.addEventListener("change", function () {
				if (stored() === null) apply(null);
			});
		}
	}

	// Another tab changed or cleared the key (a null key is a storage.clear()).
	addEventListener("storage", function (event) {
		if (event.key === "theme" || event.key === null) apply(stored());
	});
})();
