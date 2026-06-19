import { expect, test } from 'bun:test'
import { getOllamaRequestTimeoutMs } from '../src/services/api/ollama.js'

test('getOllamaRequestTimeoutMs defaults to five minutes for local Ollama', () => {
  expect(getOllamaRequestTimeoutMs(undefined, {})).toBe(300_000)
})

test('getOllamaRequestTimeoutMs respects API_TIMEOUT_MS', () => {
  expect(getOllamaRequestTimeoutMs(undefined, { API_TIMEOUT_MS: '45000' })).toBe(
    45_000,
  )
})

test('getOllamaRequestTimeoutMs lets explicit request timeout win', () => {
  expect(
    getOllamaRequestTimeoutMs(
      { timeout: 12_345 },
      { API_TIMEOUT_MS: '45000' },
    ),
  ).toBe(12_345)
})

test('getOllamaRequestTimeoutMs uses shorter default for remote sessions', () => {
  expect(getOllamaRequestTimeoutMs(undefined, { UR_CODE_REMOTE: '1' })).toBe(
    120_000,
  )
})

