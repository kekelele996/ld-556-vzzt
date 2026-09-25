import type { DuplicateGroup } from '@/types/merge'
import type { FamilyMember } from '@/types/family'

/** 姓名归一化：去除所有空白字符，避免因空格差异漏判 */
export function normalizeName(name: string): string {
  return (name || '').replace(/\s+/g, '')
}

/**
 * 找出疑似重复的成员。
 * 规则：姓名归一化后完全相同（导入旧家谱后同姓名、日期/籍贯不同的资料），
 * 且至少有两条记录才构成一组疑似重复。
 */
export function findDuplicateGroups(members: FamilyMember[]): DuplicateGroup[] {
  const groups = new Map<string, FamilyMember[]>()
  for (const member of members) {
    const key = normalizeName(member.name)
    if (!key) continue
    const bucket = groups.get(key)
    if (bucket) bucket.push(member)
    else groups.set(key, [member])
  }
  return [...groups.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => ({ key, displayName: bucket[0].name.trim() || key, members: bucket }))
}

/** 建立 memberId -> 同组其他成员 的索引，便于详情页直接取疑似对象 */
export function buildDuplicateIndex(groups: DuplicateGroup[]): Map<string, DuplicateGroup> {
  const index = new Map<string, DuplicateGroup>()
  for (const group of groups) {
    for (const member of group.members) index.set(member.id, group)
  }
  return index
}

/** 所有处于疑似重复组中的成员 id */
export function collectDuplicateIds(groups: DuplicateGroup[]): Set<string> {
  const ids = new Set<string>()
  for (const group of groups) for (const member of group.members) ids.add(member.id)
  return ids
}
