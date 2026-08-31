import type { Knex } from 'knex';

/**
 * Branch-head-owned: which teacher teaches which class/section/subject for a
 * given academic year. This is the join the whole homework flow hangs off —
 * a teacher may only post homework to classes they appear in here for, and
 * a student's feed is scoped by matching their class/section against these.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('hp_teacher_assignments', (t) => {
    t.increments('id').primary();
    t.integer('teacher_id').notNullable().references('id').inTable('hp_teachers');
    t.integer('class_id').notNullable().references('id').inTable('hp_classes');
    t.integer('section_id').nullable().references('id').inTable('hp_sections'); // null = whole class
    t.integer('subject_id').notNullable().references('id').inTable('hp_subjects');
    t.string('academic_year', 20).notNullable();
    t.integer('assigned_by').notNullable().references('id').inTable('hp_users');
    t.timestamp('assigned_at').notNullable().defaultTo(knex.fn.now());
    t.boolean('is_active').notNullable().defaultTo(true);
    t.unique(['teacher_id', 'class_id', 'section_id', 'subject_id', 'academic_year'], {
      indexName: 'hp_teacher_assignments_unique',
    });
    t.index(['class_id', 'section_id', 'academic_year', 'is_active']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('hp_teacher_assignments');
}
