import { agentTable } from '@data/db/schemas/agent'
import { agentSessionTable } from '@data/db/schemas/agentSession'
import { AgentBuiltinSeeder } from '@data/db/seeding/seeders/agentBuiltinSeeder'
import {
  CHERRY_CLAW_BUILTIN_NAME,
  CHERRY_CLAW_OLD_AGENT_ID
} from '@main/services/agents/services/builtin/BuiltinAgentIds'
import { setupTestDatabase } from '@test-helpers/db'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

function baseAgent(overrides: Partial<typeof agentTable.$inferInsert>): typeof agentTable.$inferInsert {
  return {
    id: 'agent_test',
    type: 'claude-code',
    name: 'Test Agent',
    model: 'claude-3-5-sonnet',
    sortOrder: 0,
    ...overrides
  }
}

describe('AgentBuiltinSeeder', () => {
  const dbh = setupTestDatabase()

  it('migrates old builtin IDs to UUIDs, marks rows builtin, and preserves child FKs', async () => {
    await dbh.db.insert(agentTable).values(baseAgent({ id: CHERRY_CLAW_OLD_AGENT_ID, name: 'Renamed Claw' }))
    await dbh.db.insert(agentSessionTable).values({
      id: 'session_test_001',
      agentId: CHERRY_CLAW_OLD_AGENT_ID,
      agentType: 'claude-code',
      name: 'Session',
      model: 'claude-3-5-sonnet',
      sortOrder: 0
    })

    await new AgentBuiltinSeeder().run(dbh.db)

    const [agent] = await dbh.db.select().from(agentTable).where(eq(agentTable.name, CHERRY_CLAW_BUILTIN_NAME))
    expect(agent).toBeDefined()
    expect(agent.id).not.toBe(CHERRY_CLAW_OLD_AGENT_ID)
    expect(agent.isBuiltin).toBe(true)
    expect(agent.name).toBe(CHERRY_CLAW_BUILTIN_NAME)

    const [session] = await dbh.db.select().from(agentSessionTable).where(eq(agentSessionTable.id, 'session_test_001'))
    expect(session.agentId).toBe(agent.id)

    const fkViolations = await dbh.db.all(sql`PRAGMA foreign_key_check`)
    expect(fkViolations).toHaveLength(0)
  })

  it('is a no-op when no old builtin ID rows exist', async () => {
    await dbh.db.insert(agentTable).values(baseAgent({ id: '550e8400-e29b-41d4-a716-446655440000' }))

    await new AgentBuiltinSeeder().run(dbh.db)

    const rows = await dbh.db.select().from(agentTable)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(rows[0].isBuiltin).toBe(false)
  })
})
