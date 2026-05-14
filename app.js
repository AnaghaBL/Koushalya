const STORAGE_KEY = "healthyone-state-v1";
const THEME_KEY = "healthyone-theme";
const SHARED_STATE_KEYS = ["users", "patients", "doctorApplications", "readings", "sentReports", "appointments", "healthCheckups"];

const seedState = {
  currentUser: null,
  users: [
    {
      id: "admin-demo",
      role: "admin",
      name: "Koushalya Admin",
      email: "admin@koushalya.health",
      password: "admin123",
    },
    {
      id: "patient-demo",
      role: "patient",
      name: "Anika Rao",
      email: "patient@demo.com",
      password: "demo123",
      age: "42",
      condition: "Hypertension follow-up",
      assignedDoctor: "Dr. Meera Shah",
    },
    {
      id: "doctor-demo",
      role: "doctor",
      name: "Dr. Meera Shah",
      email: "doctor@demo.com",
      password: "demo123",
      specialty: "Cardiology",
      license: "MCI-778812",
      hospital: "Koushalya Medical Center",
      verification: "approved",
      aiScore: 94,
    },
  ],
  patients: [
    {
      id: "patient-demo",
      name: "Anika Rao",
      age: "42",
      condition: "Hypertension follow-up",
      deviceId: "ESP32-HO-1001",
      status: "connected",
    },
  ],
  doctorApplications: [
    {
      id: "application-sample",
      name: "Dr. Arjun Menon",
      email: "arjun@example.com",
      specialty: "Pulmonology",
      license: "NMC-442908",
      hospital: "City Respiratory Institute",
      verification: "pending",
      aiScore: 82,
      notes: "AI pre-check found matching format and hospital domain. Admin review required.",
    },
  ],
  readings: [],
  sentReports: [],
  appointments: [],
  healthCheckups: [],
};

let state = loadState();
let syncTimer = null;
let sharedStateReady = !isServerHosted();
let activeAuth = "patient";
let authMode = { patient: "login", doctor: "login" };
let serialPort = null;
let reader = null;
let simulationTimer = null;
let chartFrame = null;
let patientStep = "home";
let patientSidebarOpen = true;
let personalizedEditorOpen = false;
let recognition = null;

const app = document.querySelector("#app");
let theme = localStorage.getItem(THEME_KEY) || "light";
applyTheme();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(seedState);
  try {
    return normalizeState({ ...structuredClone(seedState), ...JSON.parse(raw) });
  } catch {
    return structuredClone(seedState);
  }
}

function normalizeState(nextState) {
  nextState.users = Array.isArray(nextState.users) ? nextState.users : [];
  nextState.patients = Array.isArray(nextState.patients) ? nextState.patients : [];
  nextState.doctorApplications = Array.isArray(nextState.doctorApplications) ? nextState.doctorApplications : [];
  nextState.readings = Array.isArray(nextState.readings) ? nextState.readings : [];
  nextState.sentReports = Array.isArray(nextState.sentReports) ? nextState.sentReports : [];
  nextState.appointments = Array.isArray(nextState.appointments) ? nextState.appointments : [];
  nextState.healthCheckups = Array.isArray(nextState.healthCheckups) ? nextState.healthCheckups : [];
  if (!nextState.users.some((user) => user.role === "admin" && user.email === "admin@koushalya.health")) {
    nextState.users.unshift(structuredClone(seedState.users[0]));
  }
  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  saveSharedState();
}

function sharedStateSnapshot() {
  return Object.fromEntries(SHARED_STATE_KEYS.map((key) => [key, state[key]]));
}

async function syncStateFromServer({ rerender = false } = {}) {
  if (!isServerHosted()) return;
  try {
    const response = await fetch("./api/state", { cache: "no-store" });
    if (!response.ok) return;
    const sharedState = await response.json();
    const hasSharedData = SHARED_STATE_KEYS.some((key) => Array.isArray(sharedState[key]));
    if (!hasSharedData) {
      sharedStateReady = true;
      await saveSharedState();
      return;
    }
    mergeSharedState(sharedState);
    sharedStateReady = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (rerender) render();
  } catch {
    // Running from a static file still works with browser-local demo data.
    sharedStateReady = true;
  }
}

async function saveSharedState() {
  if (!isServerHosted() || !sharedStateReady) return;
  try {
    await fetch("./api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sharedStateSnapshot()),
    });
  } catch {
    // Keep localStorage as a fallback if the shared demo server is unavailable.
  }
}

function mergeSharedState(sharedState) {
  SHARED_STATE_KEYS.forEach((key) => {
    if (Array.isArray(sharedState[key])) state[key] = sharedState[key];
  });
  state = normalizeState(state);
}

function isServerHosted() {
  return ["http:", "https:"].includes(window.location.protocol);
}

function startSharedStatePolling() {
  if (!isServerHosted() || syncTimer) return;
  syncTimer = window.setInterval(() => {
    if (!state.currentUser) return;
    const modalOpen = Boolean(document.querySelector("#modal-root")?.children.length);
    const activeTag = document.activeElement?.tagName;
    const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(activeTag);
    syncStateFromServer({ rerender: !modalOpen && !editing });
  }, 5000);
}

function setUser(user) {
  state.currentUser = user ? { id: user.id, role: user.role } : null;
  patientStep = "home";
  saveState();
  render();
}

function currentUser() {
  if (!state.currentUser) return null;
  return state.users.find((user) => user.id === state.currentUser.id) || null;
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  stopChart();
  applyTheme();
  const user = currentUser();
  app.innerHTML = `
    ${topbar(user)}
    <main class="page">
      ${user ? dashboard(user) : authLanding()}
    </main>
    <div id="modal-root"></div>
  `;
  bindCommon();
  if (!user) bindAuth();
  if (user?.role === "patient") bindPatient();
  if (user?.role === "doctor") bindDoctor();
  if (user?.role === "admin") bindAdmin();
}

function topbar(user) {
  return `
    <header class="topbar">
      <div class="brand">
        ${
          user
            ? `<button class="back-button" data-action="go-back" aria-label="Go back">←</button>`
            : ""
        }
        <div class="brand-mark" aria-hidden="true">${brandLogo()}</div>
        <div>
          <h1>Koushalya</h1>
          <p>Clinical guidance for connected care</p>
        </div>
      </div>
      <div class="top-actions">
        ${
          user
            ? `<span class="status ${user.role === "doctor" ? user.verification : "approved"}">${escapeHtml(user.role)}</span>
               <button class="button secondary small theme-toggle" data-action="toggle-theme" type="button">${theme === "dark" ? "Light mode" : "Dark mode"}</button>
               <button class="button secondary small" data-action="logout">Log out</button>`
            : `<button class="button secondary small theme-toggle" data-action="toggle-theme" type="button">${theme === "dark" ? "Light mode" : "Dark mode"}</button>
               <button class="button secondary small" data-action="open-admin-login">Staff sign in</button>`
        }
      </div>
    </header>
  `;
}

function authLanding() {
  return `
    <section class="auth-welcome">
      <div class="auth-brand">
        <div class="auth-mark" aria-hidden="true">${brandLogo()}</div>
        <p class="eyebrow">Trusted health companion</p>
        <h2>Koushalya</h2>
        <p>Sign in or create an account to continue with guided tracking and verified doctor review.</p>
      </div>
      <div class="split auth-panels">
        ${authPanel("patient", "Patient access", "Log in or register for your health workspace.")}
        ${authPanel("doctor", "Doctor access", "Verified doctors can review patient reports after approval.")}
      </div>
    </section>
  `;
}

function brandLogo() {
  return `<span class="logo-mark"><span class="logo-ring"></span><span class="logo-pulse"></span></span>`;
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
}

