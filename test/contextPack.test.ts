import { describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runWithCwdOverride } from '../src/utils/cwd.js'
import {
  appendTaskMemory,
  architectureSummaryPath,
  compressTaskMemory,
  projectManifestPath,
  writeProjectContextManifest,
} from '../src/services/context/projectContextManifest.js'

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function writeProject(dir: string): void {
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'context-pack-fixture',
      scripts: {
        typecheck: 'tsc --noEmit',
        test: 'bun test',
      },
    }),
  )
  writeFileSync(join(dir, 'bun.lock'), '')
  writeFileSync(join(dir, 'AGENTS.md'), 'Use repository scripts.\n')
  writeFileSync(join(dir, 'UR.md'), 'Keep task decisions.\n')
  writeFileSync(join(dir, 'tsconfig.json'), '{}')
}

describe('project context pack', () => {
  test('writes an architecture manifest from project files and commands', () => {
    const dir = tempDir('ur-context-manifest-')
    try {
      writeProject(dir)
      const manifest = writeProjectContextManifest(dir)
      expect(manifest.project.name).toBe('context-pack-fixture')
      expect(manifest.instructionFiles).toContain('AGENTS.md')
      expect(manifest.manifests).toContain('package.json')
      expect(manifest.commands.compile).toContain('bun run typecheck')
      expect(manifest.commands.test).toContain('bun run test')
      expect(existsSync(projectManifestPath(dir))).toBe(true)
      expect(readFileSync(architectureSummaryPath(dir), 'utf8')).toContain(
        'Architecture Rules',
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('records task memory and compresses old context by kind', () => {
    const dir = tempDir('ur-context-memory-')
    try {
      appendTaskMemory(dir, 'decision', 'Use Bun scripts for checks.')
      appendTaskMemory(dir, 'constraint', 'Do not expose secret values.')
      appendTaskMemory(dir, 'diff', 'Updated the safety policy evaluator.')
      const compressed = compressTaskMemory(dir)
      expect(compressed).toContain('## Decisions')
      expect(compressed).toContain('Use Bun scripts for checks.')
      expect(compressed).toContain('Do not expose secret values.')
      expect(compressed).toContain('Updated the safety policy evaluator.')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('context-pack command scans and remembers decisions', async () => {
    const dir = tempDir('ur-context-command-')
    try {
      writeProject(dir)
      const { call } = await import('../src/commands/context-pack/context-pack.js')
      const scan = await runWithCwdOverride(dir, () => call('scan'))
      expect(scan.type).toBe('text')
      if (scan.type !== 'text') throw new Error('expected text')
      expect(scan.value).toContain('.ur/project-manifest.json')

      const remembered = await runWithCwdOverride(dir, () =>
        call('remember --decision "Use manifest commands first"'),
      )
      expect(remembered.type).toBe('text')
      if (remembered.type !== 'text') throw new Error('expected text')
      expect(remembered.value).toContain('Recorded decision')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
