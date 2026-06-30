import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { detectProjectDna, formatDna } from '../../ur/projectDna.js'
import { safeParseJSON } from '../../utils/json.js'
import { safetyPolicyPath } from '../safety/projectSafety.js'

export const TASK_MEMORY_KINDS = [
  'decision',
  'constraint',
  'command',
  'diff',
  'note',
  'architecture',
  'preference',
  'attempt',
  'accepted',
  'rejected',
] as const
export type TaskMemoryKind = (typeof TASK_MEMORY_KINDS)[number]

export type TaskMemoryEntry = {
  id: string
  at: string
  kind: TaskMemoryKind
  text: string
  status?: 'proposed' | 'accepted' | 'rejected' | 'superseded'
  rationale?: string
  alternativeTo?: string
  supersedesId?: string
  scope?: 'project' | 'team' | 'personal'
  source?: string
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

function existingFilesInDir(
  cwd: string,
  dir: string,
  extensions: string[],
): string[] {
  const absoluteDir = join(cwd, dir)
  if (!existsSync(absoluteDir) || !statSync(absoluteDir).isDirectory()) return []
  return readdirSync(absoluteDir)
    .filter(file => extensions.some(extension => file.endsWith(extension)))
    .sort()
    .map(file => `${dir}/${file}`)
}

function instructionFiles(cwd: string): string[] {
  return [
    ...existing(cwd, [
      'AGENTS.md',
      'UR.md',
      'UR.local.md',
      'CLAUDE.md',
      '.cursorrules',
      '.windsurfrules',
      '.github/copilot-instructions.md',
    ]),
    ...existingFilesInDir(cwd, '.cursor/rules', ['.mdc', '.md']),
  ]
}

function manifestFiles(cwd: string): string[] {
  return [
    ...existing(cwd, [
      'package.json',
      'bun.lock',
      'bunfig.toml',
      'tsconfig.json',
      'jsconfig.json',
      'biome.json',
      'eslint.config.js',
      'pyproject.toml',
      'requirements.txt',
      'Cargo.toml',
      'go.mod',
      'Dockerfile',
      'docker-compose.yml',
      'compose.yml',
      '.editorconfig',
      '.mcp.json',
      '.ur/verify.json',
      '.ur/safety-policy.json',
      '.vscode/settings.json',
      '.zed/settings.json',
    ]),
    ...existingFilesInDir(cwd, '.github/workflows', ['.yml', '.yaml']),
  ]
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
    instructionFiles: instructionFiles(cwd),
    manifests: manifestFiles(cwd),
    commands: {
      compile: dna.buildCommands,
      test: dna.testCommands,
      lint: dna.lintCommands,
      run: dna.runCommands,
      release,
    },
    architectureRules: [
      'Prefer package scripts and project manifests before inventing commands.',
      'Treat AGENTS.md, UR.md, Cursor rules, and other agent instruction files as shared architecture instructions when present.',
      'Use .ur/verify.json and .ur/safety-policy.json as executable project constraints.',
      'Use MCP, editor, package-manager, workflow, and language manifests to infer architecture rules and available commands.',
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
  meta?: Omit<Partial<TaskMemoryEntry>, 'id' | 'at' | 'kind' | 'text'>,
): TaskMemoryEntry {
  const entry: TaskMemoryEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at: new Date().toISOString(),
    kind,
    text,
    status: meta?.status,
    rationale: meta?.rationale,
    alternativeTo: meta?.alternativeTo,
    supersedesId: meta?.supersedesId,
    scope: meta?.scope,
    source: meta?.source,
  }
  mkdirSync(dirname(taskMemoryPath(cwd)), { recursive: true })
  writeFileSync(taskMemoryPath(cwd), `${JSON.stringify(entry)}\n`, { flag: 'a' })
  return entry
}

export function appendProjectMemory(
  cwd: string,
  kind: TaskMemoryKind,
  text: string,
  meta?: Omit<Partial<TaskMemoryEntry>, 'id' | 'at' | 'kind' | 'text'>,
): TaskMemoryEntry {
  return appendTaskMemory(cwd, kind, text, meta)
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

export function readProjectMemoryByKind(
  cwd: string,
  kinds: TaskMemoryKind[],
): TaskMemoryEntry[] {
  return readTaskMemory(cwd).filter(entry => kinds.includes(entry.kind))
}

export function compressTaskMemory(cwd: string): string {
  const entries = readTaskMemory(cwd)
  const allKinds = TASK_MEMORY_KINDS
  const byKind = new Map<TaskMemoryKind, TaskMemoryEntry[]>()
  for (const kind of allKinds) {
    byKind.set(kind, entries.filter(entry => entry.kind === kind))
  }
  const lines = [
    '# Compressed Task Context',
    '',
    `Entries: ${entries.length}`,
    `Updated: ${new Date().toISOString()}`,
  ]
  for (const kind of allKinds) {
    lines.push('', `## ${kind[0]!.toUpperCase()}${kind.slice(1)}s`)
    const group = byKind.get(kind) ?? []
    if (group.length === 0) {
      lines.push('- none')
      continue
    }
    for (const entry of group.slice(-50)) {
      const meta = [
        entry.status ? `status=${entry.status}` : '',
        entry.scope ? `scope=${entry.scope}` : '',
        entry.source ? `source=${entry.source}` : '',
        entry.rationale ? `rationale=${entry.rationale}` : '',
      ]
        .filter(Boolean)
        .join(', ')
      lines.push(`- ${entry.at}: ${entry.text}${meta ? ` (${meta})` : ''}`)
    }
  }
  const body = `${lines.join('\n')}\n`
  mkdirSync(dirname(compressedContextPath(cwd)), { recursive: true })
  writeFileSync(compressedContextPath(cwd), body)
  return body
}

export function compressProjectMemory(cwd: string): string {
  return compressTaskMemory(cwd)
}

export function getProjectMemorySummary(
  cwd: string,
  maxPerKind = 10,
): string {
  const entries = readTaskMemory(cwd)
  const lines = ['# Project Memory Summary', '']
  for (const kind of TASK_MEMORY_KINDS) {
    const group = entries.filter(e => e.kind === kind).slice(-maxPerKind)
    if (group.length === 0) continue
    lines.push(`## ${kind[0]!.toUpperCase()}${kind.slice(1)}s`)
    for (const entry of group) {
      lines.push(`- ${entry.text}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
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
