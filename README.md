# Koushalya / Healthy One

Koushalya is a local-first browser app for connected patient monitoring, patient records, care scheduling, appointment requests, doctor review, and admin-controlled doctor approval. It is built as a lightweight static frontend with a small Node.js server for shared demo state and optional eye-model prediction.

## Tech Stack

- Frontend: vanilla HTML, CSS, and JavaScript
- Runtime server: Node.js built-in `http`, `fs`, `path`, and `child_process` modules
- Storage: browser `localStorage` plus shared JSON persistence in `healthyone-data.json`
- Hardware/browser APIs: Web Serial for ESP32 data, optional Web Bluetooth, camera/media APIs, Canvas charts, browser print-to-PDF
- Optional eye AI bridge: Python script in `scripts/nayana_eye_predict.py` with model files under `models/eye-screening`
- No npm dependencies and no build step

## Run

```powershell
node server.js
```

Open the URL printed in the terminal. The default is `http://localhost:4173`. If that port is busy, the server automatically tries the next available port.

Use the app through the local server when testing patient-to-doctor workflows. Reports, appointments, checkups, chat messages, and training samples are shared through `healthyone-data.json`. Opening `index.html` directly still works for a single-browser demo, but cross-browser sharing will not work.

## Demo Accounts

- Patient: `patient@demo.com` / `demo123`
- Approved doctor: `doctor@demo.com` / `demo123`
- Admin staff: `admin@koushalya.health` / `admin123`

## Main Features

- Patient login/register and doctor registration.
- Admin approval or rejection for doctor accounts.
- Light/dark mode.
- Patient care menu with records, device monitoring, eye screening, mental health, menstrual health, care schedule, appointments, and clinical responses.
- Doctor portal with triage-ranked reports and appointment requests.
- Jitsi meeting link generation when a doctor approves an appointment.
- Consolidated patient records export.

## Patient Flow

After login, patients choose between:

- `General health monitoring`: connect an ESP32/wearable feed or start sample readings, review sensor cards, generate a report, find a hospital, request an appointment, or send data for doctor review.
- `Personalised health profile`: enter diseases, allergies, medications, and symptoms so reports include medical context.

The patient sidebar then exposes focused tools:

- `My Records`: profile, concerns, device data, shared reports, appointments, clinical responses, and care history.
- `Device Monitoring`: ESP32, smartwatch import, sample readings, and sensor dashboards.
- `Eye Screening`: camera/upload workflow that currently returns `Normal` with `99%` confidence for live screenings.
- `Care Schedule`: schedule a health checkup with date, time, clinical note, and selected approved doctor.

## Records And Trend Popups

`My Records` starts with three trend cards:

- Daily Tracking
- Weekly Tracking
- Monthly Tracking

Each card opens only its own range in a wide popup. The popup summarizes pulse, oxygen, temperature, movement alerts, and plain-language trend meaning. Consolidated patient data appears below those three cards.

## Care Schedule

Patients can schedule routine health checkups from `Care Schedule`. The scheduling modal now requires an approved doctor selection. Saved checkups include:

- Date
- Time
- Doctor name and specialty
- Clinical note

Scheduled checkups appear in the care schedule summary, checkup history, and consolidated records.

## Appointments And Attachments

Patients can request appointments from report actions. Requests can include:

- Current report only
- Weekly sensor data
- Monthly sensor data
- Data since the previous appointment
- Generated report/PDF summary
- Uploaded PDF file
- Attachment note

Doctors can open `View attachments` from the appointment request table. The attachment popup shows the included data, patient note, report summary, key vitals, uploaded PDF link when available, and an `Open attached report PDF` action for the generated report. The report page includes a small back arrow and hides that arrow during printing.

## Doctor Portal

Doctors see only patient reports and appointment requests that were explicitly sent to them. The portal includes:

- Triage summary cards.
- Pending report queue sorted by priority.
- Appointment requests with attachment viewing.
- Meeting link generation after approval.
- Doctor response form with diagnosis, medicines, duration, follow-up, and notes.
- Patient-doctor chat attached to clinical responses.

## ESP32 Data Format

The app listens through Web Serial at `115200` baud. Use Chrome or Edge, run `node server.js`, then click `Connect health device` and choose the ESP32 serial port.

The app can read multi-line serial output with labels such as:

- `Pulse Sensor Value: 2380`
- `Heart Rate: 82 BPM`
- `ECG Signal Value: 1900`
- `EMG Muscle Activity: 420`
- `Skin Temperature: 36.8 C`
- `Temperature: 36.8 C`
- `Humidity: 55 %`
- `Ambient Light Level: 830`
- `Flex Sensor Value: 120`
- `Force Sensor Value: 240`
- `IR Sensor: Object Detected`
- `MPU Accel: 120, -80, 16384`
- `MPU Gyro: 20, 12, 5`
- `ALERT: Sudden Motion / Possible Fall`

The app also supports newline-delimited JSON:

```json
{"heartRate":78,"spo2":98,"temperature":36.8,"systolic":122,"diastolic":78}
```

For the modular telemetry dashboard, send one JSON object per line. It can be flat:

```json
{"bpm":78,"ecgSignal":[1810,1840,2300],"spo2":98,"ppgSignal":[1900,1960,2100],"surfaceTemp":36.8,"ambientTemp":25.5,"emgSignal":[220,260,410],"ax":120,"ay":-80,"az":16384,"gx":20,"gy":12,"gz":5,"lux":42}
```

Or grouped by domain:

```json
{"heart":{"bpm":78,"ecg":[1810,1840,2300]},"oxygen":{"spo2":98,"ppg":[1900,1960,2100]},"climate":{"surfaceTemp":36.8,"ambientTemp":25.5},"muscle":{"emg":[220,260,410]},"movement":{"ax":120,"ay":-80,"az":16384,"gx":20,"gy":12,"gz":5},"sleep":{"lux":42}}
```

The dashboard summarizes Heart Health, Blood Oxygen, Body Climate, Muscle Vitality, Movement & Posture, and Sleep Environment. Opening a domain card expands a deep dive with filtered Canvas signals, derived parameters, and ECG-to-PPG pulse transit timing when both streams are present.

Use `esp32-serial-example.ino` as a starter sketch. You can also use sample monitoring inside the app for demo readings.

## Eye Screening

Eye screening supports image upload and camera capture. Uploaded photos are sent through the optional Nayana model bridge when the app is served by `server.js`, then blended into the screening result. If the model bridge is unavailable, the browser falls back to local image metrics and saved training samples.

Captured camera images are cropped/processed in browser canvas and the live camera screening flow is configured to always save and display:

- Primary finding: `Normal`
- Confidence: `99%`
- Risk label: `Stable`

The server exposes `/api/eye/predict` for the optional Python model bridge used by uploaded photos.

## Shared State API

When served through `server.js`, the app uses:

- `GET /api/state` to read shared JSON state.
- `PUT /api/state` to persist shared arrays into `healthyone-data.json`.
- `POST /api/eye/predict` to call the optional Python eye predictor.

The shared state keys include users, patients, doctor applications, readings, reports, appointments, checkups, clinical responses, chat messages, and eye training samples.

## Privacy Model

Doctors do not see a global patient list, patient photos, connected device status, or live patient trends by default. A doctor only receives information that the patient explicitly sends through a report, appointment request, or clinical response/chat workflow.

PDF generation uses the browser print dialog. Choose `Save as PDF` when prompted.
