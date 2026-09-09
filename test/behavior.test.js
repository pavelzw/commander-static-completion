import { test } from "node:test";
import assert from "node:assert/strict";
import { Argument, Command, Option } from "commander";
import { complete, shells } from "./helpers.js";
import { fixture } from "./fixture.js";

const cases = [
  ["nested commands", ["remote", "a"], ["add"]],
  ["nested options", ["remote", "add", "--u"], ["--url"]],
  ["aliases", ["d", "--target", "pr"], ["production"]],
  ["global options", ["d", "--v"], ["--version", "--verbose"]],
  ["negated options", ["deploy", "--no"], ["--no-cache"]],
  ["long assignments", ["deploy", "--target=pr"], ["--target=production"]],
  ["short attached values", ["deploy", "-tpr"], ["-tproduction"]],
  ["short clusters", ["deploy", "-vtpr"], ["-vtproduction"]],
  ["values matching commands", ["deploy", "--target", "remote", "e"], ["eu"]],
  ["consumed attached values", ["deploy", "-vtdev", "e"], ["eu"]],
  ["consumed assignments", ["deploy", "--target=dev", "e"], ["eu"]],
  ["empty assignments", ["deploy", "--target=", "e"], ["eu"]],
  ["exhausted positionals", ["deploy", "eu", "u"], []],
  ["optional values", ["deploy", "--color", "r"], ["red"]],
  ["optional values stop at options", ["deploy", "--color", "--t"], ["--target", "--tags"]],
  ["variadic values", ["deploy", "--tags", "one", "t"], ["two"]],
  ["attached variadic values stop", ["deploy", "--tags=one", "e"], ["eu"]],
  ["variadic values stop at options", ["deploy", "--tags", "one", "--no"], ["--no-cache"]],
  ["literal option names", ["deploy", "--", "--"], []],
  ["literal positionals", ["deploy", "--", "e"], ["eu"]],
  ["commands after the terminator", ["--", "d"], ["deploy", "d"]],
  ["explicit hidden options", ["--secret", "h"], ["hidden-value"]],
  ["root help targets", ["help", "r"], ["remote"]],
  ["nested help targets", ["remote", "help", "a"], ["add"]],
  ["help has one target", ["help", "remote", ""], []],
];

for (const shell of shells) {
  test(`${shell}: shared completion behavior`, () => {
    for (const [name, words, expected] of cases) {
      assert.deepEqual(
        complete(shell, fixture(), ["csc-test-cli", ...words]).sort(),
        [...expected].sort(),
        name,
      );
    }
  });

  test(`${shell}: visibility and literal choices`, () => {
    const root = complete(shell, fixture(), ["csc-test-cli", ""]);
    for (const name of ["deploy", "d", "remote", "help", "--help", "--version"])
      assert.ok(root.includes(name), name);
    assert.ok(!root.includes("internal") && !root.includes("--secret"));
    assert.deepEqual(
      complete(shell, fixture(), ["csc-test-cli", "deploy", "--target", ""]).sort(),
      ["dev", "production", "two words", "it's fine", "$(touch PWNED)", "`touch PWNED`"].sort(),
    );
  });
}

const probe = "zz-slot-";

// Instrument Commander value parsers to observe which declaration receives
// the next token. Keep choices as completion metadata, replacing only their
// validation callback so the probe can traverse any value declaration.
function probeProgram(
  {
    positional = false,
    passThrough = false,
    digit = false,
    leafDigit = false,
    shadow = false,
  } = {},
  observed = [],
) {
  const record = (label) => (value) => {
    if (value === probe) observed.push(`${probe}${label}`);
    return value;
  };
  const option = (flags, label) =>
    new Option(flags).choices([`${probe}${label}`]).argParser(record(label));
  const args = (command, label) =>
    command
      .addArgument(
        new Argument("[first]")
          .choices([`${probe}${label}-first`])
          .argParser(record(`${label}-first`)),
      )
      .addArgument(
        new Argument("[rest...]")
          .choices([`${probe}${label}-rest`])
          .argParser((value, previous = []) => {
            record(`${label}-rest`)(value);
            return [...previous, value];
          }),
      )
      .action(() => {});
  const root = new Command("csc-test-cli")
    .exitOverride()
    .configureOutput({ writeErr() {}, writeOut() {} });
  root.helpCommand(false).enablePositionalOptions(positional || passThrough);
  root.addOption(option("-g, --global <value>", "global"));
  if (digit) root.option("-1");
  if (shadow) root.addOption(option("--shared <value>", "root-shared"));
  args(root, "root");
  const run = root.command("run").alias("r").helpCommand(false).passThroughOptions(passThrough);
  run.addOption(option("-v, --value <value>", "value"));
  run.addOption(option("-o, --maybe [value]", "maybe"));
  run.addOption(option("-m, --many <values...>", "many"));
  if (shadow) run.addOption(option("--shared <value>", "run-shared"));
  if (digit || leafDigit) run.option("-1");
  if (passThrough) run.allowUnknownOption();
  args(run, "run");
  return root;
}

