import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Command, Argument, Option } from "commander";
import { completionDefinition, generateCompletion } from "../dist/index.js";
import { extract } from "../dist/model.js";
import { complete, shells } from "./helpers.js";
import { capture } from "./snapshot-harness.js";
import { assertShellSnapshot } from "./snapshot-assert.js";

function fixture({ positional = true, isDefault = false } = {}) {
  const root = new Command("csc-test-cli")
    .enablePositionalOptions(positional)
    .addOption(new Option("--region <region>").choices(["parent-region"]));
  root.command("deploy [ignored-display-argument]", "Deploy remotely", {
    executableFile: "missing-deploy-binary",
    isDefault,
  });
  const target = root.commands[0].alias("d");
  const definition = new Command("standalone-deploy")
    .addOption(new Option("--target <target>").choices(["production", "staging"]))
    .addOption(new Option("--region <region>").choices(["child-region"]))
    .addArgument(new Argument("[zone]").choices(["europe", "america"]));
  definition.command("status").addOption(new Option("--format <format>").choices(["json", "text"]));
  completionDefinition(target, definition);
  return { root, target, definition };
}

test("executable definitions preserve dispatch metadata without changing Commander", () => {
  const { root, target, definition } = fixture();
  assert.equal(completionDefinition(target, definition), target);
  const fail = () => {
    throw new Error("Executed parser or binary");
  };
  root._executeSubCommand = fail;
  definition.parse = fail;
  definition.action(fail);
  const nodes = extract(root);
  assert.deepEqual(nodes[0].children[0].names, ["deploy", "d"]);
  assert.equal(nodes[0].children[0].description, "Deploy remotely");
  assert.deepEqual(nodes[1].arguments[0].value.values, ["europe", "america"]);
  for (const shell of shells)
    assert.equal(generateCompletion(root, { shell }), generateCompletion(root, { shell }));
  assert.equal(target._executableHandler, true);
  assert.equal(target._executableFile, "missing-deploy-binary");
  assert.equal(target.parent, root);
  assert.equal(definition.parent, null);
  assert.equal(target.options.length, 0);
  assert.equal(target.commands.length, 0);
});

test("executable definitions diagnose missing, conflicting and cyclic metadata", () => {
  const root = new Command("cli");
  root.command("external", "external binary");
  const target = root.commands[0];
  assert.throws(
    () => generateCompletion(root, { shell: "bash" }),
    /completionDefinition.*external/,
  );
  assert.throws(() => completionDefinition(root, new Command()), /must be an executable/);
  assert.throws(() => completionDefinition(target, target), /independent/);
  assert.throws(() => completionDefinition(target, null), /two Commander commands/);
  const attached = new Command("attached");
  new Command("owner").addCommand(attached);
  assert.throws(() => completionDefinition(target, attached), /independent/);
  completionDefinition(target, root);
  assert.throws(() => generateCompletion(root, { shell: "fish" }), /Cyclic/);
  const definition = new Command("independent");
  completionDefinition(target, definition);
  target.option("--conflict");
  assert.throws(() => generateCompletion(root, { shell: "zsh" }), /conflicting parser/);
});

test("definitions can be reused, updated, hidden, and nested", () => {
  const { root, target, definition } = fixture();
  root.command("second", "second binary");
  completionDefinition(root.commands[1], definition);
  definition.option("--later");
  assert.ok(extract(root)[1].options.some((o) => o.flags.includes("--later")));
  definition.command("nested", "nested binary");
  const leaf = new Command("leaf").option("--leaf");
  completionDefinition(definition.commands.at(-1), leaf);
  assert.ok(extract(root).some((node) => node.options.some((o) => o.flags.includes("--leaf"))));
  target._hidden = true;
  assert.equal(extract(root)[0].children[0].visible, false);
  definition.addCommand(new Command("owner").addCommand(leaf));
  assert.throws(() => extract(root), /independent/);
});

