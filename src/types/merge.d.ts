import type { FamilyMember } from '@/types/family'

/** 参与合并对比的资料字段（关系字段单独做并集处理，不在此列） */
export type MergeableField = 'gender' | 'birthDate' | 'deathDate' | 'birthPlace' | 'bio' | 'avatar'

/** 主档为空、可从另一份档案直接补齐的字段 */
export interface MergeFieldFill {
  field: MergeableField
  value: string
}

/** 两边都有值且不一致、必须人工选择的字段 */
export interface MergeFieldConflict {
  field: MergeableField
  primaryValue: string
  secondaryValue: string
}

export interface MergePreview {
  primary: FamilyMember
  secondary: FamilyMember
  fills: MergeFieldFill[]
  conflicts: MergeFieldConflict[]
}

/** 用户对每个冲突字段的选择：保留主档还是另一份的值 */
export type MergeResolutions = Partial<Record<MergeableField, 'primary' | 'secondary'>>
