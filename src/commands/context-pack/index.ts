import type { Command } from '../../types/command.js'

const contextPack = {
  type: 'local',
  name: 'context-pack',
  aliases: ['project-manifest', 'ctx-pack'],
  description:
    'Summarize repo architecture, maintain task memory, and compress project context under .ur/',
  argumentHint:
    '[scan|remember|compress|status] [--type decision|constraint|command|diff|note] [--text <text>] [--json]',
  supportsNonInteractive: true,
  load: () => import('./context-pack.js'),
} satisfies Command

export default contextPack
