import { Command } from "commander";
import { completionDefinition, generateCompletion } from "../../dist/index.js";
import type { Shell } from "../../dist/index.js";
import { createDeployCommand } from "./definition.js";

const program = new Command("mycli").enablePositionalOptions();
// The description argument makes this an executable subcommand. Commander
// returns the parent from this overload, so retrieve the declaration explicitly.
program.command("deploy", "Deploy an application", { executableFile: "deploy.ts" });
completionDefinition(program.commands[0].alias("d"), createDeployCommand());

const args = process.argv.slice(2);
if (args[0] === "completions") {
  await new Command("completions")
    .argument("<shell>", "bash, fish, or zsh")
    .action((shell: string) => {
      process.stdout.write(generateCompletion(program, { shell: shell as Shell }));
    })
    .parseAsync(args.slice(1), { from: "user" });
} else {
  await program.parseAsync();
}