function authPanel(role, title, subtitle) {
  const mode = authMode[role];
  const isDoctor = role === "doctor";
  return `
    <article class="panel" data-auth-panel="${role}">
      <div class="panel-header">
        <div>
          <h3>${title}</h3>
          <p>${subtitle}</p>
        </div>
        <div class="tabs" role="tablist">
          <button class="tab ${mode === "login" ? "active" : ""}" data-auth-mode="${role}:login">Login</button>
          <button class="tab ${mode === "register" ? "active" : ""}" data-auth-mode="${role}:register">Register</button>
        </div>
      </div>
      <form class="form-grid" data-form="${role}-${mode}">
        ${
          mode === "register"
            ? `<div class="field">
                <label for="${role}-name">Full name</label>
                <input id="${role}-name" name="name" required placeholder="${isDoctor ? "Dr. Full Name" : "Patient name"}" />
              </div>`
            : ""
        }
        <div class="field">
          <label for="${role}-email">Email</label>
          <input id="${role}-email" name="email" type="email" required placeholder="${role}@demo.com" />
        </div>
        <div class="field">
          <label for="${role}-password">Password</label>
          <input id="${role}-password" name="password" type="password" required placeholder="demo123" />
        </div>
        ${
          mode === "register" && !isDoctor
            ? `<div class="field">
                <label for="patient-age">Age</label>
                <input id="patient-age" name="age" inputmode="numeric" required placeholder="38" />
              </div>
              <div class="field">
                <label for="patient-condition">Primary condition</label>
                <input id="patient-condition" name="condition" required placeholder="Diabetes, hypertension, post-op care" />
              </div>`
            : ""
        }
        ${
          mode === "register" && isDoctor
            ? `<div class="field">
                <label for="doctor-specialty">Specialty</label>
                <input id="doctor-specialty" name="specialty" required placeholder="Cardiology" />
              </div>
              <div class="field">
                <label for="doctor-license">Medical license number</label>
                <input id="doctor-license" name="license" required placeholder="NMC-123456" />
              </div>
              <div class="field">
                <label for="doctor-hospital">Hospital or clinic</label>
                <input id="doctor-hospital" name="hospital" required placeholder="Registered workplace" />
              </div>`
            : ""
        }
        <button class="button" type="submit">${mode === "login" ? "Log in" : "Create account"}</button>
      </form>
    </article>
  `;
}

function dashboard(user) {
  if (user.role === "patient") return patientDashboard(user);
  if (user.role === "doctor") return doctorDashboard(user);
  return adminDashboard();
}

function patientDashboard(user) {
  const patient = state.patients.find((item) => item.id === user.id);
  const latest = latestReading();
  if (patientStep === "personalized") return personalizedTrack(user, patient);
  if (patientStep === "general-next") return generalNextSteps(user, patient);
  if (patientStep !== "general") return patientStart(user, patient);
  const generalInput = patient?.generalInput || "";
  return `
    <section class="dashboard">
      <div class="dashboard-grid ${patientSidebarOpen ? "sidebar-open" : "sidebar-closed"}">
        ${patientSidebar(user, patient)}
        <div class="main-grid">
          ${sidebarToggleButton()}
          <div class="panel">
            <div class="panel-header">
              <div>
                <h3>General overall tracking</h3>
                <p>Your sensor readings are organized visually. The diagnosis panel explains them in simple words.</p>
              </div>
              <span class="status ${readingStatus(latest).className}">${readingStatus(latest).label}</span>
            </div>
            ${vitals(latest)}
            <div class="chart-wrap"><canvas id="vitals-chart" width="1000" height="360"></canvas></div>
          </div>
          <div class="panel">
            <div class="panel-header">
              <div>
                <h3>Diagnosis</h3>
                <p>AI explanation of the sensor data in simple words.</p>
              </div>
            </div>
            ${aiAnalysisPanel("general", latest)}
            ${alerts(latest)}
            <button class="button" data-patient-step="general-next" type="button">Continue to clinical next steps</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function generalNextSteps(user, patient) {
  const latest = latestReading();
  const generalInput = patient?.generalInput || "";
  return `
    <section class="dashboard">
      <div class="dashboard-grid ${patientSidebarOpen ? "sidebar-open" : "sidebar-closed"}">
        ${patientSidebar(user, patient)}
        <div class="main-grid">
          ${sidebarToggleButton()}
          <div class="panel">
            <div class="panel-header">
              <div>
                <h3>Clinical next steps</h3>
                <p>Add how you feel, then generate a report, find a hospital, or send it for doctor review.</p>
              </div>
              <button class="button secondary small" data-patient-step="general">Back to diagnosis</button>
            </div>
            <button class="button secondary" data-action="feeling-unwell" type="button">Tell us if you are feeling unwell</button>
            <form class="form-grid patient-note" data-form="general-input">
              ${voiceControls("general-input-text")}
              <div class="field">
                <label for="general-input-text">Clinical note for today</label>
                <textarea id="general-input-text" name="generalInput" placeholder="Example: I feel tired today, or I had chest discomfort while climbing stairs.">${escapeHtml(generalInput)}</textarea>
              </div>
              <button class="button secondary" type="submit">Save clinical note</button>
            </form>
            ${reportActions("general", latest)}
          </div>
        </div>
      </div>
    </section>
  `;
}

function patientStart(user, patient) {
  return `
    <section class="flow-shell patient-start">
      <div class="track-hero">
        <div>
          <p class="eyebrow">Patient workspace</p>
          <h2>Hi ${escapeHtml(user.name.split(" ")[0] || user.name)}, choose your care track.</h2>
          <p>Pick the experience that fits today's need. Both tracks can generate a PDF, find nearby hospitals, or send your report to a registered doctor.</p>
        </div>
        <div class="track-status-card" aria-label="Profile summary">
          <span>Current focus</span>
          <strong>${escapeHtml(patient?.condition || "General monitoring")}</strong>
          <small>Reports stay connected to your health profile.</small>
        </div>
      </div>
      <div class="choice-grid">
        <button class="choice-card general-choice" data-patient-step="general">
          <span class="choice-icon" aria-hidden="true">ECG</span>
          <span class="choice-title">General overall tracking</span>
          <small>See all sensor readings in a structured visual dashboard with a simple AI diagnosis sidebar.</small>
          <span class="track-preview" aria-hidden="true">
            <i style="height: 44%"></i>
            <i style="height: 76%"></i>
            <i style="height: 58%"></i>
            <i style="height: 88%"></i>
            <i style="height: 66%"></i>
          </span>
          <strong class="choice-action">Open live dashboard</strong>
        </button>
        <button class="choice-card personalized-choice" data-patient-step="personalized">
          <span class="choice-icon" aria-hidden="true">AI</span>
          <span class="choice-title">Personalised tracking</span>
          <small>Complete your health profile, list diseases, allergies, medicines, and today's symptoms.</small>
          <span class="profile-preview" aria-hidden="true">
            <i></i>
            <i></i>
            <i></i>
          </span>
          <strong class="choice-action">Build health report</strong>
        </button>
      </div>
    </section>
  `;
}

function personalizedTrack(user, patient) {
  const latest = latestReading();
  const hasProfile = hasPatientProfile(patient);
  const showEditor = personalizedEditorOpen || !hasProfile;
  return `
    <section class="dashboard">
      <div class="dashboard-grid ${patientSidebarOpen ? "sidebar-open" : "sidebar-closed"}">
        ${patientSidebar(user, patient)}
        <div class="main-grid">
      ${sidebarToggleButton()}
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Personalised tracking</h3>
            <p>${showEditor ? "Complete your health profile so sensor readings can be interpreted with your medical background." : "Your health profile is saved. Open edit when you need to update it."}</p>
          </div>
          <button class="button secondary small" data-patient-step="home">Back</button>
        </div>
        ${
          showEditor
            ? personalizedProfileForm(patient)
            : `<div class="profile-summary">
                ${profileSummaryItem("Conditions", patient?.diseases)}
                ${profileSummaryItem("Allergies", patient?.allergies)}
                ${profileSummaryItem("Medicines", patient?.medications)}
                ${profileSummaryItem("Today", patient?.symptoms)}
                <button class="button secondary" data-action="edit-personalized-profile" type="button">Edit health profile</button>
              </div>`
        }
      </div>
      <div class="panel">
        <div class="panel-header"><div><h3>Personalised sensor review</h3><p>Your latest sensor readings interpreted with diseases, allergies, medicines, and today's symptom.</p></div></div>
        ${vitals(latest)}
        ${personalizedAnalysisPanel(patient, latest)}
        ${reportActions("personalized", null)}
      </div>
        </div>
      </div>
    </section>
  `;
}

function personalizedProfileForm(patient) {
  return `
    <form class="form-grid" data-form="personalized-profile">
      <div class="personal-grid">
        <div class="field">
          <label for="profile-diseases">Diseases or long-term conditions</label>
          <textarea id="profile-diseases" name="diseases" placeholder="Example: diabetes, asthma, high blood pressure">${escapeHtml(patient?.diseases || "")}</textarea>
        </div>
        <div class="field">
          <label for="profile-allergies">Allergies</label>
          <textarea id="profile-allergies" name="allergies" placeholder="Example: penicillin, peanuts, dust">${escapeHtml(patient?.allergies || "")}</textarea>
        </div>
        <div class="field">
          <label for="profile-medications">Current medications</label>
          <textarea id="profile-medications" name="medications" placeholder="Example: metformin 500mg, inhaler, vitamin D">${escapeHtml(patient?.medications || "")}</textarea>
        </div>
        <div class="field">
          <label for="profile-symptoms">Any symptom today</label>
          <textarea id="profile-symptoms" name="symptoms" placeholder="Example: fever since morning, headache, weakness">${escapeHtml(patient?.symptoms || "")}</textarea>
        </div>
      </div>
      ${voiceControls("profile-symptoms")}
      <button class="button" type="submit">Save personalised profile</button>
    </form>
  `;
}

function profileSummaryItem(label, value) {
  return `
    <div class="profile-summary-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "Not added")}</strong>
    </div>
  `;
}

function patientSidebar(user, patient) {
  return `
    <aside class="sidebar">
      <button class="icon-button sidebar-close" data-action="toggle-sidebar" aria-label="Close care menu">x</button>
      <div class="profile-box">
        <h2>${escapeHtml(user.name)}</h2>
        <p>${escapeHtml(patient?.condition || "General monitoring")}</p>
      </div>
      <button class="button secondary" data-patient-step="home">Back to tracks</button>
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Health device</h3>
            <p>Connect the ESP32 device or use a supervised sample reading.</p>
          </div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="device-id">Device ID</label>
            <input id="device-id" value="${escapeHtml(patient?.deviceId || "ESP32-HO-1001")}" />
          </div>
          <button class="button" data-action="connect-esp32">Connect health device</button>
          <button class="button secondary" data-action="toggle-simulation">${simulationTimer ? "Pause sample monitoring" : "Start sample monitoring"}</button>
          <span class="status ${patient?.status === "connected" ? "connected" : "pending"}">${escapeHtml(patient?.status || "not connected")}</span>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><div><h3>Care schedule</h3><p>Plan routine monitoring and follow-up reviews.</p></div></div>
        <div class="form-grid">
          <button class="button secondary" data-action="schedule-checkup">Schedule health checkup</button>
          ${patientScheduleSummary(patient?.id)}
        </div>
      </div>
      ${patientAppointmentSummary(patient?.id)}
    </aside>
  `;
}

function sidebarToggleButton() {
  return `<button class="button secondary sidebar-toggle ${patientSidebarOpen ? "" : "sidebar-fab"}" data-action="toggle-sidebar" type="button">${patientSidebarOpen ? "Close care menu" : "Open care menu"}</button>`;
}

function doctorDashboard(user) {
  if (user.verification !== "approved") {
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>Verification pending</h3>
            <p>Your doctor account is locked until the license review is approved by the admin portal.</p>
          </div>
          <span class="status pending">Pending</span>
        </div>
        <div class="notice">AI pre-check score: ${user.aiScore || "Queued"}%. Admin must approve before patient monitoring opens.</div>
      </section>
    `;
  }
  const reports = state.sentReports.filter((report) => report.doctorId === user.id);
  const appointments = state.appointments.filter((appointment) => appointment.doctorId === user.id);
  return `
    <section class="dashboard">
      <div class="section-title">
        <h3>Doctor console</h3>
        <p>Approved doctors only see reports and appointment requests that a patient chooses to share.</p>
      </div>
      <div class="panel">
        <div class="panel-header"><div><h3>Reports sent by patients</h3><p>Reports selected and shared from the patient flow.</p></div></div>
        ${doctorReports(reports)}
      </div>
      <div class="panel">
        <div class="panel-header"><div><h3>Appointment requests</h3><p>Approve suitable consultation times and create a secure video meeting link.</p></div></div>
        ${doctorAppointments(appointments)}
      </div>
    </section>
  `;
}

