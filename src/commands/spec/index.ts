import type { Command } from '../../types/command.js'

const spec = {
  type: 'local',
  name: 'spec',
  aliases: ['specs'],
  description:
    'Spec-driven development: scaffold requirements -> design -> tasks in .ur/specs, execute task-by-task, and verify with strict proof gates',
  argumentHint:
    'init|list|show|generate|approve|next|run|verify|status|delete [name] [--goal ...] [--all] [--dry-run] [--kernel] [--json]',
  supportsNonInteractive: true,
  load: () => import('./spec.js'),
} satisfies Command

export default spec
