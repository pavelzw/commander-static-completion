import { stripVTControlCharacters } from "node:util";
import type { Argument, Command, Option } from "commander";
import type { CompletionHint } from "./types.js";

export interface ModelOption {
  flags: string[];
  description: string;
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
  arguments: { variadic: boolean; value: CompletionHint; description: string }[];
  children: { id: number; names: string[]; visible: boolean; description: string }[];
}
interface CommanderInternals {
  _enablePositionalOptions?: boolean;
  _passThroughOptions?: boolean;
  _defaultCommandName?: string | null;
  _combineFlagAndOptionalValue?: boolean;
  _executableHandler?: boolean;
  _getHelpCommand(): Command | null;
  _getHelpOption(): Option | null;
}

const definitions = new WeakMap<Command, Command>();

/** Record parser metadata for an executable declaration without changing dispatch. */
export function setDefinition<T extends Command>(target: T, definition: Command): T {
  if (
    !target ||
    typeof target.createHelp !== "function" ||
    !definition ||
    typeof definition.createHelp !== "function"
  ) {
    throw new TypeError("Completion definitions require two Commander commands.");
  }
  validateDefinition(target, definition);
  definitions.set(target, definition);
  return target;
}

function validateDefinition(target: Command, definition: Command) {
  if (!(target as Command & CommanderInternals)._executableHandler) {
    throw new TypeError(
      `Completion definition target ${target.name()} must be an executable subcommand.`,
    );
  }
  if (
    definition === target ||
    definition.parent ||
    (definition as Command & CommanderInternals)._executableHandler
  ) {
    throw new TypeError(
      `Completion definition for ${target.name()} must be an independent, in-process root Command.`,
    );
  }
  if (target.options.length || target.commands.length) {
    throw new TypeError(
      `Executable subcommand ${target.name()} has conflicting parser definitions; put options and children on its completion definition.`,
    );
  }
}

// Private Commander access is confined to this compatibility adapter.
export function checkCompatibility(command: Command) {
  const internal = command as Command & CommanderInternals;
  if (command.commands.some((child) => child.name() === "*" || child.aliases().includes("*"))) {
    throw new Error(
      "Legacy wildcard subcommands are unsupported; use { isDefault: true } with an ordinary command name.",
    );
  }
  if (internal._executableHandler && !definitions.has(command)) {
    throw new Error(
      `Supply a definition with completionDefinition() for executable subcommand ${command.name()}.`,
    );
  }
}

// Descriptions are display-only, single-line text in completion menus.
function description(value: string): string {
  // oxlint-disable-next-line no-control-regex -- Remove terminal controls and record delimiters.
  const controls = /[\s\x00-\x1f\x7f-\x9f]+/gu;
  return stripVTControlCharacters(value).replace(controls, " ").trim();
}

export const hints = new WeakMap<Option | Argument, CompletionHint>();

export function valueSpec(target: Option | Argument): CompletionHint {
  const hint = hints.get(target);
  if (hint) return hint;
  return target.argChoices ? { kind: "choices", values: [...target.argChoices] } : { kind: "none" };
}

export function extract(program: Command): ModelCommand[] {
  const nodes: ModelCommand[] = [];
  const active = new Set<Command>();
  function visit(
    command: Command,
    inherited: ModelOption[] = [],
    ancestorDigit = false,
  ): ModelCommand {
    checkCompatibility(command);
    const definition = definitions.get(command);
    if (definition) {
      validateDefinition(command, definition);
      if (inherited.some((option) => option.flags.some((flag) => /^-\d$/u.test(flag)))) {
        throw new Error(
          `Executable subcommand ${command.name()} has active ancestor digit flags; use enablePositionalOptions() on their declaring commands to separate the parsers.`,
        );
      }
      // The external parser is a fresh root, without the declaration's ancestors.
      ancestorDigit = false;
      command = definition;
      checkCompatibility(command);
    }
    if (active.has(command)) {
      throw new TypeError(`Cyclic completion definition at ${command.name()}.`);
    }
    active.add(command);
    const internal = command as Command & CommanderInternals;
    const hasDigit =
      ancestorDigit || command.options.some((option) => /^-\d$/u.test(option.short ?? ""));
    const help = command.createHelp();
    const helpCommand = internal._getHelpCommand();
    const helpOption = internal._getHelpOption();
    const visibleOptions = help.visibleOptions(command);
    const optionFlags = (option: Option): string[] =>
      [option.short, option.long].filter((flag): flag is string => flag !== undefined);
    const registeredFlags = new Set(command.options.flatMap(optionFlags));
    for (const option of visibleOptions) {
      if (command.options.includes(option) || option === helpOption) continue;
      // Commander clones the built-in help option when a registered flag shadows
      // one of its aliases. Those remaining help flags are still presentation-only.
      const flags = optionFlags(option);
      if (
        !helpOption ||
        !flags.length ||
        !flags.every((flag) => optionFlags(helpOption).includes(flag) && !registeredFlags.has(flag))
      ) {
        throw new Error(
          `configureHelp().visibleOptions() returned an unregistered option ${option.flags} for ${command.name()}. Supply parser definitions with addOption().`,
        );
      }
    }
    // Keep hidden options in the parser, but never suggest them.
    const local = [...new Set([...command.options, ...visibleOptions])];
    const localOptions: ModelOption[] = local.map((option) => ({
      flags: [option.short, option.long].filter((flag): flag is string => flag !== undefined),
      visible: visibleOptions.includes(option),
      description: description(option.description),
      inherited: command.options.includes(option),
      combineOptional: internal._combineFlagAndOptionalValue !== false,
      // Built-in help is detected after option parsing; it never consumes a value.
      mode: command.options.includes(option)
        ? option.required
          ? "required"
          : option.optional
            ? "optional"
            : "boolean"
        : "boolean",
      variadic: command.options.includes(option) && option.variadic,
      value: command.options.includes(option) ? valueSpec(option) : { kind: "none" },
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
        description: description(arg.description),
      })),
      children: [],
    };
    nodes.push(node);
    const visibleCommands = help.visibleCommands(command);
    for (const child of visibleCommands) {
      if (!command.commands.includes(child) && child !== helpCommand) {
        throw new Error(
          `configureHelp().visibleCommands() returned an unregistered command ${child.name()} for ${command.name()}. Supply parser definitions with addCommand().`,
        );
      }
    }
    // Registered commands (including aliases) win over the special help route.
    const implicitHelp =
      helpCommand &&
      !command.commands.some((child) =>
        [child.name(), ...child.aliases()].includes(helpCommand.name()),
      )
        ? helpCommand
        : null;
    for (const child of new Set([...command.commands, ...(implicitHelp ? [implicitHelp] : [])])) {
      const synthetic = child === implicitHelp;
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
              description: "",
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
        // Commander dispatches the implicit help route by name only.
        names: synthetic ? [child.name()] : [child.name(), ...child.aliases()],
        description: description(child.description()),
        visible: visibleCommands.includes(child),
      });
    }
    if (internal._defaultCommandName && node.defaultCommand < 0) {
      throw new Error(
        `Default subcommand ${internal._defaultCommandName} is missing from ${command.name()}.`,
      );
    }
    active.delete(command);
    return node;
  }
  visit(program);
  return nodes;
}
