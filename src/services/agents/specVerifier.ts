/**
 * Spec verifier — a strict, evidence-driven verification stage for spec-driven
 * development. This is the first concrete kernel role: verifier must be
 * stricter than the generator and require compile/test/lint/diff/runtime proof
 * before any PASS claim.
 *
 * The flow is intentionally simple so a future AgentKernel can call it as a
 * stage without change:
 *   1. Deterministic project gates from .ur/verify.json (cheap, fast fail).
 *   2. Deep verification subagent (read-only, adversarial, evidence-based).
 *   3. Persisted record + human-readable verification.md.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileNoThrowWithCwd } from '../../utils/execFileNoThrow.js'
import { safeParseJSON } from '../../utils/json.js'
import { extractVerdict } from './cliStepRunner.js'
import {
  defaultHeadlessRunner,
  makeDryHeadlessRunner,
  type HeadlessRunner,
} from './headlessAgent.js'
import type { AgentKernel } from './kernel.js'
import type { SpecMeta, SpecTask } from './spec.js'
import { loadVerifyConfig, runGateCommands } from '../verifier/projectGates.js'
import type { Verdict } from './executor.js'

export type SpecVerifyRecord = {
  version: 1
  verdict: Verdict
  summary: string
  commandFailures: number
  generatedAt: string
}

export type GateResult =
  | { ok: true; command: string; ranCommands: number }
  | { ok: false; command: string; exitCode: number | null; stdout: string; stderr: string }

export type SpecVerifyEvidence = {
  spec: SpecMeta
  requirements: string
  design: string
  tasks: SpecTask[]
  changedFiles: string[]
  diff: string
  priorVerifications: SpecVerifyRecord[]
}

export type SpecVerifyResult = {
  verdict: Verdict
  summary: string
  commandFailures: number
  gateResults: GateResult[]
  subagentOutput: string
  generatedAt: string
}

export type SpecVerifyOptions = {
  runner?: HeadlessRunner
  skipPermissions?: boolean
  maxTurns?: number
  dryRun?: boolean
  kernel?: AgentKernel
}

const RECORD_FILE = 'verification.json'
const REPORT_FILE = 'verification.md'
const MAX_DIFF_CHARS = 12_000

function recordPath(cwd: string, name: string): string {
  return join(cwd, '.ur', 'specs', name, RECORD_FILE)
}

function reportPath(cwd: string, name: string): string {
  return join(cwd, '.ur', 'specs', name, REPORT_FILE)
}

export function loadVerificationRecord(cwd: string, name: string): SpecVerifyRecord | null {
  const path = recordPath(cwd, name)
  if (!existsSync(path)) return null
  const parsed = safeParseJSON(readFileSync(path, 'utf-8'), false)
  if (!parsed || typeof parsed !== 'object') return null
  return parsed as SpecVerifyRecord
}

export function listVerificationRecords(cwd: string, name: string): SpecVerifyRecord[] {
  const records: SpecVerifyRecord[] = []
  let current = loadVerificationRecord(cwd, name)
  // Future: append-only log. For now, one current record.
  if (current) records.push(current)
  return records
}

export function saveVerificationRecord(cwd: string, name: string, record: SpecVerifyRecord): void {
  const path = recordPath(cwd, name)
  mkdirSync(join(cwd, '.ur', 'specs', name), { recursive: true })
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`)
}

export function writeVerificationReport(
  cwd: string,
  name: string,
  result: SpecVerifyResult,
): void {
  const lines = [
    `# Verification: ${name}`,
    '',
    `- Verdict: **${result.verdict}**`,
    `- Generated: ${result.generatedAt}`,
    `- Command failures: ${result.commandFailures}`,
    '',
    '## Summary',
    '',
    result.summary,
    '',
    '## Gate results',
    '',
    ...result.gateResults.map(g =>
      g.ok
        ? `- ✓ \`${g.command}\` passed`
        : `- ✗ \`${g.command}\` failed (exit ${(g as GateResult & { ok: false }).exitCode ?? 'killed'})`,
    ),
    '',
    '## Subagent output',
    '',
    '```',
    result.subagentOutput,
    '```',
    '',
  ]
  writeFileSync(reportPath(cwd, name), lines.join('\n'))
}

async function captureDiff(cwd: string): Promise<{ diff: string; changedFiles: string[] }> {
  const result = await execFileNoThrowWithCwd(
    'git',
    ['diff', 'HEAD', '--stat'],
    { cwd, preserveOutputOnError: true },
  )
  const statLines = result.stdout.trim().split('\n').filter(Boolean)
  const changedFiles = statLines
    .slice(0, -1) // last line is summary
    .map(line => line.split('|')[0]?.trim())
    .filter(Boolean)

  const diffResult = await execFileNoThrowWithCwd(
    'git',
    ['diff', 'HEAD'],
    { cwd, preserveOutputOnError: true },
  )
  const diff = diffResult.stdout.slice(0, MAX_DIFF_CHARS)
  return { diff, changedFiles }
}

export function buildVerifierPrompt(evidence: SpecVerifyEvidence): string {
  const incompleteTasks = evidence.tasks.filter(t => !t.done).map(t => `- ${t.id}: ${t.title}`).join('\n') || 'None (all tasks marked done)'
  const prior = evidence.priorVerifications
    .map(r => `- ${r.generatedAt}: ${r.verdict} — ${r.summary}`)
    .join('\n') || 'No prior verifications.'

  return [
    'You are verifying the implementation of a specced feature.',
    '',
    '=== CRITICAL ===',
    'You are STRICTLY PROHIBITED from modifying the project. Read, run commands, and inspect only.',
    'You must be stricter than the implementer. No proof = no PASS.',
    '',
    '=== REQUIRED PROOFS ===',
    'Before PASS, confirm ALL of the following with command-run evidence:',
    '1. Compile proof: the project builds (e.g., tsc --noEmit, build script).',
    '2. Test proof: the relevant test suite passes.',
    '3. Lint proof: configured linters/type-checkers pass.',
    '4. Diff proof: the changed files match the spec and do not include unrelated edits.',
    '5. Runtime proof: the feature behaves as required (run the code / hit the endpoint / exercise the CLI).',
    '',
    '=== SPEC ===',
    `Goal: ${evidence.spec.goal}`,
    '',
    'Requirements:',
    evidence.requirements || '(none written)',
    '',
    'Design:',
    evidence.design || '(none written)',
    '',
    'Tasks:',
    evidence.tasks.map(t => `- [${t.done ? 'x' : ' '}] ${t.id}: ${t.title}`).join('\n'),
    '',
    'Incomplete tasks at time of verification:',
    incompleteTasks,
    '',
    'Changed files:',
    evidence.changedFiles.length ? evidence.changedFiles.map(f => `- ${f}`).join('\n') : '(none detected)',
    '',
    'Diff preview:',
    '```diff',
    evidence.diff || '(no diff)',
    '```',
    '',
    'Prior verifications:',
    prior,
    '',
    '=== OUTPUT FORMAT ===',
    'Each check MUST include the exact command you ran and the observed output.',
    'End with exactly one line: VERDICT: PASS, VERDICT: FAIL, or VERDICT: PARTIAL.',
    'Use PARTIAL only for missing tools or environment, never for uncertainty.',
  ].join('\n')
}

async function runDeterministicGates(cwd: string): Promise<{ results: GateResult[]; failed: boolean }> {
  const config = await loadVerifyConfig(cwd)
  const results: GateResult[] = []
  if (!config) return { results, failed: false }

  const commands = config.afterEdit?.length ? config.afterEdit : []
  if (commands.length === 0) return { results, failed: false }

  const gate = await runGateCommands(commands, cwd, config.timeoutMs)
  if (gate.ok) {
    results.push({ ok: true, command: commands.join(' && '), ranCommands: gate.ranCommands })
    return { results, failed: false }
  }
  const failed = gate as Extract<typeof gate, { ok: false }>
  results.push({
    ok: false,
    command: failed.command,
    exitCode: failed.exitCode,
    stdout: failed.stdout,
    stderr: failed.stderr,
  })
  return { results, failed: true }
}

function countCommandFailures(output: string): number {
  const markers = ['[ERROR]', 'Command failed', 'exit code 1', 'Error:', 'FAILED']
  let count = 0
  const lower = output.toLowerCase()
  for (const marker of markers) {
    const re = new RegExp(marker.replace(/\[/g, '\\[').replace(/\]/g, '\\]').toLowerCase(), 'g')
    const matches = lower.match(re)
    if (matches) count += matches.length
  }
  return count
}

export async function runSpecVerification(
  cwd: string,
  name: string,
  options: SpecVerifyOptions = {},
): Promise<SpecVerifyResult> {
  // Kernel path: orchestrate through AgentKernel.
  if (options.kernel) {
    const { runSpecVerifyWithKernel } = await import('./kernelSpec.js')
    return runSpecVerifyWithKernel(cwd, name, options.kernel, {
      dryRun: options.dryRun,
      maxTurns: options.maxTurns,
      skipPermissions: options.skipPermissions,
      runner: options.runner,
    })
  }

  const runner = options.runner ?? (options.dryRun ? makeDryHeadlessRunner() : defaultHeadlessRunner())

  const { readPhase, loadSpec, parseTasks } = await import('./spec.js')
  const spec = loadSpec(cwd, name)
  if (!spec) throw new Error(`Spec not found: ${name}`)

  // 1. Deterministic gates first.
  const gateRun = await runDeterministicGates(cwd)
  if (gateRun.failed) {
    const generatedAt = new Date().toISOString()
    const summary = `Verification failed at project gates: ${gateRun.results.filter(r => !r.ok).map(r => r.command).join(', ')}`
    const result: SpecVerifyResult = {
      verdict: 'FAIL',
      summary,
      commandFailures: gateRun.results.filter(r => !r.ok).length,
      gateResults: gateRun.results,
      subagentOutput: '',
      generatedAt,
    }
    const record: SpecVerifyRecord = {
      version: 1,
      verdict: 'FAIL',
      summary,
      commandFailures: result.commandFailures,
      generatedAt,
    }
    saveVerificationRecord(cwd, name, record)
    writeVerificationReport(cwd, name, result)
    return result
  }

  // 2. Gather evidence.
  const requirements = readPhase(cwd, name, 'requirements') ?? ''
  const design = readPhase(cwd, name, 'design') ?? ''
  const tasksMd = readPhase(cwd, name, 'tasks') ?? ''
  const tasks = parseTasks(tasksMd)
  const { diff, changedFiles } = await captureDiff(cwd)
  const priorVerifications = listVerificationRecords(cwd, name)

  const evidence: SpecVerifyEvidence = {
    spec,
    requirements,
    design,
    tasks,
    changedFiles,
    diff,
    priorVerifications,
  }

  // 3. Deep verification subagent.
  const prompt = buildVerifierPrompt(evidence)
  const out = await runner({
    cwd,
    prompt,
    maxTurns: options.maxTurns,
    skipPermissions: options.skipPermissions,
  })

  const verdict = extractVerdict(out.output) ?? 'PARTIAL'
  const commandFailures = countCommandFailures(out.output)
  const generatedAt = new Date().toISOString()

  const summary =
    verdict === 'PASS'
      ? 'All required proofs (compile, test, lint, diff, runtime) were demonstrated by the verifier.'
      : verdict === 'FAIL'
        ? 'The verifier found failing evidence. See subagent output for details.'
        : 'The verifier could not reach a definitive PASS/FAIL verdict.'

  const result: SpecVerifyResult = {
    verdict,
    summary,
    commandFailures,
    gateResults: gateRun.results,
    subagentOutput: out.output,
    generatedAt,
  }

  const record: SpecVerifyRecord = {
    version: 1,
    verdict,
    summary,
    commandFailures,
    generatedAt,
  }

  if (!options.dryRun) {
    saveVerificationRecord(cwd, name, record)
    writeVerificationReport(cwd, name, result)
  }

  return result
}
