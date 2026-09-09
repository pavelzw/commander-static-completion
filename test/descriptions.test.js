import { test } from "node:test";
import assert from "node:assert/strict";
import { runShell } from "./shell-process.js";
import { Command, Option, Argument } from "commander";
import { generateCompletion } from "../dist/index.js";
import { complete, executables, quote } from "./helpers.js";
import { descriptionFixture } from "./fixture.js";

function describedComplete(shell, program, words) {
  const script = generateCompletion(program, { shell });
  let input;
  if (shell === "fish") {
    const line = words.join(" ");
    input = `set -g fish_complete_path\n${script}\nset -gx PATH /nonexistent\ncomplete -C ${quote(line)}\n`;
  } else {
    const fn = script.match(/^\s*compdef (\w+)/m)[1];
    const capture = String.raw`compadd() {
      local -a labels
      local name candidate label
      if [[ $1 == -d ]]; then name=$2; labels=("__DOLLAR__{(@P)name}"); shift 2; fi
      shift
      local index=1
      for candidate; do
        label=__DOLLAR__{labels[index]}
        [[ $label == "$candidate" ]] && label=
        label=__DOLLAR__{label#"$candidate -- "}
        print -r -- "$candidate"$'\t'"$label"
        ((index+=1))
      done
    }`.replaceAll("__DOLLAR__", "$");
    input = `compdef() { :; }\n${script}\n${capture}\nPATH=/nonexistent\nwords=(${words.map(quote).join(" ")})\nCURRENT=${words.length}\nPREFIX=${quote(words.at(-1))}\n${fn}\n`;
  }
  const result = runShell(executables[shell], shell === "fish" ? ["--no-config"] : ["-f"], {
    input,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return result.stdout
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [word, description = ""] = line.split("\t");
      return [word, description];
    });
}

for (const shell of ["fish", "zsh"]) {
  test(`${shell}: descriptions follow commands, aliases, flags, values, and defaults`, () => {
    const program = descriptionFixture();
    const root = describedComplete(shell, program, ["csc-test-cli", ""]);
    for (const entry of [
      ["serve", "Serve the app"],
      ["s", "Serve the app"],
      ["status", "Show app status"],
      ["st", "Show app status"],
      ["--verbose", "Show detailed output"],
      ["--format", "Output format"],
      ["app", "Build target"],
    ]) {
      assert.ok(
        root.some((item) => item[0] === entry[0] && item[1] === entry[1]),
        JSON.stringify([entry, root]),
      );
    }
    assert.ok(!root.some(([word]) => word === "internal" || word === "--secret"));
    for (const [suffix, expected] of [
      [["serve", "--format", "j"], [["json", "Output format"]]],
      [["serve", "--format=j"], [["--format=json", "Output format"]]],
      [["serve", "-fj"], [["-fjson", "Output format"]]],
      [["serve", "ap"], [["app", "Build target"]]],
    ])
      assert.deepEqual(describedComplete(shell, program, ["csc-test-cli", ...suffix]), expected);
    assert.ok(
      !describedComplete(shell, program, ["csc-test-cli", "serve", ""]).some(
        ([word]) => word === "--verbose",
      ),
    );
    assert.deepEqual(complete(shell, program, ["csc-test-cli", "serve", "--format", "j"]), [
      "json",
    ]);
  });
  test(`${shell}: descriptions preserve literal punctuation and normalize terminal formatting`, () => {
    const description =
      "Use 'quotes': \\path $(touch PWNED) `touch PWNED`\tand\n\x1b[31mred\x1b[0m";
    const expected = "Use 'quotes': \\path $(touch PWNED) `touch PWNED` and red";
    const program = new Command("csc-test-cli").addOption(
      new Option("--format <value>", description).choices(["json"]),
    );
    assert.deepEqual(describedComplete(shell, program, ["csc-test-cli", "--format", "j"]), [
      ["json", expected],
    ]);
    const child = program.command("child");
    child.addOption(new Option("--format <value>", "Child description").choices(["text"]));
    child.option("--later", "A later option");
    assert.deepEqual(describedComplete(shell, program, ["csc-test-cli", "child", "--later"]), [
      ["--later", "A later option"],
    ]);
    assert.deepEqual(
      describedComplete(shell, program, ["csc-test-cli", "child", "--format", "j"]),
      [["json", expected]],
    );
  });
}

test("bash: descriptions do not affect generated output", () => {
  const program = new Command("csc-test-cli");
  const option = new Option("--format <value>").choices(["json"]);
  const argument = new Argument("[target]").choices(["app"]);
  program.addOption(option).addArgument(argument);
  const child = program.command("child");
  const before = generateCompletion(program, { shell: "bash" });
  option.description = "Output format";
  argument.description = "Build target";
  child.description("Run child");
  assert.equal(generateCompletion(program, { shell: "bash" }), before);
});
