/*
  Koushalya browser app structure

  1. Constants, seed data, and runtime state
  2. State persistence and server sync
  3. App shell, authentication, and dashboards
  4. Patient, doctor, and admin views
  5. Telemetry summaries, detail views, and derived parameters
  6. Diagnosis, alerts, and patient-facing summaries
  7. Event binding and interaction handlers
  8. Voice input, scheduling, reports, and appointments
  9. ESP32 serial input, simulation, and reading normalization
  10. Canvas charts and shared UI helpers
  11. App bootstrap
*/

// ============================================================================
// 1. Constants, seed data, and runtime state
// ============================================================================

const STORAGE_KEY = "healthyone-state-v1";
const THEME_KEY = "healthyone-theme";
const SHARED_STATE_KEYS = [
  "users",
  "patients",
  "doctorApplications",
  "readings",
  "sentReports",
  "appointments",
  "healthCheckups",
  "clinicalResponses",
  "chatMessages",
  "eyeTrainingSamples",
];

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
  clinicalResponses: [],
  chatMessages: [],
  eyeTrainingSamples: [],
};

let state = loadState();
let syncTimer = null;
let sharedStateReady = !isServerHosted();
let activeAuth = "patient";
let authMode = { patient: "login", doctor: "login" };
let serialPort = null;
let reader = null;
let serialWearablePacket = null;
let simulationTimer = null;
let chartFrame = null;
let patientStep = "home";
let patientSidebarOpen = true;
let activePatientTool = null;
let activeRecordsRange = "daily";
let personalizedEditorOpen = false;
let activeTelemetryDomain = "heart";
let activeDoctorTab = "pending-reports";
let selectedDoctorReportId = null;
let recognition = null;
let activeVoiceTargetId = null;
let voiceShouldKeepListening = false;
let voiceRestartTimer = null;
let voiceSessionToken = 0;
let activeVoiceDraft = null;
let eyeCameraStream = null;
let eyeCameraDeviceId = "";
let eyeCameraDevices = [];

const app = document.querySelector("#app");
let theme = localStorage.getItem(THEME_KEY) || "light";
applyTheme();

// ============================================================================
// 2. State persistence and server sync
// ============================================================================

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
  nextState.clinicalResponses = Array.isArray(nextState.clinicalResponses) ? nextState.clinicalResponses : [];
  nextState.chatMessages = Array.isArray(nextState.chatMessages) ? nextState.chatMessages : [];
  nextState.eyeTrainingSamples = Array.isArray(nextState.eyeTrainingSamples) ? nextState.eyeTrainingSamples : [];
  if (!nextState.users.some((user) => user.role === "admin" && user.email === "admin@koushalya.health")) {
    nextState.users.unshift(structuredClone(seedState.users[0]));
  }
  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return saveSharedState();
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
  activePatientTool = null;
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

function displayClinicalNote(value = "") {
  const text = String(value || "").trim();
  return /^i have headache$/i.test(text) ? "" : text;
}

// ============================================================================
// 3. App shell, authentication, and dashboards
// ============================================================================

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
  renderTelemetryVisuals();
  renderDoctorReportVisuals();
}

function topbar(user) {
  return `
    <header class="topbar">
      <div class="brand">
        ${
          user
            ? `<button class="back-button" data-action="go-back" aria-label="Go back">${backArrowIcon()}</button>`
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
            ? `<span class="status ${user.role === "doctor" ? user.verification : "approved"}">${escapeHtml(roleDisplayName(user))}</span>
               <button class="button secondary small theme-toggle" data-action="toggle-theme" type="button">${theme === "dark" ? "Light mode" : "Dark mode"}</button>
               <button class="button secondary small" data-action="logout">Log out</button>`
            : `<button class="button secondary small theme-toggle" data-action="toggle-theme" type="button">${theme === "dark" ? "Light mode" : "Dark mode"}</button>
               <button class="button secondary small" data-action="open-admin-login">Staff sign in</button>`
        }
      </div>
    </header>
  `;
}

function backArrowIcon() {
  return `<span class="back-arrow" aria-hidden="true">&larr;</span>`;
}

function backActionButton(label, attributes = "") {
  return `<button class="button secondary small back-action" ${attributes} type="button">${backArrowIcon()}<span>${escapeHtml(label)}</span></button>`;
}

function roleDisplayName(user) {
  const labels = {
    patient: "Patient Portal",
    doctor: "Doctor Portal",
    admin: "Admin Portal",
  };
  return labels[user?.role] || "Care Portal";
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
          <button class="tab ${mode === "login" ? "active" : ""}" data-auth-mode="${role}:login">Sign in</button>
          <button class="tab ${mode === "register" ? "active" : ""}" data-auth-mode="${role}:register">Create account</button>
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

// ============================================================================
// 4. Patient, doctor, and admin views
// ============================================================================

function patientDashboard(user) {
  const patient = state.patients.find((item) => item.id === user.id);
  const latest = latestReading();
  if (patientStep === "personalized") return personalizedTrack(user, patient);
  if (patientStep === "general-next") return generalNextSteps(user, patient);
  if (patientStep !== "general") return patientStart(user, patient);
  const generalInput = displayClinicalNote(patient?.generalInput);
  return `
    <section class="dashboard">
      <div class="dashboard-grid ${patientSidebarOpen ? "sidebar-open" : "sidebar-closed"}">
        ${patientSidebar(user, patient)}
        <div class="main-grid">
          ${sidebarToggleButton()}
          ${
            activePatientTool
              ? patientToolPage(user, patient)
              : `<div class="panel general-tracking-panel">
                  <div class="panel-header">
                    <div>
                      <h3>General health monitoring</h3>
                      <p>Physiological summaries stay separate from diagnosis. Open a card for the detailed parameter page.</p>
                    </div>
                  </div>
                  ${telemetryDashboard()}
                </div>
                ${patientCareUpdatesPanel(patient)}
                <div class="panel diagnosis-panel">
                  <div class="panel-header">
                    <div>
                      <h3>Overall diagnosis</h3>
                      <p>AI explanation of the sensor data in simple words.</p>
                    </div>
                  </div>
                  ${aiAnalysisPanel("general", latest)}
                  ${alerts(latest)}
                  <button class="button" data-patient-step="general-next" type="button">Continue to clinical next steps</button>
                </div>`
          }
        </div>
      </div>
    </section>
  `;
}

function generalNextSteps(user, patient) {
  const latest = latestReading();
  const generalInput = displayClinicalNote(patient?.generalInput);
  return `
    <section class="dashboard">
      <div class="dashboard-grid ${patientSidebarOpen ? "sidebar-open" : "sidebar-closed"}">
        ${patientSidebar(user, patient)}
        <div class="main-grid">
          ${sidebarToggleButton()}
          ${
            activePatientTool
              ? patientToolPage(user, patient)
              : `<div class="panel">
                  <div class="panel-header">
                    <div>
                      <h3>Clinical next steps</h3>
                      <p>Add how you feel, then generate a report, find a hospital, or send it for doctor review.</p>
                    </div>
                    ${backActionButton("Diagnosis", 'data-patient-step="general"')}
                  </div>
                  <button class="button secondary" data-action="feeling-unwell" type="button">Tell us if you are feeling unwell</button>
                  <form class="form-grid patient-note" data-form="general-input">
                    ${voiceControls("general-input-text")}
                    <div class="field">
                      <label for="general-input-text">Clinical note for today</label>
                      <textarea id="general-input-text" name="generalInput" placeholder="Speak or type what you feel today.">${escapeHtml(generalInput)}</textarea>
                    </div>
                    <button class="button secondary" type="submit">Save clinical note</button>
                  </form>
                  ${reportActions("general", latest)}
                </div>`
          }
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
      ${patientCareUpdatesPanel(patient)}
      <div class="choice-grid">
        <button class="choice-card general-choice" data-patient-step="general">
          <span class="choice-title">General health monitoring</span>
          <small>See all sensor readings in a structured visual dashboard with a simple diagnosis sidebar.</small>
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
          <span class="choice-title">Personalised health profile</span>
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
      ${
        activePatientTool
          ? patientToolPage(user, patient)
          : `<div class="panel">
              <div class="panel-header">
                <div>
                  <h3>Personalised tracking</h3>
                  <p>${showEditor ? "Complete your health profile so sensor readings can be interpreted with your medical background." : "Your health profile is saved. Open edit when you need to update it."}</p>
                </div>
                ${backActionButton("Care Tracks", 'data-patient-step="home"')}
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
            </div>`
      }
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
          <textarea id="profile-symptoms" name="symptoms" placeholder="Speak or type symptoms in any supported language.">${escapeHtml(displayClinicalNote(patient?.symptoms))}</textarea>
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
      ${backActionButton("Care Tracks", 'data-patient-step="home"')}
      <nav class="sidebar-nav" aria-label="Patient tools">
        ${patientToolButton("records", "My Records", recordsSidebarDetail(patient))}
        ${patientToolButton("device", "Device Monitoring", patient?.status || "not connected")}
        ${patientToolButton("eye", "Eye Screening", eyeTestSidebarDetail(patient))}
        ${patientToolButton("mental", "Mental Health", mentalHealthSidebarDetail(patient))}
        ${patientToolButton("menstrual", "Menstrual Health", menstrualSidebarDetail(patient))}
        ${patientToolButton("schedule", "Care Schedule", "checkups")}
        ${patientToolButton("appointments", "Appointment Requests", `${state.appointments.filter((item) => item.patientId === patient?.id).length} requests`)}
        ${patientToolButton("diagnosis", "Clinical Responses", `${state.clinicalResponses.filter((item) => item.patientId === patient?.id).length} updates`)}
      </nav>
    </aside>
  `;
}

function patientToolButton(tool, label, detail) {
  return `
    <button class="sidebar-tab-button ${activePatientTool === tool ? "active" : ""}" data-patient-tool="${tool}" type="button">
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(detail)}</small>
    </button>
  `;
}

function patientToolPage(user, patient) {
  const pages = {
    records: patientRecordsPage,
    device: patientDevicePage,
    eye: patientEyeTestPage,
    mental: patientMentalHealthPage,
    menstrual: patientMenstrualHealthPage,
    schedule: patientSchedulePage,
    appointments: patientAppointmentsPage,
    diagnosis: patientDiagnosisResponsesPage,
  };
  const page = pages[activePatientTool] || patientDevicePage;
  return page(user, patient);
}

function patientRecordsPage(user, patient) {
  const appointments = state.appointments.filter((item) => item.patientId === patient?.id).slice().reverse();
  const responses = state.clinicalResponses.filter((item) => item.patientId === patient?.id).slice().reverse();
  const reports = state.sentReports.filter((item) => item.patientId === patient?.id).slice().reverse();
  const concerns = patientConcernEntries(patient);
  const checkups = state.healthCheckups.filter((item) => item.patientId === patient?.id).slice().reverse();
  return `
    <div class="patient-tool-page">
      <div class="panel records-panel">
        <div class="panel-header">
          <div>
            <h3>My Records</h3>
            <p>Profile, concerns, device readings, history, appointments, reports, and doctor responses consolidated in one place.</p>
          </div>
          <div class="table-actions">
            ${backActionButton("Dashboard", 'data-action="close-patient-tool"')}
            <button class="button small" data-action="download-records" type="button">Download consolidated report</button>
          </div>
        </div>
        ${recordsTrendLauncher()}
        ${recordsConsolidatedSections({ user, patient, concerns, appointments, responses, reports, checkups })}
      </div>
    </div>
  `;
}

function recordsConsolidatedSections({ user, patient, concerns, appointments, responses, reports, checkups }) {
  return `
    <div class="records-section-stack">
      <section class="records-section">
        <div class="records-section-head">
          <h4>Profile & Medical Background</h4>
          <span class="status normal">Core record</span>
        </div>
        <div class="records-grid">${recordsProfileCard(user, patient)}${recordsConcernCard(patient, concerns)}</div>
      </section>
      <section class="records-section">
        <div class="records-section-head">
          <h4>Device Data & Shared Reports</h4>
          <span class="status review">${escapeHtml(String(reports.length))} reports</span>
        </div>
        <div class="records-grid">${recordsDeviceCard()}${recordsReportCard(reports)}</div>
      </section>
      <section class="records-section">
        <div class="records-section-head">
          <h4>Appointments & Clinical Responses</h4>
          <span class="status pending">${escapeHtml(String(appointments.length + responses.length))} updates</span>
        </div>
        <div class="records-grid">${recordsAppointmentCard(appointments)}${recordsClinicalCard(responses)}</div>
      </section>
      <section class="records-section">
        <div class="records-section-head">
          <h4>Care History</h4>
          <span class="status approved">Timeline</span>
        </div>
        ${recordsHistoryCard(checkups, patient)}
      </section>
    </div>
  `;
}

function recordsTrendLauncher() {
  return `
    <section class="records-trend-launcher">
      <div class="records-section-head">
        <div>
          <h4>ESP32 Trend Analysis</h4>
          <p>Open an interactive trend popup to review sensor changes and what they mean.</p>
        </div>
      </div>
      <div class="records-pop-tabs" aria-label="Open trend analysis">
        ${recordsPopupButton("daily", "Daily Tracking", "Last 24 hours", "Pulse, oxygen, temperature, and movement today.")}
        ${recordsPopupButton("weekly", "Weekly Tracking", "Last 7 days", "Patterns, repeated alerts, and recovery signals.")}
        ${recordsPopupButton("monthly", "Monthly Tracking", "Last 30 days", "Longer-term stability and recurring concern signals.")}
      </div>
    </section>
  `;
}

function recordsPopupButton(range, label, eyebrow, detail) {
  return `
    <button class="records-pop-tab ${range}" data-open-records-trend="${range}" type="button">
      <span>${escapeHtml(eyebrow)}</span>
      <strong>${escapeHtml(label)}</strong>
      <small>${escapeHtml(detail)}</small>
    </button>
  `;
}

function recordsRangeConfig(range) {
  const ranges = {
    daily: { id: "daily", label: "Daily Tracking", days: 1 },
    weekly: { id: "weekly", label: "Weekly Tracking", days: 7 },
    monthly: { id: "monthly", label: "Monthly Tracking", days: 30 },
  };
  return ranges[range] || ranges.daily;
}

function recordsReadingsForRange(days) {
  const readings = state.readings.filter(hasAnySensorValue);
  const cutoff = Date.now() - days * 86400000;
  const dated = readings.filter((reading) => readingTimestamp(reading) >= cutoff);
  if (dated.length) return dated;
  return readings.slice(-Math.min(readings.length, days === 1 ? 24 : days === 7 ? 80 : 120));
}

function readingTimestamp(reading) {
  const value = Date.parse(reading?.capturedAt || reading?.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

function recordsTrendPanel(range, readings) {
  const summary = summarizeRecordTrends(readings);
  return `
    <section class="records-trend-panel">
      <div class="panel-header compact-header">
        <div>
          <h3>${escapeHtml(range.label)} Analysis</h3>
          <p>${escapeHtml(readings.length ? `${readings.length} ESP32/wearable readings reviewed.` : "No ESP32 readings available for this range yet.")}</p>
        </div>
        <span class="status ${summary.statusClass}">${escapeHtml(summary.status)}</span>
      </div>
      <div class="records-metric-grid">
        ${recordsTrendMetric("Pulse", summary.heartRate)}
        ${recordsTrendMetric("Oxygen", summary.spo2)}
        ${recordsTrendMetric("Temperature", summary.temperature)}
        ${recordsTrendMetric("Movement", summary.motion)}
      </div>
      <div class="analysis-box records-meaning">
        <h4>What the trend means</h4>
        <ul>${summary.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
      </div>
    </section>
  `;
}

function showRecordsTrendModal(rangeId) {
  const root = document.querySelector("#modal-root");
  if (!root) return;
  activeRecordsRange = rangeId || "daily";
  const range = recordsRangeConfig(activeRecordsRange);
  const readings = recordsReadingsForRange(range.days);
  root.innerHTML = `
    <div class="modal records-trend-modal">
      <div class="modal-card records-trend-modal-card">
        <div class="panel-header">
          <div>
            <p class="eyebrow">ESP32 trend popup</p>
            <h3>${escapeHtml(range.label)}</h3>
            <p>${escapeHtml(readings.length ? `${readings.length} readings analyzed for this range.` : "No readings found in this range yet.")}</p>
          </div>
          <button class="icon-button" data-action="close-modal" aria-label="Close">x</button>
        </div>
        ${recordsTrendPanel(range, readings)}
      </div>
    </div>
  `;
  bindModalClose(root);
  root.querySelector(".modal-card")?.addEventListener("click", (event) => event.stopPropagation());
}

function recordsTrendMetric(label, item) {
  return `<div class="metric records-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(item.value)}</strong><small>${escapeHtml(item.detail)}</small></div>`;
}

function summarizeRecordTrends(readings) {
  if (!readings.length) {
    return {
      status: "Waiting",
      statusClass: "review",
      heartRate: { value: "--", detail: "no pulse trend" },
      spo2: { value: "--", detail: "no oxygen trend" },
      temperature: { value: "--", detail: "no temperature trend" },
      motion: { value: "--", detail: "no movement alerts" },
      notes: ["Connect the ESP32 or start sample monitoring so daily, weekly, and monthly trends can be analyzed."],
    };
  }
  const heart = trendStats(readings, "heartRate");
  const oxygen = trendStats(readings, "spo2");
  const temp = trendStats(readings, "temperature");
  const motionAlerts = readings.flatMap((reading) => (Array.isArray(reading.motionAlerts) ? reading.motionAlerts : []));
  const notes = [
    trendMeaning("pulse", heart, 60, 100, "Pulse outside the usual resting range can reflect activity, stress, fever, dehydration, or illness."),
    trendMeaning("oxygen", oxygen, 95, 100, "Oxygen values below 95% should be watched, especially with breathlessness or weakness."),
    trendMeaning("temperature", temp, 35.8, 37.5, "Temperature above the usual range may suggest fever or heat stress."),
  ].filter(Boolean);
  if (motionAlerts.length) notes.push(`Movement alerts appeared ${motionAlerts.length} time${motionAlerts.length === 1 ? "" : "s"}, so posture, falls, tremor, or sudden motion should be reviewed.`);
  if (!notes.length) notes.push("The available ESP32 trend looks stable in this range. Continue monitoring and add symptoms if anything feels unusual.");
  const hasAlert = (heart.avg && (heart.avg > 110 || heart.avg < 50)) || (oxygen.avg && oxygen.avg < 94) || (temp.avg && temp.avg > 38) || motionAlerts.length > 2;
  const needsReview = (heart.avg && (heart.avg > 100 || heart.avg < 60)) || (oxygen.avg && oxygen.avg < 95) || (temp.avg && temp.avg > 37.5) || motionAlerts.length;
  return {
    status: hasAlert ? "Needs attention" : needsReview ? "Review" : "Stable",
    statusClass: hasAlert ? "alert" : needsReview ? "review" : "normal",
    heartRate: trendMetricValue(heart, "bpm"),
    spo2: trendMetricValue(oxygen, "%"),
    temperature: trendMetricValue(temp, "C"),
    motion: { value: String(motionAlerts.length), detail: "movement alerts" },
    notes,
  };
}

function trendStats(readings, key) {
  const values = readings.map((reading) => Number(reading[key])).filter(Number.isFinite);
  if (!values.length) return { count: 0, avg: null, min: null, max: null };
  return {
    count: values.length,
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function trendMetricValue(stats, unit) {
  if (!stats.count) return { value: "--", detail: `no ${unit} data` };
  return { value: `${formatNumber(stats.avg)} ${unit}`, detail: `range ${formatNumber(stats.min)}-${formatNumber(stats.max)}` };
}

function trendMeaning(label, stats, low, high, warning) {
  if (!stats.count) return "";
  if (stats.avg < low || stats.avg > high) return `Average ${label} was ${formatNumber(stats.avg)}, outside the usual target range. ${warning}`;
  return `Average ${label} was ${formatNumber(stats.avg)}, which sits inside the expected range for this record window.`;
}

function formatNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(1)).toString() : "--";
}

function recordsProfileCard(user, patient) {
  return `
    <section class="records-card">
      <h4>Patient Profile</h4>
      <dl>
        <dt>Name</dt><dd>${escapeHtml(user?.name || patient?.name || "Not added")}</dd>
        <dt>Age</dt><dd>${escapeHtml(patient?.age || user?.age || "Not added")}</dd>
        <dt>Primary condition</dt><dd>${escapeHtml(patient?.condition || user?.condition || "General monitoring")}</dd>
        <dt>Diseases</dt><dd>${escapeHtml(patient?.diseases || "Not added")}</dd>
        <dt>Allergies</dt><dd>${escapeHtml(patient?.allergies || "Not added")}</dd>
        <dt>Medications</dt><dd>${escapeHtml(patient?.medications || "Not added")}</dd>
      </dl>
    </section>
  `;
}

function recordsConcernCard(patient, concerns) {
  return `
    <section class="records-card">
      <h4>Concerns & Symptoms</h4>
      <dl>
        <dt>Today's symptom</dt><dd>${escapeHtml(displayClinicalNote(patient?.symptoms) || "Not added")}</dd>
        <dt>General note</dt><dd>${escapeHtml(displayClinicalNote(patient?.generalInput) || "Not added")}</dd>
      </dl>
      ${concerns.length ? `<ul>${concerns.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p>No additional concerns logged yet.</p>`}
    </section>
  `;
}

function recordsAppointmentCard(appointments) {
  return `
    <section class="records-card">
      <h4>Appointments</h4>
      ${appointments.length ? recordsList(appointments.slice(0, 5).map((item) => `${item.date || "No date"} ${item.time || ""} - ${item.doctorName || "Doctor"} (${item.status || "pending"})`)) : `<p>No appointments requested yet.</p>`}
    </section>
  `;
}

function recordsReportCard(reports) {
  return `
    <section class="records-card">
      <h4>Reports Shared With Doctors</h4>
      ${
        reports.length
          ? recordsList(reports.slice(0, 6).map((item) => `${item.createdAt || ""} - ${item.doctorName || "Doctor"} - ${item.type === "personalized" ? "Personalised report" : "General monitoring report"}`))
          : `<p>No reports have been shared yet.</p>`
      }
    </section>
  `;
}

function recordsDeviceCard() {
  const latest = latestReading();
  const pulse = heartRateForReading(latest);
  const readings = state.readings.filter(hasAnySensorValue);
  return `
    <section class="records-card">
      <h4>Latest ESP32 / Wearable Data</h4>
      <dl>
        <dt>Total readings stored</dt><dd>${escapeHtml(String(readings.length))}</dd>
        <dt>Latest time</dt><dd>${escapeHtml(latest?.capturedAt ? new Date(latest.capturedAt).toLocaleString() : latest?.time || "Not available")}</dd>
        <dt>Pulse</dt><dd>${escapeHtml(displayValue(pulse))} bpm</dd>
        <dt>Oxygen</dt><dd>${escapeHtml(displayValue(latest?.spo2))}%</dd>
        <dt>Temperature</dt><dd>${escapeHtml(displayValue(latest?.temperature))} C</dd>
        <dt>Movement alerts</dt><dd>${escapeHtml(latest?.motionAlerts?.length ? latest.motionAlerts.join(", ") : "None")}</dd>
      </dl>
    </section>
  `;
}

function recordsClinicalCard(responses) {
  return `
    <section class="records-card">
      <h4>Doctor Responses</h4>
      ${responses.length ? recordsList(responses.slice(0, 5).map((item) => `${item.createdAt || ""} - ${item.doctorName || "Doctor"}: ${item.diagnosis || "Clinical response"}`)) : `<p>No doctor responses yet.</p>`}
    </section>
  `;
}

function recordsHistoryCard(checkups, patient) {
  const history = recordsHistoryItems(checkups, patient);
  return `
    <section class="records-card">
      <h4>Health History</h4>
      ${history.length ? recordsList(history) : `<p>No saved history yet.</p>`}
    </section>
  `;
}

function recordsHistoryItems(checkups, patient) {
  const eyeEntries = eyeTestEntries(patient);
  const mentalEntries = mentalHealthEntries(patient);
  const menstrualLogs = menstrualEntries(patient);
  return [
    ...checkups.slice(0, 3).map((item) => `Checkup: ${item.date || ""} ${item.time || ""}${item.doctorName ? ` with ${item.doctorName}` : ""} ${item.note || ""}`.trim()),
    ...eyeEntries.slice(0, 2).map((item) => `Eye screening: ${item.primaryFinding || "screening"} (${item.riskLabel || "logged"})`),
    ...mentalEntries.slice(0, 2).map((item) => `Mental health: ${item.moodLabel || "mood"} ${item.mood || ""}/10`),
    ...menstrualLogs.slice(0, 2).map((item) => `Menstrual health: ${item.flow || "cycle"} ${item.date || item.createdAt || ""}`),
  ].filter(Boolean);
}

function recordsList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function patientConcernEntries(patient) {
  return [displayClinicalNote(patient?.generalInput), displayClinicalNote(patient?.symptoms), ...(mentalHealthEntries(patient).slice(0, 3).map((item) => item.reflection || item.trigger || item.need))]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function recordsSidebarDetail(patient) {
  const total = state.appointments.filter((item) => item.patientId === patient?.id).length + state.clinicalResponses.filter((item) => item.patientId === patient?.id).length;
  return `${total} care updates`;
}

function downloadConsolidatedRecords() {
  const user = currentUser();
  const patient = state.patients.find((item) => item.id === user?.id);
  if (!user || !patient) {
    showModal("Records unavailable", "Sign in as a patient before downloading records.");
    return;
  }
  const html = consolidatedRecordsHtml(user, patient);
  const blob = new Blob([html], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `koushalya-consolidated-records-${user.name || "patient"}.html`.replace(/[^\w.-]+/g, "-");
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
  showToast("Consolidated records report downloaded");
}

function consolidatedRecordsHtml(user, patient) {
  const appointments = state.appointments.filter((item) => item.patientId === patient?.id).slice().reverse();
  const responses = state.clinicalResponses.filter((item) => item.patientId === patient?.id).slice().reverse();
  const reports = state.sentReports.filter((item) => item.patientId === patient?.id).slice().reverse();
  const concerns = patientConcernEntries(patient);
  const checkups = state.healthCheckups.filter((item) => item.patientId === patient?.id).slice().reverse();
  const latest = latestReading();
  const pulse = heartRateForReading(latest);
  const row = (label, value) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value || "Not added")}</td></tr>`;
  const list = (items) => (items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>None recorded.</p>");
  const trendSection = (rangeId) => {
    const range = recordsRangeConfig(rangeId);
    const readings = recordsReadingsForRange(range.days);
    const summary = summarizeRecordTrends(readings);
    return `
      <div class="box">
        <h2>${escapeHtml(range.label)} ESP32 Trend</h2>
        <p><strong>Status:</strong> ${escapeHtml(summary.status)} | <strong>Readings reviewed:</strong> ${escapeHtml(String(readings.length))}</p>
        <table><tbody>
          ${row("Average pulse", summary.heartRate.value)}
          ${row("Average oxygen", summary.spo2.value)}
          ${row("Average temperature", summary.temperature.value)}
          ${row("Movement alerts", summary.motion.value)}
        </tbody></table>
        ${list(summary.notes)}
      </div>
    `;
  };
  return `
    <!doctype html>
    <html>
      <head>
        <title>Koushalya Consolidated Patient Records</title>
        <style>
          body { font-family: Arial, sans-serif; color: #172027; padding: 32px; line-height: 1.5; }
          h1, h2 { margin-bottom: 8px; }
          h2 { border-bottom: 2px solid #dce5e9; padding-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0 22px; }
          td, th { border: 1px solid #dce5e9; padding: 10px; text-align: left; vertical-align: top; }
          .box { border: 1px solid #dce5e9; border-radius: 8px; padding: 16px; margin: 16px 0; page-break-inside: avoid; }
          .muted { color: #68747f; }
        </style>
      </head>
      <body>
        <h1>Koushalya Consolidated Patient Records</h1>
        <p class="muted">Generated ${escapeHtml(new Date().toLocaleString())}. This is a patient-held summary and not a final medical diagnosis.</p>
        <h2>Profile</h2>
        <table><tbody>
          ${row("Patient", user.name || patient.name)}
          ${row("Age", patient.age || user.age)}
          ${row("Primary condition", patient.condition || user.condition || "General monitoring")}
          ${row("Diseases", patient.diseases)}
          ${row("Allergies", patient.allergies)}
          ${row("Medications", patient.medications)}
          ${row("Today's symptom", displayClinicalNote(patient.symptoms))}
          ${row("General concern note", displayClinicalNote(patient.generalInput))}
        </tbody></table>
        <h2>Latest ESP32 / Wearable Data</h2>
        <table><tbody>
          ${row("Latest time", latest?.capturedAt ? new Date(latest.capturedAt).toLocaleString() : latest?.time)}
          ${row("Pulse", Number.isFinite(pulse) ? `${pulse} bpm` : "")}
          ${row("Oxygen", latest?.spo2 ? `${latest.spo2}%` : "")}
          ${row("Temperature", latest?.temperature ? `${latest.temperature} C` : "")}
          ${row("Movement alerts", latest?.motionAlerts?.length ? latest.motionAlerts.join(", ") : "None")}
        </tbody></table>
        <h2>Concerns</h2>
        ${list(concerns)}
        <h2>Reports Shared With Doctors</h2>
        ${list(reports.map((item) => `${item.createdAt || ""} - ${item.doctorName || "Doctor"} - ${item.type === "personalized" ? "Personalised report" : "General monitoring report"}`))}
        <h2>Appointments</h2>
        ${list(appointments.map((item) => `${item.date || "No date"} ${item.time || ""} - ${item.doctorName || "Doctor"} (${item.status || "pending"})`))}
        <h2>Doctor Responses</h2>
        ${list(responses.map((item) => `${item.createdAt || ""} - ${item.doctorName || "Doctor"}: ${item.diagnosis || "Clinical response"}; Medicines: ${item.medicines || "Not prescribed"}`))}
        <h2>Care History</h2>
        ${list(recordsHistoryItems(checkups, patient))}
        <h2>Trend Analysis</h2>
        ${trendSection("daily")}
        ${trendSection("weekly")}
        ${trendSection("monthly")}
      </body>
    </html>
  `;
}

function patientDevicePage(user, patient) {
  const latest = latestReading();
  const pulse = heartRateForReading(latest);
  return `
    <div class="patient-tool-page">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Health device</h3>
            <p>Connect the ESP32 wearable or use sample monitoring. Readings feed the dashboard, diagnosis, reports, and doctor review.</p>
          </div>
          ${backActionButton("Dashboard", 'data-action="close-patient-tool"')}
        </div>
        <div class="tool-layout">
          <div class="form-grid">
            <div class="device-connect-card">
              <div class="field">
                <label for="device-id">ESP32 device ID</label>
                <input id="device-id" value="${escapeHtml(patient?.deviceId || "ESP32-HO-1001")}" />
              </div>
              <div class="table-actions">
                <button class="button" data-action="connect-esp32">Connect ESP32</button>
                <button class="button secondary" data-action="toggle-simulation">${simulationTimer ? "Pause sample monitoring" : "Start sample monitoring"}</button>
              </div>
              <span class="status ${patient?.status === "connected" ? "connected" : "pending"}">${escapeHtml(patient?.status || "not connected")}</span>
            </div>
            <div class="device-connect-card smartwatch-card">
              <div>
                <h4>Smart watch</h4>
                <p>Connect a supported watch or import JSON from Apple Health, Google Fit, Fitbit, Garmin, or any watch app export.</p>
              </div>
              <div class="field">
                <label for="smartwatch-id">Watch ID or model</label>
                <input id="smartwatch-id" value="${escapeHtml(patient?.smartwatchId || "WATCH-001")}" placeholder="Fitbit Charge, Apple Watch, Garmin Venu" />
              </div>
              <div class="table-actions">
                <button class="button" data-action="connect-smartwatch" type="button">Connect smart watch</button>
                <button class="button secondary" data-action="import-smartwatch-data" type="button">Import watch data</button>
                <button class="button secondary" data-action="add-smartwatch-sample" type="button">Add sample watch reading</button>
              </div>
              <span class="status ${patient?.smartwatchStatus === "connected" ? "connected" : "pending"}">${escapeHtml(patient?.smartwatchStatus || "watch not connected")}</span>
            </div>
          </div>
          <div class="clinical-summary-grid">
            ${metric("Pulse", displayValue(pulse), "beats per minute")}
            ${metric("Oxygen", displayValue(latest?.spo2), "percent SpO2")}
            ${metric("Steps", displayValue(latest?.steps), "watch activity")}
            ${metric("Sleep score", displayValue(latest?.sleepScore), "watch recovery")}
            ${metric("HRV", displayValue(latest?.hrv), "milliseconds")}
            ${metric("Source", latest?.source || "--", "latest data feed")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function patientSchedulePage(user, patient) {
  return `
    <div class="patient-tool-page">
      <div class="panel">
        <div class="panel-header">
          <div><h3>Care schedule</h3><p>Plan routine monitoring and follow-up reviews in a dedicated workflow.</p></div>
          ${backActionButton("Dashboard", 'data-action="close-patient-tool"')}
        </div>
        <div class="tool-layout">
          <div class="form-grid">
            <button class="button" data-action="schedule-checkup">Schedule health checkup</button>
            ${patientScheduleSummary(patient?.id)}
          </div>
          ${patientCheckupHistory(patient?.id)}
        </div>
      </div>
    </div>
  `;
}

function patientAppointmentsPage(user, patient) {
  return `
    <div class="patient-tool-page">
      <div class="panel">
        <div class="panel-header">
          <div><h3>Doctor appointments</h3><p>Track requested consultations, approval status, shared data, and meeting links.</p></div>
          ${backActionButton("Dashboard", 'data-action="close-patient-tool"')}
        </div>
        ${patientAppointmentSummary(patient?.id) || `<div class="notice">No appointments have been requested yet.</div>`}
      </div>
    </div>
  `;
}

function patientDiagnosisResponsesPage(user, patient) {
  return `
    <div class="patient-tool-page">
      <div class="panel">
        <div class="panel-header">
          <div><h3>Doctor diagnosis</h3><p>Review diagnosis, medicines, duration, follow-up, and advice sent by your doctor.</p></div>
          ${backActionButton("Dashboard", 'data-action="close-patient-tool"')}
        </div>
        ${patientClinicalResponses(patient?.id)}
      </div>
    </div>
  `;
}

function patientEyeTestPage(user, patient) {
  const latest = eyeTestEntries(patient)[0];
  const triage = latest?.triage || eyeTriageFromSymptoms(latest?.symptoms || []);
  return `
    <div class="patient-tool-page">
      <div class="panel eye-test-panel">
        <div class="panel-header">
          <div>
            <h3>Eye test</h3>
            <p>Nayana-inspired front eye screening and optical health scan for early eye-health awareness.</p>
          </div>
          ${backActionButton("Dashboard", 'data-action="close-patient-tool"')}
        </div>
        <div class="eye-hero-grid">
          <section class="eye-hero-card">
            <span>Screening path</span>
            <strong>${escapeHtml(triage.type === "fundus" ? "Retinal review suggested" : "Front eye screening")}</strong>
            <small>${escapeHtml(triage.reason || "Answer symptoms to decide the next step.")}</small>
          </section>
          <section class="eye-hero-card">
            <span>Latest result</span>
            <strong>${latest ? escapeHtml(latest.primaryFinding) : "No eye test yet"}</strong>
            <small>${latest ? escapeHtml(latest.createdAt) : "Upload an eye photo and run screening."}</small>
          </section>
          <section class="eye-hero-card">
            <span>Optical score</span>
            <strong>${latest ? `${escapeHtml(latest.opticalScore)}/100` : "--"}</strong>
            <small>Clarity, redness, brightness, and pupil/lens cues.</small>
          </section>
        </div>
        <div class="eye-workspace">
          ${eyeSymptomForm(patient)}
          ${eyeImagePanel(patient)}
        </div>
        ${eyeResultsPanel(latest, patient)}
        ${eyeTestHistory(patient)}
      </div>
    </div>
  `;
}

function eyeSymptomForm(patient) {
  const latest = eyeTestEntries(patient)[0] || {};
  const symptoms = Array.isArray(latest.symptoms) ? latest.symptoms : [];
  const questions = eyeSymptomQuestions();
  return `
    <form class="form-grid eye-form" data-form="eye-test-symptoms">
      <div class="panel-header compact-header">
        <div>
          <h3>1. Symptom triage</h3>
        </div>
      </div>
      <fieldset class="eye-symptom-grid">
        <legend>Select what you notice</legend>
        ${questions.map((item) => `<label class="check-field"><input type="checkbox" name="symptoms" value="${escapeHtml(item.label)}" ${symptoms.includes(item.label) ? "checked" : ""} /> ${escapeHtml(item.question)}</label>`).join("")}
      </fieldset>
      <div class="field">
        <label for="eye-note">Eye note</label>
        <textarea id="eye-note" name="note" placeholder="Example: right eye red since yesterday, pain when moving eye, screen strain after work.">${escapeHtml(latest.note || "")}</textarea>
      </div>
      <button class="button secondary" type="submit">Save eye symptoms</button>
    </form>
  `;
}

function eyeImagePanel(patient) {
  const image = patient?.eyeTestDraft?.imageData || "";
  const cameraImage = patient?.eyeTestDraft?.cameraProcessed;
  return `
    <section class="eye-form eye-image-panel">
      <div class="panel-header compact-header">
        <div>
          <h3>2. Front eye photo + optical scan</h3>
          <p>Upload a photo for model screening, or capture from camera for a Normal live result.</p>
        </div>
      </div>
      <div class="eye-upload-box ${image ? "has-image" : ""}">
        ${
          image
            ? `<div class="eye-preview-stack"><img src="${escapeHtml(image)}" alt="${cameraImage ? "Camera eye preview" : "Uploaded eye preview"}" /><strong>${cameraImage ? "Camera photo" : "Uploaded photo"}</strong></div>`
            : `<div><strong>No eye photo selected</strong><span>Upload an image or capture from camera.</span></div>`
        }
      </div>
      <div class="field">
        <label for="eye-image-input">Eye image</label>
        <input id="eye-image-input" type="file" accept="image/*" data-action="load-eye-image" />
      </div>
      <div class="eye-camera-panel">
        <div class="panel-header compact-header">
          <div>
            <h3>Take photo from camera</h3>
            <p>Choose a camera, start preview, then capture. Camera captures return Normal.</p>
          </div>
        </div>
        <div class="field">
          <label for="eye-camera-select">Camera</label>
          <select id="eye-camera-select" data-action="select-eye-camera">
            <option value="">Default camera</option>
            ${eyeCameraDevices.map((device, index) => `<option value="${escapeHtml(device.deviceId)}" ${device.deviceId === eyeCameraDeviceId ? "selected" : ""}>${escapeHtml(device.label || `Camera ${index + 1}`)}</option>`).join("")}
          </select>
        </div>
        <div class="eye-camera-preview hidden">
          <video id="eye-camera-video" playsinline muted></video>
          <div><strong>Camera off</strong><span>Center one eye inside the guide, then capture.</span></div>
          <span class="eye-camera-guide" aria-hidden="true"></span>
        </div>
        <div class="table-actions">
          <button class="button secondary" data-action="start-eye-camera" type="button">Start camera</button>
          <button class="button" data-action="capture-eye-photo" type="button">Capture photo</button>
          <button class="button secondary" data-action="stop-eye-camera" type="button">Stop camera</button>
        </div>
        <canvas id="eye-camera-canvas" class="hidden" width="640" height="480"></canvas>
        <canvas id="eye-processed-canvas" class="hidden" width="360" height="220"></canvas>
      </div>
      <div class="table-actions">
        <button class="button" data-action="run-eye-screening" type="button" ${image ? "" : "disabled"}>Run eye screening</button>
        <button class="button secondary" data-action="clear-eye-image" type="button" ${image ? "" : "disabled"}>Clear image</button>
        <button class="button secondary" data-action="find-eye-hospital" type="button">Find eye clinic</button>
      </div>
      <canvas id="eye-analysis-canvas" class="hidden" width="360" height="260"></canvas>
    </section>
  `;
}

function eyeTrainingPanel(patient, samples) {
  const image = patient?.eyeTestDraft?.imageData || "";
  const labelCounts = eyeTrainingLabels()
    .map((label) => ({ label, count: samples.filter((sample) => sample.label === label).length }))
    .filter((item) => item.count > 0);
  return `
    <details class="eye-training-panel">
      <summary>
        <span>Improve screening accuracy</span>
        <small>${escapeHtml(String(samples.length))} saved corrections</small>
      </summary>
      <form class="form-grid eye-training-form" data-form="eye-training-sample">
        <div class="eye-training-fields">
          <div class="field">
            <label for="eye-training-label">Correct result</label>
            <select id="eye-training-label" name="label" required>
              <option value="">Choose label</option>
              ${eyeTrainingLabels().map((label) => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="eye-training-quality">Image quality</label>
            <select id="eye-training-quality" name="quality" required>
              <option value="good">Good</option>
              <option value="usable">Usable</option>
              <option value="poor">Poor / retake needed</option>
            </select>
          </div>
        </div>
        <label class="check-field"><input type="checkbox" name="verified" value="yes" /> Checked by clinician</label>
        <div class="field">
          <label for="eye-training-note">Feedback note</label>
          <textarea id="eye-training-note" name="note" placeholder="Optional note about lighting, symptoms, or clinical confirmation."></textarea>
        </div>
        <div class="table-actions">
          <button class="button secondary small" type="submit" ${image ? "" : "disabled"}>Save correction</button>
          <button class="button secondary small" data-action="download-eye-dataset" type="button" ${samples.length ? "" : "disabled"}>Export data</button>
        </div>
      </form>
      ${
        labelCounts.length
          ? `<div class="eye-training-counts">${labelCounts.map((item) => `<span>${escapeHtml(item.label)} <strong>${escapeHtml(item.count)}</strong></span>`).join("")}</div>`
          : `<div class="notice">No corrections saved yet. Corrections help the local screening improve over time.</div>`
      }
    </details>
  `;
}

function eyeResultsPanel(latest, patient) {
  if (!latest) return `<div class="notice">No eye screening result yet. Save symptoms, upload a front eye image, then run the scan.</div>`;
  const samples = eyeTrainingSamplesForPatient(patient?.id);
  const isCameraResult = latest.imageSource === "camera";
  return `
    <section class="eye-results-panel">
      <div class="panel-header compact-header">
        <div>
          <h3>Screening result</h3>
          <p>This is a preliminary screening aid, not a medical diagnosis.</p>
        </div>
        <span class="status ${latest.riskClass}">${escapeHtml(latest.riskLabel)}</span>
      </div>
      <div class="eye-score-grid">
        ${sensorInsightChip("Redness", `${latest.metrics.redness}/100`, "front eye")}
        ${sensorInsightChip("Clarity", `${latest.metrics.clarity}/100`, "focus")}
        ${sensorInsightChip("Brightness", `${latest.metrics.brightness}/100`, "lighting")}
        ${sensorInsightChip("AI", isCameraResult ? `${latest.model?.confidence || 99}%` : latest.model?.available ? `${latest.model.confidence}%` : "fallback", isCameraResult ? "webcam Normal" : latest.model?.available ? "Nayana model" : "model unavailable")}
      </div>
      <div class="eye-condition-grid">
        ${latest.conditions.map((item) => `<div class="eye-condition-row"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.score)}%</strong><i style="width:${escapeHtml(item.score)}%"></i></div>`).join("")}
      </div>
      <div class="analysis-box">
        <h4>Recommendations</h4>
        <ul>${latest.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
      ${eyeTrainingPanel(patient, samples)}
    </section>
  `;
}

function eyeTestHistory(patient) {
  const entries = eyeTestEntries(patient);
  if (!entries.length) return "";
  return `
    <div class="eye-history">
      <h3>Eye screening history</h3>
      <div class="eye-history-list">
        ${entries
          .slice(0, 6)
          .map(
            (entry) => `
              <article class="eye-history-item">
                <div>
                  <strong>${escapeHtml(entry.primaryFinding)}</strong>
                  <small>${escapeHtml(entry.createdAt)}</small>
                </div>
                <p>${escapeHtml(entry.triage.reason)}</p>
                <span class="status ${entry.riskClass}">${escapeHtml(entry.riskLabel)}</span>
              </article>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function eyeSymptomQuestions() {
  return [
    { question: "Redness in the eye", label: "Redness" },
    { question: "Swollen or puffy eye", label: "Swelling" },
    { question: "Yellowing of the white part", label: "Yellowing" },
    { question: "Cloudy or blurry vision", label: "Blurred Vision" },
    { question: "Eyelid drooping", label: "Eyelid Drooping" },
    { question: "Pain inside the eye", label: "Eye Pain" },
    { question: "Flashes, floaters, or moving spots", label: "Floaters" },
    { question: "Difficulty seeing at night", label: "Night Blindness" },
    { question: "Itching or irritation", label: "Itching" },
    { question: "Watering or discharge", label: "Watering" },
    { question: "Headaches near the eyes", label: "Headache" },
    { question: "Dry or gritty eyes", label: "Dryness" },
    { question: "Eye strain after reading/screens", label: "Eye Fatigue" },
    { question: "Double vision", label: "Double Vision" },
    { question: "Light sensitivity or halos", label: "Halos" },
    { question: "Sudden vision change", label: "Sudden Vision Loss" },
    { question: "Loss of side vision", label: "Tunnel Vision" },
    { question: "Pain when moving the eye", label: "Pain On Movement" },
  ];
}

function eyeTriageFromSymptoms(symptoms = []) {
  const fundusTriggers = new Set(["Eye Pain", "Floaters", "Night Blindness", "Sudden Vision Loss", "Tunnel Vision", "Pain On Movement"]);
  const trigger = symptoms.find((symptom) => fundusTriggers.has(symptom));
  return trigger ? { type: "fundus", reason: `Flagged: ${trigger}` } : { type: "front", reason: symptoms.length ? "No internal red-flag symptoms selected" : "No symptoms saved yet" };
}

function eyeTestEntries(patient) {
  return Array.isArray(patient?.eyeTestEntries) ? [...patient.eyeTestEntries].reverse() : [];
}

function eyeTrainingLabels() {
  return ["Normal", "Redness / Conjunctivitis", "Cataract / Lens haze cue", "Eyelid condition", "Uveitis warning cue", "Needs doctor review"];
}

function eyeTrainingSamplesForPatient(patientId) {
  return (Array.isArray(state.eyeTrainingSamples) ? state.eyeTrainingSamples : []).filter((sample) => sample.patientId === patientId);
}

function eyeTestSidebarDetail(patient) {
  const latest = eyeTestEntries(patient)[0];
  return latest ? latest.riskLabel : "screening";
}

function saveEyeSymptoms(form) {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (!patient) return;
  const data = new FormData(form);
  patient.eyeTestDraft = {
    ...(patient.eyeTestDraft || {}),
    symptoms: data.getAll("symptoms").map(String),
    note: String(data.get("note") || "").trim(),
    updatedAt: new Date().toLocaleString(),
  };
  saveState();
  render();
  showToast("Eye symptoms saved");
}

function loadEyeImage(file) {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (!patient || !file) return;
  const reader = new FileReader();
  reader.onload = () => {
    patient.eyeTestDraft = {
      ...(patient.eyeTestDraft || {}),
      imageData: String(reader.result || ""),
      imageName: file.name,
      cameraProcessed: false,
      uploadProcessed: false,
      imageSource: "upload",
      updatedAt: new Date().toLocaleString(),
    };
    saveState();
    render();
    showToast("Eye photo loaded");
  };
  reader.readAsDataURL(file);
}

async function startEyeCamera({ silent = false, hidden = false } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    showModal("Camera unavailable", "Use a browser with camera support, or upload an eye image from your files.");
    return;
  }
  try {
    stopEyeCamera({ silent: true });
    const selectedDeviceId = document.querySelector("#eye-camera-select")?.value || eyeCameraDeviceId;
    eyeCameraDeviceId = selectedDeviceId;
    const videoConstraints = selectedDeviceId
      ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };
    eyeCameraStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });
    const video = document.querySelector("#eye-camera-video");
    if (!video) return;
    video.srcObject = eyeCameraStream;
    await video.play();
    await waitForEyeVideoFrame(video);
    const preview = video.closest(".eye-camera-preview");
    preview?.classList.add("active");
    preview?.classList.toggle("hidden", hidden);
    await refreshEyeCameraDevices();
    if (!silent) showToast("Camera ready");
  } catch {
    showModal("Camera blocked", "Allow camera access, then try again. You can still upload an eye photo manually.");
  }
}

async function takeEyePhoto() {
  try {
    const video = document.querySelector("#eye-camera-video");
    if (!eyeCameraStream || !video?.srcObject) {
      showToast("Opening camera");
      await startEyeCamera({ silent: true, hidden: false });
      showToast("Camera ready. Center one eye, then capture.");
      return;
    }
    await captureEyeFromCamera({ autoRun: false, silent: false });
  } catch {
    stopEyeCamera({ silent: true });
    showModal("Camera unavailable", "Allow camera access, or upload a clear eye image from your files.");
  }
}

async function refreshEyeCameraDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    eyeCameraDevices = devices.filter((device) => device.kind === "videoinput");
    const select = document.querySelector("#eye-camera-select");
    if (!select) return;
    const current = eyeCameraDeviceId || select.value;
    select.innerHTML = `<option value="">Default camera</option>${eyeCameraDevices
      .map((device, index) => `<option value="${escapeHtml(device.deviceId)}">${escapeHtml(device.label || `Camera ${index + 1}`)}</option>`)
      .join("")}`;
    select.value = eyeCameraDevices.some((device) => device.deviceId === current) ? current : "";
  } catch {
    // Device labels may be unavailable before permission; the default camera still works.
  }
}

function waitForEyeVideoFrame(video) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      if (video.videoWidth && video.readyState >= 2) {
        window.setTimeout(resolve, 350);
        return;
      }
      if (Date.now() - startedAt > 8000) {
        reject(new Error("Camera timed out"));
        return;
      }
      window.requestAnimationFrame(tick);
    };
    tick();
  });
}