for (const shell of shells) {
  test(`${shell}: executable parser definitions, aliases, defaults and option scope`, () => {
    for (const [words, expected, settings] of [
      [["deploy", "--target", "pr"], ["production"]],
      [["d", "--target=pr"], ["--target=production"]],
      [["deploy", "e"], ["europe"]],
      [["deploy", "status", "--format", "j"], ["json"]],
      [["deploy", "--region", ""], ["child-region"]],
      [["deploy", "--region", ""], ["parent-region"], { positional: false }],
      [["--target", "pr"], ["production"], { isDefault: true }],
    ]) {
      assert.deepEqual(
        complete(shell, fixture(settings).root, ["csc-test-cli", ...words]),
        expected,
        JSON.stringify(words),
      );
    }
  });
}

for (const [name, input, settings] of [
  ["alias", "csc-test-cli d --target pr<TAB>"],
  ["nested", "csc-test-cli deploy status --format j<TAB>"],
  ["argument", "csc-test-cli deploy eu<TAB>"],
  ["default", "csc-test-cli --target pr<TAB>", { isDefault: true }],
]) {
  test(`executable snapshot: ${name}`, async () => {
    const sections = [];
    for (const shell of shells) {
      const shellSetup =
        shell === "fish"
          ? "function missing-deploy-binary; printf invoked > invoked; end"
          : "missing-deploy-binary() { printf invoked > invoked; }";
      const output = await capture(shell, fixture(settings).root, input, { shellSetup });
      assert.match(
        output,
        name === "nested" ? /json/ : name === "argument" ? /europe/ : /production/,
      );
      sections.push(`Shell: ${shell}\n\n${output}`);
    }
    assertShellSnapshot(
      new URL(`./snapshots/executable-${name}.snap`, import.meta.url),
      input,
      sections,
    );
  });
}

test("executable parser boundaries reset ancestor digit settings", () => {
  const root = new Command("csc-test-cli").enablePositionalOptions().option("-1");
  root.command("external", "external binary");
  const definition = new Command("external")
    .addOption(new Option("--count [count]").choices(["-2"]))
    .addArgument(new Argument("[next]").choices(["next"]));
  completionDefinition(root.commands[0], definition);
  for (const shell of shells) {
    assert.deepEqual(complete(shell, root, ["csc-test-cli", "external", "--count", "-2", "n"]), [
      "next",
    ]);
  }
  root.enablePositionalOptions(false);
  assert.throws(
    () => generateCompletion(root, { shell: "bash" }),
    /active ancestor digit flags.*enablePositionalOptions/,
  );
});

test("TypeScript executable example generates completions and still dispatches", () => {
  const run = (...args) =>
    execFileSync(process.execPath, ["--import", "tsx", "examples/executable/cli.ts", ...args], {
      encoding: "utf8",
      timeout: 15000,
    });
  assert.equal(run("d", "--target", "production"), "Deploying to production\n");
  for (const shell of shells) {
    const script = run("completions", shell);
    assert.ok(script.includes("production"));
    assert.ok(!script.includes("Deploying to"));
  }
});

test("external option ownership agrees with Commander's dispatched argv", () => {
  for (const positional of [true, false]) {
    for (const flag of ["--region", "--target"]) {
      const observed = [];
      const { root, definition } = fixture({ positional });
      const probe = "probe-";
      for (const [command, label] of [
        [root, "parent"],
        [definition, "child"],
      ]) {
        for (const option of command.options) {
          option.choices([probe + label]).argParser((value) => {
            if (value === probe) observed.push(probe + label);
            return value;
          });
        }
      }
      definition.action(() => {});
      // Intercept only process launch; let both real Commander parsers decide
      // which options are consumed before and after the executable boundary.
      root._executeSubCommand = (_target, args) => definition.parse(args, { from: "user" });
      root.parse(["deploy", flag, probe], { from: "user" });
      assert.equal(observed.length, 1);
      for (const shell of shells) {
        assert.deepEqual(complete(shell, root, ["csc-test-cli", "deploy", flag, probe]), observed);
      }
    }
  }
});
