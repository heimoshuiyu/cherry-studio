import type { ISeeder } from '../types'
import { AgentBuiltinSeeder } from './seeders/agentBuiltinSeeder'
import { AgentIdMigrationSeeder } from './seeders/agentIdMigrationSeeder'
import { PreferenceSeeder } from './seeders/preferenceSeeder'
import { PresetProviderSeeder } from './seeders/presetProviderSeeder'
import { TranslateLanguageSeeder } from './seeders/translateLanguageSeeder'

/**
 * All seeders in execution order.
 * To add a new seeder: create an ISeeder class, add it to this array.
 * No changes to DbService needed.
 */
export const seeders: ISeeder[] = [
  new AgentBuiltinSeeder(),
  new AgentIdMigrationSeeder(),
  new PreferenceSeeder(),
  new TranslateLanguageSeeder(),
  new PresetProviderSeeder()
]