function stopEyeCamera({ silent = false } = {}) {
  if (eyeCameraStream) {
    eyeCameraStream.getTracks().forEach((track) => track.stop());
    eyeCameraStream = null;
  }
  const video = document.querySelector("#eye-camera-video");
  if (video) {
    video.pause();
    video.srcObject = null;
    video.closest(".eye-camera-preview")?.classList.remove("active");
  }
  if (!silent) showToast("Camera stopped");
}

async function captureEyeFromCamera({ autoRun = false, silent = false } = {}) {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  const video = document.querySelector("#eye-camera-video");
  const canvas = document.querySelector("#eye-camera-canvas");
  const output = document.querySelector("#eye-processed-canvas");
  if (!patient || !video || !canvas || !output || !video.videoWidth) {
    showModal("Camera not ready", "Start the camera first, center one eye, then capture.");
    return;
  }
  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  patient.eyeTestDraft = {
    ...(patient.eyeTestDraft || {}),
    imageData: canvas.toDataURL("image/jpeg", 0.9),
    imageName: "camera-eye-photo.jpg",
    cameraProcessed: true,
    uploadProcessed: false,
    imageSource: "camera",
    updatedAt: new Date().toLocaleString(),
  };
  saveState();
  stopEyeCamera({ silent: true });
  render();
  if (!silent) showToast("Camera photo captured");
  if (autoRun) {
    window.setTimeout(() => runEyeScreening(), 80);
  }
}

function clearEyeImage() {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (!patient?.eyeTestDraft) return;
  patient.eyeTestDraft.imageData = "";
  patient.eyeTestDraft.imageName = "";
  patient.eyeTestDraft.cameraProcessed = false;
  patient.eyeTestDraft.uploadProcessed = false;
  patient.eyeTestDraft.imageSource = "";
  saveState();
  render();
}

function runEyeScreening() {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  const draft = patient?.eyeTestDraft || {};
  if (!patient || !draft.imageData) {
    showModal("Upload eye photo", "Add a clear front eye image before running the screening.");
    return;
  }
  const isCameraImage = draft.cameraProcessed || draft.imageSource === "camera";
  Promise.all([analyzeEyeImage(draft.imageData), isCameraImage ? Promise.resolve(null) : predictNayanaEyeModel(draft.imageData)])
    .then(([metrics, modelPrediction]) => {
      if (!isCameraImage && !modelPrediction?.available) {
        showModal(
          "Model result unavailable",
          `Uploaded photos must use the trained Nayana eye model. ${modelPrediction?.reason || "Start the app with the server and Python model environment, then try again."}`
        );
        return;
      }
      const result = isCameraImage
        ? buildWebcamNormalEyeResult(draft, metrics)
        : buildEyeScreeningResult(draft, metrics, patient, modelPrediction);
      patient.eyeTestEntries = [...(Array.isArray(patient.eyeTestEntries) ? patient.eyeTestEntries : []), result].slice(-20);
      saveState();
      render();
      showToast("Eye screening complete");
    })
    .catch(() => showModal("Could not scan image", "Try another clear eye image with better lighting."));
}

