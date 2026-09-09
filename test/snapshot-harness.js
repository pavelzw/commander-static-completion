import { cleanupWorker, killGroup, diagnostic } from "./shell-process.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import xterm from "@xterm/headless";
import { generateCompletion } from "../dist/index.js";
import { executables, quote } from "./helpers.js";

const keys = {
  TAB: "\t",
  LEFT: "\x02",
  RIGHT: "\x06",
  HOME: "\x01",
  END: "\x05",
  BACKSPACE: "\x7f",
};
export function keystrokes(input) {
  // oxlint-disable-next-line no-control-regex -- Reject raw terminal control bytes in case definitions.
  assert.doesNotMatch(input, /[\x00-\x1f\x7f]/, "Use named keystrokes, not control characters");
  return input.replace(/<([A-Z]+)(?::(\d+))?>/g, (_, key, count = "1") => {
    assert.ok(Object.hasOwn(keys, key), `Unknown keystroke <${key}>`);
    assert.ok(Number(count) >= 1 && Number(count) <= 1000, "Keystroke count must be 1–1000");
    return keys[key].repeat(Number(count));
  });
}

export async function capture(
  shell,
  program,
  input,
  {
    executable = executables[shell],
    timeoutMs = 15000,
    bashWordBreaks,
    pathFixture = false,
    preload = [],
    shellSetup = "",
    shellCheck = "",
  } = {},
) {
  assert.ok(["bash", "zsh", "fish"].includes(shell), `Unsupported shell: ${shell}`);
  const cwd = mkdtempSync(join(tmpdir(), "csc-snapshot-"));
  const terminal = new xterm.Terminal({
    cols: 80,
    rows: 24,
    scrollback: 100,
    allowProposedApi: true,
  });
  try {
    mkdirSync(join(cwd, "home"));
    mkdirSync(join(cwd, "nested directory"));
    mkdirSync(join(cwd, "server:directory"));
    writeFileSync(join(cwd, "two words.json"), "");
    writeFileSync(join(cwd, "quote's.json"), "");
    writeFileSync(join(cwd, "server:config.json"), "");
    if (pathFixture) {
      mkdirSync(join(cwd, "~"));
      writeFileSync(join(cwd, "~", "literal.json"), "");
      writeFileSync(join(cwd, "home", "home.json"), "");
      mkdirSync(join(cwd, "home", "home-directory"));
      mkdirSync(join(cwd, "vis"));
      writeFileSync(join(cwd, "vis", "alpha.json"), "");
      writeFileSync(join(cwd, "vis", "beta.json"), "");
      writeFileSync(join(cwd, "vis", ".hidden.json"), "");
      writeFileSync(join(cwd, "nested directory", "child.json"), "");
      for (const name of [
        ".hidden.json",
        "café.json",
        "東京.json",
        "meta$(echo>PWNED).json",
        "bracket[one].json",
        "back\\slash.json",
      ]) {
        writeFileSync(join(cwd, name), "");
      }
      symlinkSync("two words.json", join(cwd, "linked-file"));
      symlinkSync("nested directory", join(cwd, "linked-directory"));
      symlinkSync("missing", join(cwd, "broken-link"));
    }
    const completion = [...preload, program]
      .map((definition, index) => {
        const filename = `completion-${index}`;
        writeFileSync(join(cwd, filename), generateCompletion(definition, { shell }));
        return `source ./${filename}`;
      })
      .join("\n");
    let setup, args;
    const ready = "\\033]777;CSC_READY\\007";
    const done = "\\033]777;CSC_DONE\\007";
    if (shell === "bash") {
      setup = `${completion}
${bashWordBreaks === undefined ? "" : `COMP_WORDBREAKS=${quote(bashWordBreaks)}`}
_csc_word_breaks=$COMP_WORDBREAKS
set -o emacs
PS1='\\[\\e]777;CSC_READY\\a\\]> '
PS2='... '
PROMPT_COMMAND=
HISTFILE=/dev/null
bind 'set enable-bracketed-paste off'
bind 'set show-all-if-ambiguous off'
bind 'set page-completions off'
bind 'set completion-query-items 0'
_mark() { ${shellCheck}\n[[ $COMP_WORDBREAKS == "$_csc_word_breaks" ]] || printf changed > word-breaks-changed; printf '${done}'; }
bind -x '"\\C-x\\C-g":_mark'
node() { printf invoked > invoked; }
csc-test-cli() { printf invoked > invoked; }
PATH=/nonexistent
${shellSetup}
`;
      args = `--noprofile --rcfile ./setup -i`;
    } else if (shell === "zsh") {
      // Signal readiness from the prompt, after startup commands have finished.
      setup = `autoload -Uz compinit
compinit -D -u
${completion}
PROMPT=$'%{\\e]777;CSC_READY\\a%}> '
RPROMPT=
setopt NO_BEEP
unsetopt AUTO_MENU MENU_COMPLETE
bindkey -e
zstyle ':completion:*' list-colors ''
_mark() { ${shellCheck}\nprintf '${done}'; }
zle -N _mark
bindkey '^X^G' _mark
node() { printf invoked > invoked; }
csc-test-cli() { printf invoked > invoked; }
PATH=/nonexistent
${shellSetup}
`;
      args = `-f -i`;
    } else {
      setup = `set -g fish_complete_path
${completion}
set -g fish_greeting
set -g fish_autosuggestion_enabled 0
set -g fish_key_bindings fish_default_key_bindings
function fish_prompt; printf '> '; end
function fish_right_prompt; end
function fish_title; end
function _mark; ${shellCheck}\nprintf '${done}'; end
bind ctrl-x,ctrl-g _mark
function node; printf invoked > invoked; end
function csc-test-cli; printf invoked > invoked; end
set -gx PATH /nonexistent
${shellSetup}
printf '${ready}'
`;
      args = `--no-config --interactive --init-command 'source ./setup'`;
    }
    writeFileSync(join(cwd, "setup"), setup);
    // zpty joins its arguments as shell source, so preserve the entire command.
    // Record the worker PID before starting the shell, including startup failures.
    const command = `printf '%s' "$$" > worker.pid; /bin/stty cols 80 rows 24; export PS1='CSC_BOOT> '; exec ${quote(executable)} ${args}`;
    const driver = `zmodload zsh/zpty
zmodload zsh/zselect
_cleanup() { if [[ -f worker.pid ]]; then kill -KILL $(<worker.pid) 2>/dev/null; fi; zpty -d worker 2>/dev/null; }
trap _cleanup EXIT
_respond() {
  while zselect -t 0 -r 3; do
    IFS= read -r -d '' -u 3 response || return
    zpty -w -n worker "$response"
  done
}
_until() {
  output=
  while [[ $output != *"$1"* ]]; do
    _respond
    if zpty -r -t worker chunk; then
      output+=$chunk
      print -rn -- "$chunk" >&2
    elif ! zpty -t worker; then
      return 1
    else
      zselect -t 1
    fi
  done
}
zpty -b -e worker ${quote(`exec /bin/sh -c ${quote(command)}`)}
${shell === "zsh" ? `_until CSC_BOOT || exit 1\nzpty -w -n worker ${quote("source ./setup\r")}\n` : ""}
_until ${quote("\x1b]777;CSC_READY\x07")} || exit 1
print -rn -- "\${output#*${"\x1b]777;CSC_READY\x07"}}"
zpty -w -n worker ${quote(keystrokes(input))}
zselect -t 10
zpty -w -n worker ${quote("\x18\x07")}
_until ${quote("\x1b]777;CSC_DONE\x07")} || exit 1
print -rn -- "$output"
# The binding acknowledges completion; drain any queued editor redraw afterward.
quiet=0
while ((quiet < 10)); do
  _respond
  if zpty -r -t worker chunk; then
    print -rn -- "$chunk"
    print -rn -- "$chunk" >&2
    quiet=0
  else
    zselect -t 1
    ((quiet+=1))
  fi
done
exit 0
`;
    const locale = pathFixture ? (process.platform === "darwin" ? "en_US.UTF-8" : "C.UTF-8") : "C";
    const result = await runDriver(driver, cwd, timeoutMs, locale);
    if (result.error || result.status !== 0) {
      assert.fail(diagnostic(executable, { shell, input, driver: executables.zsh }, result));
    }
    assert.match(result.stdout, /CSC_DONE/, "Shell did not acknowledge the capture key");
    assert.equal(
      existsSync(join(cwd, "invoked")),
      false,
      `Completion invoked the CLI or Node: ${JSON.stringify(result.stdout)}`,
    );
    assert.equal(existsSync(join(cwd, "PWNED")), false, "Completion executed filename text");
    assert.equal(
      existsSync(join(cwd, "word-breaks-changed")),
      false,
      "Completion changed COMP_WORDBREAKS",
    );
    if (existsSync(join(cwd, "state-before"))) {
      assert.equal(
        readFileSync(join(cwd, "state-after"), "utf8"),
        readFileSync(join(cwd, "state-before"), "utf8"),
        "Completion changed shell state",
      );
    }
    let transcript =
      shell === "fish" ? result.stdout : result.stdout.split("\x1b]777;CSC_DONE\x07")[0];
    // bind -x adds a newline on Bash 3.2, or clears the input line on Bash 5,
    // before executing the capture binding. Exclude only that trailing artifact.
    if (shell === "bash") {
      // oxlint-disable-next-line no-control-regex -- Match the capture binding’s terminal control sequence.
      transcript = transcript.replace(/\r\x1b\[K(?:\r\x1b\[A\x1b\[K)*\r$|\r?\n$/, "");
    }
    await new Promise((resolve) => terminal.write(transcript, resolve));
    const buffer = terminal.buffer.active;
    const lines = [];
    for (let row = 0; row < buffer.length; row++) {
      const line = buffer.getLine(row);
      let text = line.translateToString(true);
      if (row === buffer.baseY + buffer.cursorY) {
        text =
          line.translateToString(false, 0, buffer.cursorX) +
          "▏" +
          line.translateToString(true, buffer.cursorX);
      }
      lines.push(text.trimEnd());
    }
    while (lines.at(-1) === "") lines.pop();
    return lines.join("\n") + "\n";
  } finally {
    terminal.dispose();
    rmSync(cwd, { recursive: true, force: true });
  }
}

// A deadline kills both the driver and its PTY worker, rather than leaving a
// blocked interactive shell behind. Keep the transcript for actionable failures.
function runDriver(input, cwd, timeoutMs, locale) {
  return new Promise((resolve) => {
    const child = spawn(executables.zsh, ["-f"], {
      cwd,
      detached: true,
      stdio: ["pipe", "pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        HOME: join(cwd, "home"),
        ZDOTDIR: join(cwd, "home"),
        XDG_CONFIG_HOME: join(cwd, "home"),
        XDG_DATA_HOME: join(cwd, "home"),
        BASH_SILENCE_DEPRECATION_WARNING: "1",
        TERM: "xterm",
        LC_ALL: locale,
        COLUMNS: "80",
        LINES: "24",
        PS1: "CSC_BOOT> ",
        INPUTRC: "/dev/null",
        HISTFILE: "/dev/null",
      },
    });
    // Feed the complete live transcript into an emulator as well as rendering
    // the final snapshot. Its DA/DSR replies travel back to the PTY via fd 3;
    // current Fish waits for this negotiation before drawing its prompt.
    const protocol = new xterm.Terminal({ cols: 80, rows: 24, allowProposedApi: true });
    const reply = (data) => {
      if (!child.stdio[3].destroyed) child.stdio[3].write(data + "\0");
    };
    protocol.onData(reply);
    // xterm-headless has no renderer/theme or extended keyboard protocol. Answer
    // queries for those features explicitly instead of making Fish wait for them.
    protocol.parser.registerCsiHandler({ prefix: "?", final: "u" }, () => {
      reply("\x1b[?0u");
      return true;
    });
    protocol.parser.registerCsiHandler({ prefix: ">", final: "q" }, () => {
      reply("\x1bP>|XTerm(370)\x1b\\");
      return true;
    });
    protocol.parser.registerOscHandler(11, (data) => {
      if (data !== "?") return false;
      reply("\x1b]11;rgb:0000/0000/0000\x1b\\");
      return true;
    });
    protocol.parser.registerDcsHandler({ intermediates: "+", final: "q" }, (data) => {
      reply("\x1bP0+r" + data + "\x1b\\");
      return true;
    });
    child.stdio[3].on("error", () => {
      /* The worker may close during a reply. */
    });
    let stdout = "",
      stderr = "",
      error;
    const stop = (reason) => {
      error ??= reason;
      cleanupWorker(join(cwd, "worker.pid"));
      killGroup(child.pid);
    };
    const timer = setTimeout(
      () => stop(`Shell snapshot timed out after ${timeoutMs} ms`),
      timeoutMs,
    );
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (data) => {
      stdout += data;
      if (stdout.length > 1024 * 1024) stop("Terminal output exceeded 1 MiB");
    });
    child.stderr.on("data", (data) => {
      stderr += data;
      protocol.write(data);
      if (stderr.length > 1024 * 1024) stop("Terminal diagnostics exceeded 1 MiB");
    });
    child.on("error", (err) => {
      error = err.message;
    });
    child.stdin.on("error", (err) => {
      error ??= err.message;
    });
    child.on("close", (status, signal) => {
      cleanupWorker(join(cwd, "worker.pid"));
      killGroup(child.pid);
      clearTimeout(timer);
      protocol.dispose();
      resolve({ status, signal, stdout, stderr, error });
    });
    child.stdin.end(input);
  });
}