function adminDashboard() {
  const doctors = state.users.filter((user) => user.role === "doctor" && user.verification !== "approved");
  const applications = [...state.doctorApplications, ...doctors];
  return `
    <section class="dashboard">
      <div class="section-title">
        <h3>Admin verification portal</h3>
        <p>Review doctor licenses manually after the AI pre-check. Approved doctors can log in to the monitoring console.</p>
      </div>
      <div class="panel">
        <table class="table">
          <thead><tr><th>Doctor</th><th>Credentials</th><th>AI pre-check</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${
              applications.length
                ? applications
                    .map(
                      (doctor) => `
                      <tr>
                        <td>${escapeHtml(doctor.name)}<br />${escapeHtml(doctor.email)}</td>
                        <td>${escapeHtml(doctor.specialty)}<br />${escapeHtml(doctor.license)}<br />${escapeHtml(doctor.hospital)}</td>
                        <td>${doctor.aiScore || runLicensePrecheck(doctor).score}%<br />${escapeHtml(doctor.notes || runLicensePrecheck(doctor).note)}</td>
                        <td><span class="status ${doctor.verification === "rejected" ? "rejected" : "pending"}">${escapeHtml(doctor.verification || "pending")}</span></td>
                        <td>
                          <div class="table-actions">
                            <button class="button small" data-approve-doctor="${doctor.id}">Approve</button>
                            <button class="button warn small" data-reject-doctor="${doctor.id}">Reject</button>
                          </div>
                        </td>
                      </tr>
                    `,
                    )
                    .join("")
                : `<tr><td colspan="5">No doctor applications are waiting.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function vitals(reading) {
  const safe = reading || { heartRate: "--", spo2: "--", temperature: "--", systolic: "--", diastolic: "--" };
  return `
    <div class="vitals-grid">
      <div class="metric"><span>Pulse</span><strong>${safe.heartRate}</strong><small>heart beats per minute</small></div>
      <div class="metric"><span>Breathing oxygen</span><strong>${safe.spo2}</strong><small>oxygen level in blood</small></div>
      <div class="metric"><span>Body temperature</span><strong>${safe.temperature}</strong><small>Celsius</small></div>
      <div class="metric"><span>Blood pressure</span><strong>${safe.systolic}/${safe.diastolic}</strong><small>pressure in arteries</small></div>
    </div>
  `;
}

function alerts(reading) {
  if (!reading) return `<div class="notice">No readings yet. Connect your device or start simulation.</div>`;
  const issues = [];
  if (reading.heartRate > 110 || reading.heartRate < 50) issues.push(`Your pulse is unusual: ${reading.heartRate} beats per minute`);
  if (reading.spo2 < 94) issues.push(`Your breathing oxygen looks low: ${reading.spo2}%`);
  if (reading.temperature > 38) issues.push(`Your body temperature is high: ${reading.temperature} C`);
  if (reading.systolic > 140 || reading.diastolic > 90) issues.push(`Your blood pressure is high: ${reading.systolic}/${reading.diastolic}`);
  if (!issues.length) return `<div class="notice">Everything looks okay in this demo check. Keep monitoring if you still feel unwell.</div>`;
  return `
    <div class="alert-list">
      ${issues.map((issue) => `<div class="alert-item"><strong>${escapeHtml(issue)}</strong><span class="status alert">Alert</span></div>`).join("")}
    </div>
  `;
}

function aiAnalysisPanel(type, reading) {
  const lines = type === "general" ? analyzeReading(reading) : [];
  return `
    <div class="analysis-box">
      <h4>What this means in simple words</h4>
      ${
        lines.length
          ? `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
          : `<p>Connect your device or start simulation. Once readings arrive, this section explains them without medical jargon.</p>`
      }
    </div>
  `;
}

function analyzeReading(reading) {
  if (!reading) return [];
  const lines = [];
  if (reading.heartRate >= 60 && reading.heartRate <= 100) lines.push("Your pulse is in the usual resting range for most adults.");
  else if (reading.heartRate > 100) lines.push("Your pulse is faster than usual. This can happen with fever, anxiety, exercise, dehydration, or illness.");
  else lines.push("Your pulse is slower than usual. This can be normal for some people, but dizziness or weakness should be checked.");

  if (reading.spo2 >= 95) lines.push("Your breathing oxygen looks comfortable. Your blood appears to be carrying enough oxygen.");
  else lines.push("Your oxygen reading is lower than expected. If you feel breathless, confused, blue around lips, or very weak, seek urgent help.");

  if (reading.temperature <= 37.5) lines.push("Your temperature does not suggest fever right now.");
  else if (reading.temperature <= 38) lines.push("Your temperature is slightly raised. Rest and watch for worsening symptoms.");
  else lines.push("Your temperature is high and may mean fever. A doctor should review it if it continues or you feel very unwell.");

  if (reading.systolic < 140 && reading.diastolic < 90) lines.push("Your blood pressure is not in the high range in this reading.");
  else lines.push("Your blood pressure is high in this reading. Sit calmly and check again; repeated high readings should be shared with a doctor.");
  return lines;
}

function symptomAnalysisPanel(text) {
  const cleanText = text.trim();
  if (!cleanText) return `<div class="notice">Add your symptoms to get a simple explanation and suggested next step.</div>`;
  const lower = cleanText.toLowerCase();
  const urgent = ["chest pain", "breathless", "difficulty breathing", "faint", "unconscious", "severe bleeding", "stroke", "blue lips"];
  const sameDay = ["fever", "vomit", "dizziness", "weakness", "wheezing", "infection", "severe headache"];
  const isUrgent = urgent.some((term) => lower.includes(term));
  const needsReview = isUrgent || sameDay.some((term) => lower.includes(term));
  const title = isUrgent ? "This may need urgent care" : needsReview ? "A doctor should review this" : "This looks suitable for normal review";
  const advice = isUrgent
    ? "Please do not wait for an online report if symptoms are severe. Contact emergency care or visit a hospital."
    : needsReview
      ? "Share this with a doctor, especially if symptoms are getting worse, lasting more than a day, or affecting normal activity."
      : "Keep monitoring. If symptoms continue, become stronger, or worry you, send the report to a doctor.";
  return `
    <div class="analysis-box">
      <h4>${title}</h4>
      <p>${escapeHtml(advice)}</p>
      <p><strong>Your words:</strong> ${escapeHtml(cleanText)}</p>
    </div>
  `;
}

function voiceControls(targetId) {
  return `
    <div class="symptom-grid compact">
      <div class="field">
        <label for="voice-language-${targetId}">Voice language</label>
        <select id="voice-language-${targetId}" data-voice-language>
          <option value="en-IN">English</option>
          <option value="hi-IN">Hindi</option>
          <option value="ta-IN">Tamil</option>
          <option value="te-IN">Telugu</option>
          <option value="kn-IN">Kannada</option>
          <option value="ml-IN">Malayalam</option>
          <option value="mr-IN">Marathi</option>
          <option value="bn-IN">Bengali</option>
          <option value="gu-IN">Gujarati</option>
          <option value="pa-IN">Punjabi</option>
        </select>
      </div>
      <div class="form-grid">
        <button class="button secondary" data-action="start-voice" data-voice-target="${targetId}" type="button">Dictate clinical note</button>
        <span class="status review" id="voice-status">Voice is ready</span>
      </div>
    </div>
  `;
}

function personalizedAnalysisPanel(patient, reading) {
  const hasProfile = patient?.diseases || patient?.allergies || patient?.medications || patient?.symptoms;
  if (!hasProfile && !reading) return `<div class="notice">Complete the profile and connect the device to get a personalised summary for doctor review.</div>`;
  const lines = [];
  if (patient?.diseases) lines.push(`Known conditions: ${patient.diseases}. This helps the doctor understand your risk and history.`);
  if (patient?.allergies) lines.push(`Allergies: ${patient.allergies}. This is important before any medicine is suggested.`);
  if (patient?.medications) lines.push(`Current medicines: ${patient.medications}. The doctor can check for side effects or interactions.`);
  if (patient?.symptoms) lines.push(symptomTextToSummary(patient.symptoms));
  if (reading) lines.push(...personalizedSensorNotes(patient, reading));
  return `
    <div class="analysis-box">
      <h4>What this means in simple words</h4>
      <ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
    </div>
  `;
}

function personalizedSensorNotes(patient, reading) {
  const notes = [];
  const profile = `${patient?.diseases || ""} ${patient?.symptoms || ""}`.toLowerCase();
  if (profile.includes("asthma") || profile.includes("copd") || profile.includes("breath")) {
    notes.push(`Because you mentioned breathing-related concerns, the oxygen reading is especially important. It is ${reading.spo2}%.`);
  }
  if (profile.includes("diabetes")) {
    notes.push("With diabetes, illness, fever, or unusual tiredness should be taken seriously. Share this report if symptoms continue.");
  }
  if (profile.includes("blood pressure") || profile.includes("hypertension")) {
    notes.push(`Because high blood pressure is part of your profile, today's pressure of ${reading.systolic}/${reading.diastolic} should be tracked regularly.`);
  }
  if (patient?.medications) {
    notes.push("Your current medications are included so the doctor can check whether symptoms may be related to treatment or interactions.");
  }
  if (!notes.length) notes.push("Your sensor readings have been reviewed together with your profile. A doctor can use this combined context for a better consultation.");
  return notes;
}