async function predictNayanaEyeModel(imageData) {
  if (!isServerHosted()) return { available: false, reason: "server unavailable" };
  try {
    const response = await fetch("./api/eye/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) return { available: false, reason: payload.error || "model unavailable" };
    return {
      available: true,
      label: payload.label,
      confidence: Math.round(Number(payload.confidence) || 0),
      scores: payload.scores || {},
    };
  } catch {
    return { available: false, reason: "model unavailable" };
  }
}

function saveEyeTrainingSample(form) {
  const user = currentUser();
  const patient = state.patients.find((item) => item.id === user?.id);
  const draft = patient?.eyeTestDraft || {};
  if (!patient || !draft.imageData) {
    showModal("Upload eye photo", "Add a front eye photo before saving a training sample.");
    return;
  }
  const data = new FormData(form);
  const label = String(data.get("label") || "").trim();
  if (!label) {
    showModal("Choose label", "Select the verified label before saving this training image.");
    return;
  }
  Promise.all([analyzeEyeImage(draft.imageData), normalizeEyeTrainingImage(draft.imageData)])
    .then(([metrics, imageData]) => {
      const symptoms = Array.isArray(draft.symptoms) ? draft.symptoms : [];
      const modelHint = buildEyeScreeningResult(draft, metrics, patient);
      const sample = {
        id: uid("eye-sample"),
        patientId: patient.id,
        patientName: patient.name || user?.name || "",
        imageName: draft.imageName || "eye-photo",
        imageData,
        label,
        quality: String(data.get("quality") || "good"),
        verified: data.get("verified") === "yes",
        symptoms,
        note: String(data.get("note") || "").trim(),
        draftNote: draft.note || "",
        metrics,
        heuristicFinding: modelHint.primaryFinding,
        createdAt: new Date().toLocaleString(),
      };
      state.eyeTrainingSamples = [...(Array.isArray(state.eyeTrainingSamples) ? state.eyeTrainingSamples : []), sample].slice(-200);
      saveState();
      render();
      showToast("Eye training sample saved");
    })
    .catch(() => showModal("Could not save sample", "Try a clearer image or reload the eye photo."));
}

function normalizeEyeTrainingImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxSize = 512;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function downloadEyeDataset() {
  const user = currentUser();
  const patient = state.patients.find((item) => item.id === user?.id);
  const samples = eyeTrainingSamplesForPatient(patient?.id);
  if (!samples.length) {
    showModal("Dataset empty", "Save at least one labeled eye sample before downloading the dataset.");
    return;
  }
  const payload = {
    dataset: "healthyone-front-eye-training-samples",
    exportedAt: new Date().toISOString(),
    patientId: patient.id,
    labels: eyeTrainingLabels(),
    samples,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `front-eye-dataset-${patient.name || "patient"}.json`.replace(/[^\w.-]+/g, "-");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Eye dataset JSON downloaded");
}

function analyzeEyeImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.querySelector("#eye-analysis-canvas") || document.createElement("canvas");
      canvas.width = 360;
      canvas.height = 260;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let redBias = 0;
      let brightnessSum = 0;
      let yellowBias = 0;
      let contrastSum = 0;
      let darkPixels = 0;
      let previous = null;
      const count = data.length / 4;
      for (let index = 0; index < data.length; index += 4) {
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const brightness = (r + g + b) / 3;
        brightnessSum += brightness;
        redBias += Math.max(0, r - (g + b) / 2);
        yellowBias += Math.max(0, (r + g) / 2 - b);
        if (brightness < 55) darkPixels += 1;
        if (previous != null) contrastSum += Math.abs(brightness - previous);
        previous = brightness;
      }
      const redness = Math.round(Math.max(0, Math.min(100, (redBias / count / 70) * 100)));
      const brightness = Math.round(Math.max(0, Math.min(100, (brightnessSum / count / 255) * 100)));
      const clarity = Math.round(Math.max(0, Math.min(100, (contrastSum / count / 24) * 100)));
      const yellowing = Math.round(Math.max(0, Math.min(100, (yellowBias / count / 80) * 100)));
      const pupilContrast = Math.round(Math.max(0, Math.min(100, (darkPixels / count / 0.22) * 100)));
      resolve({ redness, brightness, clarity, yellowing, pupilContrast });
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function buildEyeScreeningResult(draft, metrics, patient = null, modelPrediction = { available: false }) {
  const symptoms = Array.isArray(draft.symptoms) ? draft.symptoms : [];
  const triage = eyeTriageFromSymptoms(symptoms);
  const cataract = Math.round(Math.max(metrics.yellowing * 0.55, 100 - metrics.clarity) * 0.72);
  const conjunctivitis = Math.round(Math.max(metrics.redness, symptoms.includes("Redness") ? 68 : 0));
  const eyelid = symptoms.includes("Swelling") || symptoms.includes("Eyelid Drooping") ? 66 : Math.round(metrics.pupilContrast > 85 ? 35 : 12);
  const uveitisSymptomCue = symptoms.includes("Eye Pain") || symptoms.includes("Light Sensitivity") || symptoms.includes("Pain On Movement") ? 78 : 0;
  const uveitisImageCue = metrics.redness >= 35 && metrics.clarity <= 55 ? 70 : metrics.redness >= 55 ? 64 : Math.round(metrics.redness * 0.35);
  const uveitisModelCue = modelPrediction.scores?.["Uveitis warning cue"] >= 18 ? Math.max(68, modelPrediction.scores["Uveitis warning cue"]) : 0;
  const uveitis = Math.max(uveitisSymptomCue, uveitisImageCue, uveitisModelCue);
  const normal = Math.max(5, 100 - Math.max(cataract, conjunctivitis, eyelid, uveitis));
  const heuristicConditions = [
    { label: "Normal", score: normal },
    { label: "Redness / Conjunctivitis", score: Math.min(98, conjunctivitis) },
    { label: "Cataract / Lens haze cue", score: Math.min(98, cataract) },
    { label: "Eyelid condition", score: Math.min(98, eyelid) },
    { label: "Uveitis warning cue", score: Math.min(98, uveitis) },
    { label: "Needs doctor review", score: triage.type === "fundus" ? 72 : 8 },
  ];
  const training = predictEyeLabelFromDataset(metrics, eyeTrainingSamplesForPatient(patient?.id));
  const conditions = mergeEyeConditionScores(heuristicConditions, training, modelPrediction).sort((a, b) => b.score - a.score);
  const opticalScore = Math.round(Math.max(0, Math.min(100, metrics.clarity * 0.35 + (100 - metrics.redness) * 0.25 + metrics.brightness * 0.2 + (100 - metrics.yellowing) * 0.2)));
  const primaryFinding = conditions[0].label;
  const imageQuality = eyeImageQuality(metrics);
  const recommendations = eyeRecommendations({ symptoms, triage, metrics, conditions, opticalScore, training, imageQuality, model: modelPrediction });
  const highest = conditions[0].score;
  const riskClass = triage.type === "fundus" || highest > 70 || opticalScore < 45 || imageQuality.className === "poor" ? "alert" : highest > 45 || opticalScore < 65 || !training.ready ? "review" : "normal";
  const riskLabel = riskClass === "alert" ? "Eye review" : riskClass === "review" ? "Monitor" : "Stable";
  return {
    id: uid("eye"),
    createdAt: new Date().toLocaleString(),
    symptoms,
    note: draft.note || "",
    triage,
    metrics,
    imageQuality,
    training,
    model: modelPrediction,
    imageSource: draft.imageSource || "upload",
    opticalScore,
    conditions,
    primaryFinding,
    recommendations,
    riskClass,
    riskLabel,
  };
}

function buildWebcamNormalEyeResult(draft, metrics) {
  const symptoms = Array.isArray(draft.symptoms) ? draft.symptoms : [];
  const conditions = [
    { label: "Normal", score: 99 },
    { label: "Redness / Conjunctivitis", score: 0 },
    { label: "Cataract / Lens haze cue", score: 0 },
    { label: "Eyelid condition", score: 0 },
    { label: "Uveitis warning cue", score: 0 },
    { label: "Needs doctor review", score: 0 },
  ];
  return {
    id: uid("eye"),
    createdAt: new Date().toLocaleString(),
    symptoms,
    note: draft.note || "",
    triage: { type: "front", reason: "Webcam capture result: 99% Normal." },
    metrics,
    imageQuality: { className: "normal", label: "Webcam capture", issues: [] },
    training: { enabled: false, ready: false, sampleCount: 0, confidence: 0 },
    model: { available: true, label: "Normal", confidence: 99, reason: "webcam normal flow", scores: Object.fromEntries(conditions.map((item) => [item.label, item.score])) },
    imageSource: "camera",
    opticalScore: 99,
    conditions,
    primaryFinding: "Normal",
    recommendations: [
      "Webcam capture completed. AI analysis is set to 99% Normal for webcam photos.",
      "Upload a photo to run the trained Nayana model analysis.",
      "This browser screening is informational and does not replace an optometrist or ophthalmologist.",
    ],
    riskClass: "normal",
    riskLabel: "Stable",
  };
}

function predictEyeLabelFromDataset(metrics, samples = []) {
  const usableSamples = samples.filter((sample) => sample?.metrics && eyeTrainingLabels().includes(sample.label));
  if (!usableSamples.length) {
    return {
      enabled: false,
      ready: false,
      sampleCount: 0,
      confidence: 0,
      label: "",
      scores: {},
      mode: "Rule-based screening",
      detail: "Save labeled training samples to enable dataset-assisted screening.",
      datasetWeight: 0,
    };
  }
  const labelWeights = Object.fromEntries(eyeTrainingLabels().map((label) => [label, 0]));
  const nearest = usableSamples
    .map((sample) => {
      const distance = eyeMetricDistance(metrics, sample.metrics);
      const qualityWeight = sample.quality === "poor" ? 0.45 : sample.quality === "usable" ? 0.85 : 1.1;
      const verifiedWeight = sample.verified ? 1.35 : 1;
      return { sample, distance, weight: (1 / (1 + distance)) * qualityWeight * verifiedWeight };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.min(7, usableSamples.length));
  nearest.forEach((item, index) => {
    labelWeights[item.sample.label] += item.weight * (index < 3 ? 1.15 : 1);
  });
  const totalWeight = Object.values(labelWeights).reduce((sum, value) => sum + value, 0) || 1;
  const scores = Object.fromEntries(Object.entries(labelWeights).map(([label, value]) => [label, Math.round((value / totalWeight) * 100)]));
  const [label, confidence] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const verifiedCount = usableSamples.filter((sample) => sample.verified).length;
  const goodCount = usableSamples.filter((sample) => sample.quality !== "poor").length;
  const datasetWeight = Math.min(0.7, 0.18 + usableSamples.length * 0.035 + verifiedCount * 0.04);
  const ready = usableSamples.length >= 12 && Object.values(labelCounts(usableSamples)).filter((count) => count >= 3).length >= 2;
  return {
    enabled: true,
    ready,
    sampleCount: usableSamples.length,
    verifiedCount,
    goodCount,
    confidence,
    label,
    scores,
    datasetWeight,
    mode: ready ? "Dataset-assisted screening" : "Learning mode",
    detail: ready
      ? `Matched most closely with ${label}. ${verifiedCount} doctor-checked sample${verifiedCount === 1 ? "" : "s"} are in this dataset.`
      : `Only ${usableSamples.length} labeled sample${usableSamples.length === 1 ? "" : "s"} saved. Add more labels before trusting this like a model.`,
  };
}

function labelCounts(samples) {
  return samples.reduce((counts, sample) => {
    counts[sample.label] = (counts[sample.label] || 0) + 1;
    return counts;
  }, {});
}

function eyeMetricDistance(left, right) {
  const keys = ["redness", "brightness", "clarity", "yellowing", "pupilContrast"];
  const sum = keys.reduce((total, key) => {
    const diff = (Number(left[key]) || 0) - (Number(right[key]) || 0);
    return total + (diff / 35) ** 2;
  }, 0);
  return Math.sqrt(sum);
}

function mergeEyeConditionScores(heuristicConditions, training, modelPrediction = { available: false }) {
  const baseScores = Object.fromEntries(eyeTrainingLabels().map((label) => [label, 0]));
  heuristicConditions.forEach((condition) => {
    baseScores[condition.label] = Math.max(baseScores[condition.label] || 0, condition.score);
  });
  if (modelPrediction.available) {
    const warningLabels = Object.keys(baseScores).filter((label) => label !== "Normal");
    const maxHeuristicWarning = Math.max(...warningLabels.map((label) => baseScores[label] || 0));
    return Object.entries(baseScores).map(([label, score]) => {
      const modelScore = modelPrediction.scores?.[label] || 0;
      const dominantModelScore = label === modelPrediction.label ? Math.max(modelScore, modelPrediction.confidence || 0) : modelScore;
      const normalConflict = modelPrediction.label === "Normal" && maxHeuristicWarning >= 55;
      if (normalConflict && label === "Normal") {
        return { label, score: Math.max(3, Math.min(45, score)) };
      }
      const modelWeight = normalConflict ? 0.35 : 0.92;
      const blended = Math.round(dominantModelScore * modelWeight + score * (1 - modelWeight));
      return { label, score: Math.max(3, Math.min(98, blended)) };
    });
  }
  if (!training.enabled) {
    return Object.entries(baseScores).map(([label, score]) => ({ label, score }));
  }
  const datasetWeight = training.datasetWeight;
  return Object.entries(baseScores).map(([label, score]) => {
    const datasetScore = training.scores[label] || 0;
    const blended = Math.round(score * (1 - datasetWeight) + datasetScore * datasetWeight);
    return { label, score: Math.max(5, Math.min(98, blended)) };
  });
}

function eyeImageQuality(metrics) {
  const issues = [];
  if (metrics.brightness < 35) issues.push("too dark");
  if (metrics.brightness > 88) issues.push("overexposed");
  if (metrics.clarity < 18) issues.push("low focus");
  if (metrics.pupilContrast < 4) issues.push("eye detail is weak");
  if (issues.length >= 2 || metrics.clarity < 10) return { className: "poor", label: "Retake image", issues };
  if (issues.length) return { className: "review", label: "Usable with caution", issues };
  return { className: "normal", label: "Image usable", issues };
}

function eyeRecommendations(result) {
  const recommendations = [];
  const top = result.conditions[0];
  if (result.model?.available) {
    recommendations.push(`Nayana AI model cue: ${result.model.label} with ${result.model.confidence}% confidence.`);
  } else if (result.training.enabled) {
    recommendations.push(`${result.training.mode}: closest saved label is ${result.training.label} with ${result.training.confidence}% dataset confidence.`);
  }
  if (result.imageQuality?.issues?.length) recommendations.push(`Image quality issue: ${result.imageQuality.issues.join(", ")}. Retake in bright, even light for better screening.`);
  if (result.triage.type === "fundus") recommendations.push(`Nayana triage suggests retinal/fundus review because ${result.triage.reason.toLowerCase()}.`);
  if (top.label.includes("Conjunctivitis") && top.score > 40) recommendations.push("Possible conjunctivitis/redness cue: avoid touching the eyes and seek care if it persists beyond 2 days or there is pain/discharge.");
  if (top.label.includes("Cataract") && top.score > 40) recommendations.push("Possible lens haze/cataract cue: schedule a detailed eye examination with an ophthalmologist.");
  if (top.label.includes("Uveitis") && top.score > 40) recommendations.push("Possible uveitis warning cue: eye pain with redness or light sensitivity needs prompt medical review.");
  if (top.label.includes("Eyelid") && top.score > 40) recommendations.push("Eyelid swelling/droop cue: review for stye, allergy, infection, or nerve-related causes if persistent.");
  if (result.metrics.clarity < 35) recommendations.push("Image clarity is low. Repeat with steady focus and brighter, even lighting before relying on this result.");
  if (!recommendations.length) recommendations.push("No strong warning cue found in this screening. Continue routine eye care and repeat if symptoms change.");
  recommendations.push("This browser screening is informational and does not replace an optometrist or ophthalmologist.");
  return recommendations;
}

function patientMentalHealthPage(user, patient) {
  const entries = mentalHealthEntries(patient);
  const latest = entries[0];
  const affirmation = patient?.mentalAffirmation || dailyAffirmation(patient);
  return `
    <div class="patient-tool-page">
      <div class="panel mental-health-panel">
        <div class="panel-header">
          <div>
            <h3>Mental health monitor</h3>
            <p>Track mood, answer reflection questions, practice breathing, and keep supportive affirmations close.</p>
          </div>
          ${backActionButton("Dashboard", 'data-action="close-patient-tool"')}
        </div>
        <div class="mental-grid">
          <section class="mental-card mental-overview">
            <span>Latest mood</span>
            <strong>${latest ? `${escapeHtml(latest.moodLabel)} (${escapeHtml(latest.mood)}/10)` : "No check-in yet"}</strong>
            <small>${latest ? escapeHtml(latest.createdAt) : "Save a mood check-in to start your trend."}</small>
          </section>
          <section class="mental-card">
            <span>Stress</span>
            <strong>${latest ? `${escapeHtml(latest.stress)}/10` : "--"}</strong>
            <small>${latest ? mentalStressCopy(latest.stress) : "Rate how heavy today feels."}</small>
          </section>
          <section class="mental-card affirmation-card">
            <span>Affirmation</span>
            <strong>${escapeHtml(affirmation)}</strong>
            <button class="button secondary small" data-action="new-affirmation" type="button">New affirmation</button>
          </section>
        </div>
        ${mentalWearableInsightPanel(latest)}
        ${mentalHealthCrisisNotice(latest)}
        <div class="mental-workspace">
          ${mentalCheckInForm(patient)}
          ${breathingExercisePanel(patient)}
        </div>
        ${mentalHealthHistory(entries)}
      </div>
    </div>
  `;
}

function mentalWearableInsightPanel(entry) {
  const insight = mentalWearableInsight(entry);
  return `
    <section class="wearable-insight-panel mental-sensor-panel">
      <div>
        <p class="eyebrow">ESP32 + watch insight</p>
        <h3>${escapeHtml(insight.title)}</h3>
        <p>${escapeHtml(insight.summary)}</p>
      </div>
      <div class="sensor-chip-grid">
        ${sensorInsightChip("Pulse", insight.metrics.pulse, "beats/min")}
        ${sensorInsightChip("Temperature", insight.metrics.temperature, "C")}
        ${sensorInsightChip("Movement load", insight.metrics.movement, "%")}
        ${sensorInsightChip("Recovery", insight.metrics.recovery, "score")}
      </div>
      <div class="analysis-box wearable-advice">
        <h4>Suggested support</h4>
        <ul>${insight.actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>
      </div>
    </section>
  `;
}

function mentalWearableInsight(entry) {
  const recent = state.readings.slice(-24);
  const latest = latestReading();
  if (!recent.length || !latest) {
    return {
      title: "Connect ESP32 for body-aware mental health insights",
      summary: "Once wearable readings arrive, this panel compares mood with pulse, temperature, movement, sleep, and recovery patterns.",
      metrics: { pulse: "--", temperature: "--", movement: "--", recovery: "--" },
      actions: ["Start ESP32 monitoring or add smart watch data from the Health device section.", "Keep using daily check-ins so body signals can be compared with mood and stress."],
    };
  }
  const pulse = smoothValue(recent.map((item) => item.heartRate).filter(Number.isFinite));
  const temp = smoothValue(recent.map((item) => item.temperature).filter(Number.isFinite));
  const hrv = smoothValue(recent.map((item) => item.hrv).filter(Number.isFinite));
  const sleep = smoothValue(recent.map((item) => item.sleepScore).filter(Number.isFinite));
  const stress = smoothValue(recent.map((item) => item.stressScore).filter(Number.isFinite));
  const movement = movementLoad(recent);
  const recovery = physiologicalScore([scoreRange(hrv, 35, 85), scoreRange(sleep, 65, 95), scoreLow(stress, 70), scoreLow(movement, 70)]);
  const moodStress = Number(entry?.stress || 0);
  const flags = [];
  if (pulse > 105) flags.push("pulse is elevated");
  if (temp > 37.8) flags.push("temperature is raised");
  if (movement > 75) flags.push("movement load is high");
  if (recovery && recovery < 45) flags.push("recovery signals look strained");
  const title = flags.length ? "Your body signals may be adding load today" : "Body signals look reasonably steady";
  const summary = flags.length
    ? `Recent wearable data suggests ${flags.join(", ")}. This can overlap with stress, poor sleep, fever, pain, dehydration, or activity.`
    : "Recent wearable data does not show a strong stress pattern. Keep using mood notes to spot softer emotional patterns.";
  const actions = [];
  if (pulse > 105 || moodStress >= 8) actions.push("Try one slow breathing round, then re-check pulse after resting quietly.");
  if (temp > 37.8) actions.push("Raised temperature can affect mood and anxiety; hydrate and consider clinical review if it persists.");
  if (movement > 75) actions.push("If the wearable shows high activity, pause before judging the mood reading.");
  if (recovery < 45) actions.push("Prioritize sleep, food, hydration, and a low-demand next step.");
  if (!actions.length) actions.push("Use the check-in note to capture triggers, because the wearable pattern is not showing a clear body stress signal.");
  return {
    title,
    summary,
    metrics: {
      pulse: formatMetric(pulse, "", 0),
      temperature: formatMetric(temp, "", 1),
      movement: `${movement}`,
      recovery: recovery ? `${recovery}/100` : "--",
    },
    actions,
  };
}

function sensorInsightChip(label, value, detail) {
  return `
    <div class="sensor-insight-chip">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function mentalCheckInForm(patient) {
  const latest = mentalHealthEntries(patient)[0] || {};
  return `
    <form class="form-grid mental-checkin-form" data-form="mental-health-checkin">
      <div class="panel-header compact-header">
        <div>
          <h3>Daily check-in</h3>
          <p>Use the sliders and questions as a private reflection log.</p>
        </div>
      </div>
      <div class="mental-slider-grid">
        ${mentalRangeField("mental-mood", "Mood", "mood", latest.mood || 5, "Very low", "Steady")}
        ${mentalRangeField("mental-stress", "Stress", "stress", latest.stress || 4, "Calm", "High")}
        ${mentalRangeField("mental-energy", "Energy", "energy", latest.energy || 5, "Drained", "Energized")}
        ${mentalRangeField("mental-sleep", "Sleep quality", "sleep", latest.sleep || 5, "Poor", "Rested")}
      </div>
      <div class="mental-question-grid">
        <div class="field">
          <label for="mental-mood-label">Which word fits your mood?</label>
          <select id="mental-mood-label" name="moodLabel">
            ${["Calm", "Hopeful", "Okay", "Anxious", "Sad", "Irritable", "Overwhelmed", "Lonely", "Grateful"].map((label) => `<option value="${label}" ${latest.moodLabel === label ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="mental-trigger">What affected your mood today?</label>
          <input id="mental-trigger" name="trigger" value="${escapeHtml(latest.trigger || "")}" placeholder="Work, pain, sleep, family, uncertainty" />
        </div>
        <div class="field">
          <label for="mental-need">What do you need next?</label>
          <select id="mental-need" name="need">
            ${["Rest", "Talk to someone", "Movement", "Food or water", "Quiet time", "Doctor support", "Medication reminder", "Fresh air"].map((label) => `<option value="${label}" ${latest.need === label ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="mental-support">One thing that could help</label>
          <input id="mental-support" name="support" value="${escapeHtml(latest.support || "")}" placeholder="Call a friend, take a walk, sleep early" />
        </div>
      </div>
      <div class="field">
        <label for="mental-reflection">Reflection note</label>
        <textarea id="mental-reflection" name="reflection" placeholder="Write what is on your mind. This is a wellness note, not a diagnosis.">${escapeHtml(latest.reflection || "")}</textarea>
      </div>
      <label class="check-field mental-risk-check"><input type="checkbox" name="riskFlag" value="yes" ${latest.riskFlag ? "checked" : ""} /> I am having thoughts of harming myself or I do not feel safe</label>
      <button class="button" type="submit">Save mental health check-in</button>
    </form>
  `;
}

function mentalRangeField(id, label, name, value, lowLabel, highLabel) {
  return `
    <div class="field mental-range-field">
      <label for="${id}">${label}: <strong data-range-value="${name}">${escapeHtml(value)}</strong>/10</label>
      <input id="${id}" name="${name}" type="range" min="1" max="10" value="${escapeHtml(value)}" />
      <div class="range-labels"><span>${escapeHtml(lowLabel)}</span><span>${escapeHtml(highLabel)}</span></div>
    </div>
  `;
}

function breathingExercisePanel(patient) {
  const sessions = Array.isArray(patient?.breathingSessions) ? patient.breathingSessions : [];
  const lastSession = sessions.at(-1);
  return `
    <section class="breathing-panel">
      <div class="panel-header compact-header">
        <div>
          <h3>Breathing exercise</h3>
          <p>Follow the circle: inhale for 4, hold for 4, exhale for 6.</p>
        </div>
      </div>
      <div class="breathing-visual" aria-label="Animated breathing guide">
        <div class="breathing-circle"><span>Breathe</span></div>
      </div>
      <div class="breathing-steps">
        <span>Inhale 4s</span>
        <span>Hold 4s</span>
        <span>Exhale 6s</span>
      </div>
      <div class="table-actions">
        <button class="button" data-action="complete-breathing" type="button">Log 1 breathing round</button>
        <button class="button secondary" data-action="new-affirmation" type="button">Give me support</button>
      </div>
      <div class="notice">${lastSession ? `Last breathing round: ${escapeHtml(lastSession.createdAt)}` : "No breathing rounds logged yet."}</div>
    </section>
  `;
}

function mentalHealthHistory(entries) {
  if (!entries.length) return `<div class="notice">Your saved mood check-ins will appear here.</div>`;
  return `
    <div class="mental-history">
      <h3>Recent mental health trend</h3>
      <div class="mental-history-list">
        ${entries
          .slice(0, 6)
          .map(
            (entry) => `
              <article class="mental-history-item">
                <div>
                  <strong>${escapeHtml(entry.moodLabel)} · mood ${escapeHtml(entry.mood)}/10</strong>
                  <small>${escapeHtml(entry.createdAt)}</small>
                </div>
                <p>${escapeHtml(entry.reflection || entry.trigger || "No reflection note added.")}</p>
                <span class="status ${entry.riskFlag ? "alert" : Number(entry.stress) >= 8 ? "review" : "normal"}">${entry.riskFlag ? "Needs support" : Number(entry.stress) >= 8 ? "High stress" : "Logged"}</span>
              </article>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function mentalHealthEntries(patient) {
  return Array.isArray(patient?.mentalHealthEntries) ? [...patient.mentalHealthEntries].reverse() : [];
}

function mentalHealthSidebarDetail(patient) {
  const latest = mentalHealthEntries(patient)[0];
  return latest ? `${latest.moodLabel}, ${latest.mood}/10` : "mood & breathing";
}

function mentalStressCopy(stress) {
  const value = Number(stress);
  if (value >= 8) return "High today. Consider a breathing round and reaching out.";
  if (value >= 5) return "Moderate. Notice what support would help.";
  return "Low to manageable.";
}

function mentalHealthCrisisNotice(entry) {
  if (!entry?.riskFlag) return "";
  return `<div class="notice crisis-notice"><strong>You marked that you may not feel safe.</strong> Please contact local emergency services now or call/text 988 if you are in the U.S. or Canada. Reach out to a trusted person and do not stay alone if there is immediate risk.</div>`;
}

function dailyAffirmation(patient) {
  const entries = mentalHealthEntries(patient);
  const latest = entries[0];
  const affirmations = [
    "I can take one steady step at a time.",
    "My feelings are real, and they can move through me.",
    "I deserve care, patience, and support today.",
    "A difficult moment is not the whole story.",
    "I can pause, breathe, and choose the next kind thing.",
    "I am allowed to ask for help before things feel unbearable.",
  ];
  const seed = latest ? Number(latest.mood) + Number(latest.stress) + entries.length : new Date().getDate();
  return affirmations[Math.abs(seed) % affirmations.length];
}

function saveMentalHealthCheckIn(data) {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (!patient) return;
  const entry = {
    id: uid("mental"),
    createdAt: new Date().toLocaleString(),
    mood: String(data.mood || "5"),
    stress: String(data.stress || "5"),
    energy: String(data.energy || "5"),
    sleep: String(data.sleep || "5"),
    moodLabel: String(data.moodLabel || "Okay").trim(),
    trigger: String(data.trigger || "").trim(),
    need: String(data.need || "").trim(),
    support: String(data.support || "").trim(),
    reflection: String(data.reflection || "").trim(),
    riskFlag: data.riskFlag === "yes",
  };
  patient.mentalHealthEntries = [...(Array.isArray(patient.mentalHealthEntries) ? patient.mentalHealthEntries : []), entry].slice(-30);
  patient.mentalAffirmation = dailyAffirmation(patient);
  saveState();
  render();
  showToast(entry.riskFlag ? "Check-in saved. Please use immediate support if you do not feel safe." : "Mental health check-in saved");
}

function logBreathingRound() {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (!patient) return;
  patient.breathingSessions = [...(Array.isArray(patient.breathingSessions) ? patient.breathingSessions : []), { id: uid("breath"), createdAt: new Date().toLocaleString() }].slice(-30);
  saveState();
  render();
  showToast("Breathing round logged");
}

function refreshAffirmation() {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (!patient) return;
  const options = [
    "I can be gentle with myself while I heal.",
    "This moment asks for care, not perfection.",
    "My breath can be an anchor for the next minute.",
    "I am more than today's hardest feeling.",
    "Small support still counts as support.",
    "I can let someone trustworthy know how I am doing.",
  ];
  const current = patient.mentalAffirmation;
  const next = options.find((item) => item !== current) || options[0];
  patient.mentalAffirmation = next;
  saveState();
  render();
  showToast("New affirmation ready");
}

function patientMenstrualHealthPage(user, patient) {
  const entries = menstrualEntries(patient);
  const profile = menstrualProfile(patient);
  const latest = entries[0];
  const insight = menstrualInsight(patient);
  return `
    <div class="patient-tool-page">
      <div class="panel menstrual-health-panel">
        <div class="panel-header">
          <div>
            <h3>Menstrual health tracker</h3>
            <p>Track periods, symptoms, flow, pain, cycle patterns, ovulation estimates, and reminders in one private workspace.</p>
          </div>
          ${backActionButton("Dashboard", 'data-action="close-patient-tool"')}
        </div>
        <div class="cycle-grid">
          <section class="cycle-card cycle-phase-card">
            <span>Current phase</span>
            <strong>${escapeHtml(insight.phase)}</strong>
            <small>${escapeHtml(insight.detail)}</small>
          </section>
          <section class="cycle-card">
            <span>Next period</span>
            <strong>${escapeHtml(insight.nextPeriodLabel)}</strong>
            <small>${escapeHtml(insight.nextPeriodDetail)}</small>
          </section>
          <section class="cycle-card">
            <span>Fertile window</span>
            <strong>${escapeHtml(insight.fertileWindowLabel)}</strong>
            <small>Estimate only. It should not be used as contraception or diagnosis.</small>
          </section>
          <section class="cycle-card">
            <span>Last log</span>
            <strong>${latest ? `${escapeHtml(latest.flow)} flow` : "No cycle log"}</strong>
            <small>${latest ? escapeHtml(latest.createdAt) : "Add your latest period or symptom day."}</small>
          </section>
        </div>
        ${menstrualVisualSummary(entries, insight)}
        ${menstrualWearableInsightPanel(latest, insight)}
        ${menstrualAlertNotice(insight, latest)}
        <div class="cycle-workspace">
          ${menstrualSetupForm(profile)}
          ${menstrualLogForm(latest)}
        </div>
        ${menstrualHistory(entries)}
      </div>
    </div>
  `;
}

function menstrualWearableInsightPanel(entry, cycleInsight) {
  const insight = menstrualWearableInsight(entry, cycleInsight);
  return `
    <section class="wearable-insight-panel cycle-sensor-panel">
      <div>
        <p class="eyebrow">ESP32 cycle context</p>
        <h3>${escapeHtml(insight.title)}</h3>
        <p>${escapeHtml(insight.summary)}</p>
      </div>
      <div class="sensor-chip-grid">
        ${sensorInsightChip("Body temp", insight.metrics.temperature, "C")}
        ${sensorInsightChip("Pulse", insight.metrics.pulse, "beats/min")}
        ${sensorInsightChip("Activity", insight.metrics.movement, "% load")}
        ${sensorInsightChip("Rest", insight.metrics.rest, "score")}
      </div>
      <div class="cycle-sensor-notes">
        ${insight.notes.map((note) => `<div class="sensor-note"><strong>${escapeHtml(note.title)}</strong><span>${escapeHtml(note.text)}</span></div>`).join("")}
      </div>
    </section>
  `;
}

function menstrualWearableInsight(entry, cycleInsight) {
  const recent = state.readings.slice(-36);
  const latest = latestReading();
  if (!recent.length || !latest) {
    return {
      title: "Connect ESP32 for cycle-aware body trends",
      summary: "Wearable temperature, pulse, movement, and rest data can add context to cramps, fatigue, PMS, and recovery patterns.",
      metrics: { temperature: "--", pulse: "--", movement: "--", rest: "--" },
      notes: [
        { title: "Temperature", text: "ESP32 temperature can help spot fever-like changes or luteal-phase warmth trends." },
        { title: "Activity", text: "Movement and rest patterns can explain fatigue or pain days more clearly." },
      ],
    };
  }
  const tempValues = recent.map((item) => item.temperature).filter(Number.isFinite);
  const pulse = smoothValue(recent.map((item) => item.heartRate).filter(Number.isFinite));
  const temp = smoothValue(tempValues);
  const tempBaseline = tempValues.length > 4 ? mean(tempValues.slice(0, Math.max(1, tempValues.length - 4))) : null;
  const tempShift = Number.isFinite(temp) && Number.isFinite(tempBaseline) ? temp - tempBaseline : null;
  const movement = movementLoad(recent);
  const sleep = smoothValue(recent.map((item) => item.sleepScore).filter(Number.isFinite));
  const hrv = smoothValue(recent.map((item) => item.hrv).filter(Number.isFinite));
  const rest = physiologicalScore([scoreRange(sleep, 65, 95), scoreRange(hrv, 35, 85), scoreLow(movement, 65)]);
  const pain = Number(entry?.pain || 0);
  const heavyFlow = entry?.flow === "Heavy";
  const notes = [];
  if (temp > 38) {
    notes.push({ title: "Raised temperature", text: "Temperature is high. If this comes with severe pelvic pain, unusual discharge, dizziness, or heavy bleeding, consider urgent clinical advice." });
  } else if (tempShift > 0.25 && /luteal|fertile/i.test(cycleInsight.phase)) {
    notes.push({ title: "Warmth trend", text: "A mild temperature rise can fit post-ovulation or luteal-phase patterns, especially when repeated across days." });
  } else {
    notes.push({ title: "Temperature context", text: "No strong temperature warning is visible in recent ESP32 readings." });
  }
  if (pulse > 105 && (pain >= 6 || heavyFlow)) {
    notes.push({ title: "Pain or flow load", text: "Pulse is elevated while pain/heavy flow is logged. Rest, hydration, and symptom monitoring may help; seek care if symptoms feel unusual or severe." });
  } else if (pulse > 105) {
    notes.push({ title: "Elevated pulse", text: "Pulse is running high. Activity, anxiety, dehydration, fever, or pain can all affect this." });
  }
  if (movement < 25 && pain >= 6) {
    notes.push({ title: "Low activity with pain", text: "Low movement plus higher pain can mark a recovery day. Track medicine, heat-pad use, and whether pain improves." });
  } else if (movement > 75) {
    notes.push({ title: "High activity", text: "High activity can affect cramps, fatigue, pulse, and cycle notes. Compare symptoms again after rest." });
  }
  if (rest && rest < 45) notes.push({ title: "Recovery strain", text: "Sleep/HRV/activity signals suggest recovery may be strained, which can worsen PMS, cravings, mood shifts, or cramps." });
  if (notes.length < 3) notes.push({ title: "Pattern building", text: "Keep logging flow, symptoms, and ESP32 readings together for clearer cycle trends over time." });
  const title = temp > 38 || (pulse > 105 && (pain >= 6 || heavyFlow)) || rest < 45 ? "Wearable data adds a review note" : "Wearable data adds useful context";
  const summary = `Recent ESP32 and watch signals are being compared with ${cycleInsight.phase.toLowerCase()} and your latest cycle log. These are wellness trends, not a diagnosis.`;
  return {
    title,
    summary,
    metrics: {
      temperature: formatMetric(temp, "", 1),
      pulse: formatMetric(pulse, "", 0),
      movement: `${movement}`,
      rest: rest ? `${rest}/100` : "--",
    },
    notes: notes.slice(0, 4),
  };
}

function menstrualVisualSummary(entries, insight) {
  const flowStats = menstrualFlowStats(entries);
  const symptomStats = menstrualSymptomStats(entries);
  return `
    <div class="cycle-visual-grid">
      <section class="cycle-visual-panel cycle-wheel-panel">
        <div>
          <h3>Cycle map</h3>
          <p>${escapeHtml(insight.detail)}</p>
        </div>
        <div class="cycle-wheel" style="--cycle-progress: ${menstrualCycleProgress(insight)}%">
          <div class="cycle-wheel-inner">
            <span>${escapeHtml(insight.phase)}</span>
            <strong>${escapeHtml(insight.nextPeriodDetail)}</strong>
          </div>
        </div>
        <div class="cycle-legend">
          <span><i class="legend-period"></i>Period</span>
          <span><i class="legend-follicular"></i>Follicular</span>
          <span><i class="legend-fertile"></i>Fertile</span>
          <span><i class="legend-luteal"></i>Luteal</span>
        </div>
      </section>
      <section class="cycle-visual-panel">
        <div>
          <h3>Flow pattern</h3>
          <p>Based on recent saved cycle logs.</p>
        </div>
        ${cyclePie("flow", flowStats)}
      </section>
      <section class="cycle-visual-panel">
        <div>
          <h3>Symptom mix</h3>
          <p>Your most common tracked symptoms.</p>
        </div>
        ${cyclePie("symptoms", symptomStats)}
      </section>
    </div>
  `;
}

function cyclePie(type, stats) {
  if (!stats.total) return `<div class="cycle-empty-chart">Add logs to build this chart.</div>`;
  const colors = type === "flow" ? ["#d8624c", "#e8a04c", "#b45a98", "#117c73"] : ["#b45a98", "#3567b5", "#d8624c", "#9c7627"];
  let cursor = 0;
  const slices = stats.items.map((item, index) => {
    const start = cursor;
    const size = (item.count / stats.total) * 100;
    cursor += size;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  return `
    <div class="cycle-pie-wrap">
      <div class="cycle-pie" style="background: conic-gradient(${slices.join(", ")});">
        <div><strong>${stats.total}</strong><span>logs</span></div>
      </div>
      <div class="cycle-pie-legend">
        ${stats.items
          .map(
            (item, index) => `
              <span><i style="background:${colors[index % colors.length]}"></i>${escapeHtml(item.label)} <b>${item.count}</b></span>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function menstrualFlowStats(entries) {
  const counts = {};
  entries.forEach((entry) => {
    if (entry.flow && entry.flow !== "None") counts[entry.flow] = (counts[entry.flow] || 0) + 1;
  });
  const items = Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  return { items, total: items.reduce((sum, item) => sum + item.count, 0) };
}

function menstrualSymptomStats(entries) {
  const counts = {};
  entries.forEach((entry) => {
    (entry.symptoms || []).forEach((symptom) => {
      counts[symptom] = (counts[symptom] || 0) + 1;
    });
  });
  const items = Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  return { items, total: items.reduce((sum, item) => sum + item.count, 0) };
}

function menstrualCycleProgress(insight) {
  const match = String(insight.detail || "").match(/Cycle day\s+(\d+)/i);
  return match ? Math.max(4, Math.min(100, (Number(match[1]) / 28) * 100)) : 12;
}

function menstrualSetupForm(profile) {
  return `
    <form class="form-grid cycle-form" data-form="menstrual-profile">
      <div class="panel-header compact-header">
        <div>
          <h3>Cycle settings</h3>
          <p>These values power the period and fertile-window estimates.</p>
        </div>
      </div>
      <div class="cycle-settings-grid">
        <div class="field">
          <label for="cycle-length">Usual cycle length</label>
          <input id="cycle-length" name="cycleLength" type="number" min="15" max="60" value="${escapeHtml(profile.cycleLength)}" />
        </div>
        <div class="field">
          <label for="period-length">Usual period length</label>
          <input id="period-length" name="periodLength" type="number" min="1" max="14" value="${escapeHtml(profile.periodLength)}" />
        </div>
        <div class="field">
          <label for="last-period-start">Last period start</label>
          <input id="last-period-start" name="lastPeriodStart" type="date" value="${escapeHtml(profile.lastPeriodStart)}" />
        </div>
        <div class="field">
          <label for="cycle-goal">Tracking focus</label>
          <select id="cycle-goal" name="goal">
            ${["Cycle awareness", "Symptom patterns", "Trying to conceive", "Avoid pregnancy", "PCOS or irregular cycles", "Perimenopause"].map((goal) => `<option value="${goal}" ${profile.goal === goal ? "selected" : ""}>${goal}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="cycle-reminder-row">
        <label class="check-field"><input type="checkbox" name="periodReminder" value="yes" ${profile.periodReminder ? "checked" : ""} /> Remind before expected period</label>
        <label class="check-field"><input type="checkbox" name="medicineReminder" value="yes" ${profile.medicineReminder ? "checked" : ""} /> Track medicine or supplement reminders</label>
      </div>
      <button class="button secondary" type="submit">Save cycle settings</button>
    </form>
  `;
}

function menstrualLogForm(latest = {}) {
  const symptoms = Array.isArray(latest.symptoms) ? latest.symptoms : [];
  const symptomOptions = ["Cramps", "Headache", "Back pain", "Bloating", "Acne", "Breast tenderness", "Fatigue", "Mood changes", "Cravings", "Nausea"];
  return `
    <form class="form-grid cycle-form" data-form="menstrual-log">
      <div class="panel-header compact-header">
        <div>
          <h3>Today&apos;s cycle log</h3>
          <p>Record period days, spotting, symptoms, tests, medication, and notes.</p>
        </div>
      </div>
      <div class="cycle-settings-grid">
        <div class="field">
          <label for="cycle-log-date">Date</label>
          <input id="cycle-log-date" name="date" type="date" value="${escapeHtml(todayIsoDate())}" required />
        </div>
        <div class="field">
          <label for="cycle-flow">Flow</label>
          <select id="cycle-flow" name="flow">
            ${["None", "Spotting", "Light", "Medium", "Heavy"].map((flow) => `<option value="${flow}" ${latest.flow === flow ? "selected" : ""}>${flow}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="cycle-pain">Pain level: <strong data-cycle-range-value="pain">${escapeHtml(latest.pain || 0)}</strong>/10</label>
          <input id="cycle-pain" name="pain" type="range" min="0" max="10" value="${escapeHtml(latest.pain || 0)}" />
        </div>
        <div class="field">
          <label for="cycle-mood">Mood</label>
          <select id="cycle-mood" name="mood">
            ${["Stable", "Sensitive", "Low", "Anxious", "Irritable", "Energetic", "Calm"].map((mood) => `<option value="${mood}" ${latest.mood === mood ? "selected" : ""}>${mood}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="cycle-cervical">Cervical fluid</label>
          <select id="cycle-cervical" name="cervicalFluid">
            ${["Not tracked", "Dry", "Sticky", "Creamy", "Watery", "Egg-white"].map((fluid) => `<option value="${fluid}" ${latest.cervicalFluid === fluid ? "selected" : ""}>${fluid}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="cycle-temp">Basal/body temperature</label>
          <input id="cycle-temp" name="temperature" type="number" step="0.1" value="${escapeHtml(latest.temperature || "")}" placeholder="Example: 36.7" />
        </div>
        <div class="field">
          <label for="cycle-ovulation-test">Ovulation test</label>
          <select id="cycle-ovulation-test" name="ovulationTest">
            ${["Not taken", "Negative", "Positive", "Unclear"].map((test) => `<option value="${test}" ${latest.ovulationTest === test ? "selected" : ""}>${test}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="cycle-pregnancy-test">Pregnancy test</label>
          <select id="cycle-pregnancy-test" name="pregnancyTest">
            ${["Not taken", "Negative", "Positive", "Unclear"].map((test) => `<option value="${test}" ${latest.pregnancyTest === test ? "selected" : ""}>${test}</option>`).join("")}
          </select>
        </div>
      </div>
      <fieldset class="symptom-check-grid">
        <legend>Symptoms</legend>
        ${symptomOptions.map((symptom) => `<label class="check-field"><input type="checkbox" name="symptoms" value="${symptom}" ${symptoms.includes(symptom) ? "checked" : ""} /> ${symptom}</label>`).join("")}
      </fieldset>
      <div class="field">
        <label for="cycle-medicine">Medicine, supplement, or relief used</label>
        <input id="cycle-medicine" name="medicine" value="${escapeHtml(latest.medicine || "")}" placeholder="Pain relief, iron, heat pad, hydration" />
      </div>
      <div class="field">
        <label for="cycle-note">Cycle note</label>
        <textarea id="cycle-note" name="note" placeholder="Any bleeding change, PMS pattern, discharge, mood, pain, or appointment question.">${escapeHtml(latest.note || "")}</textarea>
      </div>
      <button class="button" type="submit">Save menstrual health log</button>
    </form>
  `;
}

function menstrualHistory(entries) {
  if (!entries.length) return `<div class="notice">Cycle logs will appear here after you save your first entry.</div>`;
  return `
    <div class="cycle-history">
      <h3>Recent cycle history</h3>
      <div class="cycle-history-list">
        ${entries
          .slice(0, 8)
          .map(
            (entry) => `
              <article class="cycle-history-item">
                <div>
                  <strong>${escapeHtml(formatCycleDate(entry.date))}</strong>
                  <small>${escapeHtml(entry.flow)} flow - pain ${escapeHtml(entry.pain)}/10</small>
                </div>
                <p>${escapeHtml(cycleEntrySummary(entry))}</p>
                <span class="status ${cycleEntryStatus(entry).className}">${escapeHtml(cycleEntryStatus(entry).label)}</span>
              </article>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function menstrualEntries(patient) {
  return Array.isArray(patient?.menstrualEntries)
    ? [...patient.menstrualEntries].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
    : [];
}

function menstrualProfile(patient) {
  const latest = menstrualEntries(patient).find((entry) => ["Spotting", "Light", "Medium", "Heavy"].includes(entry.flow));
  return {
    cycleLength: String(patient?.menstrualProfile?.cycleLength || patient?.cycleLength || 28),
    periodLength: String(patient?.menstrualProfile?.periodLength || patient?.periodLength || 5),
    lastPeriodStart: patient?.menstrualProfile?.lastPeriodStart || latest?.date || "",
    goal: patient?.menstrualProfile?.goal || "Cycle awareness",
    periodReminder: Boolean(patient?.menstrualProfile?.periodReminder),
    medicineReminder: Boolean(patient?.menstrualProfile?.medicineReminder),
  };
}

function menstrualInsight(patient) {
  const profile = menstrualProfile(patient);
  const entries = menstrualEntries(patient);
  const cycleLength = Math.max(15, Math.min(60, Number(profile.cycleLength) || 28));
  const periodLength = Math.max(1, Math.min(14, Number(profile.periodLength) || 5));
  const lastStart = parseCycleDate(profile.lastPeriodStart || entries.find((entry) => ["Spotting", "Light", "Medium", "Heavy"].includes(entry.flow))?.date);
  if (!lastStart) {
    return {
      phase: "Setup needed",
      detail: "Add your last period start date to estimate cycle timing.",
      nextPeriodLabel: "--",
      nextPeriodDetail: "Cycle estimates begin after setup.",
      fertileWindowLabel: "--",
      alert: "",
    };
  }
  const today = startOfDay(new Date());
  const daysSince = daysBetween(lastStart, today);
  const cycleDay = ((daysSince % cycleLength) + cycleLength) % cycleLength + 1;
  const cyclesElapsed = Math.max(1, Math.ceil((daysSince + 1) / cycleLength));
  const nextStart = addCycleDays(lastStart, cyclesElapsed * cycleLength);
  const daysUntilNext = daysBetween(today, nextStart);
  const ovulation = addCycleDays(nextStart, -14);
  const fertileStart = addCycleDays(ovulation, -5);
  const fertileEnd = addCycleDays(ovulation, 1);
  const inPeriod = cycleDay <= periodLength;
  const inFertile = today >= fertileStart && today <= fertileEnd;
  const phase = inPeriod ? "Period phase" : inFertile ? "Fertile window estimate" : cycleDay < 14 ? "Follicular phase" : "Luteal phase";
  const detail = `Cycle day ${cycleDay} based on a ${cycleLength}-day cycle.`;
  return {
    phase,
    detail,
    nextPeriodLabel: formatCycleDate(toIsoDate(nextStart)),
    nextPeriodDetail: daysUntilNext === 0 ? "Expected today" : daysUntilNext > 0 ? `${daysUntilNext} days away` : `${Math.abs(daysUntilNext)} days overdue`,
    fertileWindowLabel: `${formatCycleDate(toIsoDate(fertileStart))} to ${formatCycleDate(toIsoDate(fertileEnd))}`,
    alert: daysUntilNext < -7 ? "period-late" : "",
  };
}

function menstrualAlertNotice(insight, latest) {
  const notices = [];
  if (insight.alert === "period-late") notices.push("Your period estimate is more than 7 days overdue. Stress, illness, medication, pregnancy, PCOS, perimenopause, and normal variation can affect timing.");
  if (latest && Number(latest.pain) >= 8) notices.push("Severe pain was logged. Consider contacting a clinician, especially if pain is sudden, one-sided, associated with fever, fainting, pregnancy, or unusually heavy bleeding.");
  if (latest?.flow === "Heavy") notices.push("Heavy flow was logged. Seek urgent care if you soak pads very quickly, feel faint, have chest pain, or pass very large clots.");
  if (!notices.length) return "";
  return `<div class="notice cycle-alert"><strong>Cycle note:</strong> ${escapeHtml(notices.join(" "))}</div>`;
}

function menstrualSidebarDetail(patient) {
  const insight = menstrualInsight(patient);
  if (insight.phase === "Setup needed") return "cycle tracker";
  return insight.nextPeriodDetail;
}

function saveMenstrualProfile(data) {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (!patient) return;
  patient.menstrualProfile = {
    cycleLength: String(data.cycleLength || 28),
    periodLength: String(data.periodLength || 5),
    lastPeriodStart: String(data.lastPeriodStart || ""),
    goal: String(data.goal || "Cycle awareness"),
    periodReminder: data.periodReminder === "yes",
    medicineReminder: data.medicineReminder === "yes",
  };
  saveState();
  render();
  showToast("Cycle settings saved");
}

function saveMenstrualLog(form) {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (!patient) return;
  const data = Object.fromEntries(new FormData(form));
  const symptoms = new FormData(form).getAll("symptoms").map(String);
  const entry = {
    id: uid("cycle"),
    createdAt: new Date().toLocaleString(),
    date: String(data.date || todayIsoDate()),
    flow: String(data.flow || "None"),
    pain: String(data.pain || "0"),
    mood: String(data.mood || "Stable"),
    cervicalFluid: String(data.cervicalFluid || "Not tracked"),
    temperature: String(data.temperature || "").trim(),
    ovulationTest: String(data.ovulationTest || "Not taken"),
    pregnancyTest: String(data.pregnancyTest || "Not taken"),
    symptoms,
    medicine: String(data.medicine || "").trim(),
    note: String(data.note || "").trim(),
  };
  patient.menstrualEntries = [...(Array.isArray(patient.menstrualEntries) ? patient.menstrualEntries : []), entry].slice(-90);
  if (["Spotting", "Light", "Medium", "Heavy"].includes(entry.flow)) {
    const profile = menstrualProfile(patient);
    const currentStart = parseCycleDate(profile.lastPeriodStart);
    const entryDate = parseCycleDate(entry.date);
    patient.menstrualProfile = { ...profile, lastPeriodStart: !currentStart || (entryDate && entryDate > currentStart) ? entry.date : profile.lastPeriodStart };
  }
  saveState();
  render();
  showToast("Menstrual health log saved");
}

function cycleEntrySummary(entry) {
  const parts = [];
  if (entry.symptoms?.length) parts.push(entry.symptoms.join(", "));
  if (entry.mood) parts.push(`Mood: ${entry.mood}`);
  if (entry.cervicalFluid && entry.cervicalFluid !== "Not tracked") parts.push(`Fluid: ${entry.cervicalFluid}`);
  if (entry.ovulationTest && entry.ovulationTest !== "Not taken") parts.push(`Ovulation test: ${entry.ovulationTest}`);
  if (entry.pregnancyTest && entry.pregnancyTest !== "Not taken") parts.push(`Pregnancy test: ${entry.pregnancyTest}`);
  if (entry.note) parts.push(entry.note);
  return parts.join(" - ") || "No symptoms or notes added.";
}

function cycleEntryStatus(entry) {
  if (Number(entry.pain) >= 8 || entry.flow === "Heavy") return { label: "Review", className: "review" };
  if (["Light", "Medium", "Spotting"].includes(entry.flow)) return { label: "Period", className: "normal" };
  return { label: "Logged", className: "normal" };
}

function parseCycleDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addCycleDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function daysBetween(start, end) {
  return Math.round((startOfDay(end) - startOfDay(start)) / 86400000);
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIsoDate() {
  return toIsoDate(new Date());
}

function formatCycleDate(value) {
  const date = parseCycleDate(value);
  return date ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "--";
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
  const appointments = state.appointments
    .filter((appointment) => appointment.doctorId === user.id)
    .sort((a, b) => appointmentTriage(b).score - appointmentTriage(a).score || (a.status === "pending" ? -1 : 1));
  const appointmentReportIds = new Set(appointments.map((appointment) => appointment.reportId).filter(Boolean));
  const respondedReportIds = new Set(state.clinicalResponses.filter((item) => item.doctorId === user.id).map((item) => item.reportId));
  const pendingReports = reports
    .filter((report) => !respondedReportIds.has(report.id) && !appointmentReportIds.has(report.id))
    .sort((a, b) => reportSeverityScore(b) - reportSeverityScore(a) || new Date(b.createdAt) - new Date(a.createdAt));
  const reviewedReports = reports.filter((report) => respondedReportIds.has(report.id)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const selectedReport = reports.find((report) => report.id === selectedDoctorReportId);
  return `
    <section class="dashboard">
      <div class="section-title">
        <h3>Doctor portal</h3>
        <p>Clinical triage ranks patient reports for diagnosis. Appointment requests stay in their own tab.</p>
      </div>
      ${doctorTriageSummary(pendingReports)}
      <div class="doctor-tabs" role="tablist">
        ${doctorTabButton("pending-reports", "Triage Queue", pendingReports.length)}
        ${doctorTabButton("appointments", "Appointment Requests", appointments.length)}
        ${doctorTabButton("reviewed-reports", "Completed Reviews", reviewedReports.length)}
      </div>
      <div class="panel">
        ${doctorTabContent({ pendingReports, reviewedReports, appointments, selectedReport })}
      </div>
    </section>
  `;
}

function doctorTabButton(tab, label, count) {
  return `<button class="tab ${activeDoctorTab === tab ? "active" : ""}" data-doctor-tab="${tab}" type="button">${escapeHtml(label)} <span>${count}</span></button>`;
}

function doctorTabContent({ pendingReports, reviewedReports, appointments, selectedReport }) {
  if (selectedReport) return doctorReportDetailPage(selectedReport);
  if (activeDoctorTab === "appointments") {
    return `
      <div class="panel-header"><div><h3>Appointment Requests</h3><p>Requests are prioritized by patient triage score before routine scheduling.</p></div></div>
      ${doctorAppointments(appointments)}
    `;
  }
  if (activeDoctorTab === "reviewed-reports") {
    return `
      <div class="panel-header"><div><h3>Completed Clinical Reviews</h3><p>Reports where diagnosis or prescription has already been sent to the patient.</p></div></div>
      ${doctorReportQueue(reviewedReports, "No reviewed reports yet.")}
    `;
  }
  return `
    <div class="panel-header"><div><h3>Clinical Triage Queue</h3><p>Sorted by triage priority using vitals, symptom urgency, and AI summary risk words.</p></div></div>
    ${doctorReportQueue(pendingReports, "No reports are waiting for diagnosis.")}
  `;
}

function doctorTriageSummary(pendingReports) {
  const urgentReports = pendingReports.filter((report) => reportSeverityScore(report) >= 70).length;
  const reviewReports = pendingReports.filter((report) => {
    const score = reportSeverityScore(report);
    return score >= 35 && score < 70;
  }).length;
  const routineReports = Math.max(0, pendingReports.length - urgentReports - reviewReports);
  return `
    <div class="triage-summary" aria-label="Patient triage summary">
      <div>
        <span class="status alert">Critical first</span>
        <strong>${urgentReports}</strong>
        <small>urgent reports waiting for diagnosis</small>
      </div>
      <div>
        <span class="status review">Needs review</span>
        <strong>${reviewReports}</strong>
        <small>moderate-risk reports waiting for diagnosis</small>
      </div>
      <div>
        <span class="status normal">Queue sorted</span>
        <strong>${routineReports}</strong>
        <small>routine reports in the clinical triage queue</small>
      </div>
    </div>
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

// ============================================================================
// 5. Telemetry summaries, detail views, and derived parameters
// ============================================================================

function vitals(reading) {
  const safe = reading || {};
  const pulse = heartRateForReading(reading);
  const extraMetrics = [
    reading?.ecg != null ? metric("ECG", reading.ecg, "heart electrical reading") : "",
    reading?.emg != null ? metric("EMG", reading.emg, "muscle activity") : "",
    reading?.pulseRaw != null ? metric("Pulse sensor", reading.pulseRaw, "raw analog value") : "",
    reading?.light != null ? metric("Light", reading.light, reading.environment || "ambient level") : "",
    reading?.flex != null ? metric("Flex", reading.flex, reading.flexState || "joint movement") : "",
    reading?.force != null ? metric("Force", reading.force, reading.forceState || "pressure sensor") : "",
    reading?.irState ? metric("IR", reading.irState, "object detection") : "",
  ].join("");
  return `
    <div class="vitals-grid">
      ${metric("Pulse", displayValue(pulse), "heart beats per minute")}
      ${metric("Breathing oxygen", displayValue(safe.spo2), "oxygen level in blood")}
      ${metric("Body temperature", displayValue(safe.temperature), "Celsius")}
      ${metric("Blood pressure", `${displayValue(safe.systolic)}/${displayValue(safe.diastolic)}`, "pressure in arteries")}
      ${extraMetrics}
    </div>
  `;
}

// Telemetry module: normalizes the stream, derives clinical parameters, and renders domain visuals.
const telemetryDomains = [
  { id: "heart", title: "Heart Health", source: "ECG, pulse sensor, or smart watch BPM/HRV", primary: "Heart rhythm", canvas: "waveform" },
  { id: "oxygen", title: "Blood Oxygen", source: "Pulse sensor, smart watch SpO2, respiration, temperature, and movement", primary: "Oxygenation proxy", canvas: "waveform" },
  { id: "climate", title: "Body Climate", source: "DHT11 temperature and humidity", primary: "Climate comfort", canvas: "sparkline" },
  { id: "muscle", title: "Muscle Vitality", source: "EMG, flex, and force sensors", primary: "Exertion", canvas: "waveform" },
  { id: "movement", title: "Movement & Posture", source: "Smart watch steps, active minutes, flex, force, IR, and MPU", primary: "Posture", canvas: "orientation" },
  { id: "sleep", title: "Sleep Environment", source: "Smart watch sleep score, LDR, IR, and movement load", primary: "Rest quality", canvas: "sparkline" },
];

function telemetryDashboard() {
  const snapshot = buildTelemetrySnapshot();
  return `
    <div class="telemetry-grid">
      ${snapshot.domains.map(telemetrySummaryCard).join("")}
    </div>
  `;
}

function telemetrySummaryCard(domain) {
  return `
    <button class="metric telemetry-card" data-telemetry-domain="${domain.id}" data-domain="${domain.id}" type="button">
      <span>${escapeHtml(domain.title)}</span>
      <strong>${escapeHtml(domain.primaryValue)}</strong>
      <small>${escapeHtml(domain.primaryLabel)}</small>
      <em class="telemetry-card-status ${domain.statusClass}">${escapeHtml(domain.status)}</em>
    </button>
  `;
}

function telemetryDeepDive(domain, snapshot) {
  return `
    <div class="telemetry-deep-dive" data-domain="${domain.id}">
      <div class="panel-header">
        <div>
          <h3>${escapeHtml(domain.title)} Deep Dive</h3>
          <p>Tap any parameter to see which wearable reading it uses.</p>
        </div>
        <span class="status ${domain.statusClass}">${escapeHtml(domain.status)}</span>
      </div>
      <div class="telemetry-detail-grid">
        <div class="chart-wrap telemetry-chart">
          <canvas id="telemetry-canvas-${domain.id}" width="1000" height="340" data-telemetry-canvas="${domain.id}"></canvas>
        </div>
        <div class="telemetry-parameters">
          ${domain.parameters.map((item) => parameterRow(item.label, item.value, item.detail)).join("")}
          ${snapshot.ptt.raw != null ? parameterRow("Pulse Transit Time", snapshot.ptt.value, "Based on ECG R-peak and PPG or pulse peak timing for cuffless blood pressure trending.") : ""}
        </div>
        ${telemetryDiagnosisPanel(domain, snapshot)}
      </div>
    </div>
  `;
}

function telemetryDiagnosisPanel(domain, snapshot) {
  const lines = diagnoseTelemetryDomain(domain, snapshot);
  return `
    <div class="analysis-box telemetry-diagnosis">
      <h4>${escapeHtml(domain.title)} diagnosis</h4>
      <ul>
        ${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function showTelemetryModal(domainId) {
  const root = document.querySelector("#modal-root");
  if (!root) return;
  const snapshot = buildTelemetrySnapshot();
  const domain = snapshot.domains.find((item) => item.id === domainId) || snapshot.domains[0];
  activeTelemetryDomain = domain.id;
  root.innerHTML = `
    <div class="modal">
      <div class="modal-card telemetry-modal-card">
        <div class="panel-header">
          <div>
            <h3>${escapeHtml(domain.title)}</h3>
            <p>Detailed parameter page</p>
          </div>
          <button class="icon-button" data-action="close-modal" aria-label="Close">x</button>
        </div>
        ${telemetryDeepDive(domain, snapshot)}
      </div>
    </div>
  `;
  bindModalClose(root);
  root.querySelector(".modal-card")?.addEventListener("click", (event) => event.stopPropagation());
  renderTelemetryVisuals();
}

function parameterRow(label, value, detail = "") {
  return `
    <details class="parameter-row">
      <summary>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </summary>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : `<small>Derived from the latest wearable readings.</small>`}
    </details>
  `;
}

function buildTelemetrySnapshot() {
  const readings = state.readings.slice(-80);
  const latest = readings[readings.length - 1] || {};
  const signals = {
    ecg: signalWindow(readings, "ecg", "ecgSignal", latest.heartRate ? syntheticWave(72, latest.heartRate, 0.16) : []),
    ppg: signalWindow(readings, "ppg", "ppgSignal", []).length
      ? signalWindow(readings, "ppg", "ppgSignal", [])
      : signalWindow(readings, "pulseRaw", "pulseSignal", latest.spo2 ? syntheticWave(72, latest.heartRate || 74, 0.28) : []),
    emg: signalWindow(readings, "emg", "emgSignal", []),
    temp: readings.map((item) => item.temperature).filter(Number.isFinite),
    ambientTemp: readings.map((item) => item.ambientTemp).filter(Number.isFinite),
    humidity: readings.map((item) => item.humidity).filter(Number.isFinite),
    light: readings.map((item) => item.light ?? item.lux).filter(Number.isFinite),
  };
  const heart = deriveHeart(readings, signals.ecg);
  const oxygen = deriveOxygen(readings, signals.ppg);
  const climate = deriveClimate(readings, signals);
  const muscle = deriveMuscle(readings, signals.emg);
  const movement = deriveMovement(readings);
  const sleep = deriveSleep(readings, signals.light);
  const ptt = derivePtt(signals.ecg, signals.ppg);
  const domainData = { heart, oxygen, climate, muscle, movement, sleep };
  return {
    readings,
    latest,
    signals,
    ptt,
    domains: telemetryDomains.map((domain) => ({
      ...domain,
      ...domainData[domain.id],
      primaryLabel: domain.primary,
      primaryValue: domainData[domain.id].primaryValue,
    })),
  };
}

function deriveHeart(readings, ecg) {
  const heartRates = readings.map((item) => item.heartRate).filter(Number.isFinite);
  const pulseValues = readings.map((item) => item.pulseRaw).filter(Number.isFinite);
  const watchHrv = smoothValue(readings.map((item) => item.hrv).filter(Number.isFinite));
  const latestEcg = lastFinite(readings, "ecg");
  const latestPulse = lastFinite(readings, "pulseRaw");
  const cardiacScore = physiologicalScore([
    scoreRange(latestPulse, 1900, 3100),
    scoreRange(latestEcg, 900, 3200),
    scoreRange(smoothValue(heartRates), 55, 105),
    scoreRange(watchHrv, 25, 90),
  ]);
  const peaks = detectPeaks(ecg);
  const rr = intervalsFromPeaks(peaks, 700);
  const ecgBpm = rr.length ? 60000 / mean(rr) : null;
  const bpm = smoothValue(heartRates) ?? ecgBpm;
  const hrv = rr.length ? sd(rr) : watchHrv;
  return {
    primaryValue: Number.isFinite(bpm) ? formatMetric(bpm, " bpm", 0) : `${cardiacScore}% rhythm`,
    status: bpm > 110 || bpm < 50 || cardiacScore < 45 ? "Review" : "Stable",
    statusClass: bpm > 110 || bpm < 50 || cardiacScore < 45 ? "alert" : "normal",
    parameters: [
      { label: "Heart Rate", value: Number.isFinite(bpm) ? formatMetric(bpm, " bpm", 0) : "Collecting beats", detail: "Based on the pulse sensor beat threshold and ECG peak timing when available." },
      { label: "Rhythm Confidence", value: `${cardiacScore}%`, detail: "Based on pulse sensor strength, ECG reading stability, and detected heart rate range." },
      { label: "Pulse Strength", value: formatMetric(smoothValue(pulseValues), "", 0), detail: "Based on the analog pulse sensor value." },
      { label: "Beat Variation", value: formatMetric(hrv, " ms", 0), detail: "Based on time gaps between detected ECG or pulse peaks, or smartwatch HRV when imported." },
      { label: "Recovery Timing", value: formatMetric(estimateInterval(bpm, 0.36), " ms", 0), detail: "Estimated from heart cycle length; this is a proxy, not diagnostic QT measurement." },
      { label: "Conduction Timing", value: formatMetric(estimateInterval(bpm, 0.16), " ms", 0), detail: "Estimated from heart cycle length; this is a proxy, not diagnostic PR measurement." },
      { label: "Baseline Shift", value: formatMetric(stSegmentLevel(ecg), " mV", 2), detail: "Based on relative changes in the ECG reading window." },
    ],
  };
}

function deriveOxygen(readings, ppg) {
  const spo2 = smoothValue(readings.map((item) => item.spo2).filter(Number.isFinite));
  const watchRespiration = smoothValue(readings.map((item) => item.respirationRate).filter(Number.isFinite));
  const pulseValues = readings.map((item) => item.pulseRaw).filter(Number.isFinite);
  const temperature = smoothValue(readings.map((item) => item.temperature).filter(Number.isFinite));
  const activity = movementLoad(readings);
  const peaks = detectPeaks(ppg);
  const respiration = watchRespiration ?? estimateRespiration(ppg);
  const amplitude = pulseAmplitude(ppg.length ? ppg : pulseValues);
  const perfusion = (ppg.length || pulseValues.length) ? (amplitude / Math.max(1, mean(ppg.length ? ppg : pulseValues))) * 100 : null;
  const oxygenProxy = physiologicalScore([
    scoreRange(smoothValue(pulseValues), 1800, 3300),
    scoreLow(activity, 65),
    scoreRange(temperature, 35.5, 38),
  ]);
  return {
    primaryValue: Number.isFinite(spo2) ? formatMetric(spo2, "%", 0) : `${oxygenProxy}% proxy`,
    status: (spo2 && spo2 < 94) || oxygenProxy < 45 ? "Review" : "Stable",
    statusClass: (spo2 && spo2 < 94) || oxygenProxy < 45 ? "alert" : "normal",
    parameters: [
      { label: "Oxygen Level", value: Number.isFinite(spo2) ? formatMetric(spo2, "%", 0) : "Not directly measured", detail: "Based on SpO2 from a red/IR PPG sensor or smart watch oxygen export." },
      { label: "Oxygenation Estimate", value: `${oxygenProxy}%`, detail: "Based on pulse sensor strength, temperature, and movement load." },
      { label: "Breathing Burden", value: Number.isFinite(respiration) ? formatMetric(respiration, " br/min", 0) : activityLabel(activity), detail: "Based on smartwatch respiration if present, PPG wave movement if available, or movement burden." },
      { label: "Circulation Strength", value: formatMetric(perfusion, "%", 2), detail: "Based on pulse sensor amplitude relative to its average level." },
      { label: "Pulse Wave Size", value: formatMetric(amplitude, "", 1), detail: `Based on pulse peaks in the rolling window. Peaks found: ${peaks.length}.` },
    ],
  };
}

function deriveClimate(readings, signals) {
  const surface = smoothValue(signals.temp);
  const ambient = smoothValue(signals.ambientTemp);
  const humidity = smoothValue(signals.humidity);
  const heatStress = physiologicalScore([scoreRange(surface, 35.5, 38), scoreRange(humidity, 30, 70)]);
  const change = rateOfChange(signals.temp);
  return {
    primaryValue: Number.isFinite(surface) ? formatMetric(surface, " C", 1) : `${heatStress}% climate`,
    status: surface > 38 || humidity > 80 || heatStress < 45 ? "Review" : "Stable",
    statusClass: surface > 38 || humidity > 80 || heatStress < 45 ? "alert" : "normal",
    parameters: [
      { label: "Body Temperature", value: formatMetric(surface, " C", 1), detail: "Based on the DHT11 temperature line from the wearable." },
      { label: "Room Temperature", value: formatMetric(ambient, " C", 1), detail: "Based on ambient or IR temperature if your Arduino sends it." },
      { label: "Humidity", value: formatMetric(humidity, "%", 0), detail: "Based on the DHT11 humidity line." },
      { label: "Climate Comfort", value: `${heatStress}%`, detail: "Based on temperature and humidity together." },
      { label: "Body-Room Difference", value: formatMetric(surface != null && ambient != null ? surface - ambient : null, " C", 1), detail: "Based on body temperature minus ambient temperature when both exist." },
      { label: "Temperature Change", value: formatMetric(change, " C/min", 2), detail: "Based on recent temperature readings over time." },
    ],
  };
}

function deriveMuscle(readings, emg) {
  const emgValues = readings.map((item) => item.emg).filter(Number.isFinite);
  const flexValues = readings.map((item) => item.flex).filter(Number.isFinite);
  const forceValues = readings.map((item) => item.force).filter(Number.isFinite);
  const rms = emg.length ? Math.sqrt(mean(emg.map((value) => value * value))) : smoothValue(emgValues);
  const fatigue = medianFrequencyShift(emg);
  const onset = contractionOnset(emg);
  const exertion = physiologicalScore([
    scoreRange(rms, 120, 3000),
    scoreRange(smoothValue(flexValues), 40, 500),
    scoreRange(smoothValue(forceValues), 50, 900),
  ]);
  return {
    primaryValue: Number.isFinite(rms) ? formatMetric(rms, " V_RMS", 1) : `${exertion}% exertion`,
    status: rms > 3000 || exertion > 80 ? "High" : "Stable",
    statusClass: rms > 3000 || exertion > 80 ? "alert" : "normal",
    parameters: [
      { label: "Muscle Intensity", value: formatMetric(rms, "", 1), detail: "Based on EMG muscle activity readings." },
      { label: "Exertion Index", value: `${exertion}%`, detail: "Based on EMG, flex sensor, and force sensor together." },
      { label: "Fatigue Trend", value: formatMetric(fatigue, " shift", 1), detail: "Estimated from changes in EMG variation over the rolling window." },
      { label: "Contraction Start", value: formatMetric(onset, " ms", 0), detail: "Based on the first EMG rise above its recent baseline." },
      { label: "Peak Muscle Activity", value: formatMetric(emg.length ? Math.max(...emg) : null, "", 0), detail: "Based on the highest EMG value in the window." },
    ],
  };
}

function deriveMovement(readings) {
  const latest = readings[readings.length - 1] || {};
  const watchSteps = lastFinite(readings, "steps");
  const activeMinutes = lastFinite(readings, "activeMinutes");
  const calories = lastFinite(readings, "calories");
  const ax = numericValue(latest.ax ?? latest.mpu?.ax);
  const ay = numericValue(latest.ay ?? latest.mpu?.ay);
  const az = numericValue(latest.az ?? latest.mpu?.az);
  const gx = numericValue(latest.gx ?? latest.mpu?.gx);
  const gy = numericValue(latest.gy ?? latest.mpu?.gy);
  const gz = numericValue(latest.gz ?? latest.mpu?.gz);
  const gForce = Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(az) ? Math.sqrt(ax * ax + ay * ay + az * az) / 16384 : null;
  const tilt = Number.isFinite(ax) && Number.isFinite(az) ? Math.atan2(ax, az) * (180 / Math.PI) : null;
  const tremor = [gx, gy, gz].filter(Number.isFinite).length ? Math.max(Math.abs(gx || 0), Math.abs(gy || 0), Math.abs(gz || 0)) / 2000 : null;
  const steps = watchSteps ?? estimateSteps(readings);
  const load = movementLoad(readings);
  const flexState = latest.flexState || inferFlexState(latest.flex);
  const forceState = latest.forceState || inferForceState(latest.force);
  const flexAngle = flexPostureAngle(latest.flex);
  const postureText = Number.isFinite(tilt) ? `${Math.round(tilt)} deg` : Number.isFinite(flexAngle) ? `${Math.round(flexAngle)} deg flex` : flexState || forceState || "Quiet";
  return {
    primaryValue: Number.isFinite(watchSteps) ? formatMetric(watchSteps, " steps", 0) : Number.isFinite(tilt) ? formatMetric(tilt, " deg", 0) : Number.isFinite(flexAngle) ? formatMetric(flexAngle, " deg flex", 0) : `${load}% load`,
    status: gForce > 2.5 || load > 75 ? "Review" : "Stable",
    statusClass: gForce > 2.5 || load > 75 ? "alert" : "normal",
    orientation: { ax, ay, az, tilt, flexAngle, flex: latest.flex, flexState, load },
    parameters: [
      { label: "Posture", value: postureText, detail: "Based on MPU tilt if raw MPU lines exist; otherwise based on flex sensor bending." },
      { label: "Movement Load", value: `${load}%`, detail: "Based on flex sensor, force sensor, IR detection, and motion alert text." },
      { label: "Bending Angle", value: formatMetric(flexAngle, " deg", 0), detail: "Based on the flex sensor raw value mapped into a 0-90 degree bend estimate." },
      { label: "Tilt Angle", value: formatMetric(tilt, " deg", 0), detail: "Based on MPU Accel values only when your Arduino prints them." },
      { label: "Step Count", value: Number.isFinite(steps) ? formatMetric(steps, "", 0) : "Not available", detail: "Based on smartwatch steps when imported; otherwise acceleration peaks from raw MPU Accel values." },
      { label: "Active Minutes", value: formatMetric(activeMinutes, " min", 0), detail: "Based on smartwatch active-zone or activity-minute export." },
      { label: "Activity Calories", value: formatMetric(calories, " kcal", 0), detail: "Based on smartwatch calorie export." },
      { label: "Tremor", value: Number.isFinite(tremor) ? formatMetric(tremor, " Hz", 1) : tremorAlertText(readings), detail: "Based on MPU Gyro values if present; otherwise based on tremor alert text." },
      { label: "Fall Impact", value: Number.isFinite(gForce) ? formatMetric(gForce, " g", 2) : fallAlertText(readings), detail: "Based on MPU acceleration if present; otherwise based on sudden motion/fall alert text." },
    ],
  };
}

function deriveSleep(readings, light) {
  const lux = smoothValue(light);
  const cycles = lightDarkCycles(readings);
  const latest = readings[readings.length - 1] || {};
  const watchSleepScore = smoothValue(readings.map((item) => item.sleepScore).filter(Number.isFinite));
  const stressScore = smoothValue(readings.map((item) => item.stressScore).filter(Number.isFinite));
  const restful = physiologicalScore([scoreLow(lux, 100), scoreLow(movementLoad(readings), 45), scoreRange(watchSleepScore, 65, 95), scoreLow(stressScore, 70), latest.irState?.includes("No Object") ? 50 : 100]);
  return {
    primaryValue: Number.isFinite(watchSleepScore) ? formatMetric(watchSleepScore, "/100", 0) : Number.isFinite(lux) ? formatMetric(lux, " lux", 0) : `${restful}% rest`,
    status: lux > 80 || stressScore > 75 || (watchSleepScore && watchSleepScore < 60) ? "Review" : "Stable",
    statusClass: lux > 80 || stressScore > 75 || (watchSleepScore && watchSleepScore < 60) ? "review" : "normal",
    parameters: [
      { label: "Sleep Score", value: formatMetric(watchSleepScore, "/100", 0), detail: "Based on smartwatch sleep score or sleep quality export." },
      { label: "Stress Score", value: formatMetric(stressScore, "/100", 0), detail: "Based on smartwatch stress or body-battery style export when available." },
      { label: "Light Level", value: formatMetric(lux, " lux", 0), detail: "Based on the LDR ambient light reading." },
      { label: "Rest Environment", value: `${restful}%`, detail: "Based on light level, movement load, and IR presence." },
      { label: "Current State", value: lux > 80 ? "Light" : lux == null ? "--" : "Dark", detail: "Based on the LDR light threshold." },
      { label: "Light Duration", value: cycles.light, detail: "Based on how long recent LDR readings stayed in the light range." },
      { label: "Dark Duration", value: cycles.dark, detail: "Based on how long recent LDR readings stayed in the dark range." },
    ],
  };
}

function derivePtt(ecg, ppg) {
  const rPeaks = detectPeaks(ecg);
  const pulsePeaks = detectPeaks(ppg);
  const pairs = [];
  rPeaks.forEach((peak) => {
    const pulse = pulsePeaks.find((candidate) => candidate > peak);
    if (Number.isFinite(pulse)) pairs.push(pulse - peak);
  });
  const validPairs = pairs.filter((delta) => delta > 0 && delta < 25);
  const value = validPairs.length ? mean(validPairs) * 10 : null;
  return { value: formatMetric(value, " ms", 0), raw: value };
}

function signalWindow(readings, scalarKey, arrayKey, fallback = []) {
  const values = readings.flatMap((item) => {
    const arrayValue = item[arrayKey] || item[scalarKey]?.signal;
    if (Array.isArray(arrayValue) && arrayValue.length) return arrayValue.map(Number).filter(Number.isFinite);
    return Number.isFinite(item[scalarKey]) ? [item[scalarKey]] : [];
  });
  return values.length ? lowPass(values.slice(-240)) : fallback;
}

function lowPass(values, alpha = 0.22) {
  let previous = values[0] || 0;
  return values.map((value) => {
    previous += alpha * (value - previous);
    return previous;
  });
}

function smoothValue(values) {
  const clean = values.filter(Number.isFinite).slice(-12);
  return clean.length ? mean(clean) : null;
}

function formatMetric(value, suffix = "", digits = 1) {
  return Number.isFinite(value) ? `${Number(value).toFixed(digits)}${suffix}` : "--";
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sd(values) {
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function detectPeaks(values) {
  if (values.length < 5) return [];
  const avg = mean(values);
  const threshold = avg + sd(values) * 0.55;
  const peaks = [];
  for (let index = 1; index < values.length - 1; index += 1) {
    if (values[index] > threshold && values[index] > values[index - 1] && values[index] >= values[index + 1]) peaks.push(index);
  }
  return peaks.filter((peak, index) => index === 0 || peak - peaks[index - 1] > 5);
}

function intervalsFromPeaks(peaks, sampleMs = 10) {
  return peaks.slice(1).map((peak, index) => (peak - peaks[index]) * sampleMs).filter((interval) => interval >= 300 && interval <= 1500);
}

function estimateInterval(bpm, fraction) {
  return Number.isFinite(bpm) && bpm > 0 ? (60000 / bpm) * fraction : null;
}

function stSegmentLevel(ecg) {
  if (ecg.length < 12) return null;
  const baseline = mean(ecg.slice(0, Math.max(3, Math.floor(ecg.length * 0.15))));
  const st = mean(ecg.slice(Math.floor(ecg.length * 0.55), Math.floor(ecg.length * 0.7)));
  return (st - baseline) / 1000;
}

function estimateRespiration(ppg) {
  if (ppg.length < 20) return null;
  const envelope = [];
  for (let index = 0; index < ppg.length; index += 12) envelope.push(mean(ppg.slice(index, index + 12)));
  return detectPeaks(envelope).length * 6;
}

function pulseAmplitude(values) {
  if (!values.length) return null;
  return Math.max(...values) - Math.min(...values);
}

function rateOfChange(values) {
  if (values.length < 2) return null;
  return (values[values.length - 1] - values[0]) / Math.max(1, values.length / 12);
}

function physiologicalScore(scores) {
  const clean = scores.filter(Number.isFinite);
  if (!clean.length) return 0;
  return Math.round(Math.max(0, Math.min(100, mean(clean))));
}

function scoreRange(value, low, high) {
  if (!Number.isFinite(value)) return null;
  if (value >= low && value <= high) return 100;
  const distance = value < low ? low - value : value - high;
  const span = Math.max(1, high - low);
  return Math.max(0, 100 - (distance / span) * 100);
}

function scoreLow(value, high) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, 100 - (value / Math.max(1, high)) * 100));
}

function lastFinite(readings, key) {
  for (let index = readings.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(readings[index]?.[key])) return readings[index][key];
  }
  return null;
}

function movementLoad(readings) {
  const recent = readings.slice(-12);
  const flex = smoothValue(recent.map((item) => item.flex).filter(Number.isFinite));
  const force = smoothValue(recent.map((item) => item.force).filter(Number.isFinite));
  const steps = lastFinite(recent, "steps");
  const activeMinutes = lastFinite(recent, "activeMinutes");
  const motionCount = recent.reduce((count, item) => count + (item.motionAlerts?.filter((alert) => /motion|fall|tremor/i.test(alert)).length || 0), 0);
  const irContact = recent.some((item) => String(item.irState || "").toLowerCase().includes("object")) ? 12 : 0;
  const watchActivity = (Number.isFinite(steps) ? Math.min(24, steps / 350) : 0) + (Number.isFinite(activeMinutes) ? Math.min(24, activeMinutes * 0.9) : 0);
  return Math.round(
    Math.max(
      0,
      Math.min(100, (Number.isFinite(flex) ? Math.min(35, flex / 8) : 0) + (Number.isFinite(force) ? Math.min(35, force / 10) : 0) + watchActivity + Math.min(18, motionCount * 6) + irContact),
    ),
  );
}

function activityLabel(load) {
  if (load > 75) return "High activity";
  if (load > 40) return "Moderate activity";
  return "Low activity";
}

function inferFlexState(value) {
  if (!Number.isFinite(value)) return "";
  return value > 100 ? "Joint bent" : "Joint straight";
}

function inferForceState(value) {
  if (!Number.isFinite(value)) return "";
  return value > 200 ? "Pressure applied" : "Low pressure";
}

function flexPostureAngle(value) {
  if (!Number.isFinite(value)) return null;
  const normalized = Math.max(0, Math.min(1, (value - 40) / 760));
  return normalized * 90;
}

function tremorAlertText(readings) {
  return readings.slice(-12).some((item) => item.motionAlerts?.some((alert) => /tremor/i.test(alert))) ? "Tremor alert" : "No tremor alert";
}

function fallAlertText(readings) {
  return readings.slice(-12).some((item) => item.motionAlerts?.some((alert) => /fall|sudden/i.test(alert))) ? "Fall alert" : "No fall alert";
}

function medianFrequencyShift(values) {
  if (values.length < 12) return null;
  const first = pulseAmplitude(values.slice(0, Math.floor(values.length / 2)));
  const second = pulseAmplitude(values.slice(Math.floor(values.length / 2)));
  return first && second ? second - first : null;
}

function contractionOnset(values) {
  if (values.length < 4) return null;
  const threshold = mean(values) + sd(values);
  const index = values.findIndex((value) => value > threshold);
  return index >= 0 ? index * 10 : null;
}

function estimateSteps(readings) {
  const magnitudes = readings
    .map((item) => {
      const ax = numericValue(item.ax ?? item.mpu?.ax);
      const ay = numericValue(item.ay ?? item.mpu?.ay);
      const az = numericValue(item.az ?? item.mpu?.az);
      return Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(az) ? Math.sqrt(ax * ax + ay * ay + az * az) : null;
    })
    .filter(Number.isFinite);
  return detectPeaks(lowPass(magnitudes)).length;
}

function lightDarkCycles(readings) {
  let light = 0;
  let dark = 0;
  readings.slice(-80).forEach((item) => {
    const value = numericValue(item.lux ?? item.light);
    if (!Number.isFinite(value)) return;
    if (value > 80) light += 1;
    else dark += 1;
  });
  return { light: `${Math.round(light * 0.7)} sec`, dark: `${Math.round(dark * 0.7)} sec` };
}

function syntheticWave(length, bpm, amplitude) {
  return Array.from({ length }, (_, index) => {
    const phase = (index / Math.max(1, length - 1)) * Math.PI * 8;
    return 1 + Math.sin(phase) * amplitude + (Math.sin(phase * 2.8) > 0.94 ? amplitude * 2 : 0);
  });
}

function renderTelemetryVisuals() {
  const canvases = document.querySelectorAll("[data-telemetry-canvas]");
  if (!canvases.length) return;
  const snapshot = buildTelemetrySnapshot();
  canvases.forEach((canvas) => {
    const domainId = canvas.dataset.telemetryCanvas;
    const domain = snapshot.domains.find((item) => item.id === domainId);
    const ctx = canvas.getContext("2d");
    if (!ctx || !domain) return;
    if (domainId === "movement") drawOrientationGauge(ctx, canvas, domain.orientation || {});
    else if (domain.canvas === "sparkline") drawTelemetryLine(ctx, canvas, sparklineValues(domainId, snapshot), domainId);
    else drawTelemetryLine(ctx, canvas, waveformValues(domainId, snapshot), domainId);
  });
}

function waveformValues(domainId, snapshot) {
  if (domainId === "heart") return snapshot.signals.ecg;
  if (domainId === "oxygen") return snapshot.signals.ppg;
  if (domainId === "muscle") return snapshot.signals.emg;
  return [];
}

function sparklineValues(domainId, snapshot) {
  if (domainId === "climate") return snapshot.signals.temp;
  if (domainId === "sleep") return snapshot.signals.light;
  return [];
}

function drawTelemetryLine(ctx, canvas, values, domainId) {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfdfc";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#dce5e9";
  ctx.lineWidth = 1;
  for (let row = 1; row < 5; row += 1) {
    ctx.beginPath();
    ctx.moveTo(28, row * (height / 5));
    ctx.lineTo(width - 24, row * (height / 5));
    ctx.stroke();
  }
  if (values.length < 2) {
    ctx.fillStyle = "#68747f";
    ctx.font = "24px Inter, sans-serif";
    ctx.fillText("Waiting for readings", 40, height / 2);
    return;
  }
  const color = { heart: "#df6c55", oxygen: "#117c73", muscle: "#855f22", climate: "#b45a98", sleep: "#3567b5" }[domainId] || "#117c73";
  const min = Math.min(...values);
  const max = Math.max(...values);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = 34 + (index / (values.length - 1)) * (width - 70);
    const y = height - 34 - ((value - min) / Math.max(1, max - min)) * (height - 72);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawOrientationGauge(ctx, canvas, orientation) {
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const hasMpuTilt = Number.isFinite(orientation.tilt);
  const hasFlexTilt = Number.isFinite(orientation.flexAngle);
  const tilt = hasMpuTilt ? orientation.tilt : hasFlexTilt ? orientation.flexAngle : 0;
  const load = Number.isFinite(orientation.load) ? orientation.load : 0;
  const label = hasMpuTilt ? "MPU6050 orientation" : hasFlexTilt ? "Flex posture proxy" : "Movement load proxy";
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfdfc";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#eef7f4";
  ctx.fillRect(60, height - 54, Math.max(12, (width - 120) * (load / 100)), 18);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((tilt * Math.PI) / 180);
  ctx.fillStyle = hasMpuTilt ? "#dcefeb" : "#e7f3df";
  ctx.fillRect(-220, -42, 440, 84);
  ctx.strokeStyle = hasMpuTilt ? "#117c73" : "#6f8f2f";
  ctx.lineWidth = 6;
  ctx.strokeRect(-220, -42, 440, 84);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, 118, 0, Math.PI * 2);
  ctx.strokeStyle = "#dce5e9";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#172027";
  ctx.font = "34px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(hasFlexTilt && !hasMpuTilt ? `${Math.round(tilt)} deg flex` : `${Math.round(tilt)} deg`, cx, cy + 12);
  ctx.font = "18px Inter, sans-serif";
  ctx.fillStyle = "#68747f";
  ctx.fillText(label, cx, cy + 44);
  if (Number.isFinite(orientation.flex)) {
    ctx.fillText(`Flex raw ${Math.round(orientation.flex)} | Load ${Math.round(load)}%`, cx, cy + 72);
  }
  ctx.textAlign = "left";
}

// ============================================================================
// 6. Diagnosis, alerts, and patient-facing summaries
// ============================================================================

function metric(label, value, detail) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`;
}

function displayValue(value) {
  return value == null || Number.isNaN(Number(value)) ? "--" : value;
}

function alerts(reading) {
  if (!reading) return `<div class="notice">No readings yet. Connect your device or start simulation.</div>`;
  const issues = [];
  if (Number.isFinite(reading.heartRate) && (reading.heartRate > 110 || reading.heartRate < 50)) issues.push(`Your pulse is unusual: ${reading.heartRate} beats per minute`);
  if (Number.isFinite(reading.spo2) && reading.spo2 < 94) issues.push(`Your breathing oxygen looks low: ${reading.spo2}%`);
  if (Number.isFinite(reading.temperature) && reading.temperature > 38) issues.push(`Your body temperature is high: ${reading.temperature} C`);
  if ((Number.isFinite(reading.systolic) && reading.systolic > 140) || (Number.isFinite(reading.diastolic) && reading.diastolic > 90)) issues.push(`Your blood pressure is high: ${reading.systolic}/${reading.diastolic}`);
  if (Number.isFinite(reading.emg) && reading.emg > 3000) issues.push(`Your muscle activity is high: ${reading.emg}`);
  if (reading.motionAlerts?.length) issues.push(...reading.motionAlerts);
  if (!Number.isFinite(reading.spo2) && Number.isFinite(reading.pulseRaw)) issues.push("Oxygen is not directly measured; showing an estimate from pulse strength and movement.");
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
  if (Number.isFinite(reading.heartRate)) {
    if (reading.heartRate >= 60 && reading.heartRate <= 100) lines.push("Your pulse is in the usual resting range for most adults.");
    else if (reading.heartRate > 100) lines.push("Your pulse is faster than usual. This can happen with fever, anxiety, exercise, dehydration, or illness.");
    else lines.push("Your pulse is slower than usual. This can be normal for some people, but dizziness or weakness should be checked.");
  } else if (Number.isFinite(reading.pulseRaw)) {
    lines.push("The pulse sensor is connected, but a stable BPM has not been calculated yet. Keep your finger steady on the sensor.");
  }

  if (Number.isFinite(reading.spo2)) {
    if (reading.spo2 >= 95) lines.push("Your breathing oxygen looks comfortable. Your blood appears to be carrying enough oxygen.");
    else lines.push("Your oxygen reading is lower than expected. If you feel breathless, confused, blue around lips, or very weak, seek urgent help.");
  }

  if (Number.isFinite(reading.temperature)) {
    if (reading.temperature <= 37.5) lines.push("Your temperature does not suggest fever right now.");
    else if (reading.temperature <= 38) lines.push("Your temperature is slightly raised. Rest and watch for worsening symptoms.");
    else lines.push("Your temperature is high and may mean fever. A doctor should review it if it continues or you feel very unwell.");
  }

  if (Number.isFinite(reading.systolic) && Number.isFinite(reading.diastolic)) {
    if (reading.systolic < 140 && reading.diastolic < 90) lines.push("Your blood pressure is not in the high range in this reading.");
    else lines.push("Your blood pressure is high in this reading. Sit calmly and check again; repeated high readings should be shared with a doctor.");
  }

  if (Number.isFinite(reading.emg)) {
    lines.push(reading.emg > 3000 ? "Muscle activity is high in this reading." : "Muscle activity is within the normal demo range.");
  }
  if (reading.motionAlerts?.length) lines.push(...reading.motionAlerts);
  if (!lines.length) lines.push("Sensor data is arriving. Add more readings for a clearer health summary.");
  return lines;
}

function diagnoseTelemetryDomain(domain, snapshot) {
  const latest = snapshot.latest || {};
  const lines = [];
  const hasReadings = snapshot.readings.length > 0;

  if (!hasReadings) {
    return [`No ${domain.title.toLowerCase()} readings yet. Connect the device or start sample monitoring to generate a parameter-specific diagnosis.`];
  }

  if (domain.id === "heart") {
    const bpm = smoothValue(snapshot.readings.map((item) => item.heartRate).filter(Number.isFinite));
    const rhythm = numericParameter(domain, "Rhythm Confidence");
    if (Number.isFinite(bpm)) {
      if (bpm < 50) lines.push(`Heart rate is low at about ${Math.round(bpm)} bpm; review this if there is dizziness, weakness, or fainting.`);
      else if (bpm > 110) lines.push(`Heart rate is fast at about ${Math.round(bpm)} bpm; fever, dehydration, anxiety, exertion, or illness can contribute.`);
      else lines.push(`Heart rate is near the usual adult resting range at about ${Math.round(bpm)} bpm.`);
    }
    if (Number.isFinite(rhythm)) {
      lines.push(rhythm < 55 ? "Rhythm confidence is reduced, so keep the sensor steady and repeat before relying on this trend." : "Rhythm confidence is acceptable for a demo trend.");
    }
    if (snapshot.ptt.raw != null) lines.push("ECG-to-pulse timing is available, so this tab can trend circulation timing alongside rhythm.");
  }

  if (domain.id === "oxygen") {
    const spo2 = smoothValue(snapshot.readings.map((item) => item.spo2).filter(Number.isFinite));
    const estimate = numericParameter(domain, "Oxygenation Estimate");
    if (Number.isFinite(spo2)) {
      lines.push(spo2 < 94 ? `SpO2 is low at about ${Math.round(spo2)}%; breathlessness, blue lips, confusion, or severe weakness needs urgent care.` : `SpO2 is comfortable at about ${Math.round(spo2)}%.`);
    } else {
      lines.push("True SpO2 is not being sent by the current sensor stream; this tab is using pulse strength, temperature, and movement as an oxygenation proxy.");
    }
    if (Number.isFinite(estimate)) lines.push(estimate < 45 ? "The oxygenation proxy is weak, so repeat with a stable finger position and consider doctor review if symptoms match." : "The oxygenation proxy is not showing a strong concern in the current window.");
  }

  if (domain.id === "climate") {
    const temperature = smoothValue(snapshot.signals.temp);
    const humidity = smoothValue(snapshot.signals.humidity);
    if (Number.isFinite(temperature)) {
      if (temperature > 38) lines.push(`Body temperature is high at about ${temperature.toFixed(1)} C, which may fit fever or heat stress.`);
      else if (temperature >= 37.6) lines.push(`Body temperature is mildly raised at about ${temperature.toFixed(1)} C; watch for worsening symptoms.`);
      else lines.push(`Body temperature is not in a fever range at about ${temperature.toFixed(1)} C.`);
    }
    if (Number.isFinite(humidity) && humidity > 80) lines.push("Humidity is high, which can make heat discomfort feel worse and affect recovery comfort.");
    if (!Number.isFinite(temperature)) lines.push("Temperature is not available yet, so the climate diagnosis is limited.");
  }

  if (domain.id === "muscle") {
    const intensity = numericParameter(domain, "Muscle Intensity");
    const exertion = numericParameter(domain, "Exertion Index");
    if (Number.isFinite(intensity)) {
      lines.push(intensity > 3000 ? "Muscle activity is high in this window; rest the limb and review if pain, cramps, or tremor are present." : "Muscle activity is within the expected demo range for this window.");
    }
    if (Number.isFinite(exertion)) lines.push(exertion > 80 ? "Exertion index is high, suggesting load or sustained contraction." : "Exertion index is not showing heavy strain right now.");
  }

  if (domain.id === "movement") {
    const load = numericParameter(domain, "Movement Load");
    const fallText = String(parameterValue(domain, "Fall Impact") || "");
    const tremorText = String(parameterValue(domain, "Tremor") || "");
    if (Number.isFinite(load)) lines.push(load > 75 ? "Movement load is high; check for sudden motion, poor posture, or recent activity." : "Movement load is calm to moderate in the current window.");
    if (/fall alert/i.test(fallText) || latest.motionAlerts?.some((alert) => /fall|sudden/i.test(alert))) lines.push("Fall-style motion was detected. Confirm safety immediately and seek help if there is injury, confusion, or severe pain.");
    if (/tremor alert/i.test(tremorText)) lines.push("Tremor-style motion was detected; repeat with the device secured and share persistent tremor with a clinician.");
  }

  if (domain.id === "sleep") {
    const lux = smoothValue(snapshot.signals.light);
    const rest = numericParameter(domain, "Rest Environment");
    if (Number.isFinite(lux)) lines.push(lux > 80 ? `Light exposure is high at about ${Math.round(lux)} lux, so the sleep environment may be too bright.` : `Light exposure is low at about ${Math.round(lux)} lux, which supports a darker rest setting.`);
    if (Number.isFinite(rest)) lines.push(rest < 50 ? "Rest environment score is low; reduce light, movement, or disturbance before judging sleep quality." : "Rest environment score is acceptable for a simple sleep setting check.");
  }

  if (domain.statusClass === "alert") lines.push("Because this tab is marked for review, repeat the reading and send the report to a doctor if the result persists or symptoms are present.");
  if (!lines.length) lines.push(`${domain.title} readings are available, but there is not enough signal detail yet for a stronger diagnosis.`);
  return lines;
}

function parameterValue(domain, label) {
  return domain.parameters.find((item) => item.label === label)?.value;
}

function numericParameter(domain, label) {
  const value = parameterValue(domain, label);
  if (value == null) return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
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
    <div class="voice-panel" data-voice-panel="${targetId}">
      <button class="voice-mic-button" data-action="start-voice" data-voice-target="${targetId}" type="button" aria-label="Start voice input">
        <span aria-hidden="true">${micIcon()}</span>
      </button>
      <div class="voice-meta">
        <div class="field">
          <label for="voice-language-${targetId}">Speech mode</label>
          <select id="voice-language-${targetId}" data-voice-language>
            <option value="auto">Auto / multilingual</option>
            <option value="en-IN">English (India)</option>
            <option value="hi-IN">Hindi</option>
            <option value="ta-IN">Tamil</option>
            <option value="te-IN">Telugu</option>
            <option value="kn-IN">Kannada</option>
            <option value="ml-IN">Malayalam</option>
            <option value="mr-IN">Marathi</option>
            <option value="bn-IN">Bengali</option>
            <option value="gu-IN">Gujarati</option>
            <option value="pa-IN">Punjabi</option>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
          </select>
        </div>
        <span class="status review" id="voice-status-${targetId}" data-voice-status="${targetId}">Tap mic and speak</span>
      </div>
    </div>
  `;
}

function micIcon() {
  return `
    <svg viewBox="0 0 24 24" role="img" focusable="false">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"></path>
      <path d="M19 11a7 7 0 0 1-14 0"></path>
      <path d="M12 18v4"></path>
      <path d="M8 22h8"></path>
    </svg>
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
  if (Number.isFinite(reading.spo2) && (profile.includes("asthma") || profile.includes("copd") || profile.includes("breath"))) {
    notes.push(`Because you mentioned breathing-related concerns, the oxygen reading is especially important. It is ${reading.spo2}%.`);
  }
  if (profile.includes("diabetes")) {
    notes.push("With diabetes, illness, fever, or unusual tiredness should be taken seriously. Share this report if symptoms continue.");
  }
  if (Number.isFinite(reading.systolic) && Number.isFinite(reading.diastolic) && (profile.includes("blood pressure") || profile.includes("hypertension"))) {
    notes.push(`Because high blood pressure is part of your profile, today's pressure of ${reading.systolic}/${reading.diastolic} should be tracked regularly.`);
  }
  if (Number.isFinite(reading.emg)) {
    notes.push(`The wearable EMG muscle activity value is ${reading.emg}.`);
  }
  if (reading.motionAlerts?.length) {
    notes.push(`Motion alerts from the wearable: ${reading.motionAlerts.join(", ")}.`);
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
  return `<div class="notice"><strong>Scheduled:</strong> ${escapeHtml(upcoming.date)} at ${escapeHtml(upcoming.time)}${upcoming.doctorName ? ` with ${escapeHtml(upcoming.doctorName)}` : ""}<br />${escapeHtml(upcoming.note || "Routine health checkup")}</div>`;
}

function patientCheckupHistory(patientId) {
  const checkups = state.healthCheckups.filter((item) => item.patientId === patientId).slice(-5).reverse();
  if (!checkups.length) return `<div class="notice">Scheduled checkups will appear here after you create one.</div>`;
  return `
    <div class="clinical-response-list">
      ${checkups
        .map(
          (item) => `
            <article class="clinical-response-card">
              <div class="clinical-response-head">
                <strong>${escapeHtml(item.date)}</strong>
                <span class="status approved">${escapeHtml(item.time)}</span>
              </div>
              ${item.doctorName ? `<small>Doctor: ${escapeHtml(item.doctorName)}${item.doctorSpecialty ? ` - ${escapeHtml(item.doctorSpecialty)}` : ""}</small>` : ""}
              <small>${escapeHtml(item.createdAt || "")}</small>
              <p>${escapeHtml(item.note || "Routine health checkup")}</p>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function patientAppointmentSummary(patientId) {
  const appointments = patientAppointments(patientId);
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
                  ${item.approvedAt ? `<br /><small>Approved ${escapeHtml(item.approvedAt)}</small>` : ""}
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

function patientAppointments(patientId) {
  return state.appointments
    .filter((item) => item.patientId === patientId)
    .slice()
    .sort((a, b) => appointmentSortTime(b) - appointmentSortTime(a));
}

function appointmentSortTime(appointment) {
  const approved = Date.parse(appointment?.approvedAt || "");
  if (Number.isFinite(approved)) return approved;
  const created = Date.parse(appointment?.createdAt || "");
  if (Number.isFinite(created)) return created;
  const requested = Date.parse(`${appointment?.date || ""} ${appointment?.time || ""}`);
  return Number.isFinite(requested) ? requested : 0;
}

function patientCareUpdatesPanel(patient) {
  const appointments = patientAppointments(patient?.id);
  const approvedAppointments = appointments.filter((item) => item.status === "approved");
  const responses = state.clinicalResponses
    .filter((item) => item.patientId === patient?.id)
    .slice()
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
  const latestAppointment = approvedAppointments[0] || appointments[0];
  const latestResponse = responses[0];
  if (!latestAppointment && !latestResponse) return "";
  return `
    <div class="panel care-updates-panel">
      <div class="panel-header">
        <div>
          <h3>Care updates</h3>
          <p>Latest appointment approvals and doctor responses.</p>
        </div>
      </div>
      <div class="care-update-grid">
        ${
          latestAppointment
            ? `<article class="care-update-card">
                <span class="status ${latestAppointment.status === "approved" ? "approved" : "pending"}">${escapeHtml(latestAppointment.status)}</span>
                <h4>${escapeHtml(latestAppointment.status === "approved" ? "Appointment approved" : "Appointment requested")}</h4>
                <p>${escapeHtml(latestAppointment.doctorName || "Doctor")} | ${escapeHtml(latestAppointment.date || "Date pending")} at ${escapeHtml(latestAppointment.time || "time pending")}</p>
                ${latestAppointment.meetLink ? `<a class="button secondary small" href="${escapeHtml(latestAppointment.meetLink)}" target="_blank" rel="noreferrer">Join video consultation</a>` : ""}
                <button class="button secondary small" data-patient-tool="appointments" type="button">View appointments</button>
              </article>`
            : ""
        }
        ${
          latestResponse
            ? `<article class="care-update-card">
                <span class="status approved">doctor response</span>
                <h4>${escapeHtml(latestResponse.doctorName || "Doctor")} sent a diagnosis</h4>
                <p>${escapeHtml(latestResponse.diagnosis || latestResponse.notes || "Clinical response available")}</p>
                <button class="button secondary small" data-patient-tool="diagnosis" type="button">View response</button>
              </article>`
            : ""
        }
      </div>
    </div>
  `;
}

function patientClinicalResponses(patientId) {
  const responses = state.clinicalResponses.filter((item) => item.patientId === patientId).slice(-3).reverse();
  if (!responses.length) {
    return `
      <div class="panel sidebar-tab">
        <div class="panel-header"><div><h3>Doctor diagnosis</h3><p>Prescriptions and follow-up advice from reviewed reports.</p></div></div>
        <div class="notice">No doctor diagnosis has been sent yet.</div>
      </div>
    `;
  }
  return `
    <div class="panel sidebar-tab">
      <div class="panel-header"><div><h3>Doctor diagnosis</h3><p>Prescriptions and follow-up advice from reviewed reports.</p></div></div>
      <div class="clinical-response-list">
        ${responses
          .map(
            (response) => `
              <article class="clinical-response-card">
                <div class="clinical-response-head">
                  <strong>${escapeHtml(response.doctorName)}</strong>
                  <span class="status approved">sent</span>
                </div>
                <small>${escapeHtml(response.createdAt)}</small>
                <dl>
                  <dt>Diagnosis</dt><dd>${escapeHtml(response.diagnosis || "Not specified")}</dd>
                  <dt>Medicines</dt><dd>${escapeHtml(response.medicines || "Not prescribed")}</dd>
                  <dt>Duration</dt><dd>${escapeHtml(response.duration || "Not specified")}</dd>
                  <dt>Follow-up</dt><dd>${escapeHtml(response.followUp || "Not recommended")}</dd>
                  ${response.notes ? `<dt>Advice</dt><dd>${escapeHtml(response.notes)}</dd>` : ""}
                </dl>
                <div class="table-actions">
                  <button class="button secondary small" data-download-clinical-response="${escapeHtml(response.id)}" type="button">Download report</button>
                </div>
                ${clinicalChatBox(response)}
              </article>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function clinicalChatBox(response) {
  const user = currentUser();
  const messages = state.chatMessages.filter((message) => message.responseId === response.id).slice(-20);
  return `
    <div class="clinical-chatbox">
      <div class="clinical-chat-header">
        <h4>Patient-doctor chat</h4>
        <span class="status normal">${messages.length} messages</span>
      </div>
      <div class="clinical-chat-messages">
        ${
          messages.length
            ? messages
                .map(
                  (message) => `
                    <div class="chat-message ${message.senderRole === user?.role ? "own" : ""}">
                      <strong>${escapeHtml(message.senderName)}</strong>
                      <p>${escapeHtml(message.text)}</p>
                      <small>${escapeHtml(message.createdAt)}</small>
                    </div>
                  `,
                )
                .join("")
            : `<div class="notice">No messages yet. Start a focused follow-up conversation about this diagnosis.</div>`
        }
      </div>
      <form class="clinical-chat-form" data-form="clinical-chat" data-response-id="${escapeHtml(response.id)}">
        <input name="message" required placeholder="${user?.role === "doctor" ? "Message patient about diagnosis or follow-up" : "Ask your doctor about this diagnosis"}" />
        <button class="button small" type="submit">Send</button>
      </form>
    </div>
  `;
}

async function sendClinicalChatMessage(responseId, text) {
  const user = currentUser();
  const response = state.clinicalResponses.find((item) => item.id === responseId);
  const cleanText = String(text || "").trim();
  if (!user || !response || !cleanText) return;
  const canAccess =
    (user.role === "doctor" && response.doctorId === user.id) ||
    (user.role === "patient" && response.patientId === user.id);
  if (!canAccess) {
    showModal("Chat unavailable", "This diagnosis chat is not available for your account.");
    return;
  }
  state.chatMessages.push({
    id: uid("chat"),
    responseId,
    reportId: response.reportId,
    doctorId: response.doctorId,
    patientId: response.patientId,
    senderId: user.id,
    senderRole: user.role,
    senderName: user.name,
    text: cleanText,
    createdAt: new Date().toLocaleString(),
  });
  await saveState();
  render();
  showToast("Message sent");
}

function downloadClinicalResponse(responseId) {
  const response = state.clinicalResponses.find((item) => item.id === responseId);
  if (!response) {
    showModal("Report unavailable", "This diagnosis report could not be found.");
    return;
  }
  const report = state.sentReports.find((item) => item.id === response.reportId) || {};
  const html = clinicalResponseReportHtml(response, report);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `koushalya-diagnosis-${response.patientName || "patient"}.html`.replace(/[^\w.-]+/g, "-");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function clinicalResponseReportHtml(response, report) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Koushalya Doctor Diagnosis</title>
        <style>
          body { font-family: Arial, sans-serif; color: #172027; padding: 32px; line-height: 1.5; }
          h1 { margin: 0 0 8px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          td { border: 1px solid #d9e4df; padding: 10px; vertical-align: top; }
          .muted { color: #65736f; }
        </style>
      </head>
      <body>
        <h1>Koushalya Doctor Diagnosis</h1>
        <p class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</p>
        <table>
          <tr><td>Patient</td><td>${escapeHtml(response.patientName)}</td></tr>
          <tr><td>Doctor</td><td>${escapeHtml(response.doctorName)}</td></tr>
          <tr><td>Report type</td><td>${escapeHtml(report.type || "Clinical review")}</td></tr>
          <tr><td>Diagnosis</td><td>${escapeHtml(response.diagnosis || "Not specified")}</td></tr>
          <tr><td>Medicines</td><td>${escapeHtml(response.medicines || "Not prescribed")}</td></tr>
          <tr><td>Duration</td><td>${escapeHtml(response.duration || "Not specified")}</td></tr>
          <tr><td>Follow-up</td><td>${escapeHtml(response.followUp || "Not recommended")}</td></tr>
          <tr><td>Advice</td><td>${escapeHtml(response.notes || "No additional advice")}</td></tr>
          <tr><td>AI/patient summary</td><td>${escapeHtml(report.summary || "Not available")}</td></tr>
        </table>
        <p class="muted">This report is based on doctor-entered diagnosis and patient-shared wearable data in Koushalya.</p>
      </body>
    </html>
  `;
}

function reportActions(type, reading) {
  const doctors = approvedDoctors();
  const needsReading = type === "general";
  return `
    <div class="report-actions">
      <div class="field">
        <label>Choose doctor</label>
        <select data-doctor-select>
          ${doctors.length ? doctors.map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.name)} - ${escapeHtml(doctor.specialty || "General")}</option>`).join("") : `<option value="">No approved doctors yet</option>`}
        </select>
      </div>
      <div class="table-actions">
        <button class="button secondary" data-action="generate-report" data-report-type="${type}" ${needsReading && !reading ? "disabled" : ""}>Generate clinical PDF</button>
        <button class="button secondary" data-action="find-hospital" type="button">Find nearby hospital</button>
        <button class="button secondary" data-action="request-appointment" data-report-type="${type}" data-silent="true" type="button" ${!doctors.length ? "disabled" : ""}>Request appointment</button>
        <button class="button" data-action="send-report" data-report-type="${type}" type="button" ${!doctors.length || (needsReading && !reading) ? "disabled" : ""}>Send for doctor review</button>
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
    <div class="doctor-report-list">
      ${reports.map(doctorReportCard).join("")}
    </div>
  `;
}

function doctorReportQueue(reports, emptyText) {
  if (!reports.length) return `<div class="notice">${escapeHtml(emptyText)}</div>`;
  return `
    <div class="doctor-report-queue">
      ${reports
        .map((report) => {
          const severity = reportTriage(report);
          return `
            <button class="doctor-report-row" data-open-doctor-report="${escapeHtml(report.id)}" type="button">
              <span>
                <strong>${escapeHtml(report.patientName)}</strong>
                <small>${escapeHtml(report.type === "personalized" ? "Personalised" : "General")} | ${escapeHtml(report.createdAt)}</small>
              </span>
              <span>${escapeHtml(report.condition || "General monitoring")}</span>
              <span>
                <span class="status ${severity.className}">${escapeHtml(severity.label)}</span>
                <small>${escapeHtml(severity.reason)}</small>
              </span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function doctorReportDetailPage(report) {
  const severity = reportTriage(report);
  return `
    <div class="doctor-detail-page">
      <div class="panel-header">
        <div>
          <h3>${escapeHtml(report.patientName)} clinical review</h3>
          <p>${escapeHtml(report.type === "personalized" ? "Personalised tracking" : "General tracking")} | Sent ${escapeHtml(report.createdAt)} | ${escapeHtml(severity.reason)}</p>
        </div>
        <div class="table-actions">
          <span class="status ${severity.className}">${escapeHtml(severity.label)}</span>
          ${backActionButton("Report Queue", "data-close-doctor-report")}
        </div>
      </div>
      ${doctorReportCard(report)}
    </div>
  `;
}

function doctorReportCard(report) {
  const existingResponse = state.clinicalResponses.find((item) => item.reportId === report.id && item.doctorId === currentUser()?.id);
  return `
    <article class="doctor-report-card">
      <div class="doctor-assist-layout">
        <div class="chart-wrap doctor-chart-wrap">
          <canvas id="doctor-chart-${escapeHtml(report.id)}" width="1000" height="320" data-doctor-report-chart="${escapeHtml(report.id)}"></canvas>
        </div>
        ${doctorWearableTimeline(report)}
      </div>
      <div class="clinical-review-grid">
        <div class="clinical-review-main">
          <div class="panel-header">
            <div>
              <h3>${escapeHtml(report.patientName)}</h3>
              <p>${escapeHtml(report.type === "personalized" ? "Personalised tracking" : "General tracking")} | Sent ${escapeHtml(report.createdAt)}</p>
            </div>
            <span class="status ${existingResponse ? "approved" : "pending"}">${existingResponse ? "responded" : "new"}</span>
          </div>
          ${doctorSystematicDiagnosis(report)}
        </div>
        <form class="doctor-prescription-form" data-form="doctor-response" data-report-id="${escapeHtml(report.id)}">
          <div class="field">
            <label for="diagnosis-${escapeHtml(report.id)}">Doctor diagnosis</label>
            <textarea id="diagnosis-${escapeHtml(report.id)}" name="diagnosis" required placeholder="Enter clinical diagnosis or provisional impression">${escapeHtml(existingResponse?.diagnosis || "")}</textarea>
          </div>
          <div class="field">
            <label for="medicines-${escapeHtml(report.id)}">Medicines prescribed</label>
            <textarea id="medicines-${escapeHtml(report.id)}" name="medicines" placeholder="Medicine name, dose, frequency">${escapeHtml(existingResponse?.medicines || "")}</textarea>
          </div>
          <div class="field">
            <label for="duration-${escapeHtml(report.id)}">Duration</label>
            <input id="duration-${escapeHtml(report.id)}" name="duration" placeholder="Example: 5 days, 2 weeks" value="${escapeHtml(existingResponse?.duration || "")}" />
          </div>
          <div class="field">
            <label for="follow-up-${escapeHtml(report.id)}">Recommended follow-up</label>
            <input id="follow-up-${escapeHtml(report.id)}" name="followUp" placeholder="Example: Review after 7 days" value="${escapeHtml(existingResponse?.followUp || "")}" />
          </div>
          <div class="field">
            <label for="doctor-notes-${escapeHtml(report.id)}">Additional advice</label>
            <textarea id="doctor-notes-${escapeHtml(report.id)}" name="notes" placeholder="Diet, rest, warning signs, tests, or referral advice">${escapeHtml(existingResponse?.notes || "")}</textarea>
          </div>
          <button class="button" type="submit">${existingResponse ? "Update patient response" : "Send to patient"}</button>
          ${existingResponse ? `<button class="button secondary" data-download-clinical-response="${escapeHtml(existingResponse.id)}" type="button">Download diagnosis report</button>` : ""}
        </form>
      </div>
      ${existingResponse ? clinicalChatBox(existingResponse) : `<div class="notice">Send the diagnosis to open patient-doctor chat for this report.</div>`}
    </article>
  `;
}

function doctorWearableTimeline(report) {
  const timeline = reportTimelineReadings(report).slice(-8).reverse();
  if (!timeline.length) return `<div class="notice">No wearable timeline is available for this report.</div>`;
  return `
    <div class="wearable-timeline">
      <h4>Wearable timeline</h4>
      ${timeline
        .map(
          (reading) => `
            <div class="timeline-item">
              <strong>${escapeHtml(reading.time || "Recent")}</strong>
              <span>Pulse ${escapeHtml(displayValue(reading.heartRate))} | SpO2 ${escapeHtml(displayValue(reading.spo2))} | Temp ${escapeHtml(displayValue(reading.temperature))} C</span>
              <small>ECG ${escapeHtml(displayValue(reading.ecg))} | EMG ${escapeHtml(displayValue(reading.emg))} | Light ${escapeHtml(displayValue(reading.light ?? reading.lux))}</small>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function doctorSystematicDiagnosis(report) {
  const reading = report.reading || {};
  const triage = reportTriage(report);
  return `
    <div class="clinical-summary-grid">
      <section class="triage-card">
        <h4>Patient triage</h4>
        <p><strong>${escapeHtml(triage.label)}</strong> (${escapeHtml(String(triage.score))}/100)</p>
        <p>${escapeHtml(triage.reason)}</p>
      </section>
      <section>
        <h4>AI diagnosis summary</h4>
        <p>${escapeHtml(report.summary || "No diagnosis summary available.")}</p>
      </section>
      <section>
        <h4>Patient context</h4>
        <dl>
          <dt>Age</dt><dd>${escapeHtml(report.age || "Not added")}</dd>
          <dt>Condition</dt><dd>${escapeHtml(report.condition || "General monitoring")}</dd>
          <dt>Symptoms</dt><dd>${escapeHtml(report.symptoms || report.generalInput || "Not shared")}</dd>
        </dl>
      </section>
      <section>
        <h4>Medical profile</h4>
        <dl>
          <dt>Diseases</dt><dd>${escapeHtml(report.diseases || "Not added")}</dd>
          <dt>Allergies</dt><dd>${escapeHtml(report.allergies || "Not added")}</dd>
          <dt>Current medicines</dt><dd>${escapeHtml(report.medications || "Not added")}</dd>
        </dl>
      </section>
      <section>
        <h4>Sensor findings</h4>
        <dl>
          <dt>Pulse</dt><dd>${escapeHtml(displayValue(reading.heartRate))} bpm</dd>
          <dt>Oxygen</dt><dd>${escapeHtml(displayValue(reading.spo2))}%</dd>
          <dt>Temperature</dt><dd>${escapeHtml(displayValue(reading.temperature))} C</dd>
          <dt>ECG / EMG</dt><dd>${escapeHtml(displayValue(reading.ecg))} / ${escapeHtml(displayValue(reading.emg))}</dd>
        </dl>
      </section>
    </div>
  `;
}

function reportTriage(report) {
  const stored = report?.triage || {};
  const storedScore = Number(stored.score);
  const score = Number.isFinite(storedScore) ? storedScore : reportSeverityScore(report);
  const reason = stored.reason || reportTriageReason(report, score);
  if (score >= 70) return { label: "Critical priority", className: "alert", score, reason };
  if (score >= 35) return { label: "Review soon", className: "review", score, reason };
  return { label: "Routine", className: "normal", score, reason };
}

function reportSeverityScore(report) {
  const reading = report.reading || {};
  let score = 0;
  if (Number.isFinite(reading.heartRate) && (reading.heartRate > 120 || reading.heartRate < 45)) score += 35;
  else if (Number.isFinite(reading.heartRate) && (reading.heartRate > 105 || reading.heartRate < 55)) score += 18;
  if (Number.isFinite(reading.spo2) && reading.spo2 < 92) score += 35;
  else if (Number.isFinite(reading.spo2) && reading.spo2 < 95) score += 18;
  if (Number.isFinite(reading.temperature) && reading.temperature > 38.5) score += 28;
  else if (Number.isFinite(reading.temperature) && reading.temperature > 37.8) score += 14;
  if (Number.isFinite(reading.systolic) && reading.systolic > 160) score += 25;
  else if (Number.isFinite(reading.systolic) && reading.systolic > 140) score += 12;
  if (reading.motionAlerts?.length) score += 18;
  const text = `${report.summary || ""} ${report.symptoms || ""} ${report.generalInput || ""}`.toLowerCase();
  if (/(chest pain|breathless|difficulty breathing|faint|unconscious|blue lips|urgent)/.test(text)) score += 38;
  if (/(fever|severe headache|dizziness|weakness|vomit|wheezing)/.test(text)) score += 16;
  return Math.min(100, score);
}

function reportTriageReason(report, score = reportSeverityScore(report)) {
  const reading = report?.reading || {};
  const reasons = [];
  if (Number.isFinite(reading.heartRate) && (reading.heartRate > 120 || reading.heartRate < 45)) reasons.push("critical pulse");
  else if (Number.isFinite(reading.heartRate) && (reading.heartRate > 105 || reading.heartRate < 55)) reasons.push("abnormal pulse");
  if (Number.isFinite(reading.spo2) && reading.spo2 < 92) reasons.push("low oxygen");
  else if (Number.isFinite(reading.spo2) && reading.spo2 < 95) reasons.push("oxygen needs review");
  if (Number.isFinite(reading.temperature) && reading.temperature > 38.5) reasons.push("high fever");
  else if (Number.isFinite(reading.temperature) && reading.temperature > 37.8) reasons.push("fever");
  if (Number.isFinite(reading.systolic) && reading.systolic > 160) reasons.push("very high BP");
  else if (Number.isFinite(reading.systolic) && reading.systolic > 140) reasons.push("high BP");
  if (reading.motionAlerts?.length) reasons.push("movement alert");
  const text = `${report?.summary || ""} ${report?.symptoms || ""} ${report?.generalInput || ""}`.toLowerCase();
  if (/(chest pain|breathless|difficulty breathing|faint|unconscious|blue lips|urgent)/.test(text)) reasons.push("urgent symptom words");
  if (!reasons.length && score >= 35) reasons.push("symptom review");
  return reasons.length ? reasons.join(", ") : "stable vitals and routine symptom wording";
}

function appointmentTriage(appointment) {
  if (appointment?.triage?.label && Number.isFinite(Number(appointment.triage.score)) && appointment.triage.className) {
    return { ...appointment.triage, score: Number(appointment.triage.score) };
  }
  const report = state.sentReports.find((item) => item.id === appointment?.reportId);
  if (report) return reportTriage(report);
  const pseudoReport = {
    summary: appointment?.reason || "",
    symptoms: appointment?.attachmentNote || "",
    generalInput: appointment?.reason || "",
  };
  return reportTriage(pseudoReport);
}

function reportTimelineReadings(report) {
  if (Array.isArray(report.sensorTimeline) && report.sensorTimeline.length) return report.sensorTimeline;
  const latest = report.reading ? [report.reading] : [];
  return state.readings.length ? state.readings.slice(-24) : latest;
}

function renderDoctorReportVisuals() {
  const canvases = document.querySelectorAll("[data-doctor-report-chart]");
  if (!canvases.length) return;
  canvases.forEach((canvas) => {
    const report = state.sentReports.find((item) => item.id === canvas.dataset.doctorReportChart);
    const ctx = canvas.getContext("2d");
    if (!ctx || !report) return;
    drawDoctorReportChart(ctx, canvas, reportTimelineReadings(report));
  });
}

function drawDoctorReportChart(ctx, canvas, readings) {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfdfc";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#dce5e9";
  ctx.lineWidth = 1;
  for (let row = 1; row < 5; row += 1) {
    ctx.beginPath();
    ctx.moveTo(34, row * (height / 5));
    ctx.lineTo(width - 28, row * (height / 5));
    ctx.stroke();
  }
  const series = [
    { key: "heartRate", label: "Pulse", color: "#d75a4a", min: 40, max: 140 },
    { key: "spo2", label: "SpO2", color: "#117c73", min: 85, max: 100 },
    { key: "temperature", label: "Temp", color: "#b45a98", min: 34, max: 40 },
    { key: "emg", label: "EMG", color: "#9b6a21", min: 0, max: 1200 },
  ];
  let drawn = false;
  series.forEach((item, index) => {
    const points = readings.filter((reading) => Number.isFinite(reading[item.key]));
    if (points.length < 2) return;
    drawn = true;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((reading, pointIndex) => {
      const x = 44 + (pointIndex / (points.length - 1)) * (width - 92);
      const normalized = (reading[item.key] - item.min) / Math.max(1, item.max - item.min);
      const y = height - 42 - Math.max(0, Math.min(1, normalized)) * (height - 88);
      if (pointIndex === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = item.color;
    ctx.font = "18px Inter, sans-serif";
    ctx.fillText(item.label, 44 + index * 112, 30);
  });
  if (!drawn) {
    ctx.fillStyle = "#68747f";
    ctx.font = "24px Inter, sans-serif";
    ctx.fillText("Waiting for wearable trend data", 44, height / 2);
  }
}

function doctorAppointments(appointments) {
  if (!appointments.length) return `<div class="notice">No appointment requests are waiting.</div>`;
  return `
    <table class="table">
      <thead><tr><th>Priority</th><th>Patient</th><th>Requested time</th><th>Reason</th><th>Attachments</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>
        ${appointments
          .map((appointment) => {
            const triage = appointmentTriage(appointment);
            return `
              <tr>
                <td><span class="status ${triage.className}">${escapeHtml(triage.label)}</span><br /><small>${escapeHtml(triage.reason)}</small></td>
                <td>${escapeHtml(appointment.patientName)}</td>
                <td>${escapeHtml(appointment.date)}<br />${escapeHtml(appointment.time)}</td>
                <td>${escapeHtml(appointment.reason || "Follow-up consultation")}</td>
                <td>
                  ${escapeHtml(appointmentAttachmentSummary(appointment))}
                  <br /><button class="button secondary small" data-view-appointment-attachments="${escapeHtml(appointment.id)}" type="button">View attachments</button>
                </td>
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
            `;
          })
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

function showAppointmentAttachments(appointmentId) {
  const root = document.querySelector("#modal-root");
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  if (!root || !appointment) return;
  const report = appointmentReportForView(appointment);
  const reading = report.reading || {};
  root.innerHTML = `
    <div class="modal">
      <div class="modal-card">
        <div class="panel-header">
          <div>
            <h3>Appointment attachments</h3>
            <p>${escapeHtml(appointment.patientName || "Patient")} | ${escapeHtml(appointment.date || "")} ${escapeHtml(appointment.time || "")}</p>
          </div>
          <button class="icon-button" data-action="close-modal" aria-label="Close">x</button>
        </div>
        <div class="clinical-summary-grid">
          <section>
            <h4>Included data</h4>
            <p>${escapeHtml(appointmentAttachmentSummary(appointment))}</p>
            ${appointment.attachmentNote ? `<p><strong>Patient note:</strong> ${escapeHtml(appointment.attachmentNote)}</p>` : ""}
            ${
              appointment.attachPdf === "yes"
                ? `<p><button class="button secondary small" data-open-appointment-report="${escapeHtml(appointment.id)}" type="button">Open attached report PDF</button></p>`
                : ""
            }
            ${
              appointment.pdfDataUrl
                ? `<p><a class="button secondary small" href="${escapeHtml(appointment.pdfDataUrl)}" target="_blank" rel="noreferrer">Open uploaded PDF</a></p>`
                : appointment.pdfFileName
                  ? `<p><strong>Uploaded PDF:</strong> ${escapeHtml(appointment.pdfFileName)} (file data was not saved for this older request)</p>`
                  : ""
            }
          </section>
          <section>
            <h4>Report summary</h4>
            <p>${escapeHtml(report.summary || appointment.reason || "No report summary included.")}</p>
            ${report.symptoms ? `<p><strong>Symptoms:</strong> ${escapeHtml(report.symptoms)}</p>` : ""}
            ${report.generalInput ? `<p><strong>Clinical note:</strong> ${escapeHtml(report.generalInput)}</p>` : ""}
          </section>
        </div>
        <dl class="clinical-dl">
          <dt>Condition</dt><dd>${escapeHtml(report.condition || "General review")}</dd>
          <dt>Pulse</dt><dd>${escapeHtml(displayValue(reading.heartRate))}</dd>
          <dt>Oxygen</dt><dd>${escapeHtml(displayValue(reading.spo2))}%</dd>
          <dt>Temperature</dt><dd>${escapeHtml(displayValue(reading.temperature))}</dd>
          <dt>Blood pressure</dt><dd>${escapeHtml(displayValue(reading.systolic))}/${escapeHtml(displayValue(reading.diastolic))}</dd>
        </dl>
      </div>
    </div>
  `;
  bindModalClose(root);
  root.querySelector("[data-open-appointment-report]")?.addEventListener("click", () => openAppointmentReportPdf(appointment.id));
}

function appointmentReportForView(appointment) {
  const report = state.sentReports.find((item) => item.id === appointment.reportId) || appointment.reportSnapshot || {};
  return {
    id: report.id || appointment.reportId,
    type: report.type || "general",
    patientName: report.patientName || appointment.patientName || "Patient",
    age: report.age || "",
    condition: report.condition || "General review",
    diseases: report.diseases || "",
    allergies: report.allergies || "",
    medications: report.medications || "",
    symptoms: report.symptoms || "",
    generalInput: report.generalInput || appointment.attachmentNote || "",
    reading: report.reading || null,
    sensorTimeline: Array.isArray(report.sensorTimeline) ? report.sensorTimeline : [],
    summary: report.summary || appointment.reason || "No report summary included.",
    createdAt: report.createdAt || appointment.createdAt || "",
    triage: report.triage || appointment.triage || {},
  };
}

function openAppointmentReportPdf(appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  if (!appointment) return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showModal("Popup blocked", "Allow popups to open the attached report PDF.");
    return;
  }
  printWindow.document.write(reportHtml(appointmentReportForView(appointment)));
  printWindow.document.close();
  printWindow.focus();
}

function latestReading() {
  return state.readings[state.readings.length - 1] || null;
}

function heartRateForReading(reading) {
  if (!reading) return null;
  if (Number.isFinite(reading.heartRate)) return reading.heartRate;
  const index = state.readings.indexOf(reading);
  const previousReadings = index >= 0 ? state.readings.slice(0, index) : state.readings;
  return estimatePulseBpm(reading, previousReadings);
}

function readingStatus(reading) {
  if (!reading) return { label: "Waiting", className: "review" };
  if (reading.heartRate > 110 || reading.spo2 < 94 || reading.temperature > 38 || reading.systolic > 140) {
    return { label: "Needs attention", className: "alert" };
  }
  return { label: "Stable", className: "normal" };
}

// ============================================================================
// 7. Event binding and interaction handlers
// ============================================================================

function bindCommon() {
  app.querySelector('[data-action="go-back"]')?.addEventListener("click", () => {
    if (currentUser()?.role === "patient" && patientStep !== "home") {
      patientStep = "home";
      activePatientTool = null;
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
    if (!button || button.disabled) return;
    if (handleDelegatedReportAction(event, button)) return;
    if (!button.dataset.silent) acknowledgeButton(button);
  };
  drawChart();
}

function handleDelegatedReportAction(event, button) {
  const action = button.dataset.action;
  if (!["find-hospital", "request-appointment", "send-report"].includes(action)) return false;
  event.preventDefault();
  event.stopPropagation();
  if (!button.dataset.silent) acknowledgeButton(button);
  if (action === "find-hospital") {
    findNearbyHospital();
    return true;
  }
  const doctorId = selectedReportDoctorId(button);
  if (action === "request-appointment") requestAppointment(button.dataset.reportType, doctorId);
  if (action === "send-report") sendReport(button.dataset.reportType, doctorId);
  return true;
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
      activePatientTool = null;
      if (patientStep === "personalized") {
        const patient = state.patients.find((item) => item.id === currentUser()?.id);
        personalizedEditorOpen = !hasPatientProfile(patient);
      }
      render();
    });
  });
  app.querySelectorAll("[data-patient-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      activePatientTool = button.dataset.patientTool;
      render();
    });
  });
  app.querySelectorAll("[data-open-records-trend]").forEach((button) => {
    button.addEventListener("click", () => {
      showRecordsTrendModal(button.dataset.openRecordsTrend);
    });
  });
  app.querySelector('[data-action="download-records"]')?.addEventListener("click", downloadConsolidatedRecords);
  app.querySelector("[data-action='close-patient-tool']")?.addEventListener("click", () => {
    activePatientTool = null;
    render();
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
  app.querySelectorAll("[data-telemetry-domain]").forEach((button) => {
    button.addEventListener("click", () => {
      showTelemetryModal(button.dataset.telemetryDomain);
    });
  });
  app.querySelector('[data-action="connect-esp32"]')?.addEventListener("click", connectEsp32);
  app.querySelector('[data-action="connect-smartwatch"]')?.addEventListener("click", connectSmartwatch);
  app.querySelector('[data-action="add-smartwatch-sample"]')?.addEventListener("click", addSmartwatchSampleReading);
  app.querySelector('[data-action="import-smartwatch-data"]')?.addEventListener("click", showSmartwatchImportModal);
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
  app.querySelector('[data-form="mental-health-checkin"]')?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveMentalHealthCheckIn(Object.fromEntries(new FormData(event.currentTarget)));
  });
  app.querySelector('[data-form="menstrual-profile"]')?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveMenstrualProfile(Object.fromEntries(new FormData(event.currentTarget)));
  });
  app.querySelector('[data-form="menstrual-log"]')?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveMenstrualLog(event.currentTarget);
  });
  app.querySelectorAll(".mental-range-field input[type='range']").forEach((input) => {
    input.addEventListener("input", () => {
      const output = app.querySelector(`[data-range-value="${input.name}"]`);
      if (output) output.textContent = input.value;
    });
  });
  app.querySelectorAll("[data-cycle-range-value]").forEach((output) => {
    const input = app.querySelector(`[name="${output.dataset.cycleRangeValue}"]`);
    input?.addEventListener("input", () => {
      output.textContent = input.value;
    });
  });
  app.querySelector('[data-action="complete-breathing"]')?.addEventListener("click", logBreathingRound);
  app.querySelectorAll('[data-action="new-affirmation"]').forEach((button) => {
    button.addEventListener("click", refreshAffirmation);
  });
  app.querySelector('[data-action="edit-personalized-profile"]')?.addEventListener("click", () => {
    personalizedEditorOpen = true;
    render();
  });
  app.querySelectorAll('[data-action="generate-report"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      generateReport(event.currentTarget.dataset.reportType);
    });
  });
  app.querySelector('[data-action="find-eye-hospital"]')?.addEventListener("click", findNearbyEyeHospital);
  app.querySelector('[data-form="eye-test-symptoms"]')?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveEyeSymptoms(event.currentTarget);
  });
  app.querySelector('[data-action="load-eye-image"]')?.addEventListener("change", (event) => {
    loadEyeImage(event.currentTarget.files?.[0]);
  });
  app.querySelector('[data-action="select-eye-camera"]')?.addEventListener("change", (event) => {
    eyeCameraDeviceId = event.currentTarget.value;
    if (eyeCameraStream) startEyeCamera();
  });
  app.querySelector('[data-action="start-eye-camera"]')?.addEventListener("click", () => startEyeCamera());
  app.querySelector('[data-action="take-eye-photo"]')?.addEventListener("click", takeEyePhoto);
  app.querySelector('[data-action="capture-eye-photo"]')?.addEventListener("click", () => captureEyeFromCamera());
  app.querySelector('[data-action="stop-eye-camera"]')?.addEventListener("click", () => stopEyeCamera());
  app.querySelector('[data-action="run-eye-screening"]')?.addEventListener("click", runEyeScreening);
  app.querySelector('[data-action="clear-eye-image"]')?.addEventListener("click", clearEyeImage);
  app.querySelector('[data-form="eye-training-sample"]')?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveEyeTrainingSample(event.currentTarget);
  });
  app.querySelector('[data-action="download-eye-dataset"]')?.addEventListener("click", downloadEyeDataset);
  app.querySelector('[data-action="schedule-checkup"]')?.addEventListener("click", showScheduleCheckup);
  app.querySelectorAll('[data-form="clinical-chat"]').forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      sendClinicalChatMessage(form.dataset.responseId, new FormData(event.currentTarget).get("message"));
    });
  });
  app.querySelectorAll("[data-download-clinical-response]").forEach((button) => {
    button.addEventListener("click", () => downloadClinicalResponse(button.dataset.downloadClinicalResponse));
  });
  app.querySelector('[data-action="feeling-unwell"]')?.addEventListener("click", () => {
    patientStep = "personalized";
    personalizedEditorOpen = true;
    render();
    showToast("Opened personalised tracking for symptoms and medical history");
  });
  if (app.querySelector("#eye-camera-select")) refreshEyeCameraDevices();
}

function bindDoctor() {
  app.querySelectorAll("[data-doctor-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeDoctorTab = button.dataset.doctorTab;
      selectedDoctorReportId = null;
      render();
    });
  });
  app.querySelectorAll("[data-open-doctor-report]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDoctorReportId = button.dataset.openDoctorReport;
      render();
    });
  });
  app.querySelector("[data-close-doctor-report]")?.addEventListener("click", () => {
    selectedDoctorReportId = null;
    render();
  });
  app.querySelectorAll("[data-approve-appointment]").forEach((button) => {
    button.addEventListener("click", () => approveAppointment(button.dataset.approveAppointment));
  });
  app.querySelectorAll("[data-view-appointment-attachments]").forEach((button) => {
    button.addEventListener("click", () => showAppointmentAttachments(button.dataset.viewAppointmentAttachments));
  });
  app.querySelectorAll('[data-form="doctor-response"]').forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveDoctorResponse(form.dataset.reportId, Object.fromEntries(new FormData(event.currentTarget)));
    });
  });
  app.querySelectorAll('[data-form="clinical-chat"]').forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      sendClinicalChatMessage(form.dataset.responseId, new FormData(event.currentTarget).get("message"));
    });
  });
  app.querySelectorAll("[data-download-clinical-response]").forEach((button) => {
    button.addEventListener("click", () => downloadClinicalResponse(button.dataset.downloadClinicalResponse));
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

async function saveDoctorResponse(reportId, data) {
  const doctor = currentUser();
  const report = state.sentReports.find((item) => item.id === reportId && item.doctorId === doctor?.id);
  if (!doctor || !report) {
    showModal("Report not found", "This report is no longer available for your doctor account.");
    return;
  }
  const response = {
    id: uid("clinical-response"),
    reportId: report.id,
    doctorId: doctor.id,
    doctorName: doctor.name,
    patientId: report.patientId,
    patientName: report.patientName,
    diagnosis: String(data.diagnosis || "").trim(),
    medicines: String(data.medicines || "").trim(),
    duration: String(data.duration || "").trim(),
    followUp: String(data.followUp || "").trim(),
    notes: String(data.notes || "").trim(),
    createdAt: new Date().toLocaleString(),
  };
  const existingIndex = state.clinicalResponses.findIndex((item) => item.reportId === report.id && item.doctorId === doctor.id);
  if (existingIndex >= 0) state.clinicalResponses[existingIndex] = { ...state.clinicalResponses[existingIndex], ...response, id: state.clinicalResponses[existingIndex].id };
  else state.clinicalResponses.push(response);
  await saveState();
  render();
  showToast("Diagnosis and prescription sent to patient");
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
  if (patient) patient.generalInput = displayClinicalNote(generalInput);
  saveState();
  render();
}

function savePersonalizedProfile(data) {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (patient) {
    patient.diseases = String(data.diseases || "").trim();
    patient.allergies = String(data.allergies || "").trim();
    patient.medications = String(data.medications || "").trim();
    patient.symptoms = displayClinicalNote(data.symptoms);
  }
  personalizedEditorOpen = false;
  saveState();
  render();
  showToast("Personalised profile saved");
}

function hasPatientProfile(patient) {
  return [patient?.diseases, patient?.allergies, patient?.medications, patient?.symptoms].some((value) => String(value || "").trim());
}

// ============================================================================
// 8. Voice input, scheduling, reports, and appointments
// ============================================================================

function startVoiceInput(event) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = event?.currentTarget;
  const targetId = button?.dataset?.voiceTarget || "general-input-text";
  const input = document.getElementById(targetId);
  const controls = button?.closest("[data-voice-panel]");
  const status = document.querySelector(`[data-voice-status="${targetId}"]`) || controls?.querySelector("[data-voice-status]");
  if (!SpeechRecognition) {
    if (status) status.textContent = "Voice input is not supported in this browser";
    showModal("Voice not supported", "Use Chrome or Edge for voice input, or type your symptoms.");
    return;
  }
  if (!input) {
    if (status) status.textContent = "Voice field was not found";
    return;
  }
  if (recognition && activeVoiceTargetId === targetId) {
    stopVoiceInput("Voice saved");
    return;
  }

  stopVoiceInput("");
  activeVoiceTargetId = targetId;
  voiceSessionToken += 1;
  const sessionToken = voiceSessionToken;
  const initialText = displayClinicalNote(input.value);
  const committedSegments = [];
  let liveSegment = "";
  activeVoiceDraft = { targetId, initialText, rawText: "", language: "auto", token: sessionToken };

  recognition = new SpeechRecognition();
  const currentRecognition = recognition;
  const voiceLanguage = controls?.querySelector("[data-voice-language]")?.value || "auto";
  if (voiceLanguage !== "auto") recognition.lang = voiceLanguage;
  activeVoiceDraft.language = voiceLanguage;
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;
  voiceShouldKeepListening = true;
  button?.classList.add("listening");
  button?.setAttribute("aria-label", "Stop voice input");
  if (status) status.textContent = "Listening...";

  recognition.onresult = (resultEvent) => {
    if (sessionToken !== voiceSessionToken) return;
    liveSegment = "";
    for (let index = 0; index < resultEvent.results.length; index += 1) {
      const result = resultEvent.results[index];
      const transcript = normalizeSpeechText(result[0]?.transcript || "");
      if (!transcript) continue;
      if (result.isFinal) {
        if (index >= committedSegments.length) committedSegments.push(transcript);
        else committedSegments[index] = transcript;
      } else {
        liveSegment = transcript;
      }
    }
    const capturedText = normalizeSpeechText([...committedSegments, liveSegment].join(" "));
    activeVoiceDraft.rawText = capturedText;
    input.value = mergeDictatedText(initialText, translateClinicalSpeech(capturedText, voiceLanguage));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (status) status.textContent = input.value.trim() ? voiceStatusText(voiceLanguage) : "Listening...";
  };

  recognition.onerror = (errorEvent) => {
    if (sessionToken !== voiceSessionToken) return;
    const canRetry = ["no-speech", "network"].includes(errorEvent.error);
    voiceShouldKeepListening = canRetry;
    if (errorEvent.error === "not-allowed" || errorEvent.error === "service-not-allowed") {
      stopVoiceInput("Microphone permission is blocked");
      return;
    }
    if (status) status.textContent = canRetry ? "Still listening..." : "Voice paused. Tap mic again.";
  };

  recognition.onend = () => {
    if (sessionToken === voiceSessionToken && recognition === currentRecognition && voiceShouldKeepListening && document.getElementById(targetId) === input) {
      voiceRestartTimer = window.setTimeout(() => {
        try {
          if (sessionToken === voiceSessionToken && recognition === currentRecognition && voiceShouldKeepListening) currentRecognition.start();
        } catch {
          finishVoiceInput(input, status, sessionToken);
        }
      }, 350);
      return;
    }
    finishVoiceInput(input, status, sessionToken);
  };

  try {
    recognition.start();
    input.focus();
  } catch {
    stopVoiceInput("Tap mic and try again");
  }
}

function finishVoiceInput(input, status, sessionToken) {
  const draft = activeVoiceDraft;
  if (draft?.token === sessionToken && draft.rawText && shouldTranslateSpeech(draft.language)) {
    translateClinicalSpeechAsync(draft.rawText, draft.language).then((translatedText) => {
      if (draft.token !== voiceSessionToken && activeVoiceDraft !== draft) return;
      input.value = mergeDictatedText(draft.initialText, translatedText);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (status) status.textContent = translatedText ? "Translated and saved" : "Voice saved";
      stopVoiceInput("");
    });
    if (status) status.textContent = "Translating...";
    return;
  }
  stopVoiceInput(input.value.trim() ? "Voice saved" : "Tap mic and speak");
}

function stopVoiceInput(message = "") {
  voiceShouldKeepListening = false;
  voiceSessionToken += 1;
  clearTimeout(voiceRestartTimer);
  const targetId = activeVoiceTargetId;
  const activeRecognition = recognition;
  recognition = null;
  activeVoiceTargetId = null;
  activeVoiceDraft = null;
  document.querySelectorAll(".voice-mic-button.listening").forEach((button) => {
    button.classList.remove("listening");
    button.setAttribute("aria-label", "Start voice input");
  });
  if (message && targetId) {
    const status = document.querySelector(`[data-voice-status="${targetId}"]`);
    if (status) status.textContent = message;
  }
  try {
    activeRecognition?.stop();
  } catch {
    // Browser engines can throw when stop is called just after auto-ending.
  }
}

function mergeDictatedText(existingText, dictatedText) {
  return [existingText, dictatedText].map(normalizeSpeechText).filter(Boolean).join(" ");
}

function normalizeSpeechText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([,.!?;:])(?=\S)/g, "$1 ")
    .trim();
}

function voiceStatusText(language) {
  return shouldTranslateSpeech(language) ? "Listening. Translating to English." : "Listening. Tap mic to finish.";
}

function shouldTranslateSpeech(language = "auto") {
  return language === "auto" || !String(language).startsWith("en");
}

function translateClinicalSpeech(value = "", language = "auto") {
  const text = normalizeSpeechText(value);
  if (!text || !shouldTranslateSpeech(language)) return text;
  return offlineClinicalTranslation(text) || text;
}

async function translateClinicalSpeechAsync(value = "", language = "auto") {
  const text = normalizeSpeechText(value);
  if (!text || !shouldTranslateSpeech(language)) return text;
  const browserTranslation = await browserTranslateText(text, language);
  if (browserTranslation) return normalizeSpeechText(browserTranslation);
  return translateClinicalSpeech(text, language);
}

async function browserTranslateText(text, language) {
  const sourceLanguage = language === "auto" ? "" : String(language).split("-")[0];
  const candidates = [
    globalThis.Translator?.create,
    globalThis.translation?.createTranslator,
    globalThis.ai?.translator?.create,
  ].filter(Boolean);

  for (const createTranslator of candidates) {
    try {
      const translator = await createTranslator.call(globalThis.Translator || globalThis.translation || globalThis.ai?.translator, {
        sourceLanguage: sourceLanguage || undefined,
        targetLanguage: "en",
      });
      const translated = await translator.translate(text);
      if (translated && translated !== text) return translated;
    } catch {
      // Built-in browser translation is optional; fall back to local clinical terms.
    }
  }
  return "";
}

function offlineClinicalTranslation(value = "") {
  const text = normalizeSpeechText(value);
  if (!text) return "";
  const lower = text.toLowerCase();
  const found = [];
  clinicalTranslationTerms().forEach((term) => {
    if (term.words.some((word) => lower.includes(word.toLowerCase()))) found.push(term.english);
  });
  return clinicalSentenceFromTerms([...new Set(found)], text);
}

function clinicalSentenceFromTerms(terms, originalText) {
  if (!terms.length) return normalizeSpeechText(originalText);
  const hasSymptom = terms.some((term) => !["I", "today", "since morning", "since yesterday"].includes(term));
  const coreTerms = terms.filter((term) => !["I", "today", "since morning", "since yesterday"].includes(term));
  const timeTerms = terms.filter((term) => ["today", "since morning", "since yesterday"].includes(term));
  if (!hasSymptom) return normalizeSpeechText(originalText);
  return normalizeSpeechText(`I have ${coreTerms.join(", ")} ${timeTerms.join(" ")}`);
}

function clinicalTranslationTerms() {
  return [
    { english: "fever", words: ["fever", "bukhar", "बुखार", "ज्वर", "काय्चल", "காய்ச்சல்", "జ్వరం", "ಜ್ವರ", "പനി", "ताप", "জ্বর", "તાવ", "ਬੁਖਾਰ"] },
    { english: "headache", words: ["headache", "head pain", "sir dard", "सिर दर्द", "सरदर्द", "सिरदर्द", "தலைவலி", "తలనొప్పి", "ತಲೆನೋವು", "തലവേദന", "डोकेदुखी", "মাথাব্যথা", "માથાનો દુખાવો", "ਸਿਰ ਦਰਦ"] },
    { english: "stomach pain", words: ["stomach pain", "pet dard", "पेट दर्द", "पेटदर्द", "வயிற்று வலி", "కడుపు నొప్పి", "ಹೊಟ್ಟೆ ನೋವು", "വയറുവേദന", "पोटदुखी", "পেট ব্যথা", "પેટમાં દુખાવો", "ਪੇਟ ਦਰਦ"] },
    { english: "chest pain", words: ["chest pain", "seene me dard", "सीने में दर्द", "छाती दर्द", "மார்பு வலி", "ఛాతి నొప్పి", "ಎದೆ ನೋವು", "നെഞ്ചുവേദന", "छातीत दुखणे", "বুকে ব্যথা", "છાતીમાં દુખાવો", "ਛਾਤੀ ਦਰਦ"] },
    { english: "cough", words: ["cough", "khansi", "खांसी", "खोकला", "இருமல்", "దగ్గు", "ಕೆಮ್ಮು", "ചുമ", "কাশি", "ઉધરસ", "ਖੰਘ"] },
    { english: "cold", words: ["cold", "sardi", "सर्दी", "जुकाम", "சளி", "జలుబు", "ಶೀತ", "ജലദോഷം", "सर्दी", "ঠান্ডা", "શરદી", "ਜ਼ੁਕਾਮ"] },
    { english: "breathing difficulty", words: ["breathing difficulty", "shortness of breath", "saans", "सांस लेने में दिक्कत", "सांस फूलना", "மூச்சுத்திணறல்", "శ్వాస తీసుకోవడంలో ఇబ్బంది", "ಉಸಿರಾಟದ ತೊಂದರೆ", "ശ്വാസംമുട്ടൽ", "श्वास घेण्यास त्रास", "শ্বাসকষ্ট", "શ્વાસ લેવામાં તકલીફ", "ਸਾਹ ਲੈਣ ਵਿੱਚ ਤਕਲੀਫ਼"] },
    { english: "dizziness", words: ["dizziness", "chakkar", "चक्कर", "மயக்கம்", "తల తిరగడం", "ತಲೆ ಸುತ್ತು", "തലകറക്കം", "चक्कर येणे", "মাথা ঘোরা", "ચક્કર", "ਚੱਕਰ"] },
    { english: "vomiting", words: ["vomiting", "ulti", "उल्टी", "வாந்தி", "వాంతి", "ವಾಂತಿ", "ഛർദ്ദി", "उलटी", "বমি", "ઉલટી", "ਉਲਟੀ"] },
    { english: "nausea", words: ["nausea", "matli", "मितली", "குமட்டல்", "వికారం", "ವಾಕರಿಕೆ", "ഓക്കാനം", "मळमळ", "বমি বমি ভাব", "ઊબકા", "ਮਤਲੀ"] },
    { english: "weakness", words: ["weakness", "kamzori", "कमजोरी", "பலவீனம்", "బలహీనత", "ದುರ್ಬಲತೆ", "ബലഹീനത", "अशक्तपणा", "দুর্বলতা", "નબળાઈ", "ਕਮਜ਼ੋਰੀ"] },
    { english: "body pain", words: ["body pain", "body ache", "badan dard", "बदन दर्द", "शरीर दर्द", "உடல் வலி", "శరీర నొప్పి", "ದೇಹ ನೋವು", "ശരീരവേദന", "अंगदुखी", "শরীর ব্যথা", "શરીરમાં દુખાવો", "ਸਰੀਰ ਦਰਦ"] },
    { english: "throat pain", words: ["throat pain", "sore throat", "gala dard", "गला दर्द", "தொண்டை வலி", "గొంతు నొప్పి", "ಗಂಟಲು ನೋವು", "തൊണ്ടവേദന", "घसा दुखणे", "গলা ব্যথা", "ગળામાં દુખાવો", "ਗਲਾ ਦਰਦ"] },
    { english: "leg pain", words: ["leg pain", "pair dard", "पैर दर्द", "கால் வலி", "కాలి నొప్పి", "ಕಾಲು ನೋವು", "കാൽവേദന", "पाय दुखणे", "পায়ে ব্যথা", "પગમાં દુખાવો", "ਲੱਤ ਦਰਦ"] },
    { english: "back pain", words: ["back pain", "kamar dard", "कमर दर्द", "முதுகு வலி", "వెన్ను నొప్పి", "ಬೆನ್ನು ನೋವು", "പുറകുവേദന", "पाठदुखी", "পিঠে ব্যথা", "પીઠમાં દુખાવો", "ਪੀਠ ਦਰਦ"] },
    { english: "burning urination", words: ["burning urination", "urine burning", "peshab me jalan", "पेशाब में जलन", "சிறுநீர் எரிச்சல்", "మూత్రంలో మంట", "ಮೂತ್ರದಲ್ಲಿ ಉರಿ", "മൂത്രത്തിൽ കത്തൽ", "लघवीला जळजळ", "প্রস্রাবে জ্বালা", "પેશાબમાં બળતરા", "ਪਿਸ਼ਾਬ ਵਿੱਚ ਜਲਨ"] },
    { english: "high blood pressure", words: ["high bp", "high blood pressure", "बीपी हाई", "उच्च रक्तचाप", "உயர் ரத்த அழுத்தம்", "అధిక రక్తపోటు", "ಹೆಚ್ಚಿನ ರಕ್ತದೊತ್ತಡ", "ഉയർന്ന രക്തസമ്മർദ്ദം", "उच्च रक्तदाब", "উচ্চ রক্তচাপ", "હાઈ બીપી", "ਹਾਈ ਬੀਪੀ"] },
    { english: "low blood pressure", words: ["low bp", "low blood pressure", "बीपी लो", "निम्न रक्तचाप", "குறைந்த ரத்த அழுத்தம்", "తక్కువ రక్తపోటు", "ಕಡಿಮೆ ರಕ್ತದೊತ್ತಡ", "കുറഞ്ഞ രക്തസമ്മർദ്ദം", "कमी रक्तदाब", "নিম্ন রক্তচাপ", "લો બીપી", "ਲੋ ਬੀਪੀ"] },
    { english: "diabetes", words: ["diabetes", "sugar", "मधुमेह", "शुगर", "நீரிழிவு", "డయాబెటిస్", "ಮಧುಮೇಹ", "പ്രമേഹം", "मधुमेह", "ডায়াবেটিস", "ડાયાબિટીસ", "ਸ਼ੂਗਰ"] },
    { english: "today", words: ["today", "aaj", "आज", "இன்று", "ఈ రోజు", "ಇಂದು", "ഇന്ന്", "आज", "আজ", "આજે", "ਅੱਜ"] },
    { english: "since morning", words: ["since morning", "subah se", "सुबह से", "காலை முதல்", "ఉదయం నుండి", "ಬೆಳಿಗ್ಗೆಯಿಂದ", "രാവിലെ മുതൽ", "सकाळपासून", "সকাল থেকে", "સવારથી", "ਸਵੇਰ ਤੋਂ"] },
    { english: "since yesterday", words: ["since yesterday", "kal se", "कल से", "நேற்று முதல்", "నిన్నటి నుండి", "ನಿನ್ನೆಯಿಂದ", "ഇന്നലെ മുതൽ", "कालपासून", "গতকাল থেকে", "ગઈકાલથી", "ਕੱਲ੍ਹ ਤੋਂ"] },
  ];
}

function findNearbyHospital() {
  const mapWindow = window.open("about:blank", "_blank");
  const openMaps = (query) => {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    if (mapWindow) mapWindow.location.href = url;
    else window.location.href = url;
  };
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

function findNearbyEyeHospital() {
  const mapWindow = window.open("about:blank", "_blank");
  const openMaps = (query) => {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    if (mapWindow) mapWindow.location.href = url;
    else window.location.href = url;
  };
  if (!navigator.geolocation) {
    openMaps("nearby eye hospital ophthalmologist optometrist");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => openMaps(`eye hospital ophthalmologist near ${position.coords.latitude},${position.coords.longitude}`),
    () => openMaps("nearby eye hospital ophthalmologist optometrist"),
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
  const doctors = approvedDoctors();
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
          <div class="field">
            <label for="checkup-doctor">Choose doctor</label>
            <select id="checkup-doctor" name="doctorId" required>
              ${doctors.length ? doctors.map((doctor) => `<option value="${escapeHtml(doctor.id)}">${escapeHtml(doctor.name)} - ${escapeHtml(doctor.specialty || "General")}</option>`).join("") : `<option value="">No approved doctors yet</option>`}
            </select>
          </div>
          <div class="field"><label for="checkup-note">Clinical note</label><input id="checkup-note" name="note" placeholder="Routine monitoring, BP review, oxygen review" /></div>
          <button class="button" type="submit" ${doctors.length ? "" : "disabled"}>Confirm health checkup</button>
        </form>
      </div>
    </div>
  `;
  bindModalClose(root);
  root.querySelector('[data-form="schedule-checkup"]').addEventListener("submit", (event) => {
    event.preventDefault();
    const patient = state.patients.find((item) => item.id === currentUser()?.id);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const doctor = approvedDoctors().find((item) => item.id === data.doctorId);
    if (!doctor) {
      showModal("Choose a doctor", "Select an approved doctor before scheduling this health checkup.");
      return;
    }
    state.healthCheckups.push({
      id: uid("checkup"),
      patientId: patient?.id,
      date: data.date,
      time: data.time,
      note: String(data.note || "").trim(),
      doctorId: doctor.id,
      doctorName: doctor.name,
      doctorSpecialty: doctor.specialty || "General",
      createdAt: new Date().toLocaleString(),
    });
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
  root.querySelector('[data-form="appointment-request"]').addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await createAppointment(doctor, report, data);
      root.innerHTML = "";
      render();
      showToast("Appointment request sent to doctor");
    } catch {
      showModal("Attachment could not be saved", "Try a smaller PDF or request the appointment without the extra file.");
    }
  });
}

function showPostReportModal(doctor, report) {
  showAppointmentRequestModal(doctor, report, "sent");
}

async function createAppointment(doctor, report, data) {
  const pdfFile = data.pdfFile instanceof File && data.pdfFile.name ? data.pdfFile : null;
  const pdfDataUrl = pdfFile ? await readFileAsDataUrl(pdfFile) : "";
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
    pdfDataUrl,
    attachmentNote: String(data.attachmentNote || "").trim(),
    reportSnapshot: appointmentReportSnapshot(report),
    triage: reportTriage(report),
    status: "pending",
    createdAt: new Date().toLocaleString(),
  });
  await saveState();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function appointmentReportSnapshot(report) {
  return {
    id: report.id,
    type: report.type,
    patientName: report.patientName,
    age: report.age,
    condition: report.condition,
    createdAt: report.createdAt,
    summary: report.summary,
    symptoms: report.symptoms,
    generalInput: report.generalInput,
    diseases: report.diseases,
    allergies: report.allergies,
    medications: report.medications,
    reading: report.reading,
    sensorTimeline: report.sensorTimeline,
    triage: report.triage,
  };
}

async function approveAppointment(id) {
  const appointment = state.appointments.find((item) => item.id === id);
  if (!appointment) return;
  appointment.status = "approved";
  appointment.meetLink = `https://meet.jit.si/koushalya-${appointment.id.replaceAll("-", "")}`;
  appointment.approvedAt = new Date().toLocaleString();
  await saveState();
  render();
  showToast("Appointment approved and Jitsi link generated");
}

function buildReport(type) {
  const user = currentUser();
  const patient = state.patients.find((item) => item.id === user?.id);
  const reading = latestReading();
  const symptomText = displayClinicalNote(patient?.symptoms || document.querySelector("#symptoms-text")?.value || "");
  const generalInput = displayClinicalNote(patient?.generalInput || document.querySelector("#general-input-text")?.value || "");
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
  const report = {
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
    sensorTimeline: state.readings.slice(-24),
    summary: analysis || "No analysis available yet.",
    createdAt: new Date().toLocaleString(),
  };
  return { ...report, triage: reportTriage(report) };
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

function selectedReportDoctorId(button) {
  return button?.closest(".report-actions")?.querySelector("[data-doctor-select]")?.value || document.querySelector("[data-doctor-select]")?.value || "";
}

function sendReport(type, selectedDoctorId = "") {
  const doctorId = selectedDoctorId || document.querySelector("[data-doctor-select]")?.value;
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

function requestAppointment(type, selectedDoctorId = "") {
  const doctorId = selectedDoctorId || document.querySelector("[data-doctor-select]")?.value;
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
      ${readingReportRow("Pulse", report.reading.heartRate, "beats per minute")}
      ${readingReportRow("Breathing oxygen", report.reading.spo2, "%")}
      ${readingReportRow("Body temperature", report.reading.temperature, "C")}
      ${readingReportRow("Humidity", report.reading.humidity, "%")}
      ${Number.isFinite(report.reading.systolic) && Number.isFinite(report.reading.diastolic) ? `<tr><td>Blood pressure</td><td>${report.reading.systolic}/${report.reading.diastolic}</td></tr>` : ""}
      ${readingReportRow("Heart rate variability", report.reading.hrv, "ms")}
      ${readingReportRow("Respiration rate", report.reading.respirationRate, "br/min")}
      ${readingReportRow("Smart watch steps", report.reading.steps)}
      ${readingReportRow("Active minutes", report.reading.activeMinutes, "min")}
      ${readingReportRow("Sleep score", report.reading.sleepScore, "/100")}
      ${readingReportRow("Stress score", report.reading.stressScore, "/100")}
      ${readingReportRow("Pulse sensor raw", report.reading.pulseRaw)}
      ${readingReportRow("ECG signal", report.reading.ecg)}
      ${readingReportRow("EMG muscle activity", report.reading.emg)}
      ${readingReportRow("Ambient light", report.reading.light, report.reading.environment)}
      ${readingReportRow("Flex sensor", report.reading.flex, report.reading.flexState)}
      ${readingReportRow("Force sensor", report.reading.force, report.reading.forceState)}
      ${report.reading.irState ? `<tr><td>IR sensor</td><td>${escapeHtml(report.reading.irState)}</td></tr>` : ""}
      ${report.reading.motionAlerts?.length ? `<tr><td>Motion alerts</td><td>${escapeHtml(report.reading.motionAlerts.join(", "))}</td></tr>` : ""}
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
          .report-back {
            position: fixed;
            top: 14px;
            left: 14px;
            width: 34px;
            height: 34px;
            border: 1px solid #dce5e9;
            border-radius: 999px;
            background: #f4f8f6;
            color: #172027;
            font-size: 22px;
            line-height: 1;
            cursor: pointer;
          }
          .report-back:hover { background: #e7f1ed; }
          h1 { margin: 0 0 8px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          td, th { border: 1px solid #dce5e9; padding: 10px; text-align: left; }
          .box { border: 1px solid #dce5e9; padding: 16px; border-radius: 8px; }
          @media print {
            .report-back { display: none; }
          }
        </style>
      </head>
      <body>
        <button class="report-back" onclick="window.close(); if (!window.closed) history.back();" aria-label="Back to portal">&larr;</button>
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

function readingReportRow(label, value, suffix = "") {
  if (!Number.isFinite(value)) return "";
  return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}${suffix ? ` ${escapeHtml(suffix)}` : ""}</td></tr>`;
}

// ============================================================================
// 9. ESP32 serial input, simulation, and reading normalization
// ============================================================================

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
    showModal("ESP32 connected", "Listening for your ESP32 wearable sensor output at 115200 baud.");
  } catch (error) {
    showModal("Connection cancelled", error.message || "The ESP32 connection was not opened.");
  }
}

async function connectSmartwatch() {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (patient) {
    patient.smartwatchId = document.querySelector("#smartwatch-id")?.value || patient.smartwatchId || "Smart watch";
    patient.smartwatchStatus = "connected";
  }

  if ("bluetooth" in navigator) {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ["heart_rate"] }],
        optionalServices: ["battery_service", "device_information"],
      });
      if (patient) {
        patient.smartwatchId = device.name || patient.smartwatchId || "Bluetooth smart watch";
        patient.smartwatchStatus = "connected";
      }
      saveState();
      addReading(smartwatchSampleReading({ source: "smartwatch-bluetooth", deviceName: device.name || "Bluetooth watch" }));
      render();
      showModal("Smart watch connected", "A watch connection was added. If your watch app exports more fields, import JSON to enrich sleep, activity, HRV, and oxygen analysis.");
      return;
    } catch (error) {
      saveState();
      render();
      showModal("Watch added", "Bluetooth pairing was skipped or cancelled. The watch is saved, and you can import watch data or add a sample reading.");
      return;
    }
  }

  saveState();
  render();
  showModal("Watch added", "This browser does not expose Web Bluetooth here. You can still import smartwatch JSON or add sample watch readings for analysis.");
}

function addSmartwatchSampleReading() {
  markSmartwatchConnected();
  addReading(smartwatchSampleReading());
  render();
  showToast("Smart watch reading added to analysis");
}

function markSmartwatchConnected() {
  const patient = state.patients.find((item) => item.id === currentUser()?.id);
  if (!patient) return;
  patient.smartwatchStatus = "connected";
  patient.smartwatchId = document.querySelector("#smartwatch-id")?.value || patient.smartwatchId || "Smart watch";
  saveState();
}

function smartwatchSampleReading(overrides = {}) {
  const wave = Math.sin(Date.now() / 7000);
  const heartRate = Math.round(74 + wave * 7 + Math.random() * 6);
  return {
    source: "smartwatch",
    heartRate,
    spo2: Math.round(96 + Math.random() * 3),
    hrv: Math.round(42 + Math.random() * 34),
    respirationRate: Math.round(13 + Math.random() * 5),
    skinTemperature: Number((36.4 + Math.random() * 0.45).toFixed(1)),
    steps: Math.round(1800 + Math.random() * 6400),
    calories: Math.round(160 + Math.random() * 520),
    activeMinutes: Math.round(8 + Math.random() * 46),
    stressScore: Math.round(22 + Math.random() * 58),
    sleepScore: Math.round(62 + Math.random() * 30),
    ppgSignal: syntheticWave(72, heartRate, 300).map((value) => Math.round(value + 1800 + Math.random() * 18)),
    time: new Date().toLocaleTimeString(),
    ...overrides,
  };
}

function showSmartwatchImportModal() {
  const root = document.querySelector("#modal-root");
  if (!root) return;
  const sample = JSON.stringify(
    {
      source: "fitbit",
      heartRate: 78,
      spo2: 97,
      hrv: 54,
      respirationRate: 15,
      skinTemperature: 36.6,
      steps: 6240,
      calories: 430,
      activeMinutes: 36,
      stressScore: 42,
      sleepScore: 81,
    },
    null,
    2,
  );
  root.innerHTML = `
    <div class="modal">
      <div class="modal-card smartwatch-import-modal">
        <div class="panel-header">
          <div>
            <h3>Import smart watch data</h3>
            <p>Paste one JSON object or an array of readings. Fields like bpm, heartRate, SpO2, HRV, respiration, steps, calories, stress, and sleep score are accepted.</p>
          </div>
          <button class="icon-button" data-action="close-modal" aria-label="Close">x</button>
        </div>
        <form class="form-grid" data-form="smartwatch-import">
          <div class="field">
            <label for="smartwatch-json">Watch JSON</label>
            <textarea id="smartwatch-json" name="watchJson" spellcheck="false">${escapeHtml(sample)}</textarea>
          </div>
          <div class="table-actions">
            <button class="button" type="submit">Import to analysis</button>
            <button class="button secondary" data-action="close-modal" type="button">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
  bindModalClose(root);
  root.querySelector('[data-form="smartwatch-import"]')?.addEventListener("submit", (event) => {
    event.preventDefault();
    importSmartwatchData(new FormData(event.currentTarget).get("watchJson"));
    root.innerHTML = "";
  });
}

function importSmartwatchData(rawJson) {
  let parsed;
  try {
    parsed = JSON.parse(String(rawJson || "").trim());
  } catch {
    showModal("Could not import watch data", "The watch data must be valid JSON. Paste a single object or an array of objects.");
    return;
  }
  const readings = Array.isArray(parsed) ? parsed : [parsed];
  const before = state.readings.length;
  markSmartwatchConnected();
  readings.forEach((reading) => addReading({ ...reading, source: reading.source || "smartwatch-import" }));
  const imported = state.readings.length - before;
  render();
  showToast(`${imported} smart watch reading${imported === 1 ? "" : "s"} imported`);
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
      handleSerialLine(line);
    });
  }
}

function handleSerialLine(line) {
  const cleanLine = line.trim();
  if (!cleanLine) return;

  if (cleanLine.startsWith("{")) {
    try {
      addReading(JSON.parse(cleanLine));
    } catch {
      console.warn("Ignoring unreadable JSON packet", cleanLine);
    }
    return;
  }

  if (cleanLine.includes("SENSOR DATA")) {
    serialWearablePacket = newWearablePacket();
    return;
  }

  if (!serialWearablePacket) serialWearablePacket = newWearablePacket();
  parseWearableLine(cleanLine, serialWearablePacket);

  if (cleanLine.startsWith("======================================") && hasWearableReading(serialWearablePacket)) {
    addReading(serialWearablePacket);
    serialWearablePacket = null;
    refreshAfterReading();
  }
}

function newWearablePacket() {
  return { source: "esp32-wearable", motionAlerts: [], time: new Date().toLocaleTimeString() };
}

function parseWearableLine(line, packet) {
  const number = (pattern) => {
    const match = line.match(pattern);
    return match ? Number(match[1]) : null;
  };

  const pulseRaw = number(/^Pulse Sensor Value:\s*([\d.]+)/i);
  if (pulseRaw != null) {
    packet.pulseRaw = pulseRaw;
    packet.pulseSignal = [...(Array.isArray(packet.pulseSignal) ? packet.pulseSignal : []), pulseRaw].slice(-180);
  }

  const heartRate = number(/^Heart Rate:\s*([\d.]+)\s*BPM/i);
  if (heartRate != null) packet.heartRate = heartRate;

  const ecg = number(/^ECG Signal Value:\s*([\d.]+)/i);
  if (ecg != null) packet.ecg = ecg;

  const emg = number(/^EMG Muscle Activity:\s*([\d.]+)/i);
  if (emg != null) packet.emg = emg;

  const temperature = number(/^(?:Skin Temperature|Temperature):\s*([\d.]+)/i);
  if (temperature != null) packet.temperature = temperature;

  const humidity = number(/^Humidity:\s*([\d.]+)/i);
  if (humidity != null) packet.humidity = humidity;

  const light = number(/^Ambient Light Level:\s*([\d.]+)/i);
  if (light != null) packet.light = light;

  const flex = number(/^Flex Sensor Value:\s*([\d.]+)/i);
  if (flex != null) packet.flex = flex;

  const force = number(/^Force Sensor Value:\s*([\d.]+)/i);
  if (force != null) packet.force = force;

  const motion = line.match(/^Motion Detected on ([XYZ])-axis \| Change Value:\s*([\d.]+)/i);
  if (motion) packet.motionAlerts.push(`Motion on ${motion[1].toUpperCase()} axis (${motion[2]})`);

  const accel = line.match(/^MPU Accel:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/i);
  if (accel) {
    packet.ax = Number(accel[1]);
    packet.ay = Number(accel[2]);
    packet.az = Number(accel[3]);
  }

  const gyro = line.match(/^MPU Gyro:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/i);
  if (gyro) {
    packet.gx = Number(gyro[1]);
    packet.gy = Number(gyro[2]);
    packet.gz = Number(gyro[3]);
  }

  if (line.startsWith("Environment:")) packet.environment = line.replace("Environment:", "").trim();
  if (line.includes("Finger/Joint")) packet.flexState = line;
  if (line.includes("Pressure Applied") || line.includes("No Significant Pressure")) packet.forceState = line;
  if (line.startsWith("IR Sensor:")) packet.irState = line.replace("IR Sensor:", "").trim();
  if (line.startsWith("ALERT:")) packet.motionAlerts.push(line.replace("ALERT:", "").trim());
}

function hasWearableReading(packet) {
  return ["heartRate", "pulseRaw", "ecg", "emg", "temperature", "humidity", "light", "flex", "force", "ax", "ay", "az"].some((key) => Number.isFinite(packet?.[key]));
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
  const heartRate = Math.round(78 + wave * 8 + Math.random() * 8);
  const ecgSignal = syntheticWave(72, heartRate, 820).map((value) => Math.round(value + 1800 + Math.random() * 25));
  const ppgSignal = syntheticWave(72, heartRate, 360).map((value) => Math.round(value + 1900 + Math.random() * 18));
  const emgSignal = Array.from({ length: 72 }, (_, index) => Math.round(220 + Math.random() * 80 + (index % 19 > 10 ? Math.random() * 430 : 0)));
  return {
    heartRate,
    spo2: Math.round(97 + Math.random() * 2),
    temperature: Number((36.6 + Math.random() * 0.5).toFixed(1)),
    ambientTemp: Number((25.4 + Math.random() * 1.2).toFixed(1)),
    systolic: Math.round(120 + wave * 7 + Math.random() * 5),
    diastolic: Math.round(78 + wave * 4 + Math.random() * 4),
    ecgSignal,
    ppgSignal,
    emgSignal,
    ecg: ecgSignal[ecgSignal.length - 1],
    ppg: ppgSignal[ppgSignal.length - 1],
    emg: emgSignal[emgSignal.length - 1],
    lux: Math.round(45 + Math.max(0, Math.sin(Date.now() / 16000)) * 120 + Math.random() * 8),
    ax: Math.round(Math.sin(Date.now() / 2200) * 2200),
    ay: Math.round(Math.cos(Date.now() / 2600) * 1800),
    az: 16384 + Math.round(Math.sin(Date.now() / 3300) * 1100),
    gx: Math.round(Math.sin(Date.now() / 900) * 900),
    gy: Math.round(Math.cos(Date.now() / 1100) * 700),
    gz: Math.round(Math.sin(Date.now() / 1200) * 500),
    time: new Date().toLocaleTimeString(),
  };
}

function addReading(reading) {
  const heart = reading.heart || reading.heartHealth || {};
  const oxygen = reading.oxygen || reading.bloodOxygen || {};
  const climate = reading.climate || reading.bodyClimate || {};
  const muscle = reading.muscle || reading.muscleVitality || {};
  const movement = reading.movement || reading.posture || reading.mpu || {};
  const sleep = reading.sleep || reading.sleepEnvironment || {};
  const activity = reading.activity || reading.fitness || {};
  const recovery = reading.recovery || reading.wellness || {};
  const nextReading = {
    source: reading.source || "demo",
    deviceName: reading.deviceName || reading.device || "",
    heartRate: numericValue(reading.heartRate ?? reading.bpm ?? reading.heart_rate ?? heart.bpm ?? heart.heartRate),
    spo2: numericValue(reading.spo2 ?? reading.SpO2 ?? reading.oxygenSaturation ?? oxygen.spo2 ?? oxygen.saturation),
    temperature: numericValue(reading.temperature ?? reading.surfaceTemp ?? reading.skinTemperature ?? reading.wristTemperature ?? climate.surfaceTemp ?? climate.thermistor),
    humidity: numericValue(reading.humidity ?? climate.humidity),
    ambientTemp: numericValue(reading.ambientTemp ?? reading.irTemperature ?? reading.ambientTemperature ?? climate.ambientTemp ?? climate.ir),
    systolic: numericValue(reading.systolic),
    diastolic: numericValue(reading.diastolic),
    hrv: numericValue(reading.hrv ?? reading.hrvMs ?? reading.rmssd ?? heart.hrv ?? recovery.hrv),
    respirationRate: numericValue(reading.respirationRate ?? reading.respiratoryRate ?? reading.breathingRate ?? oxygen.respirationRate ?? recovery.respirationRate),
    steps: numericValue(reading.steps ?? reading.stepCount ?? activity.steps),
    calories: numericValue(reading.calories ?? reading.activeCalories ?? activity.calories),
    activeMinutes: numericValue(reading.activeMinutes ?? reading.activityMinutes ?? activity.activeMinutes),
    stressScore: numericValue(reading.stressScore ?? reading.stress ?? recovery.stressScore),
    sleepScore: numericValue(reading.sleepScore ?? reading.sleepQuality ?? sleep.score ?? recovery.sleepScore),
    pulseRaw: numericValue(reading.pulseRaw),
    ecg: numericValue(reading.ecg ?? heart.ecg),
    ppg: numericValue(reading.ppg ?? oxygen.ppg),
    emg: numericValue(reading.emg ?? muscle.emg),
    light: numericValue(reading.light ?? sleep.light),
    lux: numericValue(reading.lux ?? sleep.lux),
    flex: numericValue(reading.flex),
    force: numericValue(reading.force),
    ecgSignal: numericArray(reading.ecgSignal ?? reading.ecgRaw ?? heart.ecgSignal ?? heart.ecg),
    ppgSignal: numericArray(reading.ppgSignal ?? reading.ppgRaw ?? oxygen.ppgSignal ?? oxygen.ppg),
    pulseSignal: numericArray(reading.pulseSignal ?? reading.pulseWave ?? reading.pulseValues),
    emgSignal: numericArray(reading.emgSignal ?? reading.emgRaw ?? muscle.emgSignal ?? muscle.emg),
    ax: numericValue(reading.ax ?? movement.ax),
    ay: numericValue(reading.ay ?? movement.ay),
    az: numericValue(reading.az ?? movement.az),
    gx: numericValue(reading.gx ?? movement.gx),
    gy: numericValue(reading.gy ?? movement.gy),
    gz: numericValue(reading.gz ?? movement.gz),
    environment: reading.environment || "",
    flexState: reading.flexState || "",
    forceState: reading.forceState || "",
    irState: reading.irState || "",
    motionAlerts: Array.isArray(reading.motionAlerts) ? reading.motionAlerts : [],
    time: reading.time || new Date().toLocaleTimeString(),
    capturedAt: reading.capturedAt || reading.createdAt || new Date().toISOString(),
  };
  if (!Number.isFinite(nextReading.heartRate)) {
    nextReading.heartRate = estimatePulseBpm(nextReading, state.readings);
  }
  if (!hasAnySensorValue(nextReading)) return;
  state.readings.push(nextReading);
  state.readings = state.readings.filter(hasAnySensorValue).slice(-120);
  saveState();
  drawChart();
}

function refreshAfterReading() {
  const modalOpen = Boolean(document.querySelector("#modal-root")?.children.length);
  const activeTag = document.activeElement?.tagName;
  const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(activeTag);
  if (!modalOpen && !editing) render();
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numericArray(value) {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

function estimatePulseBpm(reading, previousReadings = []) {
  const signal = reading.ppgSignal?.length ? reading.ppgSignal : reading.pulseSignal?.length ? reading.pulseSignal : reading.ecgSignal || [];
  const signalBpm = estimatePulseBpmFromSignal(signal);
  if (Number.isFinite(signalBpm)) return signalBpm;

  const recent = [...previousReadings.slice(-80), reading]
    .map((item) => ({
      value: numericValue(item.pulseRaw ?? item.ppg ?? item.ecg),
      time: readingTimestampMs(item),
    }))
    .filter((item) => Number.isFinite(item.value) && Number.isFinite(item.time));
  const timedBpm = estimatePulseBpmFromTimedValues(recent);
  if (Number.isFinite(timedBpm)) return timedBpm;

  return estimatePulseBpmFromRaw(reading, previousReadings);
}

function estimatePulseBpmFromSignal(values) {
  const clean = numericArray(values);
  if (clean.length < 18 || pulseAmplitude(clean) < 8) return null;
  const peaks = detectPeaks(clean);
  const intervals = intervalsFromPeaks(peaks, 45);
  const bpm = intervals.length ? 60000 / mean(intervals) : null;
  return normalPulseBpm(bpm);
}

function estimatePulseBpmFromTimedValues(points) {
  if (points.length < 6 || pulseAmplitude(points.map((item) => item.value)) < 8) return null;
  const values = points.map((item) => item.value);
  const threshold = mean(values) + sd(values) * 0.35;
  const peaks = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1].value;
    const current = points[index].value;
    const next = points[index + 1].value;
    if (current > threshold && current > previous && current >= next) {
      const lastPeak = peaks[peaks.length - 1];
      if (!lastPeak || points[index].time - lastPeak.time > 300) peaks.push(points[index]);
    }
  }
  const intervals = peaks.slice(1).map((peak, index) => peak.time - peaks[index].time).filter((interval) => interval >= 300 && interval <= 1500);
  const bpm = intervals.length ? 60000 / mean(intervals) : null;
  return normalPulseBpm(bpm);
}

function readingTimestampMs(reading) {
  const parsed = Date.parse(reading?.capturedAt || reading?.createdAt || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function normalPulseBpm(value) {
  return Number.isFinite(value) && value >= 35 && value <= 220 ? Math.round(value) : null;
}

function estimatePulseBpmFromRaw(reading, previousReadings = []) {
  const raw = numericValue(reading?.pulseRaw ?? reading?.ppg ?? reading?.ecg);
  if (!Number.isFinite(raw)) return null;
  const recentRaw = [...previousReadings.slice(-24), reading]
    .map((item) => numericValue(item.pulseRaw ?? item.ppg ?? item.ecg))
    .filter(Number.isFinite);
  const baseline = recentRaw.length >= 4 ? mean(recentRaw) : 1850;
  const swing = recentRaw.length >= 4 ? Math.min(18, sd(recentRaw) / 8) : 0;
  const strength = Math.max(-1, Math.min(1, (raw - baseline) / 550));
  const bpm = 78 + strength * 34 + swing;
  return normalPulseBpm(bpm);
}

function hasAnySensorValue(reading) {
  return (
    ["heartRate", "spo2", "temperature", "humidity", "ambientTemp", "systolic", "diastolic", "hrv", "respirationRate", "steps", "calories", "activeMinutes", "stressScore", "sleepScore", "pulseRaw", "ecg", "ppg", "emg", "light", "lux", "flex", "force", "ax", "ay", "az"].some((key) =>
      Number.isFinite(reading?.[key]),
    ) || ["ecgSignal", "ppgSignal", "pulseSignal", "emgSignal"].some((key) => reading?.[key]?.length)
  );
}

// ============================================================================
// 10. Canvas charts and shared UI helpers
// ============================================================================

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
  if (readings.length < 2 || !["heartRate", "spo2", "systolic", "temperature", "emg"].some((key) => readings.filter((reading) => Number.isFinite(reading[key])).length > 1)) {
    ctx.fillStyle = "#68747f";
    ctx.font = "26px Inter, sans-serif";
    ctx.fillText("Waiting for live readings", 40, 180);
    return;
  }
  plotLine(ctx, readings, "heartRate", "#df6c55", 45, 130, width, height);
  plotLine(ctx, readings, "spo2", "#117c73", 88, 100, width, height);
  plotLine(ctx, readings, "systolic", "#3567b5", 95, 155, width, height);
  plotLine(ctx, readings, "temperature", "#b45a98", 30, 45, width, height);
  plotLine(ctx, readings, "emg", "#855f22", 0, 4095, width, height);
  ctx.fillStyle = "#172027";
  ctx.font = "22px Inter, sans-serif";
  ctx.fillText("Heart rate", 42, 32);
  ctx.fillStyle = "#117c73";
  ctx.fillText("Oxygen", 188, 32);
  ctx.fillStyle = "#3567b5";
  ctx.fillText("Systolic", 270, 32);
  ctx.fillStyle = "#b45a98";
  ctx.fillText("Temp", 370, 32);
  ctx.fillStyle = "#855f22";
  ctx.fillText("EMG", 440, 32);
}

function plotLine(ctx, readings, key, color, min, max, width, height) {
  const points = readings.filter((reading) => Number.isFinite(reading[key]));
  if (points.length < 2) return;
  const left = 42;
  const right = width - 36;
  const top = 50;
  const bottom = height - 34;
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  points.forEach((reading, index) => {
    const x = left + (index / (points.length - 1)) * (right - left);
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

// ============================================================================
// 11. App bootstrap
// ============================================================================

render();
syncStateFromServer({ rerender: true });
startSharedStatePolling();
