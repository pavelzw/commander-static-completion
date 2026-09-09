import { Argument, Command, Option } from "commander";
import {
  completionHint,
  completionDefinition,
  generateCompletion,
} from "commander-static-completion";
import type { CompletionHint, GenerateOptions, Shell } from "commander-static-completion";

const hint: CompletionHint = { kind: "choices", values: ["fast"] as const };
const option: Option = completionHint(new Option("--mode <mode>"), hint);
const argument: Argument = completionHint(new Argument("[path]"), { kind: "directory" });
for (const shell of ["bash", "zsh", "fish"] satisfies Shell[]) {
  const options: GenerateOptions = { shell, executable: "demo" };
  const script: string = generateCompletion(
    new Command("demo").addOption(option).addArgument(argument),
    options,
  );
  void script;
}
// @ts-expect-error Unknown shells must not be accepted by the published API.
generateCompletion(new Command("demo"), { shell: "powershell" });
// @ts-expect-error Choices must remain strings.
completionHint(new Option("--mode"), { kind: "choices", values: [1] });

const externalRoot = new Command("external-root");
externalRoot.command("external", "external executable");
completionDefinition(externalRoot.commands[0], new Command("definition").option("--external-flag"));
generateCompletion(externalRoot, { shell: "bash" });
