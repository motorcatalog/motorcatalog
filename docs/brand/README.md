# Brand

MotorCatalog looks like a classic service book made clean: oxblood and brass on a dark ground, with a warm serif for the name and a friendly sans for everything else.

**Tagline:** Your car's service history, in one place.

## Colours

| Role | Hex | Use |
|---|---|---|
| Ground | `#0B0D10` | Page background (dark mode first) |
| Surface | `#15181D` | Cards and rows |
| Border | `#2A2E35` | Hairlines |
| Text | `#F4F1EC` | Body text |
| Muted | `#A3A9B1` | Secondary text |
| Oxblood | `#A8322A` | Primary buttons and the car in the logo. Fill only |
| Brass | `#CFA45A` | Accents, the book in the logo, the second half of the wordmark |
| Brass dark | `#8C6A2C` | The rim around the book, and `Catalog` in the light-mode wordmark |

## Contrast rules

- Oxblood is a fill, never text on the ground: 2.9:1 fails. Light text on oxblood is 5.9:1.
- Brass works as text on the ground: 8.4:1. Dark text on brass is 8.4:1.
- Muted on the ground is 8.2:1.
- Brass dark works on both grounds: 5.0:1 on white and 3.9:1 on the dark ground. Plain brass on white is only 2.3:1, so it never carries text in light mode.
- "Overdue" and errors need their own brighter red, so a late service never looks like a brand button.

## Type

- **Fraunces 500:** the wordmark and headings.
- **Figtree 400:** body and UI.

Wordmark: `Motor` in text colour, `Catalog` in brass.

## Logo

A brass service book with an oxblood car on the cover and a dark combination wrench lying flat above the car. The cover is filled, not outlined, and has a brass-dark rim. That way one drawing works on light and dark surfaces alike.

The car gets its depth from flat shading, not blur, so it stays crisp at every size. These shades belong to the logo only, never the UI: oxblood shade `#7E2520` (lower body, door seam), oxblood highlight `#C9574B` (roofline), tail light `#E0573F`, a Text-coloured headlight, and a brass-dark ground shadow. The first outline sketch is kept as [`logo-sketch.svg`](logo-sketch.svg) for history.

| File | Use |
|---|---|
| [`logo.svg`](logo.svg) | Master mark on a transparent background |
| [`lockup-dark.svg`](lockup-dark.svg) | Mark and wordmark for dark backgrounds |
| [`lockup-light.svg`](lockup-light.svg) | Mark and wordmark for light backgrounds |
| [`favicon.svg`](favicon.svg), [`favicon.ico`](favicon.ico) | Browser tab. A simplified redraw on a 32 px grid, with 16, 32 and 48 px in the ICO |
| `icon-192.png`, `icon-512.png` | Manifest icons, `"purpose": "any"` |
| `icon-maskable-192.png`, `icon-maskable-512.png` | Manifest icons, `"purpose": "maskable"`, on an oxblood plate |
| `apple-touch-icon.png` | iOS home screen, 180 px, opaque |
| [`banner.svg`](banner.svg), `banner.png` | Repo social preview, 1280×640. Upload the PNG under Settings, General, Social preview |

Maskable source: [`logo-maskable.svg`](logo-maskable.svg). The book stays inside the safe zone (measured at 0.39 of the width, limit 0.40). Never combine `any` and `maskable` in one manifest entry.

The wordmark text is converted to outlines, so the lockups render without Fraunces installed. The banner's tagline is outlined Figtree for the same reason.
