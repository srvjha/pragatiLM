import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Runs the API and the queue worker together.
 *
 * They are two processes on purpose: in deploy the chat queue runs on its own
 * so an answer never waits behind a ten minute PDF, and keeping that shape
 * locally is the only way the split is ever exercised. What was not on purpose
 * was that `npm run dev` started only the API, and nothing said so. A source
 * added with no worker attached does not fail — it queues, and waits, and the
 * spinner turns forever, which is indistinguishable from a broken extractor
 * and cost an afternoon of looking in the wrong place.
 *
 * So both start together and neither outlives the other. Ctrl-C stops both,
 * and if one dies the other is torn down rather than left running as half a
 * backend that looks like a whole one.
 *
 * A launcher rather than `concurrently`, because the whole job is two spawns
 * and a signal handler, and the interesting part is the teardown rather than
 * the parallelism.
 */

const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

if (!existsSync(tsx)) {
  process.stderr.write("tsx is not installed. Run npm install first.\n");
  process.exit(1);
}

const targets = [
  { name: "api", entry: "src/index.ts" },
  { name: "worker", entry: "src/worker.ts" },
];

/** Set before killing anyone, so the exit of a child we killed is not an error. */
let stopping = false;

const children = targets.map(({ name, entry }) => {
  const child = spawn(tsx, ["watch", entry], {
    // Inherited rather than piped: the logger already prefixes every line with
    // its own process field, and re-prefixing pino's output here would break
    // anything that pipes it to pino-pretty.
    stdio: "inherit",
    env: { ...process.env, PROCESS_NAME: name },
  });

  child.on("exit", (code, signal) => {
    if (stopping) return;

    process.stderr.write(
      `\n${name} exited${code === null ? ` on ${signal}` : ` with code ${code}`}, ` +
        `stopping the other half.\n`,
    );
    stop(code ?? 1);
  });

  return { name, child };
});

function stop(code) {
  if (stopping) return;
  stopping = true;

  for (const { child } of children) {
    if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  }

  // The worker drains in flight jobs before exiting, which is the behaviour
  // worth keeping, so it is given a moment rather than killed outright.
  setTimeout(() => {
    for (const { child } of children) {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    process.exit(code);
  }, 5_000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(0));
}
