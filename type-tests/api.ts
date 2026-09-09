import { Command, Option } from "commander";
import { completionHint, generateCompletion } from "../src/index.js";
const option: Option = completionHint(new Option("--file <path>"), { kind: "file" });
const result: string = generateCompletion(new Command("demo").addOption(option), { shell: "bash" });
void result;
// @ts-expect-error Only implemented shells are accepted.
generateCompletion(new Command("demo"), { shell: "powershell" });
