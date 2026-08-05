# U.S. AutoForce PACE Driving Evaluation

Mobile ride-along evaluation form built around the PACE method: **Plan Ahead, Analyze Surroundings, Communicate, Execute**. Works offline as an installable PWA.

## Features

- Full PACE form with 1–3 rating scale (Not Practiced / Somewhat Practiced / Always Practiced)
- **Built-in stopwatches** for the three timed measurements:
  - Eye Lead Time (seconds)
  - Mirror Check Intervals (seconds)
  - Following Distance (seconds)
- Quarterly result toggle (Training Completed / Continued Training) + Next PACE Drive date
- Evaluator & employee signature capture
- Saved records with print/PDF report view and JSON export
- Offline PWA — installs to home screen; signed Android APK available

## Install

- **Live site:** https://joshwheeler8206-cell.github.io/pace-eval/
- **Android APK:** available from the latest release below (signed, standalone app)

## Tech

Plain HTML/JS/CSS, no build step. Service worker caches for offline use. Data lives in the browser's IndexedDB (`usaf_pace_eval_db`).
