import type { LocalCommandCall } from '../../types/command.js'
import { parseArguments } from '../../utils/argumentSubstitution.js'
import { getCwd } from '../../utils/cwd.js'
import {
  appendTaskMemory,
  architectureSummaryPath,
  compressTaskMemory,
  compressedContextPath,
  contextStatus,
  type TaskMemoryKind,
  projectManifestPath,
  writeProjectContextManifest,
} from '../../services/context/projectContextManifest.js'

const MEMORY_KINDS: TaskMemoryKind[] = [
  'decision',
  'constraint',
  'command',
  'diff',
  'note',
]

function usage(): string {
  return [
    'Usage:',
    '  ur context-pack scan [--json]',
    '  ur context-pack remember --type decision --text "Use Bun scripts"',
    '  ur context-pack remember --decision "Use AST rename for exported symbols"',
    '  ur context-pack compress [--json]',
    '  ur context-pack status',
  ].join('\n')
}

function option(tokens: string[], name: string): string | undefined {
  const index = tokens.indexOf(name)
  return index === -1 ? undefined : tokens[index + 1]
}

function positionals(tokens: string[]): string[] {
  const flagsWithValue = new Set([
    '--type',
    '--text',
    '--decision',
    '--constraint',
    '--command',
    '--diff',
    '--note',
  ])
  const values: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (flagsWithValue.has(token)) {
      i++
      continue
    }
    if (token.startsWith('--')) continue
    values.push(token)
  }
  return values
}

function rememberInput(tokens: string[]): { kind: TaskMemoryKind; text: string } | null {
  for (const kind of MEMORY_KINDS) {
    const value = option(tokens, `--${kind}`)
    if (value) return { kind, text: value }
  }
  const kind = option(tokens, '--type') as TaskMemoryKind | undefined
  const text = option(tokens, '--text')
  if (!kind || !text || !MEMORY_KINDS.includes(kind)) return null
  return { kind, text }
}

export const call: LocalCommandCall = async (args: string) => {
  const tokens = parseArguments(args)
  const json = tokens.includes('--json')
  const action = positionals(tokens)[0] ?? 'scan'
  const cwd = getCwd()

  if (action === 'scan') {
    const manifest = writeProjectContextManifest(cwd)
    const result = {
      manifest: projectManifestPath(cwd),
      architecture: architectureSummaryPath(cwd),
      project: manifest.project.name,
      commands: manifest.commands,
      manifests: manifest.manifests,
    }
    return {
      type: 'text',
      value: json
        ? JSON.stringify(result, null, 2)
        : [
            `Wrote ${result.manifest}`,
            `Wrote ${result.architecture}`,
            `Project: ${result.project}`,
            `Commands: ${Object.values(result.commands).flat().length}`,
          ].join('\n'),
    }
  }

  if (action === 'remember') {
    const input = rememberInput(tokens)
    if (!input) return { type: 'text', value: usage() }
    const entry = appendTaskMemory(cwd, input.kind, input.text)
    return {
      type: 'text',
      value: json
        ? JSON.stringify(entry, null, 2)
        : `Recorded ${entry.kind}: ${entry.text}`,
    }
  }

  if (action === 'compress') {
    const body = compressTaskMemory(cwd)
    return {
      type: 'text',
      value: json
        ? JSON.stringify({ path: compressedContextPath(cwd), bytes: body.length }, null, 2)
        : `Wrote ${compressedContextPath(cwd)}`,
    }
  }

  if (action === 'status') {
    return { type: 'text', value: contextStatus(cwd) }
  }

  return { type: 'text', value: usage() }
}
