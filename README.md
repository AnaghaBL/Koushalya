# Koushalya

A dependency-free browser app for patient registration, general sensor tracking, personalised health profiles, consent-based doctor review, doctor registration with license review, and protected admin approval.

## Run

```powershell
node server.js
```

Open the URL printed in the terminal. The default is `http://localhost:4173`. If that port is busy, the server automatically tries the next available port, such as `http://localhost:4174`.

Use the app through this local server when testing patient-to-doctor workflows. Appointment requests and sent reports are shared through `healthyone-data.json`, so a patient browser and a doctor browser can see the same data. Opening `index.html` directly still works for a single-browser demo, but it cannot share appointments between separate browsers or devices.

## Demo Accounts

- Patient: `patient@demo.com` / `demo123`
- Approved doctor: `doctor@demo.com` / `demo123`
- Admin staff: `admin@koushalya.health` / `admin123`

## UI Features

- Light and dark mode toggle from the top bar.
- Patient care menu can be opened and closed as a sliding sidebar.
- Clean login/register screen with the Koushalya brand mark.
- Doctor console only shows reports and appointment requests that the patient chooses to send.

## ESP32 Data Format

The app listens through Web Serial at `115200` baud. Use Chrome or Edge, open the app through `node server.js`, then click `Connect health device` and choose the ESP32 serial port.

The app can read the multi-line Serial output from the wearable sketch that prints labels like:

- `Pulse Sensor Value: 2380`
- `Heart Rate: 82 BPM`
- `ECG Signal Value: 1900`
- `EMG Muscle Activity: 420`
- `Skin Temperature: 36.8 °C`
- `Ambient Light Level: 830`
- `Flex Sensor Value: 120`
- `Force Sensor Value: 240`
- `IR Sensor: Object Detected`
- `ALERT: Sudden Motion / Possible Fall`

The dashboard will show unsupported/missing values, such as SpO2 or blood pressure, as `--`.

The app also still supports newline-delimited JSON:

```json
{"heartRate":78,"spo2":98,"temperature":36.8,"systolic":122,"diastolic":78}
```

Use `esp32-serial-example.ino` as a starter sketch. You can also use sample monitoring inside the app for demo readings.

## Patient Flow

After login, patients first choose:

- `General overall tracking`: connect the ESP32 device or start sample monitoring, view structured sensor data, type or speak today's input, read a simple AI diagnosis, generate a PDF, find nearby hospitals, request an appointment, or send the report to an approved doctor.
- `Personalised tracking`: complete diseases, allergies, medications, and today's symptom. After saving, the profile form closes into a summary and can be edited later. The patient can review sensor readings with profile context, generate a PDF, find nearby hospitals, request an appointment, or send the report to an approved doctor.

The care menu also supports scheduled health checkups. Times use standard half-hour slots such as `9:00 AM`, `9:30 AM`, and `10:00 AM`.

## Appointments

Patients can request appointments from either tracking flow. Appointment requests can include:

- Current report only
- Weekly sensor data
- Monthly sensor data
- Data since the previous appointment
- Generated PDF/report summary
- An additional PDF attachment name
- A note describing what should be included

Doctors can approve appointment requests from the doctor console. Approval generates a Jitsi consultation link.

## Privacy Model

Doctors do not see a global patient list, patient photos, connected device status, or live patient trends by default. A doctor only receives information that the patient explicitly sends through a report or appointment request.

PDF generation uses the browser print dialog, so choose `Save as PDF` when prompted.
