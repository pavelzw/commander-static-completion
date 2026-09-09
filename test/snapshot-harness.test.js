import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { capture, keystrokes } from "./snapshot-harness.js";
import { fixture } from "./fixture.js";
import { quote } from "./helpers.js";

test("snapshot inputs support editing keys and reject command execution", () => {
  assert.equal(
    keystrokes("cli a<LEFT:2><TAB><BACKSPACE><RIGHT><HOME><END>"),
    "cli a\x02\x02\t\x7f\x06\x01\x05",
  );
  for (const input of ["cli<ENTER>", "cli\n", "cli<LEFT:0>", "cli<TAB:1001>"]) {
    assert.throws(() => keystrokes(input));
  }
});

test("snapshot startup timeouts retain diagnostics and terminate the PTY worker", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "csc-stall-"));
  try {
    const pidFile = join(cwd, "pid");
    const executable = join(cwd, "stalled shell");
    writeFileSync(
      executable,
      `#!/bin/sh\nprintf '%s' "$$" > ${quote(pidFile)}\nprintf 'intentional startup stall'\nexec /bin/sleep 30\n`,
      { mode: 0o755 },
    );
    await assert.rejects(
      capture("bash", fixture(), "csc-test-cli dep<TAB>", { executable, timeoutMs: 1000 }),
      (error) => {
        assert.match(error.message, /timed out/);
        assert.match(error.message, /intentional startup stall/);
        return true;
      },
    );
    const pid = Number(readFileSync(pidFile, "utf8"));
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("snapshot terminal answers capability queries during startup", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "csc-query-"));
  try {
    const executable = join(cwd, "querying shell");
    writeFileSync(
      executable,
      `#!/bin/bash
/bin/stty -echo -icanon min 1
printf '\\033]777;CSC_READY\\007\\033[0c'
seen=
while IFS= read -r -n 1 char; do
  seen+=$char
  [[ $seen == *$'\\033[?1;2c' ]] && break
done
printf '> negotiation complete\\033]777;CSC_DONE\\007'
exec /bin/sleep 30
`,
      { mode: 0o755 },
    );
    assert.equal(
      await capture("bash", fixture(), "probe", { executable, timeoutMs: 2000 }),
      "> negotiation complete▏\n",
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
