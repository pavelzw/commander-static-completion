export type Shell = 'bash' | 'zsh' | 'fish';

export type CompletionHint =
  | { kind: 'file' | 'directory' | 'none' }
  | { kind: 'choices'; values: readonly string[] };

export interface GenerateOptions {
  shell: Shell;
  /** Defaults to the root Command's name. */
  executable?: string;
}