function patientScheduleSummary(patientId) {
  const upcoming = state.healthCheckups.filter((item) => item.patientId === patientId).slice(-1)[0];
  if (!upcoming) return `<div class="notice">No health checkup is scheduled.</div>`;
  return `<div class="notice"><strong>Scheduled:</strong> ${escapeHtml(upcoming.date)} at ${escapeHtml(upcoming.time)}<br />${escapeHtml(upcoming.note || "Routine health checkup")}</div>`;
}

function patientAppointmentSummary(patientId) {
  const appointments = state.appointments.filter((item) => item.patientId === patientId).slice(-2);
  if (!appointments.length) return "";
  return `
    <div class="panel">
      <div class="panel-header"><div><h3>Doctor appointments</h3><p>Consultation status and meeting links.</p></div></div>
      <div class="alert-list">
        ${appointments
          .map(
            (item) => `
              <div class="alert-item">
                <div>
                  <strong>${escapeHtml(item.doctorName)}</strong><br />
                  ${escapeHtml(item.date)} at ${escapeHtml(item.time)}
                  ${item.attachmentScope ? `<br /><small>${escapeHtml(appointmentAttachmentSummary(item))}</small>` : ""}
                  ${item.meetLink ? `<br /><a href="${escapeHtml(item.meetLink)}" target="_blank" rel="noreferrer">Join video consultation</a>` : ""}
                </div>
                <span class="status ${item.status === "approved" ? "approved" : "pending"}">${escapeHtml(item.status)}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function reportActions(type, reading) {
  const doctors = approvedDoctors();
  const needsReading = type === "general";
  return `
    <div class="report-actions">
      <div class="field">
        <label for="doctor-select">Choose doctor</label>
        <select id="doctor-select">
          ${doctors.length ? doctors.map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.name)} - ${escapeHtml(doctor.specialty || "General")}</option>`).join("") : `<option value="">No approved doctors yet</option>`}
        </select>
      </div>
      <div class="table-actions">
        <button class="button secondary" data-action="generate-report" data-report-type="${type}" ${needsReading && !reading ? "disabled" : ""}>Generate clinical PDF</button>
        <button class="button secondary" data-action="find-hospital" type="button">Find nearby hospital</button>
        <button class="button secondary" data-action="request-appointment" data-report-type="${type}" data-silent="true" ${!doctors.length ? "disabled" : ""}>Request appointment</button>
        <button class="button" data-action="send-report" data-report-type="${type}" ${!doctors.length || (needsReading && !reading) ? "disabled" : ""}>Send for doctor review</button>
      </div>
    </div>
  `;
}

function approvedDoctors() {
  return state.users.filter((user) => user.role === "doctor" && user.verification === "approved");
}

function doctorReports(reports) {
  if (!reports.length) return `<div class="notice">No patient reports have been sent yet.</div>`;
  return `
    <table class="table">
      <thead><tr><th>Patient</th><th>Type</th><th>Summary</th><th>Sent</th></tr></thead>
      <tbody>
        ${reports
          .map(
            (report) => `
              <tr>
                <td>${escapeHtml(report.patientName)}</td>
                <td>${escapeHtml(report.type === "personalized" ? "Personalised tracking" : "General tracking")}</td>
                <td>${escapeHtml(report.summary)}</td>
                <td>${escapeHtml(report.createdAt)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function doctorAppointments(appointments) {
  if (!appointments.length) return `<div class="notice">No appointment requests are waiting.</div>`;
  return `
    <table class="table">
      <thead><tr><th>Patient</th><th>Requested time</th><th>Reason</th><th>Attachments</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>
        ${appointments
          .map(
            (appointment) => `
              <tr>
                <td>${escapeHtml(appointment.patientName)}</td>
                <td>${escapeHtml(appointment.date)}<br />${escapeHtml(appointment.time)}</td>
                <td>${escapeHtml(appointment.reason || "Follow-up consultation")}</td>
                <td>${escapeHtml(appointmentAttachmentSummary(appointment))}</td>
                <td>
                  <span class="status ${appointment.status === "approved" ? "approved" : "pending"}">${escapeHtml(appointment.status)}</span>
                  ${appointment.meetLink ? `<br /><a href="${escapeHtml(appointment.meetLink)}" target="_blank" rel="noreferrer">Jitsi meet link</a>` : ""}
                </td>
                <td>
                  ${
                    appointment.status === "approved"
                      ? "Approved"
                      : `<button class="button small" data-approve-appointment="${appointment.id}">Approve appointment</button>`
                  }
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function appointmentAttachmentSummary(appointment) {
  const scopeLabels = {
    "current-report": "Current report",
    "weekly-sensor-data": "Weekly sensor data",
    "monthly-sensor-data": "Monthly sensor data",
    "since-previous-appointment": "Data since previous appointment",
  };
  const parts = [scopeLabels[appointment.attachmentScope] || "Current report"];
  if (appointment.attachPdf === "yes") parts.push("PDF attached");
  if (appointment.pdfFileName) parts.push(appointment.pdfFileName);
  if (appointment.attachmentNote) parts.push(appointment.attachmentNote);
  return parts.join(" | ");
}

function latestReading() {
  return state.readings[state.readings.length - 1] || null;
}

function readingStatus(reading) {
  if (!reading) return { label: "Waiting", className: "review" };
  if (reading.heartRate > 110 || reading.spo2 < 94 || reading.temperature > 38 || reading.systolic > 140) {
    return { label: "Needs attention", className: "alert" };
  }
  return { label: "Stable", className: "normal" };
}

function bindCommon() {
  app.querySelector('[data-action="go-back"]')?.addEventListener("click", () => {
    if (currentUser()?.role === "patient" && patientStep !== "home") {
      patientStep = "home";
      render();
      showToast("Returned to patient tracks");
      return;
    }
    window.history.back();
  });
  app.querySelector('[data-action="logout"]')?.addEventListener("click", () => {
    stopSimulation();
    setUser(null);
  });
  app.querySelector('[data-action="open-admin-login"]')?.addEventListener("click", showAdminLogin);
  app.querySelectorAll('[data-action="toggle-theme"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      theme = theme === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, theme);
      render();
      showToast(`${theme === "dark" ? "Dark" : "Light"} mode enabled`);
    });
  });
  app.onclick = (event) => {
    const button = event.target.closest("button");
    if (button && !button.disabled && !button.dataset.silent) acknowledgeButton(button);
  };
  drawChart();
}

function bindAuth() {
  app.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const [role, mode] = button.dataset.authMode.split(":");
      activeAuth = role;
      authMode[role] = mode;
      render();
    });
  });
  app.querySelectorAll("[data-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const [role, mode] = form.dataset.form.split("-");
      const data = Object.fromEntries(new FormData(form));
      mode === "login" ? login(role, data) : register(role, data);
    });
  });
  activeAuth = activeAuth || "patient";
}

function login(role, data) {
  const user = state.users.find(
    (item) => item.role === role && item.email.toLowerCase() === data.email.toLowerCase() && item.password === data.password,
  );
  if (!user) return showModal("Login failed", "Check the email, password, and selected role.");
  if (role === "doctor" && user.verification !== "approved") {
    setUser(user);
    return;
  }
  setUser(user);
}

function adminLogin(data) {
  const user = state.users.find(
    (item) =>
      item.role === "admin" &&
      item.email.toLowerCase() === String(data.email || "").toLowerCase() &&
      item.password === data.password,
  );
  if (!user) return showModal("Admin sign in failed", "Use a valid admin email and password.");
  setUser(user);
}

function register(role, data) {
  if (state.users.some((user) => user.email.toLowerCase() === data.email.toLowerCase())) {
    return showModal("Account exists", "Use another email address or log in with the existing account.");
  }
  const id = uid(role);
  if (role === "patient") {
    const user = { id, role, name: data.name, email: data.email, password: data.password, age: data.age, condition: data.condition };
    state.users.push(user);
    state.patients.push({
      id,
      name: data.name,
      age: data.age,
      condition: data.condition,
      deviceId: `ESP32-HO-${Math.floor(1000 + Math.random() * 8999)}`,
      status: "not connected",
    });
    saveState();
    setUser(user);
    return;
  }
  const precheck = runLicensePrecheck(data);
  const doctor = {
    id,
    role,
    name: data.name,
    email: data.email,
    password: data.password,
    specialty: data.specialty,
    license: data.license,
    hospital: data.hospital,
    verification: "pending",
    aiScore: precheck.score,
    notes: precheck.note,
  };
  state.users.push(doctor);
  saveState();
  authMode.doctor = "login";
  render();
  showModal("Doctor application submitted", `AI pre-check score: ${precheck.score}%. Admin approval is required before login access is fully enabled.`);
}

function runLicensePrecheck(data) {
  const license = String(data.license || "");
  let score = 55;
  if (/^(NMC|MCI|MED|DOC)-?\d{5,}$/i.test(license)) score += 25;
  if (String(data.name || "").toLowerCase().startsWith("dr")) score += 8;
  if (String(data.hospital || "").trim().length > 6) score += 7;
  if (String(data.specialty || "").trim().length > 3) score += 5;
  score = Math.min(score, 98);
  return {
    score,
    note: score >= 80 ? "Format, identity text, and workplace fields look consistent." : "Needs closer review; license format or workplace details are weak.",
  };
}

function bindPatient() {
  app.querySelectorAll("[data-patient-step]").forEach((button) => {
    button.addEventListener("click", () => {
      patientStep = button.dataset.patientStep;
      if (patientStep === "personalized") {
        const patient = state.patients.find((item) => item.id === currentUser()?.id);
        personalizedEditorOpen = !hasPatientProfile(patient);
      }
      render();
    });
  });
  app.querySelectorAll('[data-action="toggle-sidebar"]').forEach((button) => {
    button.addEventListener("click", () => {
      patientSidebarOpen = !patientSidebarOpen;
      render();
    });
  });
  app.querySelector('[data-action="toggle-simulation"]')?.addEventListener("click", () => {
    simulationTimer ? stopSimulation() : startSimulation();
    render();
  });
  app.querySelector('[data-action="connect-esp32"]')?.addEventListener("click", connectEsp32);
  app.querySelectorAll('[data-action="start-voice"]').forEach((button) => {
    button.addEventListener("click", startVoiceInput);
  });
  app.querySelector('[data-form="general-input"]')?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveGeneralInput(new FormData(event.currentTarget).get("generalInput"));
  });
  app.querySelector('[data-form="personalized-profile"]')?.addEventListener("submit", (event) => {
    event.preventDefault();
    savePersonalizedProfile(Object.fromEntries(new FormData(event.currentTarget)));
  });
  app.querySelector('[data-action="edit-personalized-profile"]')?.addEventListener("click", () => {
    personalizedEditorOpen = true;
    render();
  });
  app.querySelector('[data-action="generate-report"]')?.addEventListener("click", (event) => {
    generateReport(event.currentTarget.dataset.reportType);
  });
  app.querySelector('[data-action="send-report"]')?.addEventListener("click", (event) => {
    sendReport(event.currentTarget.dataset.reportType);
  });
  app.querySelector('[data-action="request-appointment"]')?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    requestAppointment(event.currentTarget.dataset.reportType);
  });
  app.querySelector('[data-action="find-hospital"]')?.addEventListener("click", findNearbyHospital);
  app.querySelector('[data-action="schedule-checkup"]')?.addEventListener("click", showScheduleCheckup);
  app.querySelector('[data-action="feeling-unwell"]')?.addEventListener("click", () => {
    patientStep = "personalized";
    personalizedEditorOpen = true;
    render();
    showToast("Opened personalised tracking for symptoms and medical history");
  });
}

function bindDoctor() {
  app.querySelectorAll("[data-approve-appointment]").forEach((button) => {
    button.addEventListener("click", () => approveAppointment(button.dataset.approveAppointment));
  });
}

function bindAdmin() {
  app.querySelectorAll("[data-approve-doctor]").forEach((button) => {
    button.addEventListener("click", () => updateDoctorStatus(button.dataset.approveDoctor, "approved"));
  });
  app.querySelectorAll("[data-reject-doctor]").forEach((button) => {
    button.addEventListener("click", () => updateDoctorStatus(button.dataset.rejectDoctor, "rejected"));
  });
}

function updateDoctorStatus(id, verification) {
  const user = state.users.find((item) => item.id === id);
  if (user) user.verification = verification;
  state.doctorApplications = state.doctorApplications.map((item) => (item.id === id ? { ...item, verification } : item));
  saveState();
  render();
}

function saveSymptoms(symptoms) {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (patient) patient.symptoms = String(symptoms || "").trim();
  saveState();
  patientStep = "general";
  render();
}

function saveGeneralInput(generalInput) {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (patient) patient.generalInput = String(generalInput || "").trim();
  saveState();
  render();
}

function savePersonalizedProfile(data) {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (patient) {
    patient.diseases = String(data.diseases || "").trim();
    patient.allergies = String(data.allergies || "").trim();
    patient.medications = String(data.medications || "").trim();
    patient.symptoms = String(data.symptoms || "").trim();
  }
  personalizedEditorOpen = false;
  saveState();
  render();
  showToast("Personalised profile saved");
}

function hasPatientProfile(patient) {
  return [patient?.diseases, patient?.allergies, patient?.medications, patient?.symptoms].some((value) => String(value || "").trim());
}

function startVoiceInput(event) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const status = document.querySelector("#voice-status");
  if (!SpeechRecognition) {
    if (status) status.textContent = "Voice input is not supported in this browser";
    showModal("Voice not supported", "Use Chrome or Edge for voice input, or type your symptoms.");
    return;
  }
  recognition?.stop();
  const targetId = event?.currentTarget?.dataset?.voiceTarget || "general-input-text";
  recognition = new SpeechRecognition();
  recognition.lang = document.querySelector("[data-voice-language]")?.value || "en-IN";
  recognition.interimResults = true;
  recognition.continuous = false;
  if (status) status.textContent = "Listening...";
  recognition.onresult = (event) => {
    const text = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(" ");
    const input = document.querySelector(`#${targetId}`);
    if (input) input.value = text;
  };
  recognition.onerror = () => {
    if (status) status.textContent = "Could not hear clearly. Try again or type.";
  };
  recognition.onend = () => {
    const input = document.querySelector("#symptoms-text");
    if (status) status.textContent = input?.value ? "Voice captured" : "Voice stopped";
  };
  recognition.start();
}

function findNearbyHospital() {
  const openMaps = (query) => window.open(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, "_blank");
  if (!navigator.geolocation) {
    openMaps("nearby hospital");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => openMaps(`hospital near ${position.coords.latitude},${position.coords.longitude}`),
    () => openMaps("nearby hospital"),
    { enableHighAccuracy: true, timeout: 7000 },
  );
}

function meetingTimeOptions(selected = "") {
  const slots = [];
  for (let hour = 9; hour <= 20; hour += 1) {
    slots.push(timeSlotLabel(hour, 0));
    if (hour < 20) slots.push(timeSlotLabel(hour, 30));
  }
  return `<option value="">Select a standard time</option>${slots
    .map((slot) => `<option value="${escapeHtml(slot)}" ${slot === selected ? "selected" : ""}>${escapeHtml(slot)}</option>`)
    .join("")}`;
}

function timeSlotLabel(hour24, minute) {
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function showScheduleCheckup() {
  const root = document.querySelector("#modal-root");
  if (!root) return;
  root.innerHTML = `
    <div class="modal">
      <div class="modal-card auth-modal">
        <div class="panel-header">
          <div>
            <h3>Schedule health checkup</h3>
            <p>Select a suitable time for routine sensor monitoring and follow-up review.</p>
          </div>
          <button class="icon-button" data-action="close-modal" aria-label="Close">x</button>
        </div>
        <form class="form-grid" data-form="schedule-checkup">
          <div class="field"><label for="checkup-date">Date</label><input id="checkup-date" name="date" type="date" required /></div>
          <div class="field"><label for="checkup-time">Time</label><select id="checkup-time" name="time" required>${meetingTimeOptions()}</select></div>
          <div class="field"><label for="checkup-note">Clinical note</label><input id="checkup-note" name="note" placeholder="Routine monitoring, BP review, oxygen review" /></div>
          <button class="button" type="submit">Confirm health checkup</button>
        </form>
      </div>
    </div>
  `;
  bindModalClose(root);
  root.querySelector('[data-form="schedule-checkup"]').addEventListener("submit", (event) => {
    event.preventDefault();
    const patient = state.patients.find((item) => item.id === currentUser()?.id);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.healthCheckups.push({ id: uid("checkup"), patientId: patient?.id, ...data, createdAt: new Date().toLocaleString() });
    saveState();
    root.innerHTML = "";
    render();
    showToast("Health checkup scheduled");
  });
}

function showAppointmentRequestModal(doctor, report, context = "request") {
  const root = document.querySelector("#modal-root");
  if (!root) return;
  const wasSent = context === "sent";
  root.innerHTML = `
    <div class="modal">
      <div class="modal-card">
        <div class="panel-header">
          <div>
            <h3>${wasSent ? `Report sent to ${escapeHtml(doctor.name)}` : `Request appointment with ${escapeHtml(doctor.name)}`}</h3>
            <p>${wasSent ? "Your report has been shared for clinical review. You can now request a consultation time." : "Choose a standard consultation slot and decide what sensor data should travel with the request."}</p>
          </div>
          <button class="icon-button" data-action="close-modal" aria-label="Close">x</button>
        </div>
        <form class="form-grid" data-form="appointment-request">
          <div class="field"><label for="appointment-date">Preferred date</label><input id="appointment-date" name="date" type="date" required /></div>
          <div class="field"><label for="appointment-time">Preferred time</label><select id="appointment-time" name="time" required>${meetingTimeOptions()}</select></div>
          <div class="field"><label for="appointment-reason">Reason for consultation</label><input id="appointment-reason" name="reason" value="${escapeHtml(report.type === "personalized" ? "Personalised health review" : "General tracking review")}" /></div>
          <div class="field"><label for="appointment-attachment-scope">Sensor data to include</label><select id="appointment-attachment-scope" name="attachmentScope">
            <option value="current-report">Current report only</option>
            <option value="weekly-sensor-data">Weekly sensor data</option>
            <option value="monthly-sensor-data">Monthly sensor data</option>
            <option value="since-previous-appointment">Since previous appointment</option>
          </select></div>
          <label class="check-field"><input type="checkbox" name="attachPdf" value="yes" checked /> Attach generated PDF/report summary</label>
          <div class="field"><label for="appointment-pdf-file">Additional PDF</label><input id="appointment-pdf-file" name="pdfFile" type="file" accept="application/pdf" /></div>
          <div class="field"><label for="appointment-attachment-note">Attachment note</label><input id="appointment-attachment-note" name="attachmentNote" placeholder="Example: include BP trend after last visit" /></div>
          <div class="table-actions">
            <button class="button" type="submit">Request appointment</button>
            <button class="button secondary" data-action="close-modal" type="button">Later</button>
          </div>
        </form>
      </div>
    </div>
  `;
  bindModalClose(root);
  root.querySelector(".modal-card")?.addEventListener("click", (event) => event.stopPropagation());
  root.querySelector('[data-form="appointment-request"]').addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    createAppointment(doctor, report, data);
    root.innerHTML = "";
    render();
    showToast("Appointment request sent to doctor");
  });
}

function showPostReportModal(doctor, report) {
  showAppointmentRequestModal(doctor, report, "sent");
}

function createAppointment(doctor, report, data) {
  const pdfFile = data.pdfFile instanceof File && data.pdfFile.name ? data.pdfFile : null;
  state.appointments.push({
    id: uid("appointment"),
    reportId: report.id,
    doctorId: doctor.id,
    doctorName: doctor.name,
    patientId: report.patientId,
    patientName: report.patientName,
    date: data.date,
    time: data.time,
    reason: data.reason,
    attachmentScope: data.attachmentScope || "current-report",
    attachPdf: data.attachPdf === "yes" ? "yes" : "no",
    pdfFileName: pdfFile?.name || "",
    attachmentNote: String(data.attachmentNote || "").trim(),
    status: "pending",
    createdAt: new Date().toLocaleString(),
  });
  saveState();
}

function approveAppointment(id) {
  const appointment = state.appointments.find((item) => item.id === id);
  if (!appointment) return;
  appointment.status = "approved";
  appointment.meetLink = `https://meet.jit.si/koushalya-${appointment.id.replaceAll("-", "")}`;
  appointment.approvedAt = new Date().toLocaleString();
  saveState();
  render();
  showToast("Appointment approved and Jitsi link generated");
}

function buildReport(type) {
  const user = currentUser();
  const patient = state.patients.find((item) => item.id === user?.id);
  const reading = latestReading();
  const symptomText = patient?.symptoms || document.querySelector("#symptoms-text")?.value || "";
  const generalInput = patient?.generalInput || document.querySelector("#general-input-text")?.value || "";
  const readingSummary = analyzeReading(reading).join(" ");
  const symptomSummary = symptomTextToSummary(symptomText);
  const personalizedSummary = [
    patient?.diseases ? `Known conditions: ${patient.diseases}.` : "",
    patient?.allergies ? `Allergies: ${patient.allergies}.` : "",
    patient?.medications ? `Current medicines: ${patient.medications}.` : "",
    symptomSummary,
  ]
    .filter(Boolean)
    .join(" ");
  const analysis =
    type === "personalized"
      ? personalizedSummary
      : [readingSummary, generalInput ? `Patient input: ${generalInput}` : "", symptomSummary ? `Symptoms note: ${symptomSummary}` : ""]
          .filter(Boolean)
          .join(" ");
  return {
    id: uid("report"),
    type,
    patientId: user.id,
    patientName: user.name,
    age: patient?.age || user.age || "",
    condition: patient?.condition || user.condition || "",
    diseases: patient?.diseases || "",
    allergies: patient?.allergies || "",
    medications: patient?.medications || "",
    symptoms: symptomText,
    generalInput,
    reading,
    summary: analysis || "No analysis available yet.",
    createdAt: new Date().toLocaleString(),
  };
}

function symptomTextToSummary(text) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return "";
  const lower = cleanText.toLowerCase();
  if (["chest pain", "difficulty breathing", "breathless", "faint", "unconscious"].some((term) => lower.includes(term))) {
    return "The patient described symptoms that may need urgent medical attention. Please review as soon as possible.";
  }
  if (["fever", "vomit", "dizziness", "weakness", "severe headache"].some((term) => lower.includes(term))) {
    return "The patient described symptoms that should be reviewed by a doctor, especially if they are worsening or continuing.";
  }
  return "The patient described symptoms for routine review. Please advise if monitoring, medicine, or consultation is needed.";
}

