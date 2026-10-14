/*
 * Picker behaviour for details[data-picker] (components/picker.css).
 * Without this script the disclosure still opens and closes. With it: opening
 * focuses the active row, the arrow keys move and wrap, Home/End jump, Escape
 * closes and refocuses the trigger, a pointer-down outside or focus leaving
 * closes without moving focus, choosing a row closes, and only one picker is
 * open at a time.
 *
 * One set of delegated listeners on document, like theme-toggle.js. Nothing is
 * wired per node, so a view that re-renders its header needs no rewiring and
 * nothing double-binds. Rows may be <button> (an app) or <a> (a per-URL site).
 * Ported from Rookdex's language-menu.ts.
 */
(function () {
	var root = document.documentElement;
	if (root.dataset.pickerWired === "true") return;
	root.dataset.pickerWired = "true";

	var PICKER = "details[data-picker]";

	function rows(details) {
		return Array.prototype.slice.call(details.querySelectorAll(".picker-row"));
	}

	function close(details, refocus) {
		if (!details.open) return;
		details.open = false;
		if (refocus) {
			var summary = details.querySelector("summary");
			if (summary) summary.focus();
		}
	}

	function closeOthers(except) {
		document.querySelectorAll(PICKER + "[open]").forEach(function (details) {
			if (details !== except) close(details, false);
		});
	}

	function pickerOf(node) {
		return node && node.closest ? node.closest(PICKER) : null;
	}

	// The list is anchored to the trigger's right edge (picker.css). A picker
	// that is not the rightmost one can still push its list off the left of a
	// 320px viewport, so the open list is shifted right by the overflow and
	// the shift is cleared on close.
	var EDGE_GAP = 8;
	function keepInView(details) {
		var list = details.querySelector(".picker-list");
		if (!list) return;
		list.style.translate = "";
		var overflow = EDGE_GAP - list.getBoundingClientRect().left;
		if (overflow > 0) list.style.translate = overflow + "px 0";
	}

	// toggle does not bubble, so it is caught in the capture phase.
	document.addEventListener(
		"toggle",
		function (event) {
			var details = event.target;
			if (!details.matches || !details.matches(PICKER)) return;
			if (!details.open) {
				var list = details.querySelector(".picker-list");
				if (list) list.style.translate = "";
				return;
			}
			closeOthers(details);
			keepInView(details);
			var list = rows(details);
			var active = null;
			for (var i = 0; i < list.length; i++) {
				if (list[i].hasAttribute("aria-current")) {
					active = list[i];
					break;
				}
			}
			var target = active || list[0];
			if (target) target.focus();
		},
		true,
	);

	document.addEventListener("keydown", function (event) {
		var details = pickerOf(event.target);
		if (!details || !details.open) return;
		if (event.key === "Escape") {
			event.preventDefault();
			close(details, true);
			return;
		}
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
		event.preventDefault();
		var list = rows(details);
		if (!list.length) return;
		var at = list.indexOf(document.activeElement);
		var next;
		if (event.key === "Home") next = 0;
		else if (event.key === "End") next = list.length - 1;
		else {
			var step = event.key === "ArrowDown" ? 1 : -1;
			next = at === -1 ? (step === 1 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
		}
		list[next].focus();
	});

	// A pointer-down outside every picker closes the open one without moving focus.
	document.addEventListener("pointerdown", function (event) {
		if (pickerOf(event.target)) return;
		closeOthers(null);
	});

	// Choosing a row closes its picker. The app's own click handler for the row
	// (a controller listening on document) still runs: nothing is stopped here.
	document.addEventListener("click", function (event) {
		var details = pickerOf(event.target);
		if (!details || !event.target.closest(".picker-row")) return;
		close(details, false);
	});

	// A null relatedTarget (the window lost focus, or Safari clicked a button
	// without focusing it) is left to the pointer-down handler.
	document.addEventListener("focusout", function (event) {
		var details = pickerOf(event.target);
		if (!details || !details.open) return;
		var to = event.relatedTarget;
		if (to && !details.contains(to)) close(details, false);
	});
})();
