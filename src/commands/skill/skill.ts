import type { LocalCommandCall } from '../../types/command.js'
import { runWorkflowSpec } from '../../services/agents/runWorkflow.js'
import { validateWorkflow } from '../../services/agents/workflows.js'
import {
  formatSkillStatus,
  initSkillDir,
  listSkillDirs,
  loadAllSkillDirs,
  loadSkillDir,
  skillToWorkflow,
  type SkillDirectoryInfo,
} from '../../skills/skillSpec.js'
import { parseArguments } from '../../utils/argumentSubstitution.js'
import { getCwd } from '../../utils/cwd.js'
import { getURConfigHomeDir } from '../../utils/envUtils.js'
import { isFsInaccessible } from '../../utils/errors.js'
import { getFsImplementation } from '../../utils/fsOperations.js'
import { getProjectDirsUpToHome } from '../../utils/markdownConfigLoader.js'
import { join } from 'node:path'

function getSkillRoots(cwd: string): string[] {
  const user = join(getURConfigHomeDir(), 'skills')
  const project = getProjectDirsUpToHome('skills', cwd)
  return [user, ...project]
}

function notFound(name: string, available: string[]): { type: 'text'; value: string } {
  const hint = available.length > 0 ? `\nAvailable: ${available.join(', ')}` : ''
  return {
    type: 'text',
    value: `Skill not found: ${name}${hint}\nCreate one: ur skill init ${name}`,
  }
}

async function findSkill(cwd: string, name: string): Promise<SkillDirectoryInfo | null> {
  const roots = getSkillRoots(cwd)
  for (const root of roots) {
    const info = loadSkillDir(root, name)
    if (info) return info
  }
  return null
}

export const call: LocalCommandCall = async (args: string) => {
  const cwd = getCwd()
  const tokens = parseArguments(args)
  const json = tokens.includes('--json')
  const dryRun = tokens.includes('--dry-run')
  const positional = tokens.filter(token => !token.startsWith('--'))
  const command = positional[0] ?? 'list'
  const name = positional[1]
  const rest = positional.slice(2).join(' ')

  if (command === 'list') {
    const roots = getSkillRoots(cwd)
    const all = loadAllSkillDirs(roots)
    if (json) {
      return {
        type: 'text',
        value: JSON.stringify(
          {
            skills: all.map(s => ({
              name: s.name,
              path: s.path,
              description: s.spec.description,
              steps: s.spec.steps.length,
            })),
          },
          null,
          2,
        ),
      }
    }
    if (all.length === 0) {
      return { type: 'text', value: 'No executable skills found. Create one: ur skill init <name>' }
    }
    return {
      type: 'text',
      value: `Executable skills:\n${all.map(s => `  - ${s.name}${s.spec.description ? ` — ${s.spec.description}` : ''}`).join('\n')}`,
    }
  }

  if (command === 'init') {
    if (!name) {
      return { type: 'text', value: 'Usage: ur skill init <name>' }
    }
    const projectSkills = getProjectDirsUpToHome('skills', cwd)[0] ?? join(cwd, '.ur', 'skills')
    const dir = join(projectSkills, name)
    const fs = getFsImplementation()
    try {
      const exists = await fs.stat(dir).then(() => true).catch(() => false)
      if (exists) {
        return {
          type: 'text',
          value: `Skill directory already exists: ${dir}\nUse --force to overwrite (not yet implemented).`,
        }
      }
    } catch (e) {
      if (!isFsInaccessible(e)) return { type: 'text', value: `Error checking ${dir}: ${e}` }
    }
    const result = initSkillDir(dir, name)
    return {
      type: 'text',
      value: json
        ? JSON.stringify(result, null, 2)
        : `Initialized skill "${name}" at ${result.path}\n  ${result.files.join('\n  ')}`,
    }
  }

  if (!name) {
    return { type: 'text', value: `Usage: ur skill ${command} <name> [args]` }
  }

  const available = listSkillDirs(getSkillRoots(cwd).find(r => loadSkillDir(r, name)?.name === name) ?? join(cwd, '.ur', 'skills'))
  const info = await findSkill(cwd, name)
  if (!info) return notFound(name, available)

  if (command === 'show') {
    const workflow = skillToWorkflow(info.spec, rest, {
      skillDir: info.path,
      instructionText: info.files.instructions,
    })
    const validation = validateWorkflow(workflow)
    if (json) {
      return {
        type: 'text',
        value: JSON.stringify(
          {
            skill: info.name,
            path: info.path,
            files: info.files,
            workflow,
            validation,
          },
          null,
          2,
        ),
      }
    }
    return {
      type: 'text',
      value: [
        formatSkillStatus(info),
        '',
        `Compiled workflow: ${workflow.name}`,
        workflow.description ? workflow.description : '',
        '',
        `Steps (${workflow.steps.length}):`,
        ...workflow.steps.map(s =>
          `  ${s.id}: ${s.name} (${s.agent})${s.gate ? ` [${s.gate}]` : ''}${s.checkpoint ? ' 💾' : ''}`),
        '',
        validation.valid ? 'Workflow valid.' : `Validation:\n${validation.errors.map(e => `  - ${e}`).join('\n')}`,
      ]
        .filter(line => line !== '')
        .join('\n'),
    }
  }

  if (command === 'run') {
    const workflow = skillToWorkflow(info.spec, rest, {
      skillDir: info.path,
      instructionText: info.files.instructions,
    })
    const validation = validateWorkflow(workflow)
    if (!validation.valid) {
      return {
        type: 'text',
        value: `Invalid compiled workflow:\n${validation.errors.map(e => `  - ${e}`).join('\n')}`,
      }
    }
    const skipPermissions =
      tokens.includes('--skip-permissions') ||
      tokens.includes('--dangerously-skip-permissions')
    const maxTurnsValue = Number(
      tokens[tokens.indexOf('--max-turns') + 1] ?? '30',
    )
    const result = await runWorkflowSpec(workflow, {
      cwd,
      stateName: workflow.name,
      dryRun,
      skipPermissions,
      maxTurns: Number.isFinite(maxTurnsValue) && maxTurnsValue > 0 ? maxTurnsValue : 30,
    })
    if (json) {
      return { type: 'text', value: JSON.stringify(result, null, 2) }
    }
    const header = dryRun ? '(dry run — no model calls)\n\n' : ''
    return { type: 'text', value: `${header}Skill "${name}" finished.\n${JSON.stringify(result, null, 2)}` }
  }

  return { type: 'text', value: `Unknown skill command: ${command}` }
}