function generateReport(type) {
  const report = buildReport(type);
  if (type === "general" && !report.reading) {
    showModal("No readings yet", "Connect your device or start simulation before generating a general tracking report.");
    return;
  }
  if (type === "personalized" && !hasPersonalizedDetails(report)) {
    showModal("Complete profile first", "Add at least one disease, allergy, medication, or today's symptom before generating the report.");
    return;
  }
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showModal("Popup blocked", "Allow popups to generate the printable PDF report.");
    return;
  }
  printWindow.document.write(reportHtml(report));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function sendReport(type) {
  const doctorId = document.querySelector("#doctor-select")?.value;
  const doctor = approvedDoctors().find((item) => item.id === doctorId);
  const report = buildReport(type);
  if (!doctor) {
    showModal("Choose a doctor", "Select an approved doctor before sending the report.");
    return;
  }
  if (type === "general" && !report.reading) {
    showModal("No readings yet", "Connect your device or start simulation before sending the report.");
    return;
  }
  if (type === "personalized" && !hasPersonalizedDetails(report)) {
    showModal("Complete profile first", "Add at least one disease, allergy, medication, or today's symptom before sending the report.");
    return;
  }
  state.sentReports.push({ ...report, doctorId, doctorName: doctor.name });
  saveState();
  showPostReportModal(doctor, report);
}

