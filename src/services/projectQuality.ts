import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectProjectDna } from '../ur/projectDna.js'

export type QualityPhase = 'compile' | 'test' | 'lint'

export type QualityCommand = {
  phase: QualityPhase
  command: string
  source: string
}

export type ProjectQualityStack = {
  languages: string[]
  packageManagers: string[]
  commands: QualityCommand[]
  missingPhases: QualityPhase[]
  readme: string | null
}

const PHASES: QualityPhase[] = ['compile', 'test', 'lint']

function uniqueCommands(commands: QualityCommand[]): QualityCommand[] {
  const seen = new Set<string>()
  const out: QualityCommand[] = []
  for (const command of commands) {
    const key = `${command.phase}:${command.command}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(command)
  }
  return out
}

function readPackageScripts(cwd: string): Record<string, string> {
  try {
    const parsed = JSON.parse(
      readFileSync(join(cwd, 'package.json'), 'utf8'),
    ) as { scripts?: unknown }
    if (!parsed.scripts || typeof parsed.scripts !== 'object') return {}
    return parsed.scripts as Record<string, string>
  } catch {
    return {}
  }
}

function primaryNodePackageManager(packageManagers: string[]): string {
  for (const pm of ['bun', 'pnpm', 'yarn', 'npm']) {
    if (packageManagers.includes(pm)) return pm
  }
  return 'npm'
}

function runScript(pm: string, script: string): string {
  return pm === 'npm' ? `npm run ${script}` : `${pm} run ${script}`
}

function tscCommand(pm: string): string {
  if (pm === 'pnpm') return 'pnpm exec tsc --noEmit'
  if (pm === 'yarn') return 'yarn tsc --noEmit'
  if (pm === 'bun') return 'bun x tsc --noEmit'
  return 'npx tsc --noEmit'
}

export function detectProjectQualityStack(cwd: string): ProjectQualityStack {
  const dna = detectProjectDna(cwd)
  const commands: QualityCommand[] = []

  for (const command of dna.buildCommands) {
    commands.push({ phase: 'compile', command, source: 'project-dna build' })
  }
  for (const command of dna.testCommands) {
    commands.push({ phase: 'test', command, source: 'project-dna test' })
  }
  for (const command of dna.lintCommands) {
    commands.push({ phase: 'lint', command, source: 'project-dna lint' })
  }

  if (existsSync(join(cwd, 'package.json'))) {
    const scripts = readPackageScripts(cwd)
    const pm = primaryNodePackageManager(dna.packageManagers)
    if (!commands.some(command => command.phase === 'compile')) {
      if (typeof scripts.typecheck === 'string') {
        commands.push({
          phase: 'compile',
          command: runScript(pm, 'typecheck'),
          source: 'package.json script:typecheck',
        })
      } else if (existsSync(join(cwd, 'tsconfig.json'))) {
        commands.push({
          phase: 'compile',
          command: tscCommand(pm),
          source: 'tsconfig.json',
        })
      }
    }
    if (!commands.some(command => command.phase === 'test')) {
      if (typeof scripts.test === 'string') {
        commands.push({
          phase: 'test',
          command: runScript(pm, 'test'),
          source: 'package.json script:test',
        })
      } else if (pm === 'bun') {
        commands.push({
          phase: 'test',
          command: 'bun test',
          source: 'bun project',
        })
      }
    }
    if (!commands.some(command => command.phase === 'lint')) {
      for (const script of ['lint', 'biome', 'eslint']) {
        if (typeof scripts[script] === 'string') {
          commands.push({
            phase: 'lint',
            command: runScript(pm, script),
            source: `package.json script:${script}`,
          })
          break
        }
      }
    }
  }

  const ordered = uniqueCommands(commands).sort(
    (a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase),
  )
  return {
    languages: dna.languages,
    packageManagers: dna.packageManagers,
    commands: ordered,
    missingPhases: PHASES.filter(
      phase => !ordered.some(command => command.phase === phase),
    ),
    readme: dna.readme,
  }
}
