type TrendStatus = 'covered' | 'partial' | 'adapter-ready'

type TrendCoverage = {
  id: string
  name: string
  status: TrendStatus
  summary: string
  evidence: string[]
  references: string[]
  professionalNextStep: string
}

type AgentTrendReport = {
  generatedAt: string
  urVersion: string
  coverage: TrendCoverage[]
  a2aAgentCard: A2AAgentCard
  priorityRoadmap: string[]
}

type A2AAgentCardOptions = {
  baseUrl?: string
}

export type A2AAgentCard = {
  protocolVersion: string
  name: string
  description: string
  url: string
  version: string
  documentationUrl: string
  capabilities: {
    streaming: boolean
    pushNotifications: boolean
    stateTransitionHistory: boolean
  }
  defaultInputModes: string[]
  defaultOutputModes: string[]
  skills: Array<{
    id: string
    name: string
    description: string
    tags: string[]
    examples: string[]
    inputModes: string[]
    outputModes: string[]
  }>
  provider: {
    organization: string
    url: string
  }
}

const urVersion = MACRO.VERSION

const coverage: TrendCoverage[] = [
  {
    id: 'local-runtime',
    name: 'Local-first model runtime',
    status: 'covered',
    summary:
      'UR routes all model traffic through the local Ollama app, so local models and Ollama Cloud-backed models exposed by that app share one local endpoint and permission boundary.',
    evidence: [
      'fixed local Ollama endpoint',
      'OLLAMA_MODEL and UR_MODEL selection',
      'auto-routing over models advertised by the local Ollama app',
    ],
    references: ['https://docs.ollama.com/'],
    professionalNextStep:
      'Add model capability reporting for tool use, vision, context length, and multimodal readiness.',
  },
  {
    id: 'mcp',
    name: 'MCP tool ecosystem',
    status: 'covered',
    summary:
      'UR has first-class MCP configuration, registry integration, OAuth/XAA helpers, tool approval, and elicitation handling.',
    evidence: [
      'ur mcp list/get/add-json/remove',
      'src/services/mcp/*',
      'MCP tools run through the same permission and evidence path as built-in tools',
    ],
    references: ['https://modelcontextprotocol.io/docs/getting-started/intro'],
    professionalNextStep:
      'Keep server trust UX, registry metadata, and MCP security guidance current as the MCP spec evolves.',
  },
  {
    id: 'a2a',
    name: 'A2A / Agent Card interoperability',
    status: 'adapter-ready',
    summary:
      'UR now exports Agent Card metadata for discovery, while full remote A2A task serving remains an adapter layer rather than a CLI-core behavior.',
    evidence: [
      'ur a2a card',
      '/a2a-card',
      'Agent Card describes UR skills, modes, and local-first operating boundary',
    ],
    references: ['https://a2a-protocol.org/latest/specification/'],
    professionalNextStep:
      'Add a separate opt-in A2A task server when UR should accept remote agent-to-agent task execution.',
  },
  {
    id: 'durable-workflows',
    name: 'Durable workflows and checkpoints',
    status: 'partial',
    summary:
      'UR supports session resume, background tasks, cron/workflow infrastructure, file restore, and task state, but does not expose a graph-runtime API like LangGraph.',
    evidence: [
      'ur --continue / --resume',
      'background task UI and task state',
      'session restore and rewind support',
    ],
    references: ['https://docs.langchain.com/oss/python/langgraph/overview'],
    professionalNextStep:
      'Expose a documented checkpointed workflow format for repeated multi-step automations.',
  },
  {
    id: 'multi-agent',
    name: 'Multi-agent orchestration',
    status: 'covered',
    summary:
      'UR ships built-in subagents for planning, exploration, verification, and general work, plus custom agents and teammate task state.',
    evidence: [
      'src/tools/AgentTool/built-in/*',
      '/verify',
      'custom agents via --agents and .ur assets',
    ],
    references: ['https://openai.github.io/openai-agents-python/'],
    professionalNextStep:
      'Document reusable team patterns and when to use each role.',
  },
  {
    id: 'memory',
    name: 'Long-term memory',
    status: 'partial',
    summary:
      'UR has file-backed memory, research notes, team memory, forget controls, and consolidation prompts; semantic vector retrieval is not exposed as a stable user feature.',
    evidence: [
      '/remember, /forget, /memory',
      '.ur/memory/notes.jsonl',
      'team memory sync and auto-dream consolidation services',
    ],
    references: [
      'https://docs.langchain.com/oss/python/langgraph/overview',
      'https://docs.langchain.com/oss/python/langgraph/memory',
    ],
    professionalNextStep:
      'Add optional local embedding indexes with scope, retention, and deletion guarantees.',
  },
  {
    id: 'browser-computer-use',
    name: 'Browser and computer-use workflows',
    status: 'covered',
    summary:
      'UR supports browser workflows, Chrome integration, Playwright-aware tasks, read-only web search/fetch, and approval boundaries for risky browser actions.',
    evidence: [
      '/browser',
      '/chrome',
      'WebSearch and WebFetch run read-only by default while respecting deny/ask rules',
    ],
    references: ['https://platform.openai.com/docs/guides/tools-computer-use'],
    professionalNextStep:
      'Add more browser replay fixtures and screenshot assertions for release validation.',
  },
  {
    id: 'provenance',
    name: 'Source provenance and citation discipline',
    status: 'partial',
    summary:
      'UR records fetched source URLs and has research citation commands, but claim-level source ledgers are not yet enforced for every generated answer.',
    evidence: [
      'WebFetch tool results include Source URL',
      '/cite and /graph research workflows',
      '/trace exposes recent tool calls and results',
    ],
    references: [
      'https://openai.github.io/openai-agents-python/tracing/',
      'https://modelcontextprotocol.io/docs/getting-started/intro',
    ],
    professionalNextStep:
      'Add a claim-to-source ledger for web/MCP outputs and expose it through /evidence or /trace.',
  },
  {
    id: 'evals-observability',
    name: 'Evals, tracing, and observability',
    status: 'partial',
    summary:
      'UR has verifier gates, project gates, /trace, OpenTelemetry plumbing, and release checks; public benchmark suites and dashboards are still a next layer.',
    evidence: [
      'UR_VERIFIER_MODE and .ur/verify.json',
      '/trace',
      'OpenTelemetry tracing utilities',
    ],
    references: [
      'https://openai.github.io/openai-agents-python/tracing/',
      'https://openai.github.io/openai-agents-python/guardrails/',
    ],
    professionalNextStep:
      'Publish replayable agent evals for coding, research, browser, MCP, and memory workflows.',
  },
  {
    id: 'security',
    name: 'Agent security and prompt-injection resistance',
    status: 'covered',
    summary:
      'UR has permission modes, read-only validation, shell security checks, MCP trust guidance, secret scanning, and explicit untrusted-web-content guidance.',
    evidence: [
      'permission allow/ask/deny rules',
      'Bash and PowerShell static safety validation',
      'WebSearch/WebFetch prompts treat external content as untrusted evidence',
    ],
    references: [
      'https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices',
      'https://openai.github.io/openai-agents-python/guardrails/',
    ],
    professionalNextStep:
      'Continuously test web/MCP prompt-injection cases in the release suite.',
  },
  {
    id: 'identity-auth',
    name: 'Agent identity and delegated authorization',
    status: 'partial',
    summary:
      'UR has OAuth, XAA, MCP auth helpers, permissions, and local trust boundaries, but it does not yet expose portable cross-agent identity or attenuated delegation tokens for remote agent collaboration.',
    evidence: [
      'MCP OAuth and XAA helpers',
      'tool permission allow/ask/deny rules',
      'local-first execution boundary',
    ],
    references: [
      'https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization',
      'https://a2a-protocol.org/latest/specification/',
    ],
    professionalNextStep:
      'Add an opt-in identity layer only when UR gains a network-facing A2A task adapter.',
  },
  {
    id: 'multimodal',
    name: 'Multimodal workflows',
    status: 'partial',
    summary:
      'UR includes image, video, YouTube, voice, and browser workflows, but polished real-time multimodal agent UX is still provider/model dependent.',
    evidence: ['/image', '/video', '/youtube', '/voice', 'examples/images.md'],
    references: [
      'https://platform.openai.com/docs/guides/tools-computer-use',
      'https://docs.ollama.com/',
    ],
    professionalNextStep:
      'Add model-aware capability reporting so users know which multimodal modes their local Ollama setup can actually run.',
  },
]

