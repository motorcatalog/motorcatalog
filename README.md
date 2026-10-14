<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/lockup-dark.svg">
    <img src="docs/brand/lockup-light.svg" alt="MotorCatalog" width="340">
  </picture>
</h1>

A digital service book for your car: log maintenance, repairs and costs, and keep the full history in one place.

## Features

The first version will cover:

- **Local profiles:** create a profile on this device and keep each person's cars apart.
- **Garage:** add one or more vehicles with make, model, year and registration number.
- **Service log:** record every service and repair with date, mileage, workshop, work done and price.
- **Reminders:** see when the next service, EU inspection or tyre change is due, by date or by mileage.
- **Cost overview:** see what each car has cost per year and per category.
- **Export:** download your data as a file to keep a backup or move it to another device.
- **Offline:** install it on your phone as a PWA and use it without a connection.

## Your data

Everything is stored in your browser's localStorage. Nothing is sent to a server.

Profiles keep data apart on a shared device. They are not a security feature: anyone with access to the browser can read what is stored there. Use export to keep a backup, since clearing site data deletes it.

## Stack

- Vite
- JavaScript (ES modules)
- Tailwind CSS
- localStorage
- PWA (web app manifest and service worker)
- Biome and node's built-in test runner

The app follows MVC. The model holds data only, views render it, and controllers handle input and update the model.

## Setup

You need Node 22.13 or newer.

```bash
npm install
npm run dev
```

`npm install` also downloads a Chrome for the browser tests (about 190 MB, once).

We use VS Code. Install the recommended extensions when it asks (Biome, Tailwind CSS IntelliSense and EditorConfig). Biome then formats and sorts imports on save.

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Build to `dist/` |
| `npm run preview` | Serve the build |
| `npm test` | All tests: model, controller, view, accessibility, Tailwind guard, icons and the browser tests |
| `npm run check` | Format, lint and sort imports with Biome |

## Languages

The UI is in English and Norwegian (bokmål). English is the default. The language picker in the header switches between them, and the choice is remembered on this device.

All UI text lives in `src/locales/en.json` and `src/locales/nb.json`. Both files must have the same keys, and a test fails if they drift. In the view, text goes through `t("key")`, never as a literal.

## Project structure

- `src/model/`: state and data. No DOM.
- `src/view/`: renders HTML from state and passes clicks on to the controller.
- `src/controller/`: handles input and updates the model.
- `src/locales/`: UI text, one file per language.
- `src/styles/index.css`: the CSS entry. Design system, brand palette and Tailwind.
- `src/styles/palette.css`: our brand colours and fonts.
- `src/styles/main.css`: project styles that Tailwind classes do not cover.
- `design-system/` and `i18n/`: shared foundation from my workbench. Read-only, never edit them here.
- `public/`: icons and the web app manifest. The icons are copies from `docs/brand/`.
- `tests/`: node's built-in test runner.

## Styling with Tailwind

Tailwind's default colours (`bg-zinc-900`, `text-red-500` ...) are switched off. Use our names instead, so light and dark mode both work:

| Brand role | Class |
|---|---|
| Ground (page) | `bg-background` |
| Surface (cards, rows) | `bg-card` |
| Text | `text-foreground` |
| Muted text | `text-muted-foreground` |
| Border | `border-border` |
| Oxblood (primary buttons, fill only) | `bg-primary text-primary-foreground` or `bg-oxblood` |
| Brass (accents, highlight text) | `text-brass` |
| Overdue and errors | `text-danger`, `bg-danger-soft` |
| Fraunces (headings) | `font-heading` |

Headings (`h1` to `h4`) already use Fraunces. Colours and contrast rules: [`docs/brand/README.md`](docs/brand/README.md).

## How we work

- User stories live as issues on our GitHub Projects board.
- We plan in short sprints, hold brief standups and close with a retro.
- Every change goes through a pull request and meets our Definition of Done before it merges to `main`.

## Status

Sprint 1: the scaffold is in place; the first features are next.
