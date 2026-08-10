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

    await check("GET /api/progress", async () => {
      const result = await request(baseUrl, "GET", "/api/progress");
      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
      assert.ok(result.json.profile);
      assert.ok(Array.isArray(result.json.profile.topicProgress));
      assert.ok(requestIdOf(result));
      assertNoObjectString(result);
    });

    await check("GET /api/recommendations", async () => {
      const result = await request(baseUrl, "GET", "/api/recommendations");
      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
      assert.ok(Array.isArray(result.json.recommendations));
      assertNoObjectString(result);
    });

    await check("GET /api/teacher/summary", async () => {
      const result = await request(baseUrl, "GET", "/api/teacher/summary");
      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
      assert.ok(result.json.summary);
      assert.ok(result.json.summary.overview);
      assert.ok(Array.isArray(result.json.summary.attentionNeeded));
      assert.ok(requestIdOf(result));
      assert.equal(requestIdOf(result), result.json.requestId);
      assertNoObjectString(result);
    });

    await check("Classroom and student API flow", async () => {
      const classroom = await request(baseUrl, "POST", "/api/classrooms", JSON.stringify({ name: "Smoke Classroom" }));
      assert.equal(classroom.response.status, 201);
      const student = await request(baseUrl, "POST", `/api/classrooms/${classroom.json.classroom.id}/students`, JSON.stringify({ displayName: "Smoke Student" }));
      assert.equal(student.response.status, 201);
      const summary = await request(baseUrl, "GET", `/api/classrooms/${classroom.json.classroom.id}/summary`);
      assert.equal(summary.response.status, 200);
      assert.equal(summary.json.summary.classroom.studentCount, 1);
      const progress = await request(baseUrl, "GET", `/api/progress?studentId=${encodeURIComponent(student.json.student.id)}`);
      assert.equal(progress.response.status, 200);
      assert.equal(progress.json.profile.researchedTopics, 0);
      assertNoObjectString(classroom); assertNoObjectString(student); assertNoObjectString(summary); assertNoObjectString(progress);
    });

    await check("GET /api/research?q=Mars", async () => {
      const result = await request(baseUrl, "GET", "/api/research?q=Mars");
      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
      assert.equal(result.json.query, "Mars");
      for (const field of ["articles", "images", "related", "sources"]) {
        assert.ok(Object.prototype.hasOwnProperty.call(result.json, field), `Eksik alan: ${field}`);
      }
      if (result.json.reliability) {
        assert.ok(result.json.reliability.score >= 0 && result.json.reliability.score <= 100);
        if (result.json.reliabilitySources !== undefined) assert.ok(Array.isArray(result.json.reliabilitySources));
      }
      if (result.json.structuredContent) {
        assert.equal(typeof result.json.structuredContent.version, "string");
        assert.equal(typeof result.json.structuredContent.summary, "string");
        assert.ok(Array.isArray(result.json.structuredContent.sections));
        assert.ok(Array.isArray(result.json.structuredContent.keyConcepts));
        assert.ok(Array.isArray(result.json.structuredContent.keyFacts));
        assert.ok(Array.isArray(result.json.structuredContent.followUpQuestions));
        assert.ok(result.json.structuredContent.generatedFrom);
      } else {
        assert.ok(result.json.summary || result.json.message || result.json.title || result.json.query);
      }
      assert.ok(result.json.quizPro);
      assert.ok(Array.isArray(result.json.quizPro.questions));
      assert.ok(result.json.quizPro.questions.length <= 5);
      assert.ok(result.json.quizPro.questions.every(question => !Object.hasOwn(question, "correctAnswer") && !Object.hasOwn(question, "acceptedAnswers")));
      assert.doesNotThrow(() => JSON.stringify(result.json.structuredContent));
      for (const article of result.json.articles || []) {
        if (article.reliabilityScore !== undefined) {
          assert.ok(article.reliabilityScore >= 0 && article.reliabilityScore <= 100);
        }
      }
      assert.ok(requestIdOf(result));
      assertNoObjectString(result);
    });

    await check("Quiz server-authoritative flow", async () => {
      const research = { query: "SmokeTopic", structuredContent: { keyFacts: [
        { text: "SmokeTopic, güvenli test için kullanılan örnek bir konudur.", concept: "Tanım" },
        { text: "SmokeTopic verileri yalnızca test akışını doğrulamak için saklanır.", concept: "Amaç" },
        { text: "SmokeTopic yanıtları server tarafından deterministik biçimde değerlendirilir.", concept: "Doğrulama" },
        { text: "SmokeTopic soruları tekrar eden cevapları engelleyecek şekilde üretilir.", concept: "Quiz" }
      ] } };
      const started = await request(baseUrl, "POST", "/api/quiz/start", JSON.stringify({ research, count: 5, difficulty: "medium", type: "multiple-choice" }));
      assert.equal(started.response.status, 200);
      assert.equal(started.json.ok, true);
      assert.ok(started.json.attempt.attemptId);
      const item = started.json.attempt.questions[0];
      const answered = await request(baseUrl, "POST", "/api/quiz/answer", JSON.stringify({ attemptId: started.json.attempt.attemptId, questionId: item.id, answer: "client-forged", isCorrect: true, xp: 999 }));
      assert.equal(answered.response.status, 200);
      assert.equal(answered.json.result.correct, false);
      const completed = await request(baseUrl, "POST", "/api/quiz/complete", JSON.stringify({ attemptId: started.json.attempt.attemptId, accuracy: 100, mastery: 100, correctAnswers: 999 }));
      assert.equal(completed.response.status, 200);
      assert.ok(completed.json.summary);
      assert.equal(completed.json.summary.correct, 0);
      const duplicate = await request(baseUrl, "POST", "/api/quiz/complete", JSON.stringify({ attemptId: started.json.attempt.attemptId }));
      assert.equal(duplicate.json.duplicate, true);
      assert.equal(duplicate.json.summary.xpAwarded, completed.json.summary.xpAwarded);
      assertNoObjectString(started); assertNoObjectString(answered); assertNoObjectString(completed);
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
    try { require("../brain/classroomStore").resetForTests(); } catch (_) { /* test cleanup is best effort */ }
  }
}

run().catch(error => {
  console.error(`Smoke tests failed: ${error.message}`);
  process.exitCode = 1;
});
