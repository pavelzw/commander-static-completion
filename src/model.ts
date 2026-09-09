import type { Argument, Command, Option } from "commander";
import type { CompletionHint } from "./types.js";

export interface ModelOption {
  flags: string[];
  visible: boolean;
  inherited: boolean;
  // Preserve the declaring command's setting when forwarding ancestor options.
  combineOptional: boolean;
  mode: "required" | "optional" | "boolean";
  variadic: boolean;
  value: CompletionHint;
}
export interface ModelCommand {
  id: number;
  defaultCommand: number;
  options: ModelOption[];
  passThrough: boolean;
  positional: boolean;
  negativeNumbers: boolean;
  localOptions: ModelOption[];
  arguments: { variadic: boolean; value: CompletionHint }[];
  children: { id: number; names: string[]; visible: boolean }[];
}
interface CommanderInternals {
  _enablePositionalOptions?: boolean;
  _passThroughOptions?: boolean;
  _defaultCommandName?: string | null;
  _combineFlagAndOptionalValue?: boolean;
  _executableHandler?: boolean;
}

// Private Commander access is confined to this compatibility adapter.
export function checkCompatibility(command: Command) {
  const internal = command as Command & CommanderInternals;
  if (internal._executableHandler) {
    throw new Error(`Supply an in-process definition for executable subcommand ${command.name()}.`);
  }
}

export const hints = new WeakMap<Option | Argument, CompletionHint>();

export function valueSpec(target: Option | Argument): CompletionHint {
  const hint = hints.get(target);
  if (hint) return hint;
  return target.argChoices ? { kind: "choices", values: [...target.argChoices] } : { kind: "none" };
}

export function extract(program: Command): ModelCommand[] {
  const nodes: ModelCommand[] = [];
  function visit(
    command: Command,
    inherited: ModelOption[] = [],
    ancestorDigit = false,
  ): ModelCommand {
    checkCompatibility(command);
    const internal = command as Command & CommanderInternals;
    const hasDigit =
      ancestorDigit || command.options.some((option) => /^-\d$/u.test(option.short ?? ""));
    const help = command.createHelp();
    const visibleOptions = help.visibleOptions(command);
    // Keep hidden options in the parser, but never suggest them.
    const local = [...new Set([...command.options, ...visibleOptions])];
    const localOptions: ModelOption[] = local.map((option) => ({
      flags: [option.short, option.long].filter((flag): flag is string => flag !== undefined),
      visible: visibleOptions.includes(option),
      inherited: command.options.includes(option),
      combineOptional: internal._combineFlagAndOptionalValue !== false,
      mode: option.required ? "required" : option.optional ? "optional" : "boolean",
      variadic: option.variadic,
      value: valueSpec(option),
    }));
    // Commander parses ancestor options before delegating to a subcommand.
    // Keep that priority when flags overlap; positional mode ends only the
    // current command's scope, not already-active ancestor scopes.
    const seen = new Set<string>();
    const options = [...inherited, ...localOptions].map((option) => ({
      ...option,
      flags: option.flags.filter((flag) => {
        if (seen.has(flag)) return false;
        seen.add(flag);
        return true;
      }),
    }));
    const node: ModelCommand = {
      id: nodes.length,
      defaultCommand: -1,
      options,
      localOptions,
      positional: internal._enablePositionalOptions ?? false,
      passThrough: internal._passThroughOptions ?? false,
      negativeNumbers: !hasDigit,
      arguments: command.registeredArguments.map((arg) => ({
        variadic: arg.variadic,
        value: valueSpec(arg),
      })),
      children: [],
    };
    nodes.push(node);
    const visibleCommands = help.visibleCommands(command);
    for (const child of new Set([...command.commands, ...visibleCommands])) {
      // Help's implicit placeholder must not recursively synthesize help commands.
      const synthetic = !command.commands.includes(child);
      let childNode: ModelCommand;
      if (synthetic) {
        childNode = {
          id: nodes.length,
          defaultCommand: -1,
          options: [],
          localOptions: [],
          passThrough: false,
          positional: false,
          negativeNumbers: !hasDigit,
          arguments: [
            {
              variadic: false,
              value: {
                kind: "choices",
                values: visibleCommands
                  .filter((c) => c !== child)
                  .flatMap((c) => [c.name(), ...c.aliases()]),
              },
            },
          ],
          children: [],
        };
        nodes.push(childNode);
      } else {
        const forwarded =
          internal._enablePositionalOptions || internal._passThroughOptions
            ? inherited
            : [...inherited, ...localOptions.filter((option) => option.inherited)];
        childNode = visit(child, forwarded, hasDigit);
      }
      if (!synthetic && child.name() === internal._defaultCommandName)
        node.defaultCommand = childNode.id;
      node.children.push({
        id: childNode.id,
        names: [child.name(), ...child.aliases()],
        visible: visibleCommands.includes(child),
      });
    }
    if (internal._defaultCommandName && node.defaultCommand < 0) {
      throw new Error(
        `Default subcommand ${internal._defaultCommandName} is missing from ${command.name()}.`,
      );
    }
    return node;
  }
  visit(program);
  return nodes;
}
