import { generateCompletion } from '../dist/index.js';
import { program } from './cli-definition.js';

process.stdout.write(generateCompletion(program, { shell: process.argv[2] ?? 'bash' }));
