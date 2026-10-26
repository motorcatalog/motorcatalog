/* ======================================================================
   src/config.js: PROJECT CONFIG
   What the project offers. Fixed setup, not state, so it lives outside
   the model. A picker renders only when a list here has more than one
   entry. `regions` maps the region of a navigator.languages entry to a
   currency and lists only regions whose currency is in `currencies`.
   `flags` names the design-system/assets/flags/<cc>.svg file per currency.
   ====================================================================== */

export const SERVICE_CATEGORIES = Object.freeze(["service", "repair", "other"])

export const config = Object.freeze({
	// Service costs are in NOK only, so the currency picker stays hidden.
	currencies: ["NOK"],
	baseCurrency: "NOK",
	regions: { NO: "NOK" },
	flags: { NOK: "no" },
	serviceCategories: SERVICE_CATEGORIES,
	// A profile name is trimmed and at most this many characters.
	profileNameMax: 40,
	// The car form (docs/design/data-model.md, Car). The last allowed year
	// is next year, worked out when the form is saved.
	fuels: ["petrol", "diesel", "electric", "hybrid", "other"],
	carNicknameMax: 40,
	carYearMin: 1900,
	carMileageMax: 10_000_000,
	// An EU-kontroll is due soon this many calendar months before its date.
	euDueSoonMonths: 3,
	// Mark done suggests the next EU-kontroll this many months after the last.
	euInspectionIntervalMonths: 24,
})
