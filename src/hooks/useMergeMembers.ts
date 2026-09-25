import { useFamilyStore } from '@/stores/familyStore'
import { useStoryStore } from '@/stores/storyStore'
import { usePhotoStore } from '@/stores/photoStore'
import { useLegacyStore } from '@/stores/legacyStore'
import { findDuplicatesOf } from '@/utils/duplicate-detector'
import { buildMergePreview, resolveMergedProfile, unresolvedConflicts } from '@/utils/merge-members'
import type { MergeResolutions } from '@/types/merge'

/**
 * 疑似重复档案的检测与合并编排。
 * 合并时先把主档资料写入 familyStore，再把故事、照片人物、遗产受益人全部改指向主档，
 * 每个 store 各自持久化，重新打开页面后合并结果仍然有效。
 */
export function useMergeMembers() {
  const family = useFamilyStore()
  const stories = useStoryStore()
  const photos = usePhotoStore()
  const legacy = useLegacyStore()

  function duplicatesOf(memberId: string) {
    const member = family.getById(memberId)
    return member ? findDuplicatesOf(member, family.members) : []
  }

  function previewMerge(primaryId: string, secondaryId: string) {
    const primary = family.getById(primaryId)
    const secondary = family.getById(secondaryId)
    if (!primary || !secondary) return undefined
    return buildMergePreview(primary, secondary)
  }

  async function mergeMembers(primaryId: string, secondaryId: string, resolutions: MergeResolutions) {
    const primary = family.getById(primaryId)
    const secondary = family.getById(secondaryId)
    if (!primary || !secondary) throw new Error('合并失败：成员档案不存在')
    const preview = buildMergePreview(primary, secondary)
    if (unresolvedConflicts(preview, resolutions).length) {
      throw new Error('存在未选择的冲突字段，请先逐项选择保留哪一边的值')
    }
    const mergedProfile = resolveMergedProfile(primary, secondary, resolutions)
    await family.applyMerge(primaryId, secondaryId, mergedProfile)
    await Promise.all([
      stories.reassignMember(secondaryId, primaryId),
      photos.reassignMember(secondaryId, primaryId),
      legacy.reassignMember(secondaryId, primaryId)
    ])
    return mergedProfile
  }

  return { duplicatesOf, previewMerge, mergeMembers }
}
