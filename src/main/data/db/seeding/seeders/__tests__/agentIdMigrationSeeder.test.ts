import { agentTable } from '@data/db/schemas/agent'
import { agentSessionTable } from '@data/db/schemas/agentSession'
import { agentSessionMessageTable } from '@data/db/schemas/agentSessionMessage'
import { agentTaskRunLogTable, agentTaskTable } from '@data/db/schemas/agentTask'
import { AgentIdMigrationSeeder } from '@data/db/seeding/seeders/agentIdMigrationSeeder'
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

function baseSession(overrides: Partial<typeof agentSessionTable.$inferInsert>): typeof agentSessionTable.$inferInsert {
  return {
    id: 'session_test_001',
    agentId: 'agent_test',
    agentType: 'claude-code',
    name: 'Test Session',
    model: 'claude-3-5-sonnet',
    sortOrder: 0,
    ...overrides
  }
}

function baseTask(overrides: Partial<typeof agentTaskTable.$inferInsert>): typeof agentTaskTable.$inferInsert {
  return {
    id: 'task_test_001',
    agentId: 'agent_test',
    name: 'Test Task',
    prompt: 'do something',
    scheduleType: 'interval',
    scheduleValue: '5m',
    status: 'active',
    ...overrides
  }
}

describe('AgentIdMigrationSeeder', () => {
  const dbh = setupTestDatabase()

  it('migrates old-format agent/session/task IDs to UUIDs and preserves child FKs', async () => {
    await dbh.db.insert(agentTable).values(baseAgent({ id: 'agent_user_001' }))
    await dbh.db.insert(agentSessionTable).values(baseSession({ id: 'session_user_001', agentId: 'agent_user_001' }))
    await dbh.db.insert(agentTaskTable).values(baseTask({ id: 'task_user_001', agentId: 'agent_user_001' }))

    await new AgentIdMigrationSeeder().run(dbh.db)

    const agents = await dbh.db.select().from(agentTable)
    expect(agents).toHaveLength(1)
    expect(agents[0].id).not.toBe('agent_user_001')
    expect(agents[0].id).toMatch(/^[0-9a-f-]{36}$/)

    const sessions = await dbh.db.select().from(agentSessionTable)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).not.toBe('session_user_001')
    expect(sessions[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(sessions[0].agentId).toBe(agents[0].id)

    const tasks = await dbh.db.select().from(agentTaskTable)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).not.toBe('task_user_001')
    expect(tasks[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(tasks[0].agentId).toBe(agents[0].id)

    const fkViolations = await dbh.db.all(sql`PRAGMA foreign_key_check`)
    expect(fkViolations).toHaveLength(0)
  })

  it('updates agentTaskRunLog.sessionId when session IDs are migrated', async () => {
    await dbh.db.insert(agentTable).values(baseAgent({ id: 'agent_log_test' }))
    await dbh.db.insert(agentSessionTable).values(baseSession({ id: 'session_log_001', agentId: 'agent_log_test' }))
    await dbh.db.insert(agentTaskTable).values(baseTask({ id: 'task_log_001', agentId: 'agent_log_test' }))
    await dbh.db.insert(agentTaskRunLogTable).values({
      taskId: 'task_log_001',
      sessionId: 'session_log_001',
      runAt: Date.now(),
      durationMs: 100,
      status: 'success'
    })

    await new AgentIdMigrationSeeder().run(dbh.db)

    const [task] = await dbh.db.select().from(agentTaskTable)
    const [log] = await dbh.db.select().from(agentTaskRunLogTable)
    expect(log.taskId).toBe(task.id)
    expect(log.sessionId).not.toBe('session_log_001')

    const fkViolations = await dbh.db.all(sql`PRAGMA foreign_key_check`)
    expect(fkViolations).toHaveLength(0)
  })

  it('updates agentSessionMessage.sessionId when session IDs are migrated', async () => {
    await dbh.db.insert(agentTable).values(baseAgent({ id: 'agent_msg_test' }))
    await dbh.db.insert(agentSessionTable).values(baseSession({ id: 'session_msg_001', agentId: 'agent_msg_test' }))
    await dbh.db.insert(agentSessionMessageTable).values({
      sessionId: 'session_msg_001',
      role: 'user',
      content: { role: 'user', content: [{ type: 'text', text: 'hello' }] } as never
    })

    await new AgentIdMigrationSeeder().run(dbh.db)

    const [session] = await dbh.db.select().from(agentSessionTable)
    const [message] = await dbh.db.select().from(agentSessionMessageTable)
    expect(message.sessionId).toBe(session.id)

    const fkViolations = await dbh.db.all(sql`PRAGMA foreign_key_check`)
    expect(fkViolations).toHaveLength(0)
  })

  it('is a no-op when no old-format IDs exist', async () => {
    const uuidAgent = '550e8400-e29b-41d4-a716-446655440001'
    await dbh.db.insert(agentTable).values(baseAgent({ id: uuidAgent }))
    await dbh.db
      .insert(agentSessionTable)
      .values(baseSession({ id: '550e8400-e29b-41d4-a716-446655440002', agentId: uuidAgent }))

    await new AgentIdMigrationSeeder().run(dbh.db)

    const [agent] = await dbh.db.select().from(agentTable).where(eq(agentTable.id, uuidAgent))
    expect(agent).toBeDefined()

    const fkViolations = await dbh.db.all(sql`PRAGMA foreign_key_check`)
    expect(fkViolations).toHaveLength(0)
  })

  it('leaves builtin rows (already UUID + isBuiltin=true) untouched', async () => {
    const builtinId = '550e8400-e29b-41d4-a716-446655440099'
    await dbh.db.insert(agentTable).values(baseAgent({ id: builtinId, isBuiltin: true, name: 'Cherry Claw' }))

    await new AgentIdMigrationSeeder().run(dbh.db)

    const [row] = await dbh.db.select().from(agentTable).where(eq(agentTable.id, builtinId))
    expect(row).toBeDefined()
    expect(row.isBuiltin).toBe(true)
  })
})
