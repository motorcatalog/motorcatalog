/* ======================================================================
   tests/fixtures.js — shared test data
   The app offers NOK only, so the currency picker stays hidden. The
   picker code is kept for the day we add a currency, and these tests
   keep it working by feeding it the scaffold's three-currency config.
   ====================================================================== */

import { config } from "../src/model/model.js"

export const MULTI_CURRENCY = Object.freeze({
	...config,
	currencies: ["NOK", "EUR", "USD"],
	regions: { NO: "NOK", FI: "EUR", DE: "EUR", FR: "EUR", ES: "EUR", NL: "EUR", US: "USD" },
	flags: { NOK: "no", EUR: "eu", USD: "us" },
})
