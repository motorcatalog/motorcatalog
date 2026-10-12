# MotorCatalog

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

The app follows MVC. The model holds data only, views render it, and controllers handle input and update the model.

## How we work

- User stories live as issues on our GitHub Projects board.
- We plan in short sprints, hold brief standups and close with a retro.
- Every change goes through a pull request and meets our Definition of Done before it merges to `main`.

## Status

In planning. Setup instructions follow with the first scaffold.
