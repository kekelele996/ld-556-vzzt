import type { FamilyMember } from '@/types/family'
import type { MergeFieldKey, MergeFieldState, MergeFieldStatus, MemberMergePreview } from '@/types/merge'

export const mergeFieldLabels: Record<MergeFieldKey, string> = {
  name: '姓名',
  gender: '性别',
  birthDate: '出生日期',
  deathDate: '逝世日期',
  birthPlace: '籍贯 / 出生地',
  bio: '个人简介',
  avatar: '头像'
}

export const mergeFieldKeys: MergeFieldKey[] = ['name', 'gender', 'birthDate', 'deathDate', 'birthPlace', 'bio', 'avatar']

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

/**
 * 逐字段比对主档与副档：
 * - same：两边相同（含都为空），直接保留
 * - only-*：仅一边有值，空字段从另一边自动补齐
 * - conflict：两边都有值且不同，必须等待用户显式选择
 */
export function compareField(key: MergeFieldKey, primary: FamilyMember, other: FamilyMember): MergeFieldState {
  const primaryValue = String(primary[key] ?? '')
  const otherValue = String(other[key] ?? '')
  const primaryEmpty = isEmpty(primaryValue)
  const otherEmpty = isEmpty(otherValue)

  let status: MergeFieldStatus
  if (primaryEmpty && otherEmpty) status = 'same'
  else if (primaryEmpty && !otherEmpty) status = 'only-b'
  else if (!primaryEmpty && otherEmpty) status = 'only-a'
  else status = primaryValue === otherValue ? 'same' : 'conflict'

  return { key, label: mergeFieldLabels[key], status, primaryValue, otherValue, resolution: null }
}

export function buildMergePreview(primary: FamilyMember, other: FamilyMember): MemberMergePreview {
  return {
    primary,
    other,
    fields: mergeFieldKeys.map((key) => compareField(key, primary, other))
  }
}

/** 是否仍有冲突字段未被用户选择；未解决时不允许写入 */
export function hasUnresolvedConflict(preview: MemberMergePreview): boolean {
  return preview.fields.some((field) => field.status === 'conflict' && field.resolution === null)
}

export function autoFilledFields(preview: MemberMergePreview): MergeFieldState[] {
  return preview.fields.filter((field) => field.status === 'only-a' || field.status === 'only-b')
}

export function conflictFields(preview: MemberMergePreview): MergeFieldState[] {
  return preview.fields.filter((field) => field.status === 'conflict')
}
