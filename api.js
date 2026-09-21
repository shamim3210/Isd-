/**
 * Netlify Function that runs the whole LibraryMS Express API.
 *
 * netlify.toml sends every  /api/*  request here, so the Netlify site serves the
 * frontend AND the backend from one address. No CORS problems, no separate
 * server to keep awake.
 *
 * How it works: the Express app is started once per warm function container on a
 * private local port. Each Netlify request is forwarded to it over 127.0.0.1 and
 * the reply is handed back. This uses Node's own HTTP stack, so JSON, CSV, PDF
 * downloads and error handling behave exactly like the normal server.
 */
const http = require("http");
const connectDB = require("../../backend/config/db");
const { app } = require("../../backend/server");

// Fail fast (before Netlify's 10 s function limit) if the database is unreachable.
if (!process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS = "7000";

let serverPromise = null;
function getServer() {
  if (!serverPromise) {
    serverPromise = new Promise((resolve, reject) => {
      const server = http.createServer(app);
      server.once("error", (err) => {
        serverPromise = null;
        reject(err);
      });
      server.listen(0, "127.0.0.1", () => resolve(server));
    });
  }
  return serverPromise;
}

const TEXT_TYPE = /^(text\/|application\/(json|javascript|xml|x-www-form-urlencoded)|image\/svg)/i;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

// Works whether Netlify hands us the original path (/api/auth/login) or the
// function path (/.netlify/functions/api/auth/login).
function normalizePath(rawPath) {
  let p = String(rawPath || "/").replace(/^\/\.netlify\/functions\/api/, "") || "/";
  if (!p.startsWith("/")) p = "/" + p;
  if (!p.startsWith("/api") && p !== "/health") p = "/api" + p;
  return p;
}

function buildQuery(event) {
  if (event.rawQuery) return `?${event.rawQuery}`;
  if (event.rawUrl) {
    try {
      return new URL(event.rawUrl).search;
    } catch {
      /* fall through */
    }
  }
  const qs = event.queryStringParameters || {};
  const s = new URLSearchParams(qs).toString();
  return s ? `?${s}` : "";
}

function forward(server, event) {
  return new Promise((resolve, reject) => {
    const method = (event.httpMethod || "GET").toUpperCase();
    const hasBody = event.body !== undefined && event.body !== null && !["GET", "HEAD"].includes(method);
    const body = hasBody ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8") : null;

    const headers = {};
    for (const [k, v] of Object.entries(event.headers || {})) {
      const key = k.toLowerCase();
      if (["host", "content-length", "connection", "transfer-encoding", "accept-encoding"].includes(key)) continue;
      headers[key] = v;
    }
    headers["accept-encoding"] = "identity"; // Netlify compresses for us
    if (body) headers["content-length"] = String(body.length);

    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        method,
        path: normalizePath(event.path) + buildQuery(event),
        headers,
        timeout: 25000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const outHeaders = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (["transfer-encoding", "connection", "content-length", "keep-alive"].includes(k)) continue;
            outHeaders[k] = Array.isArray(v) ? v.join(", ") : v;
          }
          const isText = !buf.length || TEXT_TYPE.test(String(res.headers["content-type"] || ""));
          resolve({
            statusCode: res.statusCode,
            headers: outHeaders,
            body: isText ? buf.toString("utf8") : buf.toString("base64"),
            isBase64Encoded: !isText,
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("The API took too long to answer.")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

exports.handler = async (event, context) => {
  // Don't wait for open database sockets before replying.
  if (context) context.callbackWaitsForEmptyEventLoop = false;

  // CORS preflight is never needed on the same origin; answer it cheaply anyway.
  if ((event.httpMethod || "").toUpperCase() === "OPTIONS") return { statusCode: 204, headers: {}, body: "" };

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error("JWT_SECRET is missing or shorter than 32 characters.");
    return json(500, {
      error: "Server setup incomplete: set JWT_SECRET (32+ characters) in Netlify → Site configuration → Environment variables, then redeploy.",
    });
  }
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing.");
    return json(500, {
      error: "Server setup incomplete: set MONGO_URI in Netlify → Site configuration → Environment variables, then redeploy.",
    });
  }

  try {
    await connectDB();
  } catch (err) {
    // Health check should still explain itself instead of a generic error.
    return json(503, {
      error: "Can't reach the database right now. Please try again in a moment.",
      hint: "Owner: in MongoDB Atlas allow access from anywhere (Network Access → 0.0.0.0/0) and check MONGO_URI.",
      database: "disconnected",
    });
  }

  try {
    const server = await getServer();
    return await forward(server, event);
  } catch (err) {
    console.error("API function error:", err);
    return json(500, { error: "Something went wrong on the server. Please try again." });
  }
};
