import { agentTable } from '@data/db/schemas/agent'
import { agentChannelTable, agentChannelTaskTable } from '@data/db/schemas/agentChannel'
import { agentSessionTable } from '@data/db/schemas/agentSession'
import { agentSessionMessageTable } from '@data/db/schemas/agentSessionMessage'
import { agentSkillTable } from '@data/db/schemas/agentSkill'
import { agentTaskRunLogTable, agentTaskTable } from '@data/db/schemas/agentTask'
import type { DbType, ISeeder } from '@data/db/types'
import { eq, like, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'

export class AgentIdMigrationSeeder implements ISeeder {
  readonly name = 'agentIdMigration'
  readonly version = '1'
  readonly description = 'Migrate agent/session/task rows with old-format prefix IDs to UUID v4'

  async run(db: DbType): Promise<void> {
    const oldAgents = await db.select({ id: agentTable.id }).from(agentTable).where(like(agentTable.id, 'agent_%'))
    const oldSessions = await db
      .select({ id: agentSessionTable.id })
      .from(agentSessionTable)
      .where(like(agentSessionTable.id, 'session_%'))
    const oldTasks = await db
      .select({ id: agentTaskTable.id })
      .from(agentTaskTable)
      .where(like(agentTaskTable.id, 'task_%'))

    if (oldAgents.length === 0 && oldSessions.length === 0 && oldTasks.length === 0) return

    const agentMap = new Map(oldAgents.map((r) => [r.id, uuidv4()]))
    const sessionMap = new Map(oldSessions.map((r) => [r.id, uuidv4()]))
    const taskMap = new Map(oldTasks.map((r) => [r.id, uuidv4()]))

    const now = Date.now()

    await db.run(sql`PRAGMA foreign_keys = OFF`)
    try {
      await db.transaction(async (tx) => {
        for (const [oldId, newId] of agentMap) {
          await tx.update(agentSessionTable).set({ agentId: newId }).where(eq(agentSessionTable.agentId, oldId))
          await tx.update(agentSkillTable).set({ agentId: newId }).where(eq(agentSkillTable.agentId, oldId))
          await tx.update(agentTaskTable).set({ agentId: newId }).where(eq(agentTaskTable.agentId, oldId))
          await tx.update(agentChannelTable).set({ agentId: newId }).where(eq(agentChannelTable.agentId, oldId))
          await tx.update(agentTable).set({ id: newId, updatedAt: now }).where(eq(agentTable.id, oldId))
        }

        for (const [oldId, newId] of sessionMap) {
          await tx
            .update(agentSessionMessageTable)
            .set({ sessionId: newId })
            .where(eq(agentSessionMessageTable.sessionId, oldId))
          await tx.update(agentChannelTable).set({ sessionId: newId }).where(eq(agentChannelTable.sessionId, oldId))
          await tx
            .update(agentTaskRunLogTable)
            .set({ sessionId: newId })
            .where(eq(agentTaskRunLogTable.sessionId, oldId))
          await tx.update(agentSessionTable).set({ id: newId, updatedAt: now }).where(eq(agentSessionTable.id, oldId))
        }

        for (const [oldId, newId] of taskMap) {
          await tx.update(agentTaskRunLogTable).set({ taskId: newId }).where(eq(agentTaskRunLogTable.taskId, oldId))
          await tx.update(agentChannelTaskTable).set({ taskId: newId }).where(eq(agentChannelTaskTable.taskId, oldId))
          await tx.update(agentTaskTable).set({ id: newId, updatedAt: now }).where(eq(agentTaskTable.id, oldId))
        }
      })
    } finally {
      await db.run(sql`PRAGMA foreign_keys = ON`)
    }
  }
}
