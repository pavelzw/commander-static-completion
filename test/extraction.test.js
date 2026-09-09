import { test } from "node:test";
import assert from "node:assert/strict";
import { Argument, Command, Option } from "commander";
import { extract } from "../dist/model.js";

const flags = (node, visible = true) =>
  node.options.filter((o) => !visible || o.visible).flatMap((o) => o.flags);
const child = (nodes, parent, name) =>
  nodes[parent.children.find((c) => c.names.includes(name)).id];

test("extraction: renamed, disabled, and conflicting help/version flags", () => {
  const program = new Command("cli")
    .helpOption("-?, --assist", "Assistance")
    .version("1", "-R, --release", "Release");
  program.option("-?, --query <value>");
  const [root] = extract(program);
  assert.deepEqual(flags(root), ["-R", "--release", "-?", "--query", "--assist"]);
  assert.equal(root.options.find((o) => o.flags.includes("--assist")).mode, "boolean");
  program.options[0].hideHelp();
  assert.ok(!flags(extract(program)[0]).includes("--release"));
  assert.ok(flags(extract(program)[0], false).includes("--release"));
  program.helpOption(false);
  assert.ok(!flags(extract(program)[0]).includes("--assist"));
  assert.ok(!flags(extract(new Command("cli").helpOption(false))[0]).includes("--version"));
});

test("extraction: help visibility never removes registered parser definitions", () => {
  const program = new Command("cli").helpOption(false);
  const shown = new Option("--shown <value>").choices(["visible"]);
  const hidden = new Option("--hidden <value>").hideHelp().choices(["hidden"]);
  const filtered = new Option("--filtered <value>").choices(["filtered"]);
  program.addOption(shown).addOption(hidden).addOption(filtered);
  const visible = program.command("visible");
  const secret = program.command("secret", { hidden: true });
  program.configureHelp({ visibleOptions: () => [shown], visibleCommands: () => [visible] });
  const nodes = extract(program);
  assert.deepEqual(flags(nodes[0]), ["--shown"]);
  assert.deepEqual(flags(nodes[0], false), ["--shown", "--hidden", "--filtered"]);
  assert.equal(nodes[0].children.find((c) => c.names.includes(secret.name())).visible, false);
  assert.ok(child(nodes, nodes[0], "secret"));
});

test("extraction: inherited options keep ancestor priority per flag", () => {
  const root = new Command("cli").helpOption(false);
  root.addOption(new Option("-s, --shared <value>").choices(["parent"]));
  const sub = root.command("sub");
  sub.addOption(new Option("-s, --specific <value>").choices(["child"]));
  sub.addOption(new Option("--shared <value>").choices(["shadowed"]));
  const nodes = extract(root);
  const options = child(nodes, nodes[0], "sub").options;
  assert.deepEqual(
    options.map((o) => [o.flags, o.value]),
    [
      [["-s", "--shared"], { kind: "choices", values: ["parent"] }],
      [["--specific"], { kind: "choices", values: ["child"] }],
      [[], { kind: "choices", values: ["shadowed"] }],
    ],
  );
  root.enablePositionalOptions();
  const positionalNodes = extract(root);
  assert.deepEqual(flags(child(positionalNodes, positionalNodes[0], "sub")), [
    "-s",
    "--specific",
    "--shared",
  ]);
});

test("extraction: implicit help remains a route when hidden by help configuration", () => {
  const root = new Command("cli").helpCommand("manual [command]", "Read help");
  const sub = root.command("deploy").alias("d");
  root.configureHelp({ visibleCommands: () => [sub] });
  const nodes = extract(root);
  assert.equal(nodes[0].children.find((c) => c.names.includes("manual"))?.visible, false);
  assert.deepEqual(child(nodes, nodes[0], "manual").arguments[0].value, {
    kind: "choices",
    values: ["deploy", "d"],
  });
});

test("extraction: prepared help uses Commander's special route, not its own action or aliases", () => {
  const root = new Command("cli");
  const help = new Command("manual")
    .alias("docs")
    .argument("[ignored...]")
    .option("--ignored")
    .action(() => assert.fail("help action ran"));
  root.addHelpCommand(help);
  root.command("deploy").alias("d");
  const nodes = extract(root);
  const route = nodes[0].children.find((c) => c.names.includes("manual"));
  assert.deepEqual(route.names, ["manual"]);
  const model = nodes[route.id];
  assert.deepEqual(model.options, []);
  assert.equal(model.arguments[0].variadic, false);
  assert.deepEqual(model.arguments[0].value, { kind: "choices", values: ["deploy", "d"] });
});

test("extraction: an explicit help command retains its own options and arguments", () => {
  const root = new Command("cli");
  root.command("deploy");
  const help = root.command("help").alias("docs").helpOption(false);
  help.addOption(new Option("--format <value>").choices(["text"]));
  help.addArgument(new Argument("[topic]").choices(["overview", "usage"]));
  const nodes = extract(root);
  const model = child(nodes, nodes[0], "docs");
  assert.deepEqual(flags(model), ["--format"]);
  assert.deepEqual(model.arguments[0].value, { kind: "choices", values: ["overview", "usage"] });
});

test("extraction: presentation-only command/option definitions produce diagnostics", () => {
  const command = new Command("cli").configureHelp({
    visibleCommands: () => [new Command("fake")],
  });
  assert.throws(() => extract(command), /visibleCommands.*unregistered/);
  const option = new Command("cli").configureHelp({
    visibleOptions: () => [new Option("--fake <value>")],
  });
  assert.throws(() => extract(option), /visibleOptions.*unregistered/);
});

test("extraction: legacy wildcard fallback is diagnosed", () => {
  const root = new Command("cli");
  root.command("*");
  assert.throws(() => extract(root), /wildcard.*isDefault/);
});

test("extraction: private parsing settings retain per-command scope", () => {
  const root = new Command("cli")
    .enablePositionalOptions()
    .combineFlagAndOptionalValue(false)
    .option("-1, --one")
    .option("-o, --optional [value]");
  root.command("serve", { isDefault: true }).passThroughOptions();
  root.addCommand(new Command("independent").option("-c, --child [value]"));
  const nodes = extract(root);
  const serve = child(nodes, nodes[0], "serve");
  assert.equal(nodes[0].defaultCommand, serve.id);
  assert.equal(serve.passThrough, true);
  assert.equal(serve.positional, true);
  assert.equal(
    serve.negativeNumbers,
    false,
    "ancestor digit flags disable negative-value recognition",
  );
  assert.equal(nodes[0].options.find((o) => o.flags.includes("-o")).combineOptional, false);
  const independent = child(nodes, nodes[0], "independent");
  assert.equal(independent.positional, false, "addCommand does not copy settings");
  assert.equal(independent.options.find((o) => o.flags.includes("-c")).combineOptional, true);
  assert.ok(!flags(independent).includes("--optional"));
});

test("extraction: registered help names take priority over the built-in route", () => {
  const root = new Command("cli").helpCommand(true);
  root
    .command("manual")
    .alias("help")
    .addArgument(new Argument("[topic]").choices(["overview"]));
  const nodes = extract(root);
  assert.equal(nodes[0].children.length, 1);
  assert.deepEqual(child(nodes, nodes[0], "help").arguments[0].value, {
    kind: "choices",
    values: ["overview"],
  });
});

test("extraction: custom built-in help options do not consume values", () => {
  const root = new Command("cli").addHelpOption(
    new Option("--assist [topic]").choices(["overview"]),
  );
  const help = extract(root)[0].options[0];
  assert.equal(help.mode, "boolean");
  assert.deepEqual(help.value, { kind: "none" });
});