function requestAppointment(type) {
  const doctorId = document.querySelector("#doctor-select")?.value;
  const doctor = approvedDoctors().find((item) => item.id === doctorId);
  const report = buildReport(type);
  if (!doctor) {
    showModal("Choose a doctor", "Select an approved doctor before requesting an appointment.");
    return;
  }
  if (type === "personalized" && !hasPersonalizedDetails(report)) {
    showModal("Complete profile first", "Add at least one disease, allergy, medication, or today's symptom before requesting an appointment.");
    return;
  }
  showAppointmentRequestModal(doctor, report, "request");
}

function hasPersonalizedDetails(report) {
  return [report.diseases, report.allergies, report.medications, report.symptoms].some((value) => String(value || "").trim());
}

function reportHtml(report) {
  const profileRows = `
    ${report.diseases ? `<tr><td>Diseases or long-term conditions</td><td>${escapeHtml(report.diseases)}</td></tr>` : ""}
    ${report.allergies ? `<tr><td>Allergies</td><td>${escapeHtml(report.allergies)}</td></tr>` : ""}
    ${report.medications ? `<tr><td>Current medications</td><td>${escapeHtml(report.medications)}</td></tr>` : ""}
    ${report.generalInput ? `<tr><td>Patient input during tracking</td><td>${escapeHtml(report.generalInput)}</td></tr>` : ""}
  `;
  const symptomRow = report.symptoms
    ? `<tr><td>Symptoms shared by patient</td><td>${escapeHtml(report.symptoms)}</td></tr>`
    : "";
  const readingRows = report.reading
    ? `
      <tr><td>Pulse</td><td>${report.reading.heartRate} beats per minute</td></tr>
      <tr><td>Breathing oxygen</td><td>${report.reading.spo2}%</td></tr>
      <tr><td>Body temperature</td><td>${report.reading.temperature} C</td></tr>
      <tr><td>Blood pressure</td><td>${report.reading.systolic}/${report.reading.diastolic}</td></tr>
    `
    : "";
  const rows =
    profileRows.trim() || symptomRow || readingRows
      ? `${profileRows}${symptomRow}${readingRows}`
      : `<tr><td>Report details</td><td>No symptoms or readings were available.</td></tr>`;
  return `
    <!doctype html>
    <html>
      <head>
        <title>Koushalya Report</title>
        <style>
          body { font-family: Arial, sans-serif; color: #172027; padding: 32px; line-height: 1.5; }
          h1 { margin: 0 0 8px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          td, th { border: 1px solid #dce5e9; padding: 10px; text-align: left; }
          .box { border: 1px solid #dce5e9; padding: 16px; border-radius: 8px; }
        </style>
      </head>
      <body>
        <h1>Koushalya Patient Report</h1>
        <p><strong>Patient:</strong> ${escapeHtml(report.patientName)} | <strong>Age:</strong> ${escapeHtml(report.age)} | <strong>Date:</strong> ${escapeHtml(report.createdAt)}</p>
        <p><strong>Reason:</strong> ${escapeHtml(report.type === "personalized" ? "Personalised tracking" : "General overall tracking")}</p>
        <table><tbody>${rows}</tbody></table>
        <div class="box">
          <h2>Simple AI explanation</h2>
          <p>${escapeHtml(report.summary)}</p>
        </div>
        <p>This report is for doctor review and is not a final diagnosis.</p>
      </body>
    </html>
  `;
}

