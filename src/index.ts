import type { Argument, Command, Option } from "commander";
import type { CompletionHint, GenerateOptions } from "./types.js";
export type { CompletionHint, GenerateOptions, Shell } from "./types.js";
import { createHash } from "node:crypto";
import { extract, hints } from "./model.js";
import { renderBourne } from "./bourne.js";
import { renderFish } from "./fish.js";
import { validateModel, validateText } from "./validation.js";

/** Attach static completion metadata without changing Commander parsing. */
export function completionHint<T extends Option | Argument>(target: T, hint: CompletionHint): T {
  if (!hint || !["file", "directory", "none", "choices"].includes(hint.kind)) {
    throw new TypeError("Expected a file, directory, none, or choices completion hint.");
  }
  if (
    hint.kind === "choices" &&
    (!Array.isArray(hint.values) || [...hint.values].some((value) => typeof value !== "string"))
  ) {
    throw new TypeError("Completion choices must be an array of strings.");
  }
  hints.set(
    target,
    hint.kind === "choices" ? { kind: hint.kind, values: [...hint.values] } : { kind: hint.kind },
  );
  return target;
}

/** Generate a standalone shell script from a fully configured command tree. */
export function generateCompletion(
  program: Command,
  { shell, executable = program.name() }: GenerateOptions,
): string {
  if (!["bash", "zsh", "fish"].includes(shell))
    throw new Error(`Unsupported shell: ${shell}. Expected bash, zsh, or fish.`);
  validateText(executable, "executable name", shell);
  if (/\s/u.test(executable)) {
    throw new TypeError("Provide an executable name without whitespace.");
  }
  const name =
    "_csc_" + createHash("sha256").update(`${shell}:${executable}`).digest("hex").slice(0, 16);
  const nodes = extract(program);
  validateModel(nodes, shell);
  return shell === "fish"
    ? renderFish(nodes, executable, name)
    : renderBourne(nodes, executable, name, shell);
}
