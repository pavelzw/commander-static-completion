#!/usr/bin/env node
import { createCompletionCommand, createProgram } from "./cli-definition.js";

const program = createProgram();
const args = process.argv.slice(2);

// Reserve only the first argument. Searching the entire argv could mistake an
// option value (e.g. --token completions) for the completion command.
if (args[0] === "completions") {
  // A fresh, unattached parser avoids root required options and lifecycle hooks.
  await createCompletionCommand(program).parseAsync(args.slice(1), { from: "user" });
} else {
  await program.parseAsync(args, { from: "user" });
}
