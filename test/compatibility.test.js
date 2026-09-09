import { test } from "node:test";
import assert from "node:assert/strict";
import { Argument, Command, Option } from "commander";
import { complete, shells } from "./helpers.js";
import { generateCompletion } from "../dist/index.js";

for (const shell of shells) {
  test(`${shell}: renamed help, hidden help routes, and explicit help definitions`, () => {
    const root = new Command("csc-test-cli")
      .helpOption("-?, --assist")
      .version("1", "-R, --release")
      .helpCommand("manual [command]");
    const deploy = root.command("deploy").alias("d");
    root.configureHelp({ visibleCommands: () => [deploy] });
    assert.deepEqual(complete(shell, root, ["csc-test-cli", "manual", "de"]), ["deploy"]);
    assert.deepEqual(complete(shell, root, ["csc-test-cli", "manual", "deploy", ""]), []);
    const suggestions = complete(shell, root, ["csc-test-cli", ""]);
    for (const flag of ["-?", "--assist", "-R", "--release"]) assert.ok(suggestions.includes(flag));
    for (const flag of ["--help", "--version", "manual"]) assert.ok(!suggestions.includes(flag));
    root.helpOption(false).helpCommand(false);
    assert.ok(!complete(shell, root, ["csc-test-cli", ""]).includes("--assist"));

    const explicit = new Command("csc-test-cli");
    explicit
      .command("help")
      .alias("docs")
      .addOption(new Option("--format <value>").choices(["text"]))
      .addArgument(new Argument("[topic]").choices(["overview"]));
    assert.deepEqual(complete(shell, explicit, ["csc-test-cli", "docs", "--format", "t"]), [
      "text",
    ]);
    assert.deepEqual(complete(shell, explicit, ["csc-test-cli", "help", "o"]), ["overview"]);
  });
}

const probe = "zz-probe-";
function overlapFixture(positional, observed = []) {
  const option = (flags, label) =>
    new Option(flags).choices([probe + label]).argParser((value) => {
      if (value === probe) observed.push(probe + label);
      return value;
    });
  const root = new Command("csc-test-cli")
    .exitOverride()
    .enablePositionalOptions(positional)
    .action(() => {});
  root.addOption(option("-g, --global <value>", "root-global"));
  root.addOption(option("-s, --shared <value>", "root-shared").hideHelp());
  const sub = root.command("sub").action(() => {});
  sub.addOption(option("-g, --child-global <value>", "child-global"));
  sub.addOption(option("-c, --shared <value>", "child-shared"));
  return root;
}
for (const shell of shells) {
  test(`${shell}: overlapping aliases and hidden ancestor options agree with Commander`, () => {
    for (const positional of [false, true]) {
      for (const prefix of [
        ["-g"],
        ["-s"],
        ["--shared"],
        ["sub", "-g"],
        ["sub", "--child-global"],
        ["sub", "--shared"],
        ["sub", "-c"],
        ["-g", "sub", "sub", "--shared"],
      ]) {
        const observed = [];
        overlapFixture(positional, observed).parse([...prefix, probe], { from: "user" });
        assert.equal(observed.length, 1);
        assert.deepEqual(
          complete(shell, overlapFixture(positional), ["csc-test-cli", ...prefix, probe]),
          observed,
          JSON.stringify({ positional, prefix }),
        );
      }
      const candidates = complete(shell, overlapFixture(positional), ["csc-test-cli", "sub", ""]);
      assert.ok(candidates.includes("--child-global"));
      assert.equal(
        candidates.includes("--shared"),
        positional,
        "hidden parent wins until positional scope ends",
      );
    }
  });
}

test("compatibility: prepared help dispatch follows Commander name-only semantics", () => {
  let printed = "";
  const root = new Command("cli").exitOverride().configureOutput({
    writeOut: (text) => {
      printed += text;
    },
    writeErr() {},
  });
  root.addHelpCommand(
    new Command("manual").alias("docs").action(() => assert.fail("prepared help action ran")),
  );
  root.command("deploy").description("Deployment help");
  assert.throws(
    () => root.parse(["manual", "deploy"], { from: "user" }),
    (error) => error.code === "commander.help",
  );
  assert.match(printed, /Deployment help/);
  assert.throws(
    () => root.parse(["docs", "deploy"], { from: "user" }),
    (error) => error.code === "commander.unknownCommand",
  );
});

test("compatibility: validation/storage settings do not run callbacks during generation", () => {
  const unexpected = () => assert.fail("runtime callback ran during generation");
  const root = new Command("cli")
    .allowUnknownOption()
    .allowExcessArguments()
    .storeOptionsAsProperties()
    .showHelpAfterError()
    .showSuggestionAfterError(false)
    .exitOverride(unexpected)
    .hook("preAction", unexpected)
    .action(unexpected);
  root.addOption(
    new Option("--color [value]")
      .choices(["red", "blue"])
      .default("red")
      .preset("blue")
      .env("CSC_AUDIT_COLOR")
      .argParser(unexpected)
      .implies({ verbose: true })
      .conflicts("quiet"),
  );
  root.requiredOption("--token <value>");
  root.addArgument(new Argument("[target]").choices(["app"]).default("app").argParser(unexpected));
  root.configureHelp({ sortOptions: true, showGlobalOptions: true, formatHelp: unexpected });
  for (const shell of shells) assert.equal(typeof generateCompletion(root, { shell }), "string");
  assert.deepEqual(root.args, []);
  assert.deepEqual(root.rawArgs, []);
});

test("compatibility: wildcard fallback is real Commander behavior and needs a diagnostic", () => {
  const root = new Command("cli");
  let operand;
  root
    .command("*")
    .argument("<name>")
    .action((name) => {
      operand = name;
    });
  root.parse(["unknown"], { from: "user" });
  assert.equal(operand, "unknown");
  for (const shell of shells)
    assert.throws(() => generateCompletion(root, { shell }), /wildcard.*isDefault/);
});
