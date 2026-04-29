import { agentTable } from '@data/db/schemas/agent'
import { agentChannelTable } from '@data/db/schemas/agentChannel'
import { agentSessionTable } from '@data/db/schemas/agentSession'
import { agentSkillTable } from '@data/db/schemas/agentSkill'
import { agentTaskTable } from '@data/db/schemas/agentTask'
import type { DbType, ISeeder } from '@data/db/types'
import {
  CHERRY_ASSISTANT_BUILTIN_NAME,
  CHERRY_ASSISTANT_OLD_AGENT_ID,
  CHERRY_CLAW_BUILTIN_NAME,
  CHERRY_CLAW_OLD_AGENT_ID
} from '@main/services/agents/services/builtin/BuiltinAgentIds'
import { eq, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'

type BuiltinAgentSeed = {
  oldId: string
  name: string
}

type BuiltinAgentMigration = BuiltinAgentSeed & {
  newId: string
}

const BUILTIN_AGENTS: BuiltinAgentSeed[] = [
  { oldId: CHERRY_CLAW_OLD_AGENT_ID, name: CHERRY_CLAW_BUILTIN_NAME },
  { oldId: CHERRY_ASSISTANT_OLD_AGENT_ID, name: CHERRY_ASSISTANT_BUILTIN_NAME }
]

export class AgentBuiltinSeeder implements ISeeder {
  readonly name = 'agentBuiltin'
  readonly version = '1'
  readonly description = 'Normalize builtin agent rows to UUID primary keys and mark them as builtin'

  async run(db: DbType): Promise<void> {
    const rowsToMigrate: BuiltinAgentMigration[] = []

    for (const builtin of BUILTIN_AGENTS) {
      const rows = await db.select().from(agentTable).where(eq(agentTable.id, builtin.oldId)).limit(1)
      if (rows[0]) {
        rowsToMigrate.push({ ...builtin, newId: uuidv4() })
      }
    }

    if (rowsToMigrate.length === 0) return

    await db.run(sql`PRAGMA foreign_keys = OFF`)
    try {
      await db.transaction(async (tx) => {
        for (const row of rowsToMigrate) {
          await tx.update(agentSessionTable).set({ agentId: row.newId }).where(eq(agentSessionTable.agentId, row.oldId))
          await tx.update(agentSkillTable).set({ agentId: row.newId }).where(eq(agentSkillTable.agentId, row.oldId))
          await tx.update(agentTaskTable).set({ agentId: row.newId }).where(eq(agentTaskTable.agentId, row.oldId))
          await tx.update(agentChannelTable).set({ agentId: row.newId }).where(eq(agentChannelTable.agentId, row.oldId))
          await tx
            .update(agentTable)
            .set({ id: row.newId, name: row.name, isBuiltin: true, updatedAt: Date.now() })
            .where(eq(agentTable.id, row.oldId))
        }
      })
    } finally {
      await db.run(sql`PRAGMA foreign_keys = ON`)
    }
  }
}
