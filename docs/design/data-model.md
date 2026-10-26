# Data model

The shape of `src/model/model.js`: what MotorCatalog stores, what is only screen state, and what is worked out on the fly. We designed it from the mockups in [`mockups/`](mockups/) and the feature list in the README.

Status: approved 15.10.2026. The code follows it.

## The MVC rule

`model.js` exports one plain object and nothing else. No functions, no classes, no DOM.

```js
export const model = {
  app: { ... },    // what is on screen right now
  inputs: { ... }, // what is typed into the open form
  data: { ... },   // what is saved to localStorage
}
```

- The **controller** is the only code that changes `model`. After a change it saves `model.data` if needed and calls its `render()`, which hands `model` and `derived` to the view. `derived` holds the values worked out from the model (see [Derived values](#derived-values)).
- The **view** reads `model` and renders HTML. It never changes `model`.
- Anything that can be worked out from stored data is **not** stored. The controller computes it when it is needed (see [Derived values](#derived-values)).
- Fixed project setup, such as the currencies on offer, lives in `src/config.js`. It is not state.

## Entities

```mermaid
erDiagram
  PROFILE ||--o{ CAR : owns
  CAR ||--o{ SERVICE_ENTRY : "has history"
  CAR ||--o{ TASK : "has to-dos"
  PROFILE {
    string id PK
    string name
  }
  CAR {
    string id PK
    string profileId FK
    string nickname "optional"
    string make
    string model
    number year
    string regCountry
    string regNumber
    string vin "optional"
    string fuel
    string engine "optional"
    number mileage
    string euInspectionDue "optional"
    string euReminderDismissed "optional"
  }
  SERVICE_ENTRY {
    string id PK
    string carId FK
    string category
    string title
    string date
    number mileage
    number cost
    string workshop "optional"
    string notes "optional"
  }
  TASK {
    string id PK
    string carId FK
    string title
    string dueDate "optional"
    number dueMileage "optional"
    number repeatMonths "optional"
    number repeatKm "optional"
    string doneDate "optional"
    number doneMileage "optional"
  }
```

### Profile

A local profile that keeps one person's cars apart from another's on a shared device. It is not a login.

| Field | Type | Rules |
|---|---|---|
| `id` | string | From `crypto.randomUUID()` |
| `name` | string | Required, trimmed, at most 40 characters |

### Car

| Field | Type | Rules |
|---|---|---|
| `id` | string | From `crypto.randomUUID()` |
| `profileId` | string | The profile that owns the car |
| `nickname` | string or null | Optional, trimmed, at most 40 characters, first letter in capitals. When it is set it is the car's title, with make and model under it |
| `make` | string | Required, e.g. "Mercedes-Benz". Kept as typed. The form suggests a list of makes, but any make can be typed |
| `model` | string | Required, e.g. "C63 AMG". Kept as typed, so "e-tron" and "iX" stay right |
| `year` | number | 1900 to next year |
| `regCountry` | string | Required. The country the plate is from, as an ISO 3166 code like "NO". The form starts on Norway and suggests every country with a plate rule (`src/data/plates.js`) |
| `regNumber` | string | Required. Saved in capitals without spaces or hyphens ("ab 12345" becomes "AB12345"). Its letters, digits and length follow the plate rule of `regCountry` |
| `vin` | string or null | Optional. 17 characters, saved in capitals, letters and digits only, never I, O or Q. Shown beside the registration number when it is set |
| `fuel` | string | One of `petrol`, `diesel`, `electric`, `hybrid`, `other` |
| `engine` | string or null | Optional free text, first letter in capitals, e.g. "4.0 V8" |
| `mileage` | number | Whole km from 0 to 10 000 000. See [Mileage](#mileage) |
| `euInspectionDue` | string or null | Optional. Date of the next EU inspection (EU-kontroll), from a native date input. A past date is allowed: the car is then overdue. Cars saved before the field existed lack it, and a missing value reads as null |
| `euReminderDismissed` | string or null | The start date of the EU-kontroll reminder the user dismissed, or null. See [EU-kontroll reminders](#eu-kontroll-reminders). Cars saved before the field existed lack it, and a missing value reads as null, so `version` stays 1 |

### Service entry

One line in the service history. Services, repairs and other costs share one list, told apart by `category`. The costs page sums `cost` per category and year from this list.

| Field | Type | Rules |
|---|---|---|
| `id` | string | From `crypto.randomUUID()` |
| `carId` | string | The car it belongs to |
| `category` | string | One of `service`, `repair`, `other` |
| `title` | string | Required. The type of work, e.g. "Oil change" |
| `date` | string | Required date, not in the future |
| `mileage` | number | Whole km from 0 |
| `cost` | number | Whole NOK from 0 |
| `workshop` | string or null | Optional |
| `notes` | string or null | Optional |

### Task

A maintenance to-do or reminder, like "Change to winter tyres" or "Timing belt". A task can be due by date, by mileage, both or neither. It can also repeat.

| Field | Type | Rules |
|---|---|---|
| `id` | string | From `crypto.randomUUID()` |
| `carId` | string | The car it belongs to |
| `title` | string | Required |
| `dueDate` | string or null | Optional deadline |
| `dueMileage` | number or null | Optional deadline in km |
| `repeatMonths` | number or null | Optional. Repeat this many months after it is done |
| `repeatKm` | number or null | Optional. Repeat this many km after it is done |
| `doneDate` | string or null | `null` while the task is open |
| `doneMileage` | number or null | The car's km when it was done |

## The whole object

```js
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
      nickname: "", make: "", model: "", year: "", regCountry: "NO", regNumber: "", vin: "",
      fuel: "petrol", engine: "", mileage: "", euInspectionDue: "",
    },
    serviceEntry: {
      category: "service", title: "", date: "", mileage: "",
      cost: "", workshop: "", notes: "",
    },
    task: {
      title: "", dueDate: "", dueMileage: "", repeatMonths: "", repeatKm: "",
    },
    euDone: { nextDue: "" }, // the next EU-kontroll date in Mark done
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
```

`inputs` holds strings, exactly as typed. The controller validates them, converts them to the stored types and then writes to `data`.

`preferences` keep the scaffold's rule: the value used is the chosen one if there is one, otherwise the system's. They are saved under their own localStorage keys, because they belong to the device rather than to a profile.

`currency` is kept for the day we offer more than one. With NOK only, its picker stays hidden.

## Storage

- `model.data` is saved to localStorage as JSON under the single key `motorcatalog`.
- The app still starts if that key is missing or broken. It then starts with the empty `data` above.
- `version` lets a later release change the shape and migrate old data, and lets import check a file before loading it.
- Export, on the profiles page, downloads `model.data` as a JSON file named by the local date, `motorcatalog-2026-10-26.json`.

## Formats

- Dates are ISO strings, `"2026-10-15"`. The view formats them for the chosen language, always with a four-digit year.
- Mileage and money are whole numbers. NOK is the only currency.
- Optional fields are `null` when empty, never `""`.

## Rules the controller keeps

### Typing in the car form

The controller fixes each car field as it is typed, so the user sees the rule at once. The caret stays where it was.

| Field | While typing |
|---|---|
| `nickname`, `engine` | First letter in capitals |
| `regNumber` | Capitals. Only the characters and length the country's plates use. Spaces and hyphens are kept but don't count |
| `vin` | Capitals |
| `year` | Digits only, at most 4 |
| `mileage` | Digits only, at most 8 |
| `make`, `model` | Kept as typed. Make suggests the makes in `src/data/models.js`, and model suggests the models of the typed make |
| `regCountry` | A typed country name in the chosen language or English becomes its code |

### Mileage

`car.mileage` is set when the car is added and can be edited. When a service entry or a finished task has a higher km, the controller raises `car.mileage` to match. It never lowers it by itself.

### Repeating tasks

When a task with `repeatMonths` or `repeatKm` is marked done:

1. It gets `doneDate` and `doneMileage` and moves to the completed list.
2. The controller adds a new open task with the same title and repeat values. Its `dueDate` is `doneDate` plus `repeatMonths`, and its `dueMileage` is `doneMileage` plus `repeatKm`.

### Marking the EU-kontroll done

Mark done on the car page shows only when the car has an `euInspectionDue`. It opens a dialog with the next date filled in: the old date plus 24 calendar months (`euInspectionIntervalMonths` in `src/config.js`). The suggestion counts from the old date, never from today, because an EU-kontroll done up to 2 months early keeps its date. A day the month doesn't have becomes its last day, so 29.02.2028 suggests 28.02.2030.

The user can change the date before saving. It must be a real date and can't be empty. A past date is allowed, as in the car form. Saving replaces `euInspectionDue`, and the status is worked out again from the new date. It also sets `euReminderDismissed` to null, so the new date's reminders start fresh. A new date saved in the car form does the same.

### Deleting

Deleting a car deletes its service entries and tasks. Deleting a profile deletes its cars, with their entries and tasks.

## Derived values

The controller works these out from the model each time it renders. They are never stored, so they can never go stale.

| Value | Worked out from |
|---|---|
| The language, theme and currency in use | `app.preferences`: the choice, or the system value when nothing is chosen |
| EU inspection status: OK, due soon or overdue | `euInspectionDue` compared with today (see [EU-kontroll status](#eu-kontroll-status)) |
| The reminders at the top of the garage | Each of the garage's cars whose reminder is due and not dismissed (see [EU-kontroll reminders](#eu-kontroll-reminders)) |
| Task status: open, due soon or overdue | `dueDate` and `dueMileage` compared with today and `car.mileage` |
| Status line on a car card | The car's EU status and its most urgent open task |
| Service history, filtered and newest first | `serviceEntries` for the car and `app.historyFilter` |
| Cost totals per category and year | `cost` summed by `category` for `app.costsYear` |
| The cars in the garage | `cars` where `profileId` is `activeProfileId` |

### EU-kontroll status

Worked out per car from `euInspectionDue` and today's local date each time a page renders.

| Status | When |
|---|---|
| Overdue | Today is after the date |
| Due soon | Today is on or after the date 3 calendar months before, up to and including the date itself |
| OK | Before that |
| None | No date, so no status shows |

The 3 months are calendar months, set as `euDueSoonMonths` in `src/config.js`. When the day doesn't exist in the month three months back, that month's last day counts. A date of 31.01.2027 is due soon from 31.10.2026, and 31.05 is due soon from 28.02 (29.02 in a leap year).

Every status shows as text with an icon, never colour alone. Only overdue is coloured, in the brand's danger red (`--danger-rgb` in `src/styles/palette.css`).

### EU-kontroll reminders

A car with an `euInspectionDue` gets reminders, listed at the top of the garage when the app opens. Only the active profile's cars show.

1. A reminder starts 3, 2 and 1 calendar months before the date, with the same month rule as the status above.
2. After the 1-month reminder, a new one starts every Monday until the EU-kontroll is marked done, also after the date has passed.
3. The current reminder is the latest one that has started. A date set less than 3 months ahead, or one already passed, therefore shows a reminder at once.

Dismiss stores the current reminder's start date in `euReminderDismissed`. A reminder shows when its start date is later than that, so a dismissed reminder stays hidden until the next one starts. Marking the EU-kontroll done sets the field to null.

## Not in v1

- Push notifications for reminders. They need a server.
- Car photos. Images stored as text would quickly fill localStorage's roughly 5 MB.
- A separate mileage log, e.g. one reading per refuel.
- EU inspection rolling forward by itself. The user marks it done, which suggests the next date (see [Marking the EU-kontroll done](#marking-the-eu-kontroll-done)).
