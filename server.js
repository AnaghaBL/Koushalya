const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const preferredPort = Number(process.env.PORT || 4173);
const dataFile = path.join(root, "healthyone-data.json");
const sharedKeys = ["users", "patients", "doctorApplications", "readings", "sentReports", "appointments", "healthCheckups"];

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function createStaticServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/state") {
      handleStateApi(request, response);
      return;
    }

    const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(root, requestedPath));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
      response.end(data);
    });
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
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
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
    if (body.length > 2_000_000) request.destroy();
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
