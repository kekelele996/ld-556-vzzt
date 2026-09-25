import type { Gender } from '@/constants/enums'
import type { FamilyMember } from '@/types/family'
import type { MergeFieldConflict, MergePreview, MergeResolutions, MergeableField } from '@/types/merge'

const MERGEABLE_FIELDS: MergeableField[] = ['gender', 'birthDate', 'deathDate', 'birthPlace', 'bio', 'avatar']

function isEmpty(value: string): boolean {
  return !value || !value.trim()
}

function assignField(target: FamilyMember, field: MergeableField, value: string) {
  switch (field) {
    case 'gender':
      target.gender = value as Gender
      break
    case 'birthDate':
      target.birthDate = value
      break
    case 'deathDate':
      target.deathDate = value
      break
    case 'birthPlace':
      target.birthPlace = value
      break
    case 'bio':
      target.bio = value
      break
    case 'avatar':
      target.avatar = value
      break
  }
}

/**
 * 生成合并预览：
 * - 主档为空的字段 → 列入 fills，合并时自动从另一份补齐；
 * - 两边都有值且不同的字段 → 列入 conflicts，必须等用户选择后才写入，不能悄悄覆盖。
 */
export function buildMergePreview(primary: FamilyMember, secondary: FamilyMember): MergePreview {
  const fills: MergePreview['fills'] = []
  const conflicts: MergeFieldConflict[] = []
  for (const field of MERGEABLE_FIELDS) {
    const primaryValue = String(primary[field] ?? '')
    const secondaryValue = String(secondary[field] ?? '')
    if (isEmpty(primaryValue) && !isEmpty(secondaryValue)) {
      fills.push({ field, value: secondaryValue })
    } else if (!isEmpty(primaryValue) && !isEmpty(secondaryValue) && primaryValue !== secondaryValue) {
      conflicts.push({ field, primaryValue, secondaryValue })
    }
  }
  return { primary, secondary, fills, conflicts }
}

/** 仍缺少用户选择的冲突字段；返回空数组表示可以安全写入 */
export function unresolvedConflicts(preview: MergePreview, resolutions: MergeResolutions): MergeFieldConflict[] {
  return preview.conflicts.filter((conflict) => !resolutions[conflict.field])
}

function unionIds(primaryIds: string[], secondaryIds: string[], selfId: string, removedId: string): string[] {
  return [...new Set([...primaryIds, ...secondaryIds])].filter((id) => id !== selfId && id !== removedId)
}

/**
 * 按预览和用户选择生成合并后的主档资料。
 * 关系字段取两边并集并剔除对被合并档案及自身的引用；parentId 优先保留主档的。
 */
export function resolveMergedProfile(primary: FamilyMember, secondary: FamilyMember, resolutions: MergeResolutions): FamilyMember {
  const preview = buildMergePreview(primary, secondary)
  if (unresolvedConflicts(preview, resolutions).length) {
    throw new Error('存在未选择的冲突字段，不能写入合并结果')
  }
  const merged: FamilyMember = { ...primary, spouseIds: [...primary.spouseIds], childrenIds: [...primary.childrenIds] }
  for (const fill of preview.fills) {
    assignField(merged, fill.field, fill.value)
  }
  for (const conflict of preview.conflicts) {
    if (resolutions[conflict.field] === 'secondary') {
      assignField(merged, conflict.field, conflict.secondaryValue)
    }
  }
  merged.spouseIds = unionIds(primary.spouseIds, secondary.spouseIds, primary.id, secondary.id)
  merged.childrenIds = unionIds(primary.childrenIds, secondary.childrenIds, primary.id, secondary.id)
  const primaryParent = primary.parentId && primary.parentId !== secondary.id ? primary.parentId : ''
  const secondaryParent = secondary.parentId && secondary.parentId !== primary.id ? secondary.parentId : ''
  merged.parentId = primaryParent || secondaryParent
  return merged
}
