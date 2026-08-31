import type { Knex } from 'knex';

/**
 * Configuration tables written to during the admin setup wizard:
 * - hp_setup_state: has first-run setup completed?
 * - hp_db_connections: source (school) and portal DB connection configs,
 *   with secrets stored encrypted (see src/crypto/secret-box.ts) — never plaintext.
 * - hp_entity_mappings: versioned "Power BI-style" column mapping documents.
 * - hp_storage_config: where homework file attachments live (local disk or S3).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('hp_setup_state', (t) => {
    t.increments('id').primary();
    t.boolean('completed').notNullable().defaultTo(false);
    t.timestamp('completed_at').nullable();
    t.integer('active_mapping_version').nullable();
  });
  await knex('hp_setup_state').insert({ completed: false });

  await knex.schema.createTable('hp_db_connections', (t) => {
    t.increments('id').primary();
    t.string('role', 20).notNullable(); // 'source' | 'portal'
    t.string('engine', 20).notNullable(); // 'mssql' | 'mysql' | 'postgres' | 'oracle'
    t.jsonb('config_json').notNullable(); // non-secret fields (host, db, user, schema, ssl flags)
    t.text('secret_encrypted').notNullable(); // AES-256-GCM ciphertext of the password
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('hp_entity_mappings', (t) => {
    t.increments('id').primary();
    t.integer('version').notNullable();
    t.jsonb('mapping_json').notNullable();
    t.integer('created_by').nullable();
    t.boolean('is_active').notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.unique(['version']);
  });

  await knex.schema.createTable('hp_storage_config', (t) => {
    t.increments('id').primary();
    t.string('provider', 20).notNullable(); // 'local' | 's3'
    t.jsonb('config_json').notNullable();
    t.integer('max_file_mb').notNullable().defaultTo(25);
    // Portable across pg/mysql/mssql: a JSON array of extensions rather than
    // a Postgres-only array column, since the admin can pick any engine here.
    t.jsonb('allowed_extensions').notNullable().defaultTo(
      JSON.stringify(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'zip', 'txt'])
    );
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('hp_storage_config');
  await knex.schema.dropTableIfExists('hp_entity_mappings');
  await knex.schema.dropTableIfExists('hp_db_connections');
  await knex.schema.dropTableIfExists('hp_setup_state');
}
