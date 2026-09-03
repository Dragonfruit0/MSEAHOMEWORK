import type { Knex } from 'knex';

/**
 * Lets a team try the whole app (assign teachers, post homework, submit,
 * grade) against seeded demo data before they have access to — or have
 * finished mapping — the school's real database. testing_mode is cleared the
 * moment a real setup/complete (source connection + mapping + sync) runs, so
 * the admin dashboard's banner never lingers once real data is in place.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('hp_setup_state', (t) => {
    t.boolean('testing_mode').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('hp_setup_state', (t) => {
    t.dropColumn('testing_mode');
  });
}
