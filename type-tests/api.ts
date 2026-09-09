import { Command, Option } from "commander";
import { completionHint, completionDefinition, generateCompletion } from "../src/index.js";
const option: Option = completionHint(new Option("--file <path>"), { kind: "file" });
const result: string = generateCompletion(new Command("demo").addOption(option), { shell: "bash" });
void result;
// @ts-expect-error Only implemented shells are accepted.
generateCompletion(new Command("demo"), { shell: "powershell" });

class ExternalCommand extends Command {
  marker = true;
}
const external: ExternalCommand = new ExternalCommand("external");
const same: ExternalCommand = completionDefinition(external, new Command("definition"));
void same;
// @ts-expect-error Definitions must be Commander commands, not paths or callbacks.
completionDefinition(external, "./external.js");
