import type { FamilyMember } from '@/types/family'

export type IdRemap = ReadonlyMap<string, string>

/** 将一个 id 按重定向表替换 */
export function remapId(id: string, remap: IdRemap): string {
  return remap.get(id) || id
}

/** 列表内的 id 全部重定向，并去重、去除空值 */
export function remapIdList(ids: string[], remap: IdRemap): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (!id) continue
    const next = remapId(id, remap)
    if (!next || seen.has(next)) continue
    seen.add(next)
    result.push(next)
  }
  return result
}

/**
 * 合并主/副档的关系字段：
 * - parentId：任一方有父节点即采用（都存在且不同时优先主档，避免把主档挂到别人名下）
 * - spouseIds / childrenIds：两边并集并去重，排除主档自身（副档可能曾与主档互为配偶）
 * - generation：取两边较小（辈分更高）的有效世代
 */
export function mergeRelationFields(primary: FamilyMember, other: FamilyMember) {
  const parentId = primary.parentId || other.parentId || ''
  const relationIds = [primary.id, other.id]
  const spouseIds = uniqExclude([...primary.spouseIds, ...other.spouseIds], relationIds)
  const childrenIds = uniqExclude([...primary.childrenIds, ...other.childrenIds], relationIds)
  const generation = Number.isFinite(primary.generation) && Number.isFinite(other.generation)
    ? Math.min(primary.generation, other.generation)
    : primary.generation || other.generation || 1
  return { parentId, spouseIds, childrenIds, generation }
}

function uniqExclude(ids: string[], excluded: string[]): string[] {
  const blocked = new Set(excluded)
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (!id || blocked.has(id) || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}
