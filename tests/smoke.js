const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const HOST = "127.0.0.1";
const PORT_START = 3100;
const REQUEST_TIMEOUT_MS = 15_000;
const observedRequestIds = new Set();

async function findPort() {
  for (let port = PORT_START; port < PORT_START + 100; port += 1) {
    const available = await new Promise(resolve => {
      const probe = net.createServer();
      probe.once("error", () => resolve(false));
      probe.listen(port, HOST, () => probe.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error("Smoke test için uygun yerel port bulunamadı.");
}

function startServer(port) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk.toString(); });
  child.stderr.on("data", chunk => { output += chunk.toString(); });
  child.__output = () => output;
  return child;
}

async function request(baseUrl, method, route, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body,
      signal: controller.signal
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (error) {
      throw new Error(`${method} ${route}: geçersiz JSON yanıtı (${error.message})`);
    }
    const requestId = response.headers.get("x-request-id");
    if (requestId) observedRequestIds.add(requestId);
    return { response, json, text };
  } finally {
    clearTimeout(timer);
  }
}

async function waitUntilReady(baseUrl, child) {
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Sunucu erken kapandı.\n${child.__output()}`);
    try {
      const result = await request(baseUrl, "GET", "/api/status");
      if (result.response.status === 200) return;
    } catch (_) { /* Sunucu hazır olana kadar bekle. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Sunucu hazır olmadı.\n${child.__output()}`);
}

function requestIdOf(result) {
  return result.response.headers.get("x-request-id");
}

function assertNoObjectString(result) {
  assert.equal(result.text.includes("[object Object]"), false, "Yanıtta [object Object] bulundu");
}

function assertError(result, status, code) {
  assert.equal(result.response.status, status);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, code);
  assert.equal(typeof result.json.error.message, "string");
  assert.ok(result.json.requestId);
  assert.equal(requestIdOf(result), result.json.requestId);
  assertNoObjectString(result);
}

async function run() {
  const port = await findPort();
  const baseUrl = `http://${HOST}:${port}`;
  const child = startServer(port);
  const results = [];
  const check = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`PASS  ${name}`);
    } catch (error) {
      results.push({ name, ok: false });
      console.error(`FAIL  ${name}: ${error.message}`);
      throw error;
    }
  };

  try {
    await waitUntilReady(baseUrl, child);

    await check("GET /api/status", async () => {
      const result = await request(baseUrl, "GET", "/api/status");
      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
      assert.ok(result.json.version);
      assert.ok(result.json.engine);
      assert.ok(requestIdOf(result));
      assertNoObjectString(result);
    });

    await check("GET /api/research?q=Mars", async () => {
      const result = await request(baseUrl, "GET", "/api/research?q=Mars");
      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
      assert.equal(result.json.query, "Mars");
      for (const field of ["articles", "images", "related", "sources"]) {
        assert.ok(Object.prototype.hasOwnProperty.call(result.json, field), `Eksik alan: ${field}`);
      }
      assert.ok(requestIdOf(result));
      assertNoObjectString(result);
    });

    await check("GET /api/research (missing query)", async () => {
      assertError(await request(baseUrl, "GET", "/api/research"), 400, "BAD_REQUEST");
    });

    await check("GET /api/does-not-exist", async () => {
      assertError(await request(baseUrl, "GET", "/api/does-not-exist"), 404, "NOT_FOUND");
    });

    await check("Malformed JSON POST", async () => {
      const result = await request(baseUrl, "POST", "/api/memory/save", "{bad");
      assertError(result, 400, "INVALID_JSON");
      assert.equal(result.json.error.message, "Gönderilen JSON verisi geçersiz.");
    });

    const logDeadline = Date.now() + 2_000;
    while (Date.now() < logDeadline) {
      const log = child.__output();
      if ([...observedRequestIds].every(requestId => log.includes(requestId))) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const log = child.__output();
    for (const requestId of observedRequestIds) {
      assert.ok(log.includes(requestId), `requestId sunucu logunda bulunamadı: ${requestId}`);
    }
    console.log(`\nSmoke tests: ${results.length} passed, 0 failed`);
  } finally {
    if (!child.killed && child.exitCode === null) {
      child.kill();
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 2_000);
        child.once("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
  }
}

run().catch(error => {
  console.error(`Smoke tests failed: ${error.message}`);
  process.exitCode = 1;
});
