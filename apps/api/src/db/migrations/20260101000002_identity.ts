import type { Knex } from 'knex';

/**
 * Portal-owned accounts. The portal never trusts the school ERP's own login
 * table (unknown hashing scheme, unknown schema) — every user here has their
 * own argon2id password hash, and is linked back to a mirrored entity
 * (student/teacher/branch) so role-based queries can join through it.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('hp_users', (t) => {
    t.increments('id').primary();
    t.string('login_id', 100).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('role', 20).notNullable(); // SUPER_ADMIN | BRANCH_HEAD | TEACHER | STUDENT | PARENT
    t.string('linked_entity_type', 20).nullable(); // 'teacher' | 'student' | 'branch' | null for SUPER_ADMIN
    t.integer('linked_entity_id').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.boolean('must_change_password').notNullable().defaultTo(true);
    t.timestamp('last_login_at').nullable();
    t.timestamps(true, true);
    t.index(['role']);
    t.index(['linked_entity_type', 'linked_entity_id']);
  });

  await knex.schema.createTable('hp_refresh_tokens', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('hp_users').onDelete('CASCADE');
    t.string('token_hash', 255).notNullable().unique();
    t.timestamp('expires_at').notNullable();
    t.timestamp('revoked_at').nullable();
    t.timestamps(true, true);
    t.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('hp_refresh_tokens');
  await knex.schema.dropTableIfExists('hp_users');
}
