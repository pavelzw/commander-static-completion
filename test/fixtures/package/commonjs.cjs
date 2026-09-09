const assert = require("node:assert/strict");
const { Command, Option } = require("commander");
const {
  completionHint,
  completionDefinition,
  generateCompletion,
} = require("commander-static-completion");

const option = completionHint(new Option("--mode <mode>"), { kind: "choices", values: ["fast"] });
const program = new Command("package-smoke").addOption(option);
for (const shell of ["bash", "zsh", "fish"]) {
  assert.ok(generateCompletion(program, { shell }).includes("fast"));
}

const externalRoot = new Command("external-root");
externalRoot.command("external", "external executable");
completionDefinition(externalRoot.commands[0], new Command("definition").option("--external-flag"));
generateCompletion(externalRoot, { shell: "bash" });
