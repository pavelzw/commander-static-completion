import { Command } from "commander";
import { completionDefinition, generateCompletion } from "commander-static-completion";

const script: string = generateCompletion(new Command("demo"), { shell: "bash" });
void script;
// @ts-expect-error Options are required in CommonJS consumers too.
generateCompletion(new Command("demo"));

const externalRoot = new Command("external-root");
externalRoot.command("external", "external executable");
completionDefinition(externalRoot.commands[0], new Command("definition").option("--external-flag"));
generateCompletion(externalRoot, { shell: "bash" });