const priorityRoadmap = [
  'Model capability report: detect local Ollama model support for tools, vision, context length, and multimodal workflows.',
  'A2A task-server adapter: opt-in HTTP/JSON-RPC process that accepts remote agent tasks without weakening local CLI permissions.',
  'Agent identity and delegation: portable auth metadata for any future network-facing A2A adapter.',
  'Checkpointed workflow format: documented graph steps, resume checkpoints, approval points, and verification gates.',
  'Semantic memory: optional local embeddings, project/user scopes, retention policy, and deletion enforcement.',
  'Claim provenance: map final-answer claims to WebSearch/WebFetch/MCP source URLs and show them in trace/evidence output.',
  'Public eval harness: replay coding, research, browser, MCP, and memory tasks with expected tool behavior and pass criteria.',
]

function normalizeBaseUrl(baseUrl: string | undefined): string | undefined {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return undefined
  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    parsed.search = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

export function buildA2AAgentCard(
  options: A2AAgentCardOptions = {},
): A2AAgentCard {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const url = baseUrl ? `${baseUrl}/a2a` : 'local-cli://ur'

  return {
    protocolVersion: '0.3.0',
    name: 'UR Agent',
    description:
      'Local-first terminal coding agent powered through the local Ollama app, with MCP tools, custom agents, browser workflows, memory, verifier gates, and permission controls.',
    url,
    version: urVersion,
    documentationUrl:
      'https://github.com/Maitham16/UR-mapek/blob/master/docs/AGENT_TRENDS.md',
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ['text/plain', 'text/markdown', 'application/json'],
    defaultOutputModes: ['text/plain', 'text/markdown', 'application/json'],
    provider: {
      organization: 'Maitham Al-rubaye',
      url: 'https://github.com/Maitham16/UR-mapek',
    },
    skills: [
      {
        id: 'coding-agent',
        name: 'Coding Agent',
        description:
          'Read, edit, test, verify, and explain code inside a local workspace with permission controls.',
        tags: ['coding', 'terminal', 'verification'],
        examples: [
          'Fix this failing test and run the relevant checks.',
          'Review the current diff for behavioral regressions.',
        ],
        inputModes: ['text/plain', 'text/markdown'],
        outputModes: ['text/plain', 'text/markdown'],
      },
      {
        id: 'research-agent',
        name: 'Research Agent',
        description:
          'Search, fetch, summarize, cite, and organize web or document evidence with source awareness.',
        tags: ['research', 'web', 'citations'],
        examples: [
          'Compare current agent interoperability standards and cite sources.',
          'Summarize this paper and add key claims to the research graph.',
        ],
        inputModes: ['text/plain', 'text/markdown'],
        outputModes: ['text/plain', 'text/markdown', 'application/json'],
      },
      {
        id: 'mcp-agent',
        name: 'MCP Tool Agent',
        description:
          'Use configured MCP servers through UR permission checks and elicitation flows.',
        tags: ['mcp', 'tools', 'integrations'],
        examples: [
          'Use the configured MCP tools to inspect this issue.',
          'List available MCP resources for this workspace.',
        ],
        inputModes: ['text/plain', 'application/json'],
        outputModes: ['text/plain', 'application/json'],
      },
      {
        id: 'browser-agent',
        name: 'Browser Agent',
        description:
          'Use browser, Chrome, Playwright-aware, WebSearch, and WebFetch workflows with approval for risky actions.',
        tags: ['browser', 'computer-use', 'web'],
        examples: [
          'Open the local app and verify the login page renders.',
          'Search the current docs and cite the relevant source URLs.',
        ],
        inputModes: ['text/plain', 'text/markdown'],
        outputModes: ['text/plain', 'text/markdown', 'application/json'],
      },
    ],
  }
}

export function buildAgentTrendReport(
  options: A2AAgentCardOptions = {},
): AgentTrendReport {
  return {
    generatedAt: new Date().toISOString(),
    urVersion,
    coverage,
    a2aAgentCard: buildA2AAgentCard(options),
    priorityRoadmap,
  }
}

export function formatAgentTrendReport(
  report: AgentTrendReport = buildAgentTrendReport(),
): string {
  const lines = [
    `UR Agent Trend Coverage`,
    `Version: ${report.urVersion}`,
    `Generated: ${report.generatedAt}`,
    '',
    'Status: covered = shipped, partial = useful base exists, adapter-ready = discovery metadata exists and full runtime adapter is separate.',
    '',
  ]

  for (const item of report.coverage) {
    lines.push(`[${item.status}] ${item.name}`)
    lines.push(`  ${item.summary}`)
    lines.push(`  Evidence: ${item.evidence.join('; ')}`)
    lines.push(`  References: ${item.references.join(', ')}`)
    lines.push(`  Next: ${item.professionalNextStep}`)
    lines.push('')
  }

  lines.push('Priority Roadmap')
  for (const item of report.priorityRoadmap) {
    lines.push(`- ${item}`)
  }
  lines.push('')
  lines.push('A2A')
  lines.push('- Agent Card export: ur a2a card')
  lines.push('- Slash command: /a2a-card')
  lines.push('- Full remote task execution should stay opt-in because it changes UR from a local CLI into a network-facing agent service.')

  return lines.join('\n')
}

export function formatA2AAgentCard(
  options: A2AAgentCardOptions = {},
  pretty = true,
): string {
  return JSON.stringify(buildA2AAgentCard(options), null, pretty ? 2 : 0)
}
