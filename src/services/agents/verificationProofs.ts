import type { Verdict } from './executor.js'

export type VerificationProofKind = 'compile' | 'test' | 'lint' | 'diff' | 'runtime'

export type VerificationProofCheck = {
  ok: boolean
  present: VerificationProofKind[]
  missing: VerificationProofKind[]
}

export const REQUIRED_VERIFICATION_PROOFS: VerificationProofKind[] = [
  'compile',
  'test',
  'lint',
  'diff',
  'runtime',
]

const PROOF_PATTERNS: Record<VerificationProofKind, RegExp[]> = {
  compile: [/\bcompile proof\b/i, /\bbuild proof\b/i],
  test: [/\btest proof\b/i],
  lint: [/\blint proof\b/i],
  diff: [/\bdiff proof\b/i],
  runtime: [/\bruntime proof\b/i],
}

const COMMAND_EVIDENCE_RE = /\b(command|ran|run)\b|`[^`]+`/i
const OBSERVATION_EVIDENCE_RE = /\b(output|stdout|stderr|exit(?:ed| code)?|passed|failed|succeeded|ok|reviewed|showed)\b/i

function proofBlocks(output: string): string[] {
  const lines = output.split('\n')
  const blocks: string[] = []
  let current: string[] = []

  for (const line of lines) {
    const startsProof = REQUIRED_VERIFICATION_PROOFS.some(kind =>
      PROOF_PATTERNS[kind].some(pattern => pattern.test(line)),
    )
    if (startsProof && current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
    }
    if (startsProof || current.length > 0) {
      current.push(line)
    }
  }
  if (current.length > 0) blocks.push(current.join('\n'))
  return blocks
}

function hasProof(output: string, kind: VerificationProofKind): boolean {
  return proofBlocks(output).some(block =>
    PROOF_PATTERNS[kind].some(pattern => pattern.test(block)) &&
    COMMAND_EVIDENCE_RE.test(block) &&
    OBSERVATION_EVIDENCE_RE.test(block),
  )
}

export function evaluateVerificationProofs(output: string): VerificationProofCheck {
  const present = REQUIRED_VERIFICATION_PROOFS.filter(kind => hasProof(output, kind))
  const missing = REQUIRED_VERIFICATION_PROOFS.filter(kind => !present.includes(kind))
  return { ok: missing.length === 0, present, missing }
}

export function enforceNoPassWithoutProof(
  verdict: Verdict,
  output: string,
): { verdict: Verdict; output: string; proofCheck: VerificationProofCheck; proofFailure: boolean } {
  const proofCheck = evaluateVerificationProofs(output)
  if (verdict !== 'PASS' || proofCheck.ok) {
    return { verdict, output, proofCheck, proofFailure: false }
  }
  return {
    verdict: 'FAIL',
    output: [
      output,
      '',
      '[deterministic proof check]',
      `VERDICT: FAIL because PASS was claimed without required proof: ${proofCheck.missing.join(', ')}`,
    ].join('\n'),
    proofCheck,
    proofFailure: true,
  }
}
