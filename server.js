const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 5173);
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ records: [] }, null, 2));
  }
}

function readRecords() {
  ensureDataFile();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(data.records) ? data.records : [];
  } catch {
    return [];
  }
}

function writeRecords(records) {
  const cleanRecords = records
    .filter((record) => Number.isFinite(Number(record.mileage)))
    .map((record) => ({
      id: String(record.id || Date.now()),
      mileage: Number(record.mileage),
      date: record.date || new Date().toISOString(),
    }));

  fs.writeFileSync(DATA_FILE, JSON.stringify({ records: cleanRecords }, null, 2));
  return cleanRecords;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("请求内容过大"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.url === "/api/records" && request.method === "GET") {
    sendJson(response, 200, { records: readRecords() });
    return;
  }

  if (request.url === "/api/records" && request.method === "PUT") {
    try {
      const body = await readBody(request);
      const payload = JSON.parse(body || "{}");
      if (!Array.isArray(payload.records)) {
        sendJson(response, 400, { error: "records 必须是数组" });
        return;
      }
      sendJson(response, 200, { records: writeRecords(payload.records) });
    } catch {
      sendJson(response, 400, { error: "请求格式错误" });
    }
    return;
  }

  serveStatic(request, response);
});

ensureDataFile();
server.listen(PORT, () => {
  console.log(`App running at http://localhost:${PORT}/`);
  console.log(`Data file: ${DATA_FILE}`);
});
