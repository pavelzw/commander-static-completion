import { test } from "node:test";
import assert from "node:assert/strict";
import { Argument, Command, Option } from "commander";
import { complete, shells } from "./helpers.js";

const probe = "zz-slot-";
function fixture(
  { combine = false, childCombine = false, positional = false, fallback = false } = {},
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
  const root = args(
    new Command("csc-test-cli")
      .exitOverride()
      .configureOutput({ writeErr() {} })
      .combineFlagAndOptionalValue(combine)
      .enablePositionalOptions(positional),
    "root",
  );
  root
    .option("-v, --verbose")
    .addOption(option("-o, --optional [value]", "optional"))
    .addOption(option("-r, --required <value>", "required"))
    .addOption(option("-m, --many [values...]", "many"));
  const child = args(
    root.command("child", { isDefault: fallback }).combineFlagAndOptionalValue(childCombine),
    "child",
  );
  child
    .option("-b, --boolean")
    .addOption(option("-c, --child-value [value]", "child-value"))
    .addOption(option("-p, --port <value>", "port"));
  return root;
}
const cases = [
  ["separate optional", {}, ["-o"]],
  ["long optional", {}, ["--optional"]],
  ["long assignment", {}, ["--optional=value"]],
  ["empty assignment", {}, ["--optional="]],
  ["optional then boolean", {}, ["-ov"]],
  ["boolean then optional", {}, ["-vo"]],
  ["optional then required", {}, ["-or"]],
  ["required attached", {}, ["-orvalue"]],
  ["repeated optional", {}, ["-oo"]],
  ["optional after boolean", {}, ["-ovo"]],
  ["negative optional value", {}, ["-vo", "-2"]],
  ["terminator", {}, ["-ov", "--"]],
  ["variadic at end", {}, ["-vm", "one"]],
  ["variadic before boolean", {}, ["-mv", "one"]],
  ["enabled cluster", { combine: true }, ["-ov"]],
  ["enabled variadic attached", { combine: true }, ["-mv", "one"]],
  ["child cluster", {}, ["child", "-cb"]],
  ["child optional last", {}, ["child", "-bc"]],
  ["ancestor splits child cluster", {}, ["child", "-oc"]],
  ["ancestor splits child required", {}, ["child", "-op"]],
  ["enabled ancestor", { combine: true }, ["child", "-oc"]],
  ["enabled child", { childCombine: true }, ["child", "-cb"]],
  ["positional child", { positional: true }, ["child", "-cb"]],
  ["default cluster", { fallback: true }, ["-op"]],
  ["default optional", { fallback: true }, ["-oc"]],
  ["positional default cluster", { fallback: true, positional: true }, ["-op"]],
];
for (const shell of shells) {
  test(`${shell}: optional cluster ownership agrees with Commander`, () => {
    for (const [name, config, prefix] of cases) {
      const observed = [];
      fixture(config, observed).parse([...prefix, probe], { from: "user" });
      assert.equal(observed.length, 1, name);
      assert.deepEqual(
        complete(shell, fixture(config), ["csc-test-cli", ...prefix, probe]),
        observed,
        name,
      );
    }
  });
  test(`${shell}: current optional clusters respect the owning command setting`, () => {
    for (const [config, prefix, current, expected] of [
      [{}, [], "-o" + probe, []],
      [{ combine: true }, [], "-o" + probe, ["-o" + probe + "optional"]],
      [{}, [], "-or" + probe, ["-or" + probe + "required"]],
      [{}, [], "--optional=" + probe, ["--optional=" + probe + "optional"]],
      [{ childCombine: true }, ["child"], "-o" + probe, []],
      [{ combine: true }, ["child"], "-o" + probe, ["-o" + probe + "optional"]],
      [{}, ["child"], "-cp" + probe, ["-cp" + probe + "port"]],
      [{ fallback: true }, [], "-op" + probe, ["-op" + probe + "port"]],
    ])
      assert.deepEqual(
        complete(shell, fixture(config), ["csc-test-cli", ...prefix, current]),
        expected,
        JSON.stringify([config, prefix, current]),
      );
  });
}
