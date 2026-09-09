import { generateCompletion } from "commander-static-completion";
import { createProgram } from "./cli-definition.js";

// Build-time generation uses the same definition without parsing application argv.
process.stdout.write(generateCompletion(createProgram(), { shell: process.argv[2] ?? "bash" }));
