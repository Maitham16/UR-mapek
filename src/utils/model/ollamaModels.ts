import type { ModelOption } from './modelOptions.js'

const OLLAMA_BASE_URL = 'http://localhost:11434'
const ollamaModelMetadataByName = new Map<string, OllamaModelMetadata>()

type OllamaModelMetadata = {
  contextLength?: number
}

type RefreshOptions = {
  timeoutMs?: number
}

export function getOllamaBaseUrl(): string {
  return OLLAMA_BASE_URL
}

export function parseOllamaModelNames(value: unknown): string[] {
  if (!value || typeof value !== 'object' || !('models' in value)) {
    return []
  }
  const models = (value as { models?: unknown }).models
  if (!Array.isArray(models)) {
    return []
  }
  const names = models.flatMap(model => {
    if (!model || typeof model !== 'object') {
      return []
    }
    const entry = model as { name?: unknown; model?: unknown }
    const name = typeof entry.name === 'string' ? entry.name : entry.model
    if (typeof name !== 'string') {
      return []
    }
    const trimmed = name.trim()
    return trimmed ? [trimmed] : []
  })
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

export async function listOllamaModelNames(
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await fetch(`${getOllamaBaseUrl()}/api/tags`, {
    signal,
  })
  if (!response.ok) {
    return []
  }
  const body = await response.json()
  cacheOllamaModelsFromTags(body)
  return parseOllamaModelNames(body)
}

export async function getOllamaModelOptions(
  signal?: AbortSignal,
): Promise<ModelOption[]> {
  const names = await listOllamaModelNames(signal)
  return names.map(name => ({
    value: name,
    label: name,
    description: 'Installed Ollama model',
  }))
}

export function mergeModelOptions(
  baseOptions: ModelOption[],
  extraOptions: ModelOption[],
): ModelOption[] {
  const result = [...baseOptions]
  const seen = new Set(result.map(option => option.value))
  for (const option of extraOptions) {
    if (!seen.has(option.value)) {
      result.push(option)
      seen.add(option.value)
    }
  }
  return result
}

export async function refreshOllamaModelMetadata(
  model: string,
  options: RefreshOptions = {},
): Promise<void> {
  const normalizedModel = model.trim()
  if (!normalizedModel) {
    return
  }

  const controller = new AbortController()
  const timeoutId =
    options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined

  try {
    const response = await fetch(`${getOllamaBaseUrl()}/api/show`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: normalizedModel }),
      signal: controller.signal,
    })
    if (!response.ok) {
      return
    }
    cacheOllamaModelMetadata(normalizedModel, await response.json())
  } catch {
    // Best-effort cache warm only. The caller still has the default context.
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

export function cacheOllamaModelsFromTags(value: unknown): void {
  if (!value || typeof value !== 'object' || !('models' in value)) {
    return
  }
  const models = (value as { models?: unknown }).models
  if (!Array.isArray(models)) {
    return
  }
  for (const model of models) {
    const names = getOllamaModelNameCandidates(model)
    if (names.length === 0) {
      continue
    }
    cacheOllamaModelMetadata(names[0]!, model, names)
  }
}

export function cacheOllamaModelMetadata(
  model: string,
  value: unknown,
  aliases = getOllamaModelNameCandidates(value),
): void {
  const names = [model, ...aliases]
    .map(name => name.trim())
    .filter(Boolean)
  if (names.length === 0) {
    return
  }

  const contextLength = parseOllamaContextLength(value)
  if (contextLength === undefined) {
    return
  }

  for (const name of names) {
    const key = normalizeOllamaModelName(name)
    const current = ollamaModelMetadataByName.get(key) ?? {}
    ollamaModelMetadataByName.set(key, {
      ...current,
      contextLength,
    })
  }
}

export function getOllamaContextLengthForModel(
  model: string,
): number | undefined {
  return ollamaModelMetadataByName.get(normalizeOllamaModelName(model))
    ?.contextLength
}

export function clearOllamaModelMetadataCacheForTests(): void {
  ollamaModelMetadataByName.clear()
}

function getOllamaModelNameCandidates(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return []
  }
  const entry = value as {
    name?: unknown
    model?: unknown
    remote_model?: unknown
  }
  const names = [entry.name, entry.model, entry.remote_model].flatMap(name =>
    typeof name === 'string' && name.trim() ? [name.trim()] : [],
  )
  return [...new Set(names)]
}

function parseOllamaContextLength(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const entry = value as {
    context_length?: unknown
    details?: { context_length?: unknown }
    model_info?: Record<string, unknown>
  }

  const direct = toPositiveInteger(entry.context_length)
  if (direct !== undefined) {
    return direct
  }

  const details = toPositiveInteger(entry.details?.context_length)
  if (details !== undefined) {
    return details
  }

  for (const [key, raw] of Object.entries(entry.model_info ?? {})) {
    if (key.endsWith('.context_length') || key === 'context_length') {
      const parsed = toPositiveInteger(raw)
      if (parsed !== undefined) {
        return parsed
      }
    }
  }

  return undefined
}

function toPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined
  }
  return Math.floor(value)
}

function normalizeOllamaModelName(model: string): string {
  return model.trim().toLowerCase()
}