async function connectEsp32() {
  if (!("serial" in navigator)) {
    showModal("Web Serial unavailable", "Use Chrome or Edge on desktop, or start simulation to test the monitoring workflow.");
    return;
  }
  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 115200 });
    markPatientConnected();
    readSerialLoop();
    showModal("ESP32 connected", "Listening for newline-delimited JSON readings from the device.");
  } catch (error) {
    showModal("Connection cancelled", error.message || "The ESP32 connection was not opened.");
  }
}

async function readSerialLoop() {
  const decoder = new TextDecoderStream();
  serialPort.readable.pipeTo(decoder.writable).catch(() => {});
  reader = decoder.readable.getReader();
  let buffer = "";
  while (serialPort?.readable) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach((line) => {
      try {
        addReading(JSON.parse(line));
      } catch {
        console.warn("Ignoring unreadable ESP32 packet", line);
      }
    });
  }
}

function startSimulation() {
  markPatientConnected();
  addReading(simulatedReading());
  simulationTimer = window.setInterval(() => {
    addReading(simulatedReading());
    render();
  }, 2200);
}

function stopSimulation() {
  if (simulationTimer) window.clearInterval(simulationTimer);
  simulationTimer = null;
}

function markPatientConnected() {
  const user = currentUser();
  const patient = state.patients.find((item) => item.id === user?.id);
  if (patient) {
    patient.status = "connected";
    patient.deviceId = document.querySelector("#device-id")?.value || patient.deviceId;
  }
  saveState();
}

