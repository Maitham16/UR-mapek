import type { Command } from '../../types/command.js'

const pattern = {
  type: 'local',
  name: 'pattern',
  aliases: ['patterns'],
  description:
    'Multi-agent collaboration patterns (PEER, DOE, concurrent, handoff, debate, parallel): list, show, run, or install',
  argumentHint: '[list|show|run|install] [peer|doe|concurrent|handoff|debate|parallel] [task...] [--execute] [--dry-run] [--save] [--force] [--json]',
  supportsNonInteractive: true,
  load: () => import('./pattern.js'),
} satisfies Command

export default pattern
