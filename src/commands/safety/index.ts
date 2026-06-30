import type { Command } from '../../types/command.js'

const safety = {
  type: 'local',
  name: 'safety',
  aliases: ['safety-policy'],
  description:
    'Inspect project shell safety policy, initialize .ur/safety-policy.json, and evaluate risky commands',
  argumentHint: '[status|init|check] [--command <cmd>] [--json]',
  supportsNonInteractive: true,
  load: () => import('./safety.js'),
} satisfies Command

export default safety
