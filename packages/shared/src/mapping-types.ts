/**
 * Shared types describing the "Power BI-style" entity/column mapping document
 * that the admin builds during setup. This is the single source of truth for
 * how logical fields (student name, class, etc.) map onto whatever physical
 * columns exist in the school's actual database.
 *
 * IMPORTANT: values here (table names, column names) come from an admin
 * picking from an introspected allow-list in the UI, but must still be
 * re-validated against a live introspection of the source DB before being
 * used to build SQL. Never trust this document blindly. See
 * packages/mapping/src/sql-builder.ts.
 */

export type LogicalEntityName =
  | 'student'
  | 'class'
  | 'section'
  | 'teacher'
  | 'branch'
  | 'subject'
  | 'enrollment';

export type NameStrategy = 'single' | 'concat';

export interface FilterClause {
  column: string;
  op: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'IN' | 'IS NOT NULL' | 'IS NULL';
  value?: string | number | (string | number)[];
}

export interface EntityMapping {
  /** Fully-qualified source table, e.g. "dbo.TBL_STU_MST" */
  sourceTable: string;
  /** How to derive a display name when it's split across columns */
  nameStrategy?: NameStrategy;
  nameSeparator?: string;
  /** logical field name -> physical column name (or ordered list of columns for concat) */
  fields: Record<string, string | string[]>;
  /** optional row filters applied when syncing (e.g. only active rows) */
  filters?: FilterClause[];
}

export type JoinType = 'inner' | 'left';
export type Cardinality = '1:1' | '1:N' | 'N:1' | 'N:N';

export interface RelationshipMapping {
  /** "schema.table.column" */
  from: string;
  to: string;
  cardinality: Cardinality;
  joinType: JoinType;
}

export interface EntityMappingDocument {
  version: number;
  entities: Partial<Record<LogicalEntityName, EntityMapping>>;
  relationships: RelationshipMapping[];
}

export const REQUIRED_FIELDS: Record<LogicalEntityName, string[]> = {
  student: ['student_id', 'full_name', 'class_ref'],
  class: ['class_id', 'class_name'],
  section: ['section_id', 'section_name', 'class_ref'],
  teacher: ['teacher_id', 'full_name'],
  branch: ['branch_id', 'branch_name'],
  subject: ['subject_id', 'subject_name'],
  enrollment: ['student_ref', 'class_ref'],
};

export const OPTIONAL_FIELDS: Record<LogicalEntityName, string[]> = {
  student: ['roll_no', 'section_ref', 'branch_ref', 'email', 'parent_phone', 'is_active', 'photo_url'],
  class: ['grade_level', 'branch_ref', 'academic_year'],
  section: ['branch_ref'],
  teacher: ['email', 'employee_code', 'branch_ref', 'is_active'],
  branch: ['city', 'code'],
  subject: ['class_ref'],
  enrollment: ['section_ref', 'academic_year'],
};
