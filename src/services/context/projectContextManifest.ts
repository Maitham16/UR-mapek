import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { detectProjectDna, formatDna } from '../../ur/projectDna.js'
import { safeParseJSON } from '../../utils/json.js'
import { safetyPolicyPath } from '../safety/projectSafety.js'

export type TaskMemoryKind = 'decision' | 'constraint' | 'command' | 'diff' | 'note'

export type TaskMemoryEntry = {
  id: string
  at: string
  kind: TaskMemoryKind
  text: string
}

export type ProjectContextManifest = {
  version: 1
  generatedAt: string
  project: {
    name: string
    root: string
    readme: string | null
    languages: string[]
    packageManagers: string[]
    importantFolders: string[]
  }
  instructionFiles: string[]
  manifests: string[]
  commands: {
    compile: string[]
    test: string[]
    lint: string[]
    run: string[]
    release: string[]
  }
  architectureRules: string[]
  constraints: string[]
}

export function contextDir(cwd: string): string {
  return join(cwd, '.ur', 'context')
}

export function projectManifestPath(cwd: string): string {
  return join(cwd, '.ur', 'project-manifest.json')
}

export function taskMemoryPath(cwd: string): string {
  return join(contextDir(cwd), 'task-memory.jsonl')
}

export function compressedContextPath(cwd: string): string {
  return join(contextDir(cwd), 'compressed.md')
}

export function architectureSummaryPath(cwd: string): string {
  return join(contextDir(cwd), 'architecture.md')
}

function readPackage(cwd: string): Record<string, unknown> | null {
  const path = join(cwd, 'package.json')
  if (!existsSync(path)) return null
  return safeParseJSON(readFileSync(path, 'utf8'), false) as Record<string, unknown> | null
}

function existing(cwd: string, names: string[]): string[] {
  return names.filter(name => existsSync(join(cwd, name)))
}

function packageScripts(pkg: Record<string, unknown> | null, matcher: RegExp): string[] {
  const scripts = pkg?.scripts
  if (!scripts || typeof scripts !== 'object') return []
  return Object.entries(scripts as Record<string, string>)
    .filter(([name, value]) => matcher.test(name) && typeof value === 'string')
    .map(([name]) => `bun run ${name}`)
}

export function buildProjectContextManifest(cwd: string): ProjectContextManifest {
  const dna = detectProjectDna(cwd)
  const pkg = readPackage(cwd)
  const packageName = typeof pkg?.name === 'string' ? pkg.name : 'project'
  const manifestFiles = existing(cwd, [
    'package.json',
    'bunfig.toml',
    'tsconfig.json',
    '.ur/verify.json',
    '.ur/safety-policy.json',
    '.mcp.json',
  ])
  const instructionFiles = existing(cwd, ['AGENTS.md', 'UR.md', 'UR.local.md'])
  const release = packageScripts(pkg, /^(release|package|smoke|secrets|prepack)/)
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    project: {
      name: packageName,
      root: cwd,
      readme: dna.readme,
      languages: dna.languages,
      packageManagers: dna.packageManagers,
      importantFolders: dna.importantFolders,
    },
    instructionFiles,
    manifests: manifestFiles,
    commands: {
      compile: dna.buildCommands,
      test: dna.testCommands,
      lint: dna.lintCommands,
      run: dna.runCommands,
      release,
    },
    architectureRules: [
      'Prefer package scripts and project manifests before inventing commands.',
      'Treat AGENTS.md and UR.md as shared architecture instructions when present.',
      'Use .ur/verify.json and .ur/safety-policy.json as executable project constraints.',
      'Keep generated runtime state under .ur/ unless a command documents another path.',
    ],
    constraints: [
      existsSync(safetyPolicyPath(cwd))
        ? 'Project safety policy is configured.'
        : 'Default safety policy applies until .ur/safety-policy.json is written.',
      existsSync(join(cwd, '.ur', 'verify.json'))
        ? 'Project verify gates are configured.'
        : 'No project verify gate file detected.',
      'Do not expose secret-like files or environment values in command output.',
    ],
  }
}

