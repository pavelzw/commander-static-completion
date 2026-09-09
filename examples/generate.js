import { generateCompletion } from '../src/index.js';
import { program } from './cli-definition.js';

process.stdout.write(generateCompletion(program, { shell: 'bash' }));
