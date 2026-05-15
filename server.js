const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = __dirname;
const preferredPort = Number(process.env.PORT || 4173);
const dataFile = path.join(root, "healthyone-data.json");
const sharedKeys = [
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

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function createStaticServer() {
  return http.createServer((request, response) => {
    response.on("error", (error) => {
      if (!isExpectedDisconnect(error)) console.error(error.message);
    });
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/state") {
      handleStateApi(request, response);
      return;
    }

    if (url.pathname === "/api/eye/predict") {
      handleEyePredictApi(request, response);
      return;
    }

    const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(root, requestedPath));

    if (!filePath.startsWith(root)) {
      send(response, 403, "Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        send(response, 404, "Not found");
        return;
      }
      send(response, 200, data, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    });
  });
}

function isExpectedDisconnect(error) {
  return ["ABORT_ERR", "ECONNRESET", "EPIPE", "EOF"].includes(error?.code);
}

function send(response, status, body = "", headers = {}) {
  if (response.destroyed || response.writableEnded) return;
  try {
    response.writeHead(status, headers);
    response.end(body);
  } catch (error) {
    if (!isExpectedDisconnect(error)) throw error;
  }
}

function readJsonBody(request, limit = 25_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function readSharedState() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch {
    return {};
  }
}

function writeJson(response, status, payload) {
  send(response, status, JSON.stringify(payload), { "Content-Type": "application/json; charset=utf-8" });
}

function handleStateApi(request, response) {
  if (request.method === "GET") {
    writeJson(response, 200, readSharedState());
    return;
  }

  if (request.method !== "PUT") {
    writeJson(response, 405, { error: "Method not allowed" });
    return;
  }

  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 25_000_000) request.destroy();
  });
  request.on("end", () => {
    try {
      const incoming = JSON.parse(body || "{}");
      const current = readSharedState();
      const next = { ...current };
      sharedKeys.forEach((key) => {
        if (Array.isArray(incoming[key])) next[key] = incoming[key];
      });
      fs.writeFileSync(dataFile, JSON.stringify(next, null, 2));
      writeJson(response, 200, next);
    } catch {
      writeJson(response, 400, { error: "Invalid JSON" });
    }
  });
}

async function handleEyePredictApi(request, response) {
  if (request.method !== "POST") {
    writeJson(response, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const incoming = await readJsonBody(request);
    if (!incoming.imageData) {
      writeJson(response, 400, { ok: false, error: "Missing imageData" });
      return;
    }
    const prediction = await runNayanaEyePredictor(incoming.imageData);
    writeJson(response, prediction.ok ? 200 : 503, prediction);
  } catch (error) {
    writeJson(response, 400, { ok: false, error: error.message || "Prediction failed" });
  }
}

function pythonCandidates() {
  return [
    process.env.EYE_PYTHON,
    "python",
    "python3",
    "py",
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python313", "python.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python311", "python.exe"),
  ].filter(Boolean);
}

function runNayanaEyePredictor(imageData) {
  const scriptPath = path.join(root, "scripts", "nayana_eye_predict.py");
  const modelPath = path.join(root, "models", "eye-screening", "eye_model_v2_best.pth");
  return runPythonCandidates(pythonCandidates(), {
    imageData,
    modelPath,
  }, scriptPath);
}

function runPythonCandidates(candidates, payload, scriptPath) {
  return new Promise((resolve) => {
    const [candidate, ...rest] = candidates;
    if (!candidate) {
      resolve({ ok: false, error: "Python with torch/torchvision is not available. Set EYE_PYTHON to the Nayana Python environment." });
      return;
    }
    const child = spawn(candidate, [scriptPath], {
      cwd: root,
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 45_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdin.on("error", (error) => {
      if (!isExpectedDisconnect(error)) stderr += error.message;
    });
    child.on("error", () => {
      clearTimeout(timer);
      runPythonCandidates(rest, payload, scriptPath).then(resolve);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) {
        try {
          resolve(JSON.parse(stdout));
          return;
        } catch {
          resolve({ ok: false, error: "Invalid predictor output" });
          return;
        }
      }
      if (rest.length) {
        runPythonCandidates(rest, payload, scriptPath).then(resolve);
        return;
      }
      resolve({ ok: false, error: stderr.trim() || "Nayana predictor failed" });
    });
    try {
      child.stdin.end(JSON.stringify(payload));
    } catch (error) {
      if (!isExpectedDisconnect(error)) stderr += error.message;
    }
  });
}

function listen(port, attemptsLeft = 10) {
  const server = createStaticServer();

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      console.log(`Port ${port} is busy. Trying ${port + 1}...`);
      server.close();
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    console.error(error.message);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`Koushalya is running at http://localhost:${port}`);
  });
}

listen(preferredPort);
