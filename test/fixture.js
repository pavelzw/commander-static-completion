import { Command, Option, Argument } from "commander";
import { completionHint } from "../dist/index.js";

export function fixture() {
  const program = new Command("csc-test-cli").version("1.0").option("-v, --verbose");
  program.addOption(new Option("--secret <value>").hideHelp().choices(["hidden-value"]));
  const deploy = program.command("deploy").alias("d");
  deploy.addOption(
    new Option("-t, --target <target>").choices([
      "dev",
      "production",
      "two words",
      "it's fine",
      "$(touch PWNED)",
      "`touch PWNED`",
    ]),
  );
  deploy.addOption(new Option("-c, --color [color]").choices(["red", "blue"]));
  deploy.addOption(new Option("--tags <tags...>").choices(["one", "two"]));
  deploy.option("--no-cache");
  deploy.addOption(completionHint(new Option("--config <path>"), { kind: "file" }));
  deploy.addArgument(new Argument("[region]").choices(["eu", "us"]));
  program.command("remote").command("add").option("--url <url>");
  program.command("internal", { hidden: true });
  return program;
}

export function defaultSnapshotFixture(nested = false) {
  const program = new Command("csc-test-cli").enablePositionalOptions();
  program.option("--verbose");
  const serve = program.command("serve", { isDefault: true }).alias("s");
  serve.addOption(new Option("--port <port>").choices(["3000", "8080"]));
  serve.addArgument(new Argument("[paths...]").choices(["app", "assets"]));
  program.command("admin").addOption(new Option("--format <format>").choices(["json", "text"]));
  if (nested) {
    serve
      .command("watch", { isDefault: true })
      .addOption(new Option("--interval <seconds>").choices(["1", "5"]));
  }
  return program;
}

export function optionalClusterSnapshotFixture() {
  const program = new Command("csc-test-cli").combineFlagAndOptionalValue(false);
  program.option("-v, --verbose");
  program.addOption(new Option("-o, --optional [value]").choices(["auto", "always"]));
  program.addOption(new Option("-r, --required <value>").choices(["production", "preview"]));
  program.addArgument(new Argument("[target]").choices(["app", "assets"]));
  return program;
}

// Include parser settings and hint kinds in the full generated-script snapshots.
export function generatedSnapshotFixture() {
  const program = fixture();
  program.commands[0].description("Deploy the application");
  program.commands[0].options[0].description = "Deployment environment";
  program.commands[0].registeredArguments[0].description = "Deployment region";
  const serve = program
    .command("serve", { isDefault: true })
    .alias("s")
    .enablePositionalOptions()
    .combineFlagAndOptionalValue(false);
  serve.addOption(new Option("-o, --output [format]").choices(["json", "text"]));
  serve.addOption(completionHint(new Option("--directory <path>"), { kind: "directory" }));
  serve
    .command("run", { isDefault: true })
    .passThroughOptions()
    .addArgument(new Argument("[args...]").choices(["start", "stop"]));
  return program;
}

export function descriptionFixture() {
  const program = new Command("csc-test-cli").enablePositionalOptions();
  program.option("-v, --verbose", "Show detailed output");
  const serve = program
    .command("serve", { isDefault: true })
    .alias("s")
    .description("Serve the app");
  serve.addOption(new Option("-f, --format <format>", "Output format").choices(["json", "text"]));
  serve.addOption(new Option("--secret", "Hidden option").hideHelp());
  serve.addArgument(new Argument("[target]", "Build target").choices(["app", "assets"]));
  program.command("status").alias("st").description("Show app status");
  program.command("internal", { hidden: true }).description("Hidden command");
  return program;
}

export function wordBreakFixture() {
  const program = new Command("csc-test-cli");
  program.addOption(new Option("--endpoint <value>").choices(["api:production"]));
  program.addOption(new Option("--define <value>").choices(["key=value", "key==value"]));
  program.addOption(new Option("--pair <value>").choices(["key,value"]));
  program.addOption(completionHint(new Option("--config <path>"), { kind: "file" }));
  program.addArgument(new Argument("[region]").choices(["eu", "us"]));
  return program;
}

export function pathSnapshotFixture() {
  const program = fixture();
  // Keep menu prefixes short enough to avoid version-specific Fish abbreviation.
  program.commands[0].addOption(completionHint(new Option("--f <path>"), { kind: "file" }));
  program.commands[0].addOption(
    completionHint(new Option("--directory <path>"), { kind: "directory" }),
  );
  return program;
}

export function literalFixture(kind, suffix) {
  const program = new Command(kind === "executable" ? `cli${suffix}` : "csc-test-cli");
  const option = new Option(
    kind === "option" ? `--flag${suffix} <value>` : "--value <value>",
  ).choices(kind === "choice" ? [`val${suffix}`] : ["production"]);
  if (kind === "command" || kind === "alias") {
    const child = new Command(kind === "command" ? `cmd${suffix}` : "target").addOption(option);
    if (kind === "alias") child.alias(`ali${suffix}`);
    program.addCommand(child);
  } else program.addOption(option);
  return program;
}
