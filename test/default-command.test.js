import { test } from "node:test";
import assert from "node:assert/strict";
import { Argument, Command, Option } from "commander";
import { complete, shells } from "./helpers.js";

const probe = "zz-slot-";
function defaultFixture(
  { positional = false, nested = false, passThrough = false, hidden = false } = {},
  observed = [],
) {
  const option = (flags, label) =>
    new Option(flags).choices([probe + label]).argParser((value) => {
      if (value === probe) observed.push(probe + label);
      return value;
    });
  const args = (command, label) =>
    command
      .addArgument(
        new Argument("[items...]").choices([probe + label]).argParser((value) => {
          if (value === probe) observed.push(probe + label);
          return value;
        }),
      )
      .action(() => {});
  const root = new Command("csc-test-cli")
    .exitOverride()
    .helpCommand(true)
    .configureOutput({ writeErr() {} })
    .enablePositionalOptions(positional || passThrough);
  root.addOption(option("-g, --global <value>", "global"));
  root.addOption(option("--shared <value>", "root-shared"));
  root.option("-v, --verbose");
  args(root, "root");
  const fallback = new Command("serve")
    .alias("s")
    .enablePositionalOptions(positional || passThrough);
  root.addCommand(fallback, { isDefault: true, hidden });
  fallback.addOption(option("-p, --port <value>", "port"));
  fallback.addOption(option("-o, --optional [value]", "optional"));
  fallback.addOption(option("--many <values...>", "many"));
  fallback.addOption(option("--shared <value>", "default-shared"));
  if (passThrough) fallback.passThroughOptions().allowUnknownOption();
  args(fallback, "default");
  args(
    root.command("status").alias("st").addOption(option("--detail <value>", "detail")),
    "status",
  );
  if (nested) {
    const child = fallback.command("watch", { isDefault: true });
    child.addOption(option("--interval <value>", "interval"));
    args(child, "nested");
  }
  return root;
}

const probes = [
  ["implicit positional", {}, []],
  ["second positional", {}, ["file"]],
  ["explicit default", {}, ["serve"]],
  ["default alias", {}, ["s"]],
  ["explicit sibling", {}, ["status"]],
  ["sibling alias", {}, ["st"]],
  ["implicit option", {}, ["--port"]],
  ["parent option", {}, ["--global"]],
  ["attached parent value", {}, ["--global=status"]],
  ["parent value equal sibling", {}, ["--global", "status"]],
  ["default value equal sibling", {}, ["--port", "status"]],
  ["default before sibling", {}, ["--port", "123", "status"]],
  ["sibling before default option", {}, ["status", "--detail"]],
  ["default optional value", {}, ["--optional"]],
  ["optional negative", {}, ["--optional", "-2"]],
  ["variadic default option", {}, ["--many", "one"]],
  ["attached variadic", {}, ["--many=one"]],
  ["short cluster", {}, ["-vp"]],
  ["ancestor in default values", {}, ["--port", "--global", "x"]],
  ["ancestor wins overlap", {}, ["file", "--shared"]],
  ["terminator", {}, ["--"]],
  ["literal option", {}, ["--", "--port"]],
  ["literal sibling dispatch", {}, ["--", "status"]],
  ["default operand commits route", {}, ["file", "status"]],
  ["positional default", { positional: true }, ["file", "--shared"]],
  ["positional root before default", { positional: true }, ["--shared"]],
  ["positional default boundary", { positional: true }, ["--port", "123", "--shared"]],
  ["positional explicit default", { positional: true }, ["serve", "--shared"]],
  ["nested default", { nested: true }, []],
  ["nested option", { nested: true }, ["--interval"]],
  ["nested explicit", { nested: true }, ["watch"]],
  ["nested positional", { nested: true, positional: true }, ["watch"]],
  ["pass through", { passThrough: true }, ["file", "--port"]],
  ["hidden default still parses", { hidden: true }, ["--port"]],
];
for (const shell of shells) {
  test(`${shell}: default command ownership agrees with Commander`, () => {
    for (const [name, config, prefix] of probes) {
      const observed = [];
      defaultFixture(config, observed).parse([...prefix, probe], { from: "user" });
      assert.equal(observed.length, 1, name);
      assert.deepEqual(
        complete(shell, defaultFixture(config), ["csc-test-cli", ...prefix, probe]),
        observed,
        name,
      );
    }
  });
  test(`${shell}: default command suggestions preserve explicit alternatives`, () => {
    const root = defaultFixture();
    assert.deepEqual(complete(shell, root, ["csc-test-cli", "-vp"]), ["-vp"]);
    for (const positional of [false, true]) {
      assert.deepEqual(
        complete(shell, defaultFixture({ positional }), ["csc-test-cli", "-vp" + probe]),
        ["-vp" + probe + "port"],
      );
    }
    assert.deepEqual(complete(shell, root, ["csc-test-cli", "st"]).sort(), ["st", "status"]);
    assert.deepEqual(complete(shell, root, ["csc-test-cli", "--po"]), ["--port"]);
    // Fish may match unrelated descriptions, but the default option is out of scope.
    assert.ok(!complete(shell, root, ["csc-test-cli", "status", "--po"]).includes("--port"));
    assert.deepEqual(complete(shell, root, ["csc-test-cli", "help", "s"]).sort(), [
      "s",
      "serve",
      "st",
      "status",
    ]);
    assert.ok(
      !complete(shell, defaultFixture({ hidden: true }), ["csc-test-cli", "se"]).includes("serve"),
    );
    assert.deepEqual(complete(shell, root, ["csc-test-cli", "--port=" + probe]), [
      "--port=" + probe + "port",
    ]);
  });
}
