import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";

const versions = new Map();

// Both drivers and PTY workers have their own process groups on POSIX.
export function killGroup(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH" && error.code !== "EPERM") throw error;
    // macOS can report EPERM for an exited PTY group. Check its leader too;
    // a live worker may also have changed groups during interactive startup.
    try {
      process.kill(pid, "SIGKILL");
    } catch (leaderError) {
      if (leaderError.code !== "ESRCH") throw leaderError;
    }
  }
}

export function cleanupWorker(path) {
  if (!path) return;
  try {
    const pid = Number(readFileSync(path, "utf8"));
    unlinkSync(path);
    killGroup(pid);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function version(executable) {
  if (!versions.has(executable)) {
    const result = spawnSync(executable, ["--version"], {
      encoding: "utf8",
      detached: true,
      timeout: 500,
      killSignal: "SIGKILL",
      maxBuffer: 16384,
    });
    killGroup(result.pid);
    versions.set(
      executable,
      result.stdout?.trim().split("\n")[0] || result.error?.message || "unknown",
    );
  }
  return versions.get(executable);
}

export function diagnostic(executable, input, result) {
  return [
    `Shell: ${executable} (${version(executable)})`,
    `Input: ${JSON.stringify(input)}`,
    `Exit: ${result.status}; signal: ${result.signal ?? "none"}`,
    `Error: ${result.error?.message ?? result.error ?? "none"}`,
    `stdout:\n${result.stdout ?? ""}`,
    `stderr:\n${result.stderr ?? ""}`,
  ].join("\n");
}

// Keep direct scanner tests synchronous, but bound every subprocess and clean up
// descendants even when the shell exits before them. PTY workers are separate
// sessions and must supply their PID through workerFile.
export function runShell(executable, args, options = {}) {
  const { context, workerFile, ...spawnOptions } = options;
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 1024 * 1024,
    ...spawnOptions,
    detached: true,
    killSignal: "SIGKILL",
  });
  cleanupWorker(workerFile);
  killGroup(result.pid);
  if (result.error || result.status !== 0) {
    assert.fail(diagnostic(executable, context ?? spawnOptions.input ?? args, result));
  }
  return result;
}

// Stream each PTY chunk before waiting for the next marker so a stalled shell
// leaves its startup output in the driver's captured stderr.
export const ptyReadUntil = `
zmodload zsh/zselect
_until() {
  local marker=$1 chunk
  output=
  while [[ $output != *"$marker"* ]]; do
    if zpty -r -t worker chunk; then
      print -rn -- "$chunk" >&2
      output+=$chunk
    elif ! zpty -t worker; then
      return 1
    else
      zselect -t 1 || :
    fi
  done
}
`;
