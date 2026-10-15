/* ======================================================================
   tests/model.test.js: the model is one plain object
   docs/design/data-model.md is the source of truth for the shape. These
   tests guard the MVC rule: model.js exports data and nothing else, so
   behaviour can only live in the controller.
   ====================================================================== */

import assert from "node:assert/strict"
import { test } from "node:test"
import * as modelModule from "../src/model/model.js"

const { model } = modelModule

// The path of every function in the object, at any depth.
function functionsIn(value, path = "model") {
	if (typeof value === "function") return [path]
	if (!value || typeof value !== "object") return []
	return Object.entries(value).flatMap(([key, child]) => functionsIn(child, `${path}.${key}`))
}

test("model.js exports one object named model and nothing else", () => {
	assert.deepEqual(Object.keys(modelModule), ["model"])
})

test("the model has exactly app, inputs and data", () => {
	assert.deepEqual(Object.keys(model), ["app", "inputs", "data"])
})

test("the model holds no functions at any depth", () => {
	// The guard itself goes red on a nested function.
	assert.deepEqual(functionsIn({ app: { save: () => {} } }), ["model.app.save"])
	assert.deepEqual(functionsIn(model), [])
})

test("the model is plain data: it survives a JSON round trip unchanged", () => {
	assert.deepEqual(JSON.parse(JSON.stringify(model)), model)
})

test("saved data starts empty at version 1 with no active profile", () => {
	assert.deepEqual(model.data, {
		version: 1,
		activeProfileId: null,
		profiles: [],
		cars: [],
		serviceEntries: [],
		tasks: [],
	})
})

test("preferences start with nothing chosen, so every one follows the system", () => {
	assert.deepEqual(model.app.preferences.chosen, { lang: null, theme: null, currency: null })
	assert.deepEqual(Object.keys(model.app.preferences.system), ["lang", "theme", "currency"])
})

test("form inputs start as strings, exactly as an empty form shows them", () => {
	for (const form of ["profile", "car", "serviceEntry", "task"]) {
		for (const [field, value] of Object.entries(model.inputs[form])) {
			assert.equal(typeof value, "string", `inputs.${form}.${field}`)
		}
	}
})
