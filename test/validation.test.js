import assert from "node:assert/strict";
import { test } from "node:test";
import { Command, Option, Argument } from "commander";
import { completionHint, generateCompletion } from "../dist/index.js";
import { complete, shells } from "./helpers.js";
import { literalFixture } from "./fixture.js";

const definitions = {
  command: (value) => {
    const child = new Command("target");
    const program = new Command("csc-test-cli").addCommand(child);
    child.name(value);
    return program;
  },
  alias: (value) => new Command("csc-test-cli").addCommand(new Command("target").alias(value)),
  flag: (value) => {
    const option = new Option("--value <value>");
    option.long = value;
    return new Command("csc-test-cli").addOption(option);
  },
  option: (value) =>
    new Command("csc-test-cli").addOption(new Option("--value <value>").choices([value])),
  argument: (value) =>
    new Command("csc-test-cli").addArgument(new Argument("[value]").choices([value])),
  hint: (value) =>
    new Command("csc-test-cli").addOption(
      completionHint(new Option("--value <value>"), { kind: "choices", values: [value] }),
    ),
};
for (const shell of shells) {
  test(`${shell}: reject empty and control-containing insertable text`, () => {
    for (const value of [
      "",
      "bad\0value",
      "bad\x01value",
      "bad\x1bvalue",
      "bad\x7fvalue",
      "bad\x85value",
      "bad\tvalue",
      "bad\nvalue",
      "bad\rvalue",
    ]) {
      for (const [kind, make] of Object.entries(definitions)) {
        // Commander ignores an empty alias; it never reaches extraction.
        if ((kind === "alias" || kind === "flag") && value === "") continue;
        assert.throws(
          () => generateCompletion(make(value), { shell }),
          /nonempty|NUL|control|tabs or newlines/,
          `${kind}: ${JSON.stringify(value)}`,
        );
      }
      assert.throws(
        () => generateCompletion(new Command("cli"), { shell, executable: value }),
        /executable.*(?:nonempty|NUL|control|tabs or newlines)/,
      );
    }
  });
  test(`${shell}: empty choice lists suppress values; blank text is still a choice`, () => {
    const program = new Command("csc-test-cli").addOption(
      new Option("--value <value>").choices([]),
    );
    assert.deepEqual(complete(shell, program, ["csc-test-cli", "--value", ""]), []);
    assert.doesNotThrow(() => generateCompletion(definitions.option(" "), { shell }));
  });
  test(`${shell}: validation follows current choices and explicit hints`, () => {
    const option = new Option("--value <value>").choices(["valid"]);
    const program = new Command("cli").addOption(option);
    option.argChoices.push("bad\0value");
    assert.throws(() => generateCompletion(program, { shell }), /NUL/);
    completionHint(option, { kind: "none" });
    assert.doesNotThrow(() => generateCompletion(program, { shell }));
    for (const values of [[1], Array(1)]) {
      option.argChoices = values;
      const raw = new Command("cli").addArgument(
        Object.assign(new Argument("[value]"), { argChoices: values }),
      );
      assert.throws(() => generateCompletion(raw, { shell }), /nonempty string/);
      assert.throws(() => completionHint(option, { kind: "choices", values }), /array of strings/);
    }
  });
  test(`${shell}: wildcard command names do not dispatch similar names`, () => {
    for (const [suffix, impostor] of [
      ["*", "cmdX"],
      ["?", "cmdX"],
      ["[ab]", "cmda"],
      ["\\*", "cmd\\X"],
    ]) {
      assert.ok(
        !complete(shell, literalFixture("command", suffix), [
          "csc-test-cli",
          impostor,
          "--value",
          "pr",
        ]).includes("production"),
        suffix,
      );
    }
  });
}
test("Fish executable registrations match literal names only", () => {
  for (const [suffix, impostor] of [
    ["*", "cliX"],
    ["?", "cliX"],
    ["[ab]", "clia"],
  ]) {
    assert.deepEqual(
      complete("fish", literalFixture("executable", suffix), [impostor, "--value", "pr"]),
      [],
    );
  }
});
test("Fish explains its record delimiters and descriptions remain sanitized", () => {
  assert.throws(
    () => generateCompletion(definitions.option("a\tb"), { shell: "fish" }),
    /Fish uses them as completion record delimiters/,
  );
  for (const shell of shells) {
    assert.doesNotThrow(() =>
      generateCompletion(new Command("cli").description("lines\n\t\x1b[31mred\0"), { shell }),
    );
  }
});
