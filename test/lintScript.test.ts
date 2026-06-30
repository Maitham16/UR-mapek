import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectProjectQualityStack } from '../src/services/projectQuality.js'

const repoRoot = join(import.meta.dir, '..')

describe('repo lint command', () => {
  test('root package exposes a real lint script', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(pkg.scripts?.lint).toBe('node scripts/lint.mjs')
    expect(existsSync(join(repoRoot, 'scripts', 'lint.mjs'))).toBe(true)
  })

  test('quality stack detects lint as a required project phase', () => {
    const stack = detectProjectQualityStack(repoRoot)
    expect(stack.commands.map(command => `${command.phase}:${command.command}`)).toContain(
      'lint:bun run lint',
    )
    expect(stack.missingPhases).not.toContain('lint')
  })
})