const probes = [
  ["root positional", {}, []],
  ["root required option", {}, ["--global"]],
  ["root empty value", {}, ["--global", ""]],
  ["subcommand positional", {}, ["run"]],
  ["subcommand alias", {}, ["r"]],
  ["required option", {}, ["run", "--value"]],
  ["optional option", {}, ["run", "--maybe"]],
  ["required option consumes terminator", {}, ["run", "--value", "--"]],
  ["ordinary positional", {}, ["run", "first"]],
  ["variadic positionals", {}, ["run", "first", "second", "third"]],
  ["variadic option continuation", {}, ["run", "--many", "one"]],
  ["long attached variadic value", {}, ["run", "--many=one"]],
  ["short attached variadic value", {}, ["run", "-mone"]],
  ["empty attached value", {}, ["run", "--value=", "first"]],
  ["negative optional value", {}, ["run", "--maybe", "-1"]],
  ["negative decimal value", {}, ["run", "--maybe", "-.5"]],
  ["negative exponent value", {}, ["run", "--maybe", "-1e-2"]],
  ["negative variadic value", {}, ["run", "--many", "one", "-2"]],
  ["negative positional", {}, ["run", "-2"]],
  ["ancestor digit is parsed before optional value", { digit: true }, ["run", "--maybe", "-1"]],
  ["local digit option terminates optional value", { leafDigit: true }, ["run", "--maybe", "-1"]],
  ["parent removes an apparent child value", {}, ["run", "--value", "--global", "g"]],
  ["child value after a parent option", {}, ["run", "--value", "--global", "g", "value"]],
  ["parent option inside child variadic values", {}, ["run", "--many", "one", "--global", "g"]],
  [
    "parent value has priority over child variadic values",
    {},
    ["run", "--many", "one", "--global"],
  ],
  ["parent option inside child optional value", {}, ["run", "--maybe", "--global", "g"]],
  ["terminator ends variadic values", {}, ["run", "--many", "one", "--", "first"]],
  ["terminator preserves positional command dispatch", {}, ["--", "run"]],
  ["flags after terminator are operands", {}, ["--", "run", "--value"]],
  ["ancestor flags take priority by default", { shadow: true }, ["run", "--shared"]],
  [
    "local flags take priority in positional mode",
    { shadow: true, positional: true },
    ["run", "--shared"],
  ],
  ["global before positional subcommand", { positional: true }, ["--global", "x", "run"]],
  ["options after operands normally parse", {}, ["run", "first", "--value"]],
  ["pass-through stops after operand", { passThrough: true }, ["run", "first", "--value"]],
  ["pass-through retains earlier options", { passThrough: true }, ["run", "--value", "x"]],
  ["pass-through begins at unknown option", { passThrough: true }, ["run", "--unknown"]],
  ["pass-through begins at unknown short flag", { passThrough: true }, ["run", "-X"]],
];

for (const shell of shells) {
  test(`${shell}: cursor value ownership agrees with Commander`, () => {
    for (const [name, configuration, words] of probes) {
      const observed = [];
      const program = probeProgram(configuration, observed);
      program.parse([...words, probe], { from: "user" });
      assert.equal(observed.length, 1, `Commander must assign the probe exactly once: ${name}`);
      const suggestions = complete(shell, probeProgram(configuration), [
        "csc-test-cli",
        ...words,
        probe,
      ]);
      assert.deepEqual(suggestions, observed, name);
    }
  });

  test(`${shell}: positional and pass-through option visibility`, () => {
    assert.ok(complete(shell, probeProgram(), ["csc-test-cli", "run", "--g"]).includes("--global"));
    assert.deepEqual(
      complete(shell, probeProgram({ positional: true }), ["csc-test-cli", "run", "--g"]),
      [],
    );
    assert.deepEqual(
      complete(shell, probeProgram({ passThrough: true }), ["csc-test-cli", "run", "first", "--v"]),
      [],
    );
    assert.ok(
      complete(shell, probeProgram({ passThrough: true }), ["csc-test-cli", "run", "--v"]).includes(
        "--value",
      ),
    );
  });

  test(`${shell}: nested option scopes and variadic command arguments`, () => {
    const root = new Command("csc-test-cli").option("--root-flag");
    const group = root.command("group").enablePositionalOptions().option("--group-flag");
    group.command("leaf").option("--leaf-flag");
    assert.deepEqual(complete(shell, root, ["csc-test-cli", "group", "leaf", "--root"]), [
      "--root-flag",
    ]);
    assert.deepEqual(complete(shell, root, ["csc-test-cli", "group", "leaf", "--group"]), []);

    const positionalRoot = new Command("csc-test-cli")
      .enablePositionalOptions()
      .option("--root-flag");
    const nonpositionalGroup = positionalRoot
      .command("group")
      .enablePositionalOptions(false)
      .option("--group-flag");
    nonpositionalGroup.command("leaf").option("--leaf-flag");
    assert.deepEqual(
      complete(shell, positionalRoot, ["csc-test-cli", "group", "leaf", "--root"]),
      [],
    );
    assert.deepEqual(
      complete(shell, positionalRoot, ["csc-test-cli", "group", "leaf", "--group"]),
      ["--group-flag"],
    );

    const variadic = new Command("csc-test-cli")
      .addArgument(new Argument("[items...]").choices(["a", "b", "run"]))
      .action(() => {});
    variadic.command("run").option("--local");
    assert.deepEqual(complete(shell, variadic, ["csc-test-cli", "a", "run", "a"]), ["a"]);

    const wrapper = new Command("csc-test-cli")
      .passThroughOptions()
      .option("--owned")
      .argument("[args...]");
    assert.deepEqual(complete(shell, wrapper, ["csc-test-cli", "wrapped", "--owned"]), []);
  });
}
