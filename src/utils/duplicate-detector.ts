import type { FamilyMember } from '@/types/family'

/** 姓名归一化：去掉首尾和中间空白，避免“林 建国”与“林建国”被当成两个人 */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, '')
}

/**
 * 找出与指定成员疑似重复的档案：姓名相同（归一化后）但 id 不同。
 * 导入旧家谱后同一人可能留下两份记录，日期或籍贯不一致也归入疑似。
 */
export function findDuplicatesOf(member: FamilyMember, members: FamilyMember[]): FamilyMember[] {
  const target = normalizeName(member.name)
  if (!target) return []
  return members.filter((item) => item.id !== member.id && normalizeName(item.name) === target)
}
