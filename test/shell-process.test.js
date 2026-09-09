import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { runShell, ptyReadUntil } from "./shell-process.js";

test("shell runner reports executable, input, exit status and partial output", () => {
  assert.throws(
    () =>
      runShell("/bin/sh", ["-c", "printf partial; printf problem >&2; exit 7"], {
        context: "cli ta<TAB>",
      }),
    (error) => {
      for (const text of ["Shell: /bin/sh", "cli ta<TAB>", "Exit: 7", "partial", "problem"])
        assert.ok(error.message.includes(text), error.message);
      return true;
    },
  );
});

test("shell runner reports missing executables", () => {
  assert.throws(() => runShell("/nonexistent/csc-shell", []), /ENOENT/);
});

test("shell runner bounds output", () => {
  assert.throws(
    () => runShell("/bin/sh", ["-c", "while :; do printf flood; done"], { maxBuffer: 128 }),
    /ENOBUFS/,
  );
});

for (const finish of ["wait", "exit 0"]) {
  test(`shell runner cleans up descendants when parent uses ${finish}`, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "csc-process-"));
    try {
      const run = () =>
        runShell(
          "/bin/sh",
          ["-c", `(exec >/dev/null 2>&1; /bin/sleep 0.5; echo leaked > leaked) & ${finish}`],
          { cwd, timeout: 100 },
        );
      if (finish === "wait") assert.throws(run, /ETIMEDOUT/);
      else assert.equal(run().status, 0);
      await setTimeout(650);
      assert.equal(existsSync(join(cwd, "leaked")), false, "A descendant survived cleanup");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}

test("legacy PTY deadlines retain startup output and consume the worker PID", () => {
  const cwd = mkdtempSync(join(tmpdir(), "csc-pty-process-"));
  const workerFile = join(cwd, "worker.pid");
  try {
    const input = `${ptyReadUntil}
zmodload zsh/zpty
zpty -b worker /bin/sh -c 'echo $$ > worker.pid; printf partial-startup; exec /bin/sleep 30'
_until NEVER_READY
`;
    assert.throws(
      () =>
        runShell(process.env.TEST_ZSH ?? "zsh", ["-f"], { input, cwd, workerFile, timeout: 200 }),
      (error) => {
        assert.match(error.message, /ETIMEDOUT/);
        assert.match(error.message, /stderr:\npartial-startup/);
        return true;
      },
    );
    assert.equal(existsSync(workerFile), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
