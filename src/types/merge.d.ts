import type { FamilyMember } from './family'

/** 参与合并比对的标量字段 */
export type MergeFieldKey =
  | 'name'
  | 'gender'
  | 'birthDate'
  | 'deathDate'
  | 'birthPlace'
  | 'bio'
  | 'avatar'

/** 字段比对结果：仅有值 / 一方为空可补齐 / 双方均有且冲突 */
export type MergeFieldStatus = 'only-a' | 'only-b' | 'same' | 'conflict'

/** 冲突解决选择：写入主档值还是副档值，未选择时为 null，禁止默认覆盖 */
export type MergeResolution = 'primary' | 'other' | null

export interface MergeFieldState {
  key: MergeFieldKey
  label: string
  status: MergeFieldStatus
  primaryValue: string
  otherValue: string
  /** 冲突字段等待用户选择；可补齐字段在确认前保持 null，执行时自动取非空值 */
  resolution: MergeResolution
}

/** 疑似重复成员分组 */
export interface DuplicateGroup {
  /** 归一化后的姓名（去空白） */
  key: string
  displayName: string
  members: FamilyMember[]
}

export interface MemberMergePreview {
  primary: FamilyMember
  other: FamilyMember
  fields: MergeFieldState[]
}

export interface MemberMergeResult {
  merged: FamilyMember
  removedId: string
  /** 关系改指向后受影响的其他成员 id */
  relationUpdatedIds: string[]
  /** 改挂到主档的故事 id */
  storyUpdatedIds: string[]
  /** 改挂到主档的照片 id */
  photoUpdatedIds: string[]
  /** 改挂到主档的遗产规划 id */
  planUpdatedIds: string[]
}
