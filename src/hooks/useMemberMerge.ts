import { useFamilyStore } from '@/stores/familyStore'
import { useStoryStore } from '@/stores/storyStore'
import { usePhotoStore } from '@/stores/photoStore'
import { useLegacyStore } from '@/stores/legacyStore'
import type { FamilyMember } from '@/types/family'
import type { MemberMergeResult, MergeFieldKey, MergeFieldState } from '@/types/merge'
import { mergeRelationFields, remapId, remapIdList } from '@/utils/relation-remap'

/**
 * 成员合并编排：
 * 1. 按用户对冲突字段的选择 + 空字段自动补齐，生成主档最终数据；
 * 2. 关系（parent/spouse/children）全部改指向主档并删除副档；
 * 3. 故事（memberId/authorId）、照片（memberId/people/uploaderId）、
 *    遗产规划（memberId/beneficiaries）的人物引用全部改指向主档；
 * 4. 四个 store 各自持久化，旧编号不再残留。
 */
export function useMemberMerge() {
  const family = useFamilyStore()
  const storyStore = useStoryStore()
  const photoStore = usePhotoStore()
  const legacyStore = useLegacyStore()

  async function mergeMembers(
    primary: FamilyMember,
    other: FamilyMember,
    resolvedFields: MergeFieldState[]
  ): Promise<MemberMergeResult> {
    // 确保其他实体已从 DB 载入内存，避免在未 hydrate 的页面把空集合误写回
    await Promise.all([storyStore.hydrate(), photoStore.hydrate(), legacyStore.hydrate()])

    const remap = new Map<string, string>([[other.id, primary.id]])

    // 1. 生成主档最终标量字段
    const scalar = buildScalarResult(primary, other, resolvedFields)
    const relation = mergeRelationFields(primary, other)
    const merged: FamilyMember = { ...primary, ...scalar, ...relation }

    // 2. 关系改写 + 删除副档
    const relationPass = rewriteFamily(family.members, merged, other.id, remap)
    family.members = relationPass.members
    await family.persist()

    // 3a. 故事人物改指向
    const storyUpdatedIds: string[] = []
    storyStore.stories = storyStore.stories.map((story) => {
      const memberId = remapId(story.memberId, remap)
      const authorId = story.authorId ? remapId(story.authorId, remap) : story.authorId
      if (memberId === story.memberId && authorId === story.authorId) return story
      storyUpdatedIds.push(story.id)
      return { ...story, memberId, authorId }
    })
    await storyStore.persist()

    // 3b. 照片关联人物与标注人物改指向
    const photoUpdatedIds: string[] = []
    photoStore.photos = photoStore.photos.map((photo) => {
      const memberId = remapId(photo.memberId, remap)
      const uploaderId = photo.uploaderId ? remapId(photo.uploaderId, remap) : photo.uploaderId
      const people = remapIdList(photo.people, remap)
      if (memberId === photo.memberId && uploaderId === photo.uploaderId && samePeople(people, photo.people)) return photo
      photoUpdatedIds.push(photo.id)
      return { ...photo, memberId, uploaderId, people }
    })
    await photoStore.persist()

    // 3c. 遗产规划关联成员与受益人改指向（受益人去重）
    const planUpdatedIds: string[] = []
    legacyStore.plans = legacyStore.plans.map((plan) => {
      const memberId = remapId(plan.memberId, remap)
      const beneficiaries = remapIdList(plan.beneficiaries, remap)
      if (memberId === plan.memberId && samePeople(beneficiaries, plan.beneficiaries)) return plan
      planUpdatedIds.push(plan.id)
      return { ...plan, memberId, beneficiaries }
    })
    await legacyStore.persist()

    return {
      merged,
      removedId: other.id,
      relationUpdatedIds: relationPass.updatedIds,
      storyUpdatedIds,
      photoUpdatedIds,
      planUpdatedIds
    }
  }

  return { mergeMembers }
}

function buildScalarResult(
  primary: FamilyMember,
  other: FamilyMember,
  resolvedFields: MergeFieldState[]
): Partial<FamilyMember> {
  const result = {} as Record<MergeFieldKey, string>
  for (const field of resolvedFields) {
    if (field.status === 'same' || field.status === 'only-a') {
      result[field.key] = primary[field.key]
    } else if (field.status === 'only-b') {
      // 主档为空，从副档补齐
      result[field.key] = other[field.key]
    } else if (field.status === 'conflict') {
      // 两边都有值且不同：只按用户显式选择写入，绝不悄悄覆盖
      result[field.key] = field.resolution === 'other' ? other[field.key] : primary[field.key]
    }
  }
  return result as Partial<FamilyMember>
}

function rewriteFamily(members: FamilyMember[], merged: FamilyMember, removedId: string, remap: ReadonlyMap<string, string>) {
  const updatedIds: string[] = []
  const next = members
    .filter((member) => member.id !== removedId)
    .map((member) => {
      if (member.id === merged.id) return merged
      const parentId = member.parentId ? remapId(member.parentId, remap) : ''
      const spouseIds = remapIdList(member.spouseIds, remap)
      const childrenIds = remapIdList(member.childrenIds, remap)
      if (parentId === member.parentId && samePeople(spouseIds, member.spouseIds) && samePeople(childrenIds, member.childrenIds)) {
        return member
      }
      updatedIds.push(member.id)
      return { ...member, parentId, spouseIds, childrenIds }
    })
  return { members: next, updatedIds }
}

function samePeople(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}