function simulatedReading() {
  const wave = Math.sin(Date.now() / 6000);
  return {
    heartRate: Math.round(78 + wave * 8 + Math.random() * 8),
    spo2: Math.round(97 + Math.random() * 2),
    temperature: Number((36.6 + Math.random() * 0.5).toFixed(1)),
    systolic: Math.round(120 + wave * 7 + Math.random() * 5),
    diastolic: Math.round(78 + wave * 4 + Math.random() * 4),
    time: new Date().toLocaleTimeString(),
  };
}

function addReading(reading) {
  state.readings.push({
    heartRate: Number(reading.heartRate),
    spo2: Number(reading.spo2),
    temperature: Number(reading.temperature),
    systolic: Number(reading.systolic),
    diastolic: Number(reading.diastolic),
    time: reading.time || new Date().toLocaleTimeString(),
  });
  state.readings = state.readings.filter((item) => Number.isFinite(item.heartRate)).slice(-40);
  saveState();
  drawChart();
}

function drawChart() {
  const canvas = document.querySelector("#vitals-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const readings = state.readings.slice(-24);
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfdfc";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#dce5e9";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = 34 + i * 68;
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(width - 24, y);
    ctx.stroke();
  }
  if (readings.length < 2) {
    ctx.fillStyle = "#68747f";
    ctx.font = "26px Inter, sans-serif";
    ctx.fillText("Waiting for live readings", 40, 180);
    return;
  }
  plotLine(ctx, readings, "heartRate", "#df6c55", 45, 130, width, height);
  plotLine(ctx, readings, "spo2", "#117c73", 88, 100, width, height);
  plotLine(ctx, readings, "systolic", "#3567b5", 95, 155, width, height);
  ctx.fillStyle = "#172027";
  ctx.font = "22px Inter, sans-serif";
  ctx.fillText("Heart rate", 42, 32);
  ctx.fillStyle = "#117c73";
  ctx.fillText("Oxygen", 188, 32);
  ctx.fillStyle = "#3567b5";
  ctx.fillText("Systolic", 270, 32);
}

function plotLine(ctx, readings, key, color, min, max, width, height) {
  const left = 42;
  const right = width - 36;
  const top = 50;
  const bottom = height - 34;
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  readings.forEach((reading, index) => {
    const x = left + (index / (readings.length - 1)) * (right - left);
    const normalized = (Number(reading[key]) - min) / (max - min);
    const y = bottom - Math.max(0, Math.min(1, normalized)) * (bottom - top);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function stopChart() {
  if (chartFrame) cancelAnimationFrame(chartFrame);
  chartFrame = null;
}

function showModal(title, body) {
  const root = document.querySelector("#modal-root");
  if (!root) return alert(`${title}\n${body}`);
  root.innerHTML = `
    <div class="modal">
      <div class="modal-card">
        <div class="panel-header">
          <div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(body)}</p>
          </div>
        </div>
        <button class="button" data-action="close-modal">Close</button>
      </div>
    </div>
  `;
  root.querySelector("[data-action='close-modal']").addEventListener("click", () => {
    root.innerHTML = "";
  });
}

function bindModalClose(root) {
  root.querySelectorAll("[data-action='close-modal']").forEach((button) => {
    button.addEventListener("click", () => {
      root.innerHTML = "";
    });
  });
}

function acknowledgeButton(button) {
  button.classList.add("acknowledged");
  window.setTimeout(() => button.classList.remove("acknowledged"), 650);
  const label = button.textContent.trim();
  if (label) showToast(`${label} acknowledged`);
}

function showToast(message) {
  let toast = document.querySelector("#toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function showAdminLogin() {
  const root = document.querySelector("#modal-root");
  if (!root) return;
  root.innerHTML = `
    <div class="modal">
      <div class="modal-card auth-modal">
        <div class="panel-header">
          <div>
            <h3>Staff sign in</h3>
            <p>Admin access is protected. Sign in to review doctor credentials.</p>
          </div>
          <button class="icon-button" data-action="close-modal" aria-label="Close">x</button>
        </div>
        <form class="form-grid" data-form="admin-login">
          <div class="field">
            <label for="admin-email">Admin email</label>
            <input id="admin-email" name="email" type="email" required placeholder="admin@koushalya.health" />
          </div>
          <div class="field">
            <label for="admin-password">Password</label>
            <input id="admin-password" name="password" type="password" required placeholder="admin123" />
          </div>
          <button class="button" type="submit">Sign in securely</button>
          <div class="notice">Demo admin: admin@koushalya.health / admin123</div>
        </form>
      </div>
    </div>
  `;
  root.querySelector("[data-action='close-modal']").addEventListener("click", () => {
    root.innerHTML = "";
  });
  root.querySelector('[data-form="admin-login"]').addEventListener("submit", (event) => {
    event.preventDefault();
    adminLogin(Object.fromEntries(new FormData(event.currentTarget)));
  });
}

render();
syncStateFromServer({ rerender: true });
startSharedStatePolling();
