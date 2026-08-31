import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('hp_homework', (t) => {
    t.increments('id').primary();
    t.integer('teacher_id').notNullable().references('id').inTable('hp_teachers');
    t.integer('subject_id').nullable().references('id').inTable('hp_subjects');
    t.string('title', 250).notNullable();
    t.text('description').nullable(); // rich text (HTML) from the composer
    t.date('assigned_date').notNullable();
    t.date('due_date').nullable();
    t.string('status', 20).notNullable().defaultTo('draft'); // draft | published | archived
    t.boolean('allow_submission').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(['teacher_id', 'status', 'assigned_date']);
  });

  await knex.schema.createTable('hp_homework_targets', (t) => {
    t.increments('id').primary();
    t.integer('homework_id').notNullable().references('id').inTable('hp_homework').onDelete('CASCADE');
    t.integer('class_id').notNullable().references('id').inTable('hp_classes');
    t.integer('section_id').nullable().references('id').inTable('hp_sections'); // null = whole class
    // This is the join the student feed runs on at 40k-student scale.
    t.index(['class_id', 'section_id', 'homework_id'], 'hp_homework_targets_feed_idx');
  });

  await knex.schema.createTable('hp_homework_attachments', (t) => {
    t.increments('id').primary();
    t.integer('homework_id').notNullable().references('id').inTable('hp_homework').onDelete('CASCADE');
    t.string('file_name', 255).notNullable(); // original filename, for display only
    t.string('stored_path', 500).notNullable(); // opaque path/key, never exposed to clients directly
    t.string('mime_type', 150).notNullable();
    t.bigInteger('size_bytes').notNullable();
    t.integer('uploaded_by').notNullable().references('id').inTable('hp_users');
    t.timestamp('uploaded_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('hp_homework_submissions', (t) => {
    t.increments('id').primary();
    t.integer('homework_id').notNullable().references('id').inTable('hp_homework').onDelete('CASCADE');
    t.integer('student_id').notNullable().references('id').inTable('hp_students');
    t.timestamp('submitted_at').nullable();
    t.text('note').nullable();
    t.string('status', 20).notNullable().defaultTo('pending'); // pending | submitted | late | graded
    t.decimal('grade', 5, 2).nullable();
    t.text('feedback').nullable();
    t.integer('graded_by').nullable().references('id').inTable('hp_users');
    t.timestamp('graded_at').nullable();
    t.unique(['homework_id', 'student_id']);
    t.index(['student_id', 'status']);
  });

  await knex.schema.createTable('hp_submission_attachments', (t) => {
    t.increments('id').primary();
    t.integer('submission_id').notNullable().references('id').inTable('hp_homework_submissions').onDelete('CASCADE');
    t.string('file_name', 255).notNullable();
    t.string('stored_path', 500).notNullable();
    t.string('mime_type', 150).notNullable();
    t.bigInteger('size_bytes').notNullable();
    t.timestamp('uploaded_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('hp_audit_log', (t) => {
    t.increments('id').primary();
    t.integer('actor_user_id').nullable().references('id').inTable('hp_users');
    t.string('action', 100).notNullable();
    t.string('entity_type', 50).notNullable();
    t.integer('entity_id').nullable();
    t.jsonb('payload_json').nullable();
    t.timestamp('at').notNullable().defaultTo(knex.fn.now());
    t.index(['entity_type', 'entity_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('hp_audit_log');
  await knex.schema.dropTableIfExists('hp_submission_attachments');
  await knex.schema.dropTableIfExists('hp_homework_submissions');
  await knex.schema.dropTableIfExists('hp_homework_attachments');
  await knex.schema.dropTableIfExists('hp_homework_targets');
  await knex.schema.dropTableIfExists('hp_homework');
}
