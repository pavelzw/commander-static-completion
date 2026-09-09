import { createHash } from 'node:crypto';
import { extract, hints } from './model.js';
import { renderBash } from './bash.js';

export function completionHint(target, hint) {
  if (!hint || !['file', 'directory', 'none', 'choices'].includes(hint.kind)) {
    throw new TypeError('Expected a file, directory, none, or choices completion hint.');
  }
  if (hint.kind === 'choices' && (!Array.isArray(hint.values) || hint.values.some(value => typeof value !== 'string'))) {
    throw new TypeError('Completion choices must be an array of strings.');
  }
  hints.set(target, hint.kind === 'choices' ? { kind: hint.kind, values: [...hint.values] } : { kind: hint.kind });
  return target;
}

export function generateCompletion(program, { shell, executable = program.name() } = {}) {
  if (shell !== 'bash') throw new Error(`Unsupported shell: ${shell}. This release supports bash.`);
  if (typeof executable !== 'string' || !executable || /[\s\x00-\x1f\x7f]/u.test(executable)) {
    throw new TypeError('Provide a nonempty executable name without whitespace or control characters.');
  }
  const name = '_csc_' + createHash('sha256').update(executable).digest('hex').slice(0, 16);
  return renderBash(extract(program), executable, name);
}
