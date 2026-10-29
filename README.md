<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/lockup-dark.svg">
    <img src="docs/brand/lockup-light.svg" alt="MotorCatalog" width="340">
  </picture>
</h1>

A digital service book for your car: log maintenance, repairs and costs, and keep the full history in one place.

**Try it:** [motorcatalog.github.io/motorcatalog](https://motorcatalog.github.io/motorcatalog/). Everything you enter stays in your own browser.

## Features

Implemented so far:

- **Local profiles:** create a profile on this device and keep each person's cars apart.
- **Garage and car details:** add cars, then open a car to see its make, model, year, fuel, registration number, VIN, odometer and EU inspection date.
- **Edit and delete cars:** change a car's details, or delete it with all its records after a confirmation.
- **Service history:** view a car's service, repair and other records newest first, and filter by category.
- **Register service:** record the category, work, date, odometer, cost, and optional workshop and notes. The car's odometer updates when a new record has a higher reading.
- **Cost total:** see the total spent on a car's service records from its details or service history.
- **EU inspection:** set the next EU inspection date and see on the car card whether it is OK, due soon (within three months) or overdue. A reminder shows at the top of the garage three, two and one month before, then every week until it is done. Mark it as done, and the next date is suggested two years on.
- **Export:** download every profile on this device, with its cars and service records, as one JSON file.

Planned for the first version:

- **Edit and delete service records:** fix or remove a record after it is saved.
- **Mileage checks:** see the same mileage everywhere, and get a warning before saving one that looks wrong.
- **Reminders:** see when the next service or tyre change is due, by date or by mileage.
- **Cost overview:** see what each car has cost per year and per category.
- **Import:** load an exported file to restore a backup or move your data to another device.
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

- `src/model/`: one plain object with the app's state and data. No functions, no DOM.
- `src/config.js`: fixed project setup, such as the currencies on offer.
- `src/view/`: renders HTML from the model and passes clicks on to the controller.
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
- We plan in short sprints, hold brief standups and close each sprint with a retro. The notes live in [`docs/retro/`](docs/retro/).
- Every change goes through a pull request and meets our Definition of Done before it merges to `main`.

## Status

Sprints 1 to 3 are done: profiles, the garage, car details, editing and deleting cars, service history, service registration, EU inspection dates with reminders, and export. Sprint 4 (2.11 to 8.11.2026) brings editing and deleting service records, and the mileage checks.

## License

[MIT](LICENSE)
