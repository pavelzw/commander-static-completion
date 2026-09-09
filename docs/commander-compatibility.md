# Commander compatibility

This audit covers Commander 14 and 15. CI tests both versions using the public
API to build fixtures. `test/extraction.test.js` checks the extracted model;
`test/compatibility.test.js` checks real shells and selected Commander parses.
The existing behavior, default-command, and optional-cluster matrices compare
which declaration receives a token with the completion scanner's selection.

## Parsing settings

| Setting or feature                                                                                  | Completion behavior                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required, optional, boolean, negated, and variadic options                                          | Model token ownership, attached values, short clusters, and `--`.                                                                                                             |
| Arguments, variadic arguments, aliases, nested commands                                             | Model declared positions and command dispatch.                                                                                                                                |
| `enablePositionalOptions()`                                                                         | End the current command's option scope at its dispatch boundary.                                                                                                              |
| `passThroughOptions()`                                                                              | Stop interpreting owned options at the pass-through boundary.                                                                                                                 |
| `combineFlagAndOptionalValue(false)`                                                                | Split optional short flags inside clusters; retain each declaring command's setting.                                                                                          |
| `{ isDefault: true }`                                                                               | Dispatch without consuming an unmatched operand; explicit commands take priority.                                                                                             |
| Digit short flags                                                                                   | Disable negative-number value recognition throughout the relevant ancestor chain.                                                                                             |
| `allowUnknownOption()` and `allowExcessArguments()`                                                 | These relax validation; they do not provide additional option definitions or argument hints.                                                                                  |
| `storeOptionsAsProperties()`                                                                        | Changes storage, not token ownership; generation does not inspect parsed option values.                                                                                       |
| Defaults, presets, environment variables, mandatory options, conflicts, and implications            | Do not execute parsers, read environment-backed values, enforce requirements, or filter suggestions based on these rules. Declared flags and static choices remain available. |
| Custom argument/option parsers, actions, hooks, and legacy command event listeners                  | Never invoked by generation. Runtime behavior cannot be inferred; use static completion hints for values.                                                                     |
| `parse()`/`parseAsync()` input origin, output configuration, usage text, and error-display settings | Do not change the generated scanner. The shell supplies the executable and argument tokens.                                                                                   |
| Executable subcommands                                                                              | Rejected. Supply in-process definitions for generation.                                                                                                                       |
| Legacy `*` command or alias used for fallback                                                       | Rejected. Define an ordinary command with `{ isDefault: true }`.                                                                                                              |

Completion is not Commander validation. Incomplete input is expected, and
completion does not reproduce help/version exits or decide whether a completed
invocation would pass all validation rules. Legacy wildcard migration may need
an argument-definition change: Commander passes the unmatched name to `*` as an
operand, so preserve that operand explicitly if the application needs it.

## Help and visibility

- `helpOption(false)`, renamed help flags, custom version flags, and help-flag
  conflicts with registered options are supported. Version is an ordinary
  registered option; omitting `.version()` leaves it absent. Hiding a version
  option hides its suggestion without removing its parser definition.
- `helpCommand(false)` disables the implicit help route. Renaming it changes the
  recognized name. A hidden help route still works when typed explicitly.
- `.helpCommand()` and `.addHelpCommand(command)` configure Commander's special
  help dispatch: one immediate target, by command name or alias. Commander does
  not dispatch the help object's aliases or run its own arguments/options/action.
  The completion model follows that behavior, even if the object declares them.
- A normal registered command named `help`, or with a matching alias, takes
  priority. Its options and arguments are extracted as ordinary definitions.
- `configureHelp().visibleOptions()` and `.visibleCommands()` control suggestion
  visibility. Filtering an entry does not remove its registered parser definition.
  Return registered objects, plus Commander's built-in help entries. Invented
  options/commands are rejected with a diagnostic directing you to `addOption()`
  or `addCommand()`. Commander may clone a built-in help option to remove a
  conflicting alias; this special case is supported.
- Help layout, sorting, grouping, `showGlobalOptions`, usage formatting, and
  custom help text do not redefine parsing scope. The generators retain
  registration order, with each shell applying its own matching/display rules.
  `formatHelp()` is not called. Arguments are extracted from registered parser
  definitions regardless of whether help chooses to display them.
- Descriptions come from the command, option, and argument definitions. Custom
  help-rendering callbacks do not replace completion descriptions. The legacy
  description map passed as a second argument to `Command.description()` is not
  applied; set argument descriptions directly.

## Private compatibility adapter

Private Commander access is confined to `src/model.ts`:

| Member                         | Purpose                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `_enablePositionalOptions`     | Option-scope boundaries.                                                                |
| `_passThroughOptions`          | Pass-through boundaries.                                                                |
| `_defaultCommandName`          | Default-command routing.                                                                |
| `_combineFlagAndOptionalValue` | Optional short-cluster parsing.                                                         |
| `_executableHandler`           | Reject executable subcommands.                                                          |
| `_getHelpCommand()`            | Distinguish actual implicit help from presentation-only entries, including hidden help. |
| `_getHelpOption()`             | Recognize built-in help and its conflict-resolved aliases.                              |

The getters can initialize Commander's lazy help metadata, as its help renderer
also does. Generation does not call `parse()`, mutate registered definitions, or
run application callbacks. Custom help visibility callbacks do run during
extraction and should return stable lists without application startup work.

When expanding the Commander version range, run the extraction tests and shell
behavior matrices first. Do not assume a missing private field means a new
parsing setting is unsupported or disabled without checking that version.
