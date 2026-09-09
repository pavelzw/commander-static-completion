import type { Argument, Command, Option } from 'commander';

export type CompletionHint =
  | { kind: 'file' | 'directory' | 'none' }
  | { kind: 'choices'; values: readonly string[] };

/** Attach generation metadata, without changing Commander parsing. */
export function completionHint<T extends Option | Argument>(target: T, hint: CompletionHint): T;

/** Generate a standalone Bash 3.2+ script from a fully configured command. */
export function generateCompletion(program: Command, options: {
  shell: 'bash';
  executable?: string;
}): string;