export function writeProjectContextManifest(cwd: string): ProjectContextManifest {
  const manifest = buildProjectContextManifest(cwd)
  mkdirSync(dirname(projectManifestPath(cwd)), { recursive: true })
  writeFileSync(projectManifestPath(cwd), `${JSON.stringify(manifest, null, 2)}\n`)
  mkdirSync(contextDir(cwd), { recursive: true })
  writeFileSync(architectureSummaryPath(cwd), formatArchitectureSummary(manifest, cwd))
  return manifest
}

export function formatArchitectureSummary(
  manifest: ProjectContextManifest,
  cwd: string,
): string {
  const dna = formatDna({
    languages: manifest.project.languages,
    packageManagers: manifest.project.packageManagers,
    buildCommands: manifest.commands.compile,
    testCommands: manifest.commands.test,
    lintCommands: manifest.commands.lint,
    runCommands: manifest.commands.run,
    importantFolders: manifest.project.importantFolders,
    ignoredFolders: [],
    readme: manifest.project.readme,
    hasGit: existsSync(join(cwd, '.git')),
  })
  return [
    '# Project Architecture Context',
    '',
    `Generated: ${manifest.generatedAt}`,
    `Project: ${manifest.project.name}`,
    '',
    dna,
    '',
    '## Architecture Rules',
    ...manifest.architectureRules.map(rule => `- ${rule}`),
    '',
    '## Constraints',
    ...manifest.constraints.map(rule => `- ${rule}`),
    '',
    '## Manifests',
    ...(manifest.manifests.length
      ? manifest.manifests.map(file => `- ${file}`)
      : ['- none detected']),
    '',
  ].join('\n')
}

export function appendTaskMemory(
  cwd: string,
  kind: TaskMemoryKind,
  text: string,
): TaskMemoryEntry {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at: new Date().toISOString(),
    kind,
    text,
  }
  mkdirSync(dirname(taskMemoryPath(cwd)), { recursive: true })
  writeFileSync(taskMemoryPath(cwd), `${JSON.stringify(entry)}\n`, { flag: 'a' })
  return entry
}

export function readTaskMemory(cwd: string): TaskMemoryEntry[] {
  const path = taskMemoryPath(cwd)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => safeParseJSON(line, false))
    .filter((entry): entry is TaskMemoryEntry =>
      Boolean(
        entry &&
          typeof entry === 'object' &&
          typeof (entry as TaskMemoryEntry).kind === 'string' &&
          typeof (entry as TaskMemoryEntry).text === 'string',
      ),
    )
}

export function compressTaskMemory(cwd: string): string {
  const entries = readTaskMemory(cwd)
  const byKind = new Map<TaskMemoryKind, TaskMemoryEntry[]>()
  for (const kind of ['decision', 'constraint', 'command', 'diff', 'note'] as const) {
    byKind.set(kind, entries.filter(entry => entry.kind === kind))
  }
  const lines = [
    '# Compressed Task Context',
    '',
    `Entries: ${entries.length}`,
    `Updated: ${new Date().toISOString()}`,
  ]
  for (const kind of ['decision', 'constraint', 'command', 'diff', 'note'] as const) {
    lines.push('', `## ${kind[0]!.toUpperCase()}${kind.slice(1)}s`)
    const group = byKind.get(kind) ?? []
    if (group.length === 0) {
      lines.push('- none')
      continue
    }
    for (const entry of group.slice(-50)) {
      lines.push(`- ${entry.at}: ${entry.text}`)
    }
  }
  const body = `${lines.join('\n')}\n`
  mkdirSync(dirname(compressedContextPath(cwd)), { recursive: true })
  writeFileSync(compressedContextPath(cwd), body)
  return body
}

export function contextStatus(cwd: string): string {
  const files = [
    projectManifestPath(cwd),
    architectureSummaryPath(cwd),
    taskMemoryPath(cwd),
    compressedContextPath(cwd),
  ]
  const contextFiles = existsSync(contextDir(cwd)) ? readdirSync(contextDir(cwd)) : []
  return [
    'Project context status:',
    ...files.map(path => `  ${existsSync(path) ? 'yes' : 'no '} ${relative(cwd, path)}`),
    `  context files: ${contextFiles.length}`,
  ].join('\n')
}
