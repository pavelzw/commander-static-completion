import { Command, Option } from "commander";

// Share this side-effect-free factory with the executable and completion builder.
export function createDeployCommand(): Command {
  return new Command("mycli-deploy")
    .description("Deploy an application")
    .addOption(new Option("--target <target>").choices(["staging", "production"]))
    .action((options: { target?: string }) => {
      console.log(`Deploying to ${options.target ?? "staging"}`);
    });
}
