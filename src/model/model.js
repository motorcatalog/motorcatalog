/* ======================================================================
   src/model/model.js: MODEL
   One plain object and nothing else: no functions, no classes, no DOM.
   The controller is the only code that changes it, and the view only
   reads it. The shape is documented in docs/design/data-model.md.

     app     what is on screen right now
     inputs  what is typed into the open form, as strings
     data    what is saved to localStorage

   Preferences follow one rule: the value used is chosen ?? system.
   System is the absence of a choice (null here, no key in storage),
   never a stored "system" string. The controller saves them under their
   own keys, because they belong to the device and not to a profile.
   ====================================================================== */

export const model = {
	app: {
		page: "garage", // garage | carForm | car | history | maintenance | costs | profiles
		selectedCarId: null,
		historyFilter: "all", // all | service | repair | other
		costsYear: null, // null = the current year
		preferences: {
			chosen: { lang: null, theme: null, currency: null }, // null = follow the system
			system: { lang: "en", theme: "dark", currency: "NOK" },
		},
	},
	inputs: {
		profile: { name: "" },
		car: {
			nickname: "",
			make: "",
			model: "",
			year: "",
			regNumber: "",
			vin: "",
			fuel: "petrol",
			engine: "",
			mileage: "",
			euInspectionDue: "",
		},
		serviceEntry: {
			category: "service",
			title: "",
			date: "",
			mileage: "",
			cost: "",
			workshop: "",
			notes: "",
		},
		task: { title: "", dueDate: "", dueMileage: "", repeatMonths: "", repeatKm: "" },
		editingId: null, // the id being edited, or null when adding
		errors: {}, // field name to error text key
	},
	data: {
		version: 1,
		activeProfileId: null,
		profiles: [],
		cars: [],
		serviceEntries: [],
		tasks: [],
	},
}
