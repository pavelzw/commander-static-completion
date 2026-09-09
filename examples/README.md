# Runnable CLI and completion installation

This example uses the library's public package import. From a checkout, build it
first so Node can resolve that import through the package exports:

```sh
npm ci
npm run build
node examples/cli.js --token demo deploy --target staging
node examples/cli.js completions --help
node examples/cli.js completions bash > /tmp/mycli.bash
```

Deployment is a demonstration: it prints a message and does not contact a service.
Generation requires no token and writes only the completion script to stdout.
Errors go to stderr and return a nonzero exit status. Use `node` directly when
redirecting a script; `npm run example` also prints npm's own status messages.

To try the actual command name, run these setup commands from Bash or Zsh in the
checkout (choose another name if `mycli` already exists):

```sh
mkdir -p "$HOME/.local/bin"
ln -s "$PWD/examples/cli.js" "$HOME/.local/bin/mycli"
export PATH="$HOME/.local/bin:$PATH"
mycli completions bash > /tmp/mycli.bash
source /tmp/mycli.bash
```

Now type `mycli deploy --target pr<TAB>`. Keep the checkout and its dependencies
in place while using this symlink. In Fish, add the same bin directory to the
current session with `set -gx PATH $HOME/.local/bin $PATH`.

## Keep generation independent of application startup

`cli-definition.js` builds the entire tree, including the completion command,
without parsing arguments or performing application I/O. The root deliberately
has a required `--token` option and a `preAction` hook.

`cli.js` reserves **a leading `completions` argument** and parses the remaining
arguments using a fresh, unattached completion command. Its action generates from
the full application tree. This avoids root required-option validation and root
hooks without changing the tree used for generation. All other inputs go through
the ordinary application parser. For example, `--token completions deploy` still
runs the deployment example; an option value is never mistaken for a command.

Root options belong before application commands (`enablePositionalOptions()`),
so the generated completion scopes match this routing. Put completion options
after the command:

```sh
mycli completions fish --executable mycli-preview
```

The override registers completions for `mycli-preview`; it does not rename or
install the executable. Use the name people actually type, and name automatically
loaded files accordingly. In an application with expensive startup, import and
initialize services only on the application route or inside its actions/hooks.
A top-level side effect in an imported module would still run during generation.

## Bash installation

Generate once, then source the saved script:

```bash
mkdir -p "$HOME/.local/share/mycli"
mycli completions bash > "$HOME/.local/share/mycli/completions.bash"
source "$HOME/.local/share/mycli/completions.bash"
```

Add the `source` line to `~/.bashrc` for future interactive sessions. If your login
shell uses only `~/.bash_profile`, arrange for it to source `~/.bashrc`, or add the
line there. This workflow works on Bash 3.2+ without the bash-completion package.

If you already use bash-completion, you may instead install a command-named file
in its configured user completion directory; see its
[installation documentation](https://github.com/scop/bash-completion#faq).
Do not assume that directory is loaded by Bash itself.

## Zsh installation

```zsh
mkdir -p "$HOME/.local/share/mycli"
mycli completions zsh > "$HOME/.local/share/mycli/completions.zsh"
```

In `~/.zshrc`, source it **after** your existing completion-system initialization:

```zsh
autoload -Uz compinit
compinit
source "$HOME/.local/share/mycli/completions.zsh"
```

If a shell framework already calls `compinit`, add just the final `source` line
after the framework is loaded. Open a new shell, or source the file in a session
where `compinit` has already run. These generated scripts currently require
explicit sourcing; installing them as `_mycli` in `fpath` is not supported yet.

## Fish installation

Run these commands in Fish:

```fish
mkdir -p "$__fish_config_dir/completions"
mycli completions fish > "$__fish_config_dir/completions/mycli.fish"
```

Fish automatically loads this command-named file when completion is requested.
`$__fish_config_dir` respects a custom configuration directory. For an existing
session that has already loaded older completions, start a new shell, or reload:

```fish
complete -e -c mycli
source "$__fish_config_dir/completions/mycli.fish"
```

## Build-time generation and distribution

`generate.js` uses the same definition without invoking either CLI parser:

```sh
mkdir -p generated
node examples/generate.js bash > generated/mycli.bash
node examples/generate.js zsh > generated/mycli.zsh
node examples/generate.js fish > generated/mycli.fish
```

Package authors can run this during their build and include the scripts in their
CLI package. Generation needs Node and the command definitions; installed
completion scripts need only the target shell. Do not run the generator on every
shell startup. Regenerate when commands, aliases, options, choices, hints, or the
generator version change. Load all statically known plugins before generating.
Runtime-discovered commands or service-provided values cannot be captured unless
the build supplies those definitions explicitly.

For system packages, use the package manager's configured prefix and completion
locations:

| Shell                     | Distribution location                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bash with bash-completion | Usually `$prefix/share/bash-completion/completions/mycli`; use `pkg-config --variable=completionsdir bash-completion` when available.                        |
| Fish                      | Usually `$prefix/share/fish/vendor_completions.d/mycli.fish`; use `pkg-config --variable=completionsdir fish` when available.                                |
| Zsh                       | Ship a sourced script and document loading it after `compinit`; this generator does not yet support the usual `site-functions/_mycli` autoload installation. |

Consult the [bash-completion](https://github.com/scop/bash-completion#installation)
and [Fish completion documentation](https://fishshell.com/docs/current/completions.html)
for discovery rules and distribution-specific overrides. Installing an npm CLI
does not automatically register shell completions; ship the files or expose the
generation command and document the user's installation step.

`npm run test:package` copies these examples into a temporary consumer of the
packed library. It checks root validation, hooks, argument routing, invalid
completion requests, executable overrides, build-time equivalence, shell syntax,
Bash/Zsh sourcing, and Fish automatic loading. Loaded scripts must suggest
`production` with external commands unavailable and without invoking `mycli`.
