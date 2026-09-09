import { Command } from 'commander';
import { generateCompletion } from 'commander-static-completion';

const script: string = generateCompletion(new Command('demo'), { shell: 'bash' });
void script;
// @ts-expect-error Options are required in CommonJS consumers too.
generateCompletion(new Command('demo'));
