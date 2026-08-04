const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const root = require("node:path").resolve(__dirname, "..");
const loggerPath = require("node:path").join(root, "brain", "logger.js");

function runLogger(env, script) {
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  return `${result.stdout}${result.stderr}`.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

const moduleRequire = `require(${JSON.stringify(loggerPath)})`;
const normal = runLogger({ NODE_ENV: "development", LOG_LEVEL: "info" }, `
  const logger = ${moduleRequire};
  const circular = {}; circular.self = circular;
  logger.debug("debug.disabled", { secret: "hidden" });
  logger.info("test.info", { authorization: "secret", cookie: "cookie", circular });
  logger.error("test.error", Object.assign(new Error("safe failure"), { code: "E_TEST" }), { token: "secret" });
`);
assert.equal(normal.length, 2);
assert.equal(normal[0].event, "test.info");
assert.equal(normal[0].authorization, "[REDACTED]");
assert.equal(normal[0].cookie, "[REDACTED]");
assert.equal(normal[0].circular.self, "[Circular]");
assert.equal(normal[1].errorName, "Error");
assert.match(normal[1].stack, /Error: safe failure/);

const context = runLogger({ NODE_ENV: "development", LOG_LEVEL: "info" }, `
  const logger = ${moduleRequire};
  logger.runWithRequest("request-test", () => logger.info("context.event"));
`);
assert.equal(context[0].requestId, "request-test");

const production = runLogger({ NODE_ENV: "production", LOG_LEVEL: "debug" }, `
  const logger = ${moduleRequire};
  logger.debug("debug.production");
  logger.error("production.error", new Error("no stack for clients"));
`);
assert.equal(production.length, 1);
assert.equal(production[0].event, "production.error");
assert.equal(Object.prototype.hasOwnProperty.call(production[0], "stack"), false);

const writeFailure = spawnSync(process.execPath, ["-e", `
  const logger = ${moduleRequire};
  process.stdout.write = () => { throw new Error("stream unavailable"); };
  process.stderr.write = () => { throw new Error("error stream unavailable"); };
  logger.info("write.failure", { circular: (() => { const value = {}; value.self = value; return value; })() });
  logger.error("write.failure.error", new Error("safe failure"));
`], { cwd: root, env: { ...process.env }, encoding: "utf8" });
assert.equal(writeFailure.status, 0);

console.log("PASS  logger JSON, redaction, circular safety, and environment levels");
