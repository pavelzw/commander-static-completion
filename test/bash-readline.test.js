import { test } from "node:test";
import assert from "node:assert/strict";
import { runShell, ptyReadUntil } from "./shell-process.js";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateCompletion } from "../dist/index.js";
import { fixture } from "./fixture.js";
import { executables, quote } from "./helpers.js";

// Zsh supplies the PTY only: Bash's real Readline performs completion. Capture
// through history after commenting out the buffer, so Bash 3.2 works too and
// neither the CLI nor any shell syntax in a candidate gets executed.
function insert(cwd, input) {
  rmSync(join(cwd, "result"), { force: true });
  writeFileSync(
    join(cwd, "setup.bash"),
    `
${generateCompletion(fixture(), { shell: "bash" })}
set -o emacs
set -o history
HISTCONTROL=
HISTIGNORE=
HISTTIMEFORMAT=
PS1='CSC_READY> '
PROMPT_COMMAND='if [[ $capture == yes ]]; then history 1 > result; printf CSC_DONE; fi; capture=yes'
bind 'set enable-bracketed-paste off'
bind '"\\C-x\\C-g": "\\C-a#\\C-e\\C-m"'
node() { printf invoked > invoked; }
csc-test-cli() { printf invoked > invoked; }
PATH=/nonexistent
capture=no
`,
  );
  const driver = `set -e
${ptyReadUntil}
zmodload zsh/zpty
trap 'zpty -d worker 2>/dev/null' EXIT
zpty -b worker /bin/sh -c ${quote(`echo $$ > worker.pid; exec ${quote(executables.bash)} --noprofile --norc -i`)}
_until CSC_PROMPT
zpty -w -n worker ${quote("source ./setup.bash\r")}
_until CSC_READY
zpty -w -n worker ${quote(input + "\x18\x07")}
_until CSC_DONE
print -r -- "$output"
zpty -d worker
`;
  const result = runShell(executables.zsh, ["-f"], {
    input: driver,
    context: { shell: executables.bash, input },
    workerFile: join(cwd, "worker.pid"),
    cwd,
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      TERM: "xterm",
      PS1: "CSC_PROMPT> ",
      INPUTRC: "/dev/null",
      HISTFILE: "/dev/null",
    },
  });
  assert.equal(
    result.status,
    0,
    `${JSON.stringify(input)}: ${result.error ?? ""}\n${result.stderr}\n${result.stdout}`,
  );
  assert.equal(existsSync(join(cwd, "invoked")), false);
  assert.equal(existsSync(join(cwd, "PWNED")), false);
  return readFileSync(join(cwd, "result"), "utf8")
    .replace(/^\s*\d+\s+#/, "")
    .replace(/\n$/, "");
}

test("bash: native Readline insertion", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "csc-readline-"));
  try {
    writeFileSync(join(cwd, "two words.json"), "");
    writeFileSync(join(cwd, "quote's.json"), "");
    writeFileSync(join(cwd, "meta$(echo).json"), "");
    mkdirSync(join(cwd, "nested directory"));
    const cases = [
      ["choice", "deploy --target pr\t", "deploy --target production "],
      ["assignment", "deploy --target=pr\t", "deploy --target=production "],
      ["short attached value", "deploy -vtpr\t", "deploy -vtproduction "],
      ["double quoted choice", 'deploy --target "two\t', 'deploy --target "two words" '],
      ["single quoted choice", "deploy --target 'it\t", "deploy --target 'it'\\''s fine' "],
      ["choice with spaces", "deploy --target two\t", "deploy --target two\\ words "],
      ["literal substitution", "deploy --target \\$\t", "deploy --target \\$\\(touch\\ PWNED\\) "],
      ["literal backticks", "deploy --target \\`\t", "deploy --target \\`touch\\ PWNED\\` "],
      ["choice with quote", "deploy --target it\t", "deploy --target it\\'s\\ fine "],
      ["file with spaces", "deploy --config two\t", "deploy --config two\\ words.json "],
      ["attached file", "deploy --config=two\t", "deploy --config=two\\ words.json "],
      ["file with quote", "deploy --config quo\t", "deploy --config quote\\'s.json "],
      ["file metacharacters", "deploy --config meta\t", "deploy --config meta\\$\\(echo\\).json "],
      ["directory", "deploy --config nest\t", "deploy --config nested\\ directory/"],
      ["attached directory", "deploy --config=nest\t", "deploy --config=nested\\ directory/"],
      ["unfinished quote", 'deploy --config "two\t', 'deploy --config "two words.json" '],
      ["escaped space", "deploy --config two\\ w\t", "deploy --config two\\ words.json "],
      [
        "middle of line",
        "deploy --target pr --no-cache" + "\x02".repeat(11) + "\t",
        "deploy --target production --no-cache",
      ],
    ];
    for (const [name, input, expected] of cases) {
      await t.test(name, () =>
        assert.equal(insert(cwd, "csc-test-cli " + input), "csc-test-cli " + expected),
      );
    }
  } finally {
    rmSync(cwd, { recursive: true });
  }
});
