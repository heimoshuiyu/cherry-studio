import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindBuiltinAgentByName,
  mockCreateAgent,
  mockUpdateAgent,
  mockGetModels,
  mockListSessions,
  mockCreateSession,
  mockEnsureHeartbeatTask,
  mockInstallBuiltinSkills,
  mockResolveAccessiblePaths,
  mockValidateAgentModels,
  mockSeedWorkspaceTemplates,
  mockInitSkillsForAgent,
  mockProvisionBuiltinAgent
} = vi.hoisted(() => ({
  mockFindBuiltinAgentByName: vi.fn(),
  mockCreateAgent: vi.fn(),
  mockUpdateAgent: vi.fn(),
  mockGetModels: vi.fn(),
  mockListSessions: vi.fn(),
  mockCreateSession: vi.fn(),
  mockEnsureHeartbeatTask: vi.fn(),
  mockInstallBuiltinSkills: vi.fn(),
  mockResolveAccessiblePaths: vi.fn(),
  mockValidateAgentModels: vi.fn(),
  mockSeedWorkspaceTemplates: vi.fn(),
  mockInitSkillsForAgent: vi.fn(),
  mockProvisionBuiltinAgent: vi.fn()
}))

vi.mock('@main/utils/builtinSkills', () => ({
  installBuiltinSkills: mockInstallBuiltinSkills
}))

vi.mock('@data/services/AgentService', () => ({
  agentService: {
    findBuiltinAgentByName: mockFindBuiltinAgentByName,
    createAgent: mockCreateAgent,
    updateAgent: mockUpdateAgent
  }
}))

vi.mock('@data/services/AgentSessionService', () => ({
  agentSessionService: {
    listSessions: mockListSessions,
    createSession: mockCreateSession
  }
}))

vi.mock('@main/apiServer/services/models', () => ({
  modelsService: {
    getModels: mockGetModels
  }
}))

vi.mock('@main/services/agents/agentUtils', () => ({
  resolveAccessiblePaths: mockResolveAccessiblePaths,
  validateAgentModels: mockValidateAgentModels
}))

vi.mock('@main/services/agents/services/cherryclaw/seedWorkspace', () => ({
  seedWorkspaceTemplates: mockSeedWorkspaceTemplates
}))

vi.mock('@main/services/agents/skills/SkillService', () => ({
  skillService: {
    initSkillsForAgent: mockInitSkillsForAgent
  }
}))

vi.mock('../../SchedulerService', () => ({
  schedulerService: {
    ensureHeartbeatTask: mockEnsureHeartbeatTask
  }
}))

vi.mock('../BuiltinAgentProvisioner', () => ({
  provisionBuiltinAgent: mockProvisionBuiltinAgent
}))

describe('bootstrapBuiltinAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.resetModules()
    mockInstallBuiltinSkills.mockResolvedValue(undefined)
    mockListSessions.mockResolvedValue({ total: 0 })
    mockCreateSession.mockResolvedValue({ id: 'session_1' })
    mockEnsureHeartbeatTask.mockResolvedValue(undefined)
    mockResolveAccessiblePaths.mockReturnValue(['/tmp/workspace'])
    mockValidateAgentModels.mockResolvedValue(undefined)
    mockSeedWorkspaceTemplates.mockResolvedValue(undefined)
    mockInitSkillsForAgent.mockResolvedValue(undefined)
    mockProvisionBuiltinAgent.mockResolvedValue(undefined)
    mockCreateAgent.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      accessiblePaths: ['/tmp/workspace']
    })
    mockUpdateAgent.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries built-in bootstrap when no model is available yet', async () => {
    // First attempt: no model for either agent → both skip
    mockFindBuiltinAgentByName.mockResolvedValue(null)
    mockGetModels
      .mockResolvedValueOnce({ data: [] }) // CherryClaw: no model
      .mockResolvedValueOnce({ data: [] }) // CherryAssistant: no model
      .mockResolvedValueOnce({ data: [{ id: 'claude-3-5-sonnet' }] }) // CherryClaw retry: model found
      .mockResolvedValueOnce({ data: [] }) // CherryAssistant retry (if any)

    const { bootstrapBuiltinAgents } = await import('../BuiltinAgentBootstrap')

    await bootstrapBuiltinAgents()
    expect(mockCreateAgent).not.toHaveBeenCalled()
    expect(mockCreateSession).not.toHaveBeenCalled()

    // After retry delay, model is available
    await vi.advanceTimersByTimeAsync(5000)

    expect(mockCreateAgent).toHaveBeenCalledTimes(1)
    expect(mockListSessions).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', { limit: 1 })
    expect(mockCreateSession).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', {})
    expect(mockEnsureHeartbeatTask).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', 30)
  })

  it('does not retry built-in agents deleted by the user', async () => {
    // Both agents are soft-deleted
    mockFindBuiltinAgentByName.mockResolvedValue({ id: 'some-id', deletedAt: Date.now() })

    const { bootstrapBuiltinAgents } = await import('../BuiltinAgentBootstrap')

    await bootstrapBuiltinAgents()
    await vi.advanceTimersByTimeAsync(60000)

    expect(mockCreateAgent).not.toHaveBeenCalled()
    expect(mockCreateSession).not.toHaveBeenCalled()
    expect(mockEnsureHeartbeatTask).not.toHaveBeenCalled()
  })
})
