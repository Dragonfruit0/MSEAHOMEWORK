export const ROLES = ['SUPER_ADMIN', 'BRANCH_HEAD', 'TEACHER', 'STUDENT', 'PARENT'] as const;
export type Role = (typeof ROLES)[number];

export const HOMEWORK_STATUS = ['draft', 'published', 'archived'] as const;
export type HomeworkStatus = (typeof HOMEWORK_STATUS)[number];

export const SUBMISSION_STATUS = ['pending', 'submitted', 'late', 'graded'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUS)[number];

export const STORAGE_PROVIDERS = ['local', 's3'] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

export const DB_ROLES = ['source', 'portal'] as const;
export type DbRole = (typeof DB_ROLES)[number];
