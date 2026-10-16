/* ======================================================================
   src/data/plates.js: REGISTRATION PLATE RULES
   One rule per country, by ISO 3166 code ("XK" is Kosovo's user-assigned
   code). It caps what the registration number field takes, so it covers
   every private car plate still on the road, personalised plates too:
     min, max  letters and digits on a plate, spaces and hyphens not counted
     letters   letters beyond A-Z that plates may use
     example   a standard plate as printed, shown as the field's example
   Not an exact pattern per country: formats change, and old plates stay.
   Sources: Wikipedia, "Vehicle registration plates of <country>" (10.2026).
   Japan is left out: its plates use kana, so there is no cap to give.
   ====================================================================== */

export const PLATES = Object.freeze({
	// Current: 1 letter + 4 digits; pre-2011 plates printed AND + 4 digits, so 7 allows typing the AND
	AD: { min: 1, max: 7, letters: "", example: "A1234" },
	// Standard 7; personalised 5-7; plates of 4 or fewer characters are sold at auction (e.g. 7777)
	AL: { min: 1, max: 7, letters: "", example: "AA 123 AA" },
	// Standard 7 (2 digits, 2 letters, 3 digits); personalised rules not verified
	AM: { min: 6, max: 7, letters: "", example: "12 AB 345" },
	// District code 1-2 letters + 3-6 chars (6 only with 1-letter codes); personalised same cap, no umlauts
	AT: { min: 4, max: 7, letters: "", example: "GU 123 AB" },
	// Varies by state; 7 is the highest (WA standard, SA/QLD/ACT/NT custom); NSW and VIC custom mostly 6
	AU: { min: 1, max: 7, letters: "", example: "AB 12 CD" },
	// Region 2 digits + 2 letters + 3 digits; personalised rules not verified
	AZ: { min: 6, max: 7, letters: "", example: "10-AB-123" },
	// Always 7; only A E J K M O T (shared with Cyrillic, so Cyrillic input may occur); no personalised plates
	BA: { min: 7, max: 7, letters: "АЕЈКМОТ", example: "A12-K-345" },
	// Standard 7 (older 6); personalised 1-8 characters with at least one letter
	BE: { min: 1, max: 8, letters: "", example: "1-ABC-123" },
	// Cyrillic plates using only the 12 Latin-lookalike letters; personalised = region code + exactly 6 chars
	BG: { min: 6, max: 8, letters: "АВЕКМНОРСТУХ", example: "CA 1234 AB" },
	// Cyrillic plates using Latin-lookalike letters only; 4 digits + 2 letters + region digit
	BY: { min: 6, max: 7, letters: "АВЕІКМНОРСТХ", example: "1234 AB-7" },
	// Varies by province; Ontario personalised 2-8 is the highest, most others 7; Alberta allows 1
	CA: { min: 1, max: 8, letters: "", example: "ABCD 123" },
	// Canton code 2 letters + 1-6 digits; chosen numbers only, no free text
	CH: { min: 3, max: 8, letters: "", example: "ZH 123456" },
	// Latin letters shared with Greek (Greek keyboards may type them); older plates 2 letters + 3 digits; no free text
	CY: { min: 5, max: 6, letters: "ΑΒΕΗΙΚΜΝΟΡΤΥΧΖ", example: "ABC 123" },
	// Standard 5-8 (usually 7); personalised exactly 8 with at least one digit; no diacritics
	CZ: { min: 5, max: 8, letters: "", example: "1AB 2345" },
	// Max 8 including district code and H/E suffix; umlauts only in district codes (e.g. GÖ, SÄK)
	DE: { min: 3, max: 8, letters: "ÄÖÜ", example: "M AB 1234" },
	// Personalised 2-7 characters; sources disagree on whether Æ Ø Å are allowed, kept to be safe
	DK: { min: 2, max: 7, letters: "ÆØÅ", example: "AB 12 345" },
	// Standard 6; custom plates up to 9 letters+digits with at least one digit after the letters
	EE: { min: 2, max: 9, letters: "", example: "123 ABC" },
	// Current 7; old provincial plates up to 8 (e.g. GR 1234 AB); historic H prefix 8; no personalised
	ES: { min: 5, max: 8, letters: "", example: "1234 BCD" },
	// 2-3 letters + 1-3 digits for standard and personalised; Å Ä Ö reported allowed on personalised
	FI: { min: 3, max: 6, letters: "ÅÄÖ", example: "ABC-123" },
	// Current SIV 7; older FNI plates (e.g. 1234 AB 75) up to 8 still on the road; no personalised
	FR: { min: 4, max: 8, letters: "", example: "AB-123-CD" },
	// Current 7; cherished and dateless plates 2-7; Northern Ireland ABZ 1234 also 7
	GB: { min: 2, max: 7, letters: "", example: "AB12 CDE" },
	// Current 7, older ABC-123 6; personalised rules not verified
	GE: { min: 6, max: 7, letters: "", example: "AB-123-CD" },
	// Greek letters that look like Latin ones only; Greek keyboards may type them; no personalised
	GR: { min: 5, max: 7, letters: "ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ", example: "ABE-1234" },
	// Area code + 3-7 chars on personalised; Č Š Ž only in area codes (ČK, ŠI, VŽ, PŽ, KŽ, ŽU)
	HR: { min: 5, max: 9, letters: "ČŠŽ", example: "ZG 1234-AB" },
	// Current 7, older ABC-123 6; personalised 7 (3-6 letters + 1-4 digits), no accented letters
	HU: { min: 6, max: 7, letters: "", example: "AA AA-123" },
	// Year+half (2-3 digits) + county (1-2 letters) + 1-6 digits; no free-text plates
	IE: { min: 3, max: 11, letters: "", example: "241-D-12345" },
	// Standard 5; personalised 2-6 Icelandic letters and digits
	IS: { min: 2, max: 6, letters: "ÁÐÉÍÓÚÝÞÆÖ", example: "AB 123" },
	// Current 7; pre-1994 provincial plates up to 8; pre-1985 ROMA + 6 chars = 10; no personalised
	IT: { min: 3, max: 10, letters: "", example: "AB 123 CD" },
	// FL + 1-5 digits
	LI: { min: 3, max: 7, letters: "", example: "FL 12345" },
	// Standard 6; personalised 1-6 with at least one digit; Lithuanian diacritics not confirmed
	LT: { min: 1, max: 6, letters: "", example: "ABC 123" },
	// Standard 2 letters + 4 digits; chosen 4-5 digit numbers; low numeric plates from older series
	LU: { min: 1, max: 6, letters: "", example: "AB 1234" },
	// Standard 6; personalised 2-8 symbols; Latvian diacritics not confirmed
	LV: { min: 2, max: 8, letters: "", example: "AB-1234" },
	// Up to 4 characters, the shortest in Europe
	MC: { min: 1, max: 4, letters: "", example: "A123" },
	// Standard 6; personalised 3 letters + 1-3 digits; some 4-letter plates exist (7)
	MD: { min: 4, max: 7, letters: "", example: "ABC 123" },
	// Standard 7; customised plates allowed but length not documented, 8 is a guess; diacritics in codes (ŽB, ŠN, PŽ) and custom plates
	ME: { min: 4, max: 8, letters: "ČĆĐŠŽ", example: "PG AB 123" },
	// Current 8; 1993-2012 plates still valid (code ŠT for Štip); vanity plates exist, length not documented
	MK: { min: 6, max: 8, letters: "Š", example: "SK 1234 AB" },
	// Standard 6; customised plates up to 9 letters and digits
	MT: { min: 1, max: 9, letters: "", example: "ABC 123" },
	// Always 6 characters in varying side-codes; no personalised
	NL: { min: 6, max: 6, letters: "", example: "AB-123-C" },
	// Standard 7; personalised 2-7 Norwegian letters or digits
	NO: { min: 2, max: 7, letters: "ÆØÅ", example: "AB 12345" },
	// Standard 6; personalised 1-6
	NZ: { min: 1, max: 6, letters: "", example: "ABC123" },
	// Standard 7-8 (2-3 letter district code); personalised 5-7 (voivodeship letter + digit + 3-5 chars)
	PL: { min: 5, max: 8, letters: "", example: "WA 12345" },
	// Always 6 in pairs; no personalised
	PT: { min: 6, max: 6, letters: "", example: "AA-00-AA" },
	// County code 1-2 letters + 2-3 digits + 3 letters; personalised only within this format
	RO: { min: 6, max: 7, letters: "", example: "B 123 ABC" },
	// Latin plates (Cyrillic only in badge); diacritics in city codes (ČA, ŠA, ĆU) and pre-2017 serials; personalised city + 3-5
	RS: { min: 5, max: 8, letters: "ČĆĐŠŽ", example: "BG 123-AB" },
	// Cyrillic plates using the 12 Latin-lookalike letters; region code 2-3 digits
	RU: { min: 8, max: 9, letters: "АВЕКМНОРСТУХ", example: "А 123 ВС 77" },
	// Standard 6; personalised 2-7 with Å Ä Ö allowed
	SE: { min: 2, max: 7, letters: "ÅÄÖ", example: "ABC 12D" },
	// Standard 7; personalised area code + 3-6 chars; Č Š Ž not allowed
	SI: { min: 5, max: 8, letters: "", example: "LJ 12-ABC" },
	// Standard 7 (old district format also 7); personalised exactly 7 since 2023, no diacritics
	SK: { min: 6, max: 7, letters: "", example: "AB 123CD" },
	// Usually 1 letter + up to 4 digits; custom plates since 2004, length not documented
	SM: { min: 1, max: 5, letters: "", example: "A1234" },
	// Province 2 digits + 1-3 letters + 2-5 digits; no Turkish letters (Ç Ğ İ Ö Ş Ü) used
	TR: { min: 7, max: 8, letters: "", example: "34 ABC 123" },
	// Standard uses Latin-lookalike Cyrillic; individual plates 3-8 and may use any Ukrainian letter
	UA: { min: 3, max: 8, letters: "АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ", example: "АА 1234 ВВ" },
	// Varies by state; 8 is the highest (New York, Indiana), most states 7; some allow 1
	US: { min: 1, max: 8, letters: "", example: "ABC 1234" },
	// SCV (official) or CV (residents) + 5 digits
	VA: { min: 4, max: 8, letters: "", example: "CV 03566" },
	// Current 7; older UNMIK plates (123KS456) were 8; XK is a user-assigned code, not official ISO
	XK: { min: 7, max: 8, letters: "", example: "01-123-AB" },
})
