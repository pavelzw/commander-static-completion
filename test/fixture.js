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
