import type { ModelCommand } from "./model.js";
import type { Shell } from "./types.js";

/** Insertable text must survive shell strings and completion record formats. */
export function validateText(
  value: unknown,
  label: string,
  shell?: Shell,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a nonempty string.`);
  }
  if (value.includes("\0")) throw new TypeError(`${label} cannot contain NUL.`);
  if (shell === "fish" && /[\t\r\n]/u.test(value)) {
    throw new TypeError(
      `${label} cannot contain tabs or newlines: Fish uses them as completion record delimiters.`,
    );
  }
  // oxlint-disable-next-line no-control-regex -- Reject terminal controls in insertable text.
  if (/[\x01-\x1f\x7f-\x9f]/u.test(value)) {
    throw new TypeError(`${label} cannot contain control characters.`);
  }
}

export function validateModel(nodes: ModelCommand[], shell: Shell): void {
  for (const node of nodes) {
    for (const child of node.children) {
      for (const name of child.names)
        validateText(name, `Command name or alias ${JSON.stringify(name)}`, shell);
    }
    for (const option of node.localOptions) {
      for (const flag of option.flags)
        validateText(flag, `Option flag ${JSON.stringify(flag)}`, shell);
      if (option.value.kind === "choices") {
        for (const [index, value] of option.value.values.entries()) {
          validateText(
            value,
            `Choice ${index + 1} for option ${JSON.stringify(option.flags.join(", "))}`,
            shell,
          );
        }
      }
    }
    for (const [index, argument] of node.arguments.entries()) {
      if (argument.value.kind === "choices") {
        for (const [choice, value] of argument.value.values.entries()) {
          validateText(
            value,
            `Choice ${choice + 1} for argument ${index + 1} in command ${node.id}`,
            shell,
          );
        }
      }
    }
  }
}
