// Private Commander access is confined to this compatibility adapter.
export function checkCompatibility(command) {
  const unsupported = [
    ['_enablePositionalOptions', 'enablePositionalOptions'],
    ['_passThroughOptions', 'passThroughOptions'],
    ['_defaultCommandName', 'default subcommands'],
  ];
  for (const [key, label] of unsupported) {
    if (command[key]) throw new Error(`Static Bash completion does not yet support ${label} (${command.name()}).`);
  }
  if (command._combineFlagAndOptionalValue === false) {
    throw new Error('Static Bash completion requires combineFlagAndOptionalValue(true).');
  }
  if (command._executableHandler) {
    throw new Error(`Supply an in-process definition for executable subcommand ${command.name()}.`);
  }
}

export const hints = new WeakMap();

export function valueSpec(target) {
  const hint = hints.get(target);
  if (hint) return hint;
  return target.argChoices ? { kind: 'choices', values: [...target.argChoices] } : { kind: 'none' };
}

export function extract(program) {
  const nodes = [];
  function visit(command, inherited = []) {
    checkCompatibility(command);
    const help = command.createHelp();
    const visibleOptions = help.visibleOptions(command);
    // Keep hidden options in the parser, but never suggest them.
    const local = [...new Set([...command.options, ...visibleOptions])];
    const options = local.map(option => ({
      flags: [option.short, option.long].filter(Boolean),
      visible: visibleOptions.includes(option),
      inherited: command.options.includes(option),
      mode: option.required ? 'required' : option.optional ? 'optional' : 'boolean',
      variadic: option.variadic,
      value: valueSpec(option),
    }));
    const localFlags = new Set(options.flatMap(option => option.flags));
    options.push(...inherited.map(option => ({ ...option, flags: option.flags.filter(flag => !localFlags.has(flag)) })));
    const node = { id: nodes.length, options, arguments: command.registeredArguments.map(arg => ({
      variadic: arg.variadic, value: valueSpec(arg),
    })), children: [] };
    nodes.push(node);
    const visibleCommands = help.visibleCommands(command);
    for (const child of new Set([...command.commands, ...visibleCommands])) {
      // Help's implicit placeholder must not recursively synthesize help commands.
      const synthetic = !command.commands.includes(child);
      let childNode;
      if (synthetic) {
        childNode = { id: nodes.length, options: [], arguments: [{ variadic: true, value: {
          kind: 'choices', values: visibleCommands.filter(c => c !== child).flatMap(c => [c.name(), ...c.aliases()]),
        } }], children: [] };
        nodes.push(childNode);
      } else {
        childNode = visit(child, options.filter(option => option.inherited));
      }
      node.children.push({ id: childNode.id, names: [child.name(), ...child.aliases()], visible: visibleCommands.includes(child) });
    }
    return node;
  }
  visit(program);
  return nodes;
}
