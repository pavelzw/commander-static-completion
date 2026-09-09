import assert from "node:assert/strict";
import { Argument, Command, Option } from "commander";
import {
  completionHint,
  completionDefinition,
  generateCompletion,
} from "commander-static-completion";

const program = new Command("package-smoke");
program
  .command("deploy")
  .addOption(new Option("--target <target>").choices(["production", "staging"]))
  .addArgument(completionHint(new Argument("[config]"), { kind: "file" }));
for (const shell of ["bash", "zsh", "fish"]) {
  const script = generateCompletion(program, { shell });
  assert.ok(script.includes("production") && script.includes("deploy"));
  assert.equal(generateCompletion(program, { shell }), script);
}

const externalRoot = new Command("external-root");
externalRoot.command("external", "external executable");
completionDefinition(externalRoot.commands[0], new Command("definition").option("--external-flag"));
generateCompletion(externalRoot, { shell: "bash" });
