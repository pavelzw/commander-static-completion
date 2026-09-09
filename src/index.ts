import type { Argument, Command, Option } from 'commander';
import type { CompletionHint, GenerateOptions } from './types.js';
export type { CompletionHint, GenerateOptions, Shell } from './types.js';
import { createHash } from 'node:crypto';
import { extract, hints } from './model.js';
import { renderBourne } from './bourne.js';
import { renderFish } from './fish.js';

/** Attach static completion metadata without changing Commander parsing. */
export function completionHint<T extends Option | Argument>(target: T, hint: CompletionHint): T {
  if (!hint || !['file', 'directory', 'none', 'choices'].includes(hint.kind)) {
    throw new TypeError('Expected a file, directory, none, or choices completion hint.');
  }
  if (hint.kind === 'choices' && (!Array.isArray(hint.values) || hint.values.some(value => typeof value !== 'string'))) {
    throw new TypeError('Completion choices must be an array of strings.');
  }
  hints.set(target, hint.kind === 'choices' ? { kind: hint.kind, values: [...hint.values] } : { kind: hint.kind });
  return target;
}

/** Generate a standalone shell script from a fully configured command tree. */
export function generateCompletion(program: Command, { shell, executable = program.name() }: GenerateOptions): string {
  if (!['bash', 'zsh', 'fish'].includes(shell)) throw new Error(`Unsupported shell: ${shell}. Expected bash, zsh, or fish.`);
  // oxlint-disable-next-line no-control-regex -- Reject control characters in executable names.
  if (typeof executable !== 'string' || !executable || /[\s\x00-\x1f\x7f]/u.test(executable)) {
    throw new TypeError('Provide a nonempty executable name without whitespace or control characters.');
  }
  const name = '_csc_' + createHash('sha256').update(`${shell}:${executable}`).digest('hex').slice(0, 16);
  const nodes = extract(program);
  return shell === 'fish' ? renderFish(nodes, executable, name) : renderBourne(nodes, executable, name, shell);
}
