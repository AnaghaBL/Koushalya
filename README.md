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
- `Temperature: 36.8 °C`
- `Humidity: 55 %`
- `Ambient Light Level: 830`
- `Flex Sensor Value: 120`
- `Force Sensor Value: 240`
- `IR Sensor: Object Detected`
- `MPU Accel: 120, -80, 16384`
- `MPU Gyro: 20, 12, 5`
- `ALERT: Sudden Motion / Possible Fall`

The dashboard uses a physiological interpretation pipeline for the sensors that are actually present. Directly measured values are shown when available, and missing clinical-grade channels are replaced with honest proxy scores:

- Heart Health combines pulse raw, ECG signal, and detected BPM into cardiac signal quality.
- Blood Oxygen shows real SpO2 only if a red/IR PPG sensor is present; otherwise it shows an oxygenation/perfusion proxy from pulse quality, temperature, and movement load.
- Body Climate combines DHT11 temperature and humidity into climate comfort and thermal trend.
- Muscle Vitality combines EMG, flex, and force into exertion and fatigue-style indicators.
- Movement & Posture uses MPU raw values when printed, otherwise flex, force, IR, and motion alert text become a movement load proxy.
- Sleep Environment combines LDR, movement load, and IR presence into rest-environment quality.

Movement & Posture becomes more precise if the Arduino prints raw MPU lines such as `MPU Accel: ax, ay, az` and `MPU Gyro: gx, gy, gz`; motion alert text alone can still drive the proxy but cannot calculate true tilt angle, tremor Hz, or fall G-force.

The app also still supports newline-delimited JSON:

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

The dashboard summarizes Heart Health, Blood Oxygen, Body Climate, Muscle Vitality, Movement & Posture, and Sleep Environment. Opening a domain card expands a deep dive with filtered Canvas signals, derived parameters, and ECG-to-PPG Pulse Transit Time when both streams are present.

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
