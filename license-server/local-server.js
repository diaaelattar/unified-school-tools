"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const licenseHandler = require("./api/license");
const adminHandler = require("./api/admin");

const PORT = Number(process.env.PORT || 3456);

function createMockRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

function readReqBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (_) { resolve(raw); }
    });
  });
}

function startServer(port = PORT) {
  const server = http.createServer(async (req, res) => {
    createMockRes(res);
    const u = new URL(req.url || "/", `http://localhost:${port}`);

    if (u.pathname === "/" || u.pathname === "/index.html" || u.pathname === "/public/index.html") {
      const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(html);
    }

    req.body = await readReqBody(req);

    if (u.pathname === "/api/v1/check-school") {
      req.url = "/api/license?action=check-school";
      return licenseHandler(req, res);
    }
    if (u.pathname === "/api/v1/activate-key") {
      req.url = "/api/license?action=activate-key";
      return licenseHandler(req, res);
    }
    if (u.pathname === "/api/v1/health" || u.pathname === "/api/license") {
      return licenseHandler(req, res);
    }
    if (u.pathname.startsWith("/api/v1/admin") || u.pathname === "/api/admin") {
      return adminHandler(req, res);
    }

    res.status(404).json({ ok: false, message: "Not Found" });
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`Nepras License Server running at http://localhost:${server.address().port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = { startServer };
