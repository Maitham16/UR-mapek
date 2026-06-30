import { describe, expect, test } from 'bun:test'
import {
  compilePatternToWorkflow,
  getPattern,
  buildExecutionPlan,
} from '../src/services/agents/patterns.js'
import { executeWorkflow } from '../src/services/agents/executor.js'
import { makeDryRunner } from '../src/services/agents/cliStepRunner.js'

describe('parallel pattern', () => {
  test('parallel pattern exists with six stages', () => {
    const pattern = getPattern('parallel')
    expect(pattern).toBeDefined()
    expect(pattern?.stages.length).toBe(6)
    expect(pattern?.stages.map(s => s.id)).toEqual([
      'find-bugs',
      'write-patch',
      'write-tests',
      'security-review',
      'style-review',
      'synthesize',
    ])
  })

  test('compilePatternToWorkflow produces five parallel steps plus synthesizer', () => {
    const pattern = getPattern('parallel')!
    const workflow = compilePatternToWorkflow(pattern, 'fix the parser')
    expect(workflow.steps.length).toBe(6)
    const parallel = workflow.steps.filter(s => s.dependsOn?.length === 0)
    expect(parallel.length).toBe(5)
    const synth = workflow.steps.find(s => s.id === 'synthesize')
    expect(synth?.dependsOn?.sort()).toEqual(['find-bugs', 'security-review', 'style-review', 'write-patch', 'write-tests'])
  })

  test('execution plan marks independent stages parallelizable', () => {
    const pattern = getPattern('parallel')!
    const plan = buildExecutionPlan(pattern, 'fix the parser')
    const parallelSteps = plan.steps.filter(s => s.parallelizable)
    expect(parallelSteps.map(s => s.stageId).sort()).toEqual([
      'find-bugs',
      'security-review',
      'style-review',
      'write-patch',
      'write-tests',
    ])
    const synth = plan.steps.find(s => s.stageId === 'synthesize')
    expect(synth?.parallelizable).toBe(false)
  })

  test('dry-run workflow execution completes with synthesizer stage', async () => {
    const pattern = getPattern('parallel')!
    const workflow = compilePatternToWorkflow(pattern, 'fix the parser')
    workflow.name = 'parallel-test'
    const result = await executeWorkflow(workflow, {
      runStep: makeDryRunner(),
      maxConcurrency: 5,
    })
    expect(result.status).toBe('completed')
    const synth = result.steps.find(s => s.id === 'synthesize')
    expect(synth?.status).toBe('done')
  })
})
