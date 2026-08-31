export {
  ROLES,
  HOMEWORK_STATUS,
  SUBMISSION_STATUS,
  STORAGE_PROVIDERS,
  DB_ROLES,
} from './roles';
export type { Role, HomeworkStatus, SubmissionStatus, StorageProvider, DbRole } from './roles';

export { REQUIRED_FIELDS, OPTIONAL_FIELDS } from './mapping-types';
export type {
  LogicalEntityName,
  NameStrategy,
  FilterClause,
  EntityMapping,
  JoinType,
  Cardinality,
  RelationshipMapping,
  EntityMappingDocument,
} from './mapping-types';
