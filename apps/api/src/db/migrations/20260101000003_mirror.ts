import type { Knex } from 'knex';

/**
 * Mirror of the school's source data (branches/classes/sections/subjects/
 * teachers/students), synced in from whatever DB the admin mapped in setup.
 * Every row keeps `source_key` = the source system's primary key as text, so
 * the sync service can upsert idempotently without knowing the source's
 * native ID type. Rows missing from a sync are marked inactive, never
 * deleted, so historical homework/submissions never dangle.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('hp_branches', (t) => {
    t.increments('id').primary();
    t.string('source_key', 100).notNullable().unique();
    t.string('name', 200).notNullable();
    t.string('code', 50).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('synced_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('hp_classes', (t) => {
    t.increments('id').primary();
    t.string('source_key', 100).notNullable().unique();
    t.string('name', 100).notNullable();
    t.string('grade_level', 50).nullable();
    t.integer('branch_id').nullable().references('id').inTable('hp_branches');
    t.string('academic_year', 20).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('synced_at').notNullable().defaultTo(knex.fn.now());
    t.index(['branch_id']);
  });

  await knex.schema.createTable('hp_sections', (t) => {
    t.increments('id').primary();
    t.string('source_key', 100).notNullable().unique();
    t.string('name', 50).notNullable();
    t.integer('class_id').notNullable().references('id').inTable('hp_classes');
    t.integer('branch_id').nullable().references('id').inTable('hp_branches');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('synced_at').notNullable().defaultTo(knex.fn.now());
    t.index(['class_id']);
  });

  await knex.schema.createTable('hp_subjects', (t) => {
    t.increments('id').primary();
    t.string('source_key', 100).notNullable().unique();
    t.string('name', 100).notNullable();
    t.integer('class_id').nullable().references('id').inTable('hp_classes');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('synced_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('hp_teachers', (t) => {
    t.increments('id').primary();
    t.string('source_key', 100).notNullable().unique();
    t.string('full_name', 200).notNullable();
    t.string('email', 200).nullable();
    t.string('employee_code', 50).nullable();
    t.integer('branch_id').nullable().references('id').inTable('hp_branches');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('synced_at').notNullable().defaultTo(knex.fn.now());
    t.index(['branch_id']);
  });

  await knex.schema.createTable('hp_students', (t) => {
    t.increments('id').primary();
    t.string('source_key', 100).notNullable().unique();
    t.string('full_name', 200).notNullable();
    t.string('roll_no', 50).nullable();
    t.integer('class_id').nullable().references('id').inTable('hp_classes');
    t.integer('section_id').nullable().references('id').inTable('hp_sections');
    t.integer('branch_id').nullable().references('id').inTable('hp_branches');
    t.string('email', 200).nullable();
    t.string('parent_phone', 30).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('synced_at').notNullable().defaultTo(knex.fn.now());
    // The lookup path for the homework feed at 40k-student scale.
    t.index(['class_id', 'section_id', 'is_active']);
  });

  await knex.schema.createTable('hp_enrollments', (t) => {
    t.increments('id').primary();
    t.integer('student_id').notNullable().references('id').inTable('hp_students').onDelete('CASCADE');
    t.integer('class_id').notNullable().references('id').inTable('hp_classes');
    t.integer('section_id').nullable().references('id').inTable('hp_sections');
    t.string('academic_year', 20).nullable();
    t.timestamp('synced_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['student_id', 'class_id', 'academic_year']);
  });

  await knex.schema.createTable('hp_sync_runs', (t) => {
    t.increments('id').primary();
    t.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('finished_at').nullable();
    t.string('status', 20).notNullable().defaultTo('running'); // running | success | failed
    t.integer('rows_inserted').notNullable().defaultTo(0);
    t.integer('rows_updated').notNullable().defaultTo(0);
    t.integer('rows_deactivated').notNullable().defaultTo(0);
    t.text('error_log').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('hp_sync_runs');
  await knex.schema.dropTableIfExists('hp_enrollments');
  await knex.schema.dropTableIfExists('hp_students');
  await knex.schema.dropTableIfExists('hp_teachers');
  await knex.schema.dropTableIfExists('hp_subjects');
  await knex.schema.dropTableIfExists('hp_sections');
  await knex.schema.dropTableIfExists('hp_classes');
  await knex.schema.dropTableIfExists('hp_branches');
}
