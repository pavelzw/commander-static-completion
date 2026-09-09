import { Argument, Command, Option } from "commander";
import { completionHint, generateCompletion } from "commander-static-completion";

// This command can also be parsed independently of the application root.
export function createCompletionCommand(program) {
  return new Command("completions")
    .description("Print a static shell completion script")
    .addArgument(new Argument("<shell>").choices(["bash", "zsh", "fish"]))
    .option("--executable <name>", "command name to register", program.name())
    .action((shell, options) => {
      process.stdout.write(generateCompletion(program, { shell, executable: options.executable }));
    });
}

// Defining the tree does not parse arguments, authenticate, or start services.
export function createProgram() {
  const program = new Command("mycli")
    .enablePositionalOptions()
    .description("Example deployment CLI (no real deployments)")
    .requiredOption("--token <token>", "deployment credential")
    .hook("preAction", () => {
      process.stderr.write("Preparing deployment (example only)\n");
    });
  program
    .command("deploy")
    .description("Demonstrate an application command")
    .addOption(
      new Option("-t, --target <target>").choices(["dev", "staging", "production"]).default("dev"),
    )
    .addOption(completionHint(new Option("--config <path>"), { kind: "file" }))
    .action((options) => {
      process.stdout.write(`Deploying to ${options.target} (example only)\n`);
    });
  program.addCommand(createCompletionCommand(program));
  return program;
}
