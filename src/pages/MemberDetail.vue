<template>
  <section v-if="member" class="detail-page">
    <div class="profile-hero">
      <MemberAvatar :member="member" size="lg" :deceased="Boolean(member.deathDate)" />
      <div>
        <p>成员档案</p>
        <h1>{{ member.name }}</h1>
        <span>{{ genderLabels[member.gender] }} · {{ lifeYears(member) }} · {{ member.birthPlace || '籍贯未知' }}</span>
      </div>
    </div>
    <n-alert v-if="duplicates.length" type="warning" title="发现疑似重复档案" class="duplicate-alert">
      <p>以下档案与「{{ member.name }}」同名，可能是导入旧家谱时留下的重复记录，故事和照片分散在两份档案上：</p>
      <div v-for="dup in duplicates" :key="dup.id" class="duplicate-row">
        <span>{{ sideSummary(dup.id) }}</span>
        <n-button size="small" type="warning" @click="openMerge(dup.id)">合并重复档案</n-button>
      </div>
    </n-alert>
    <n-grid :cols="2" :x-gap="18" :y-gap="18" responsive="screen">
      <n-gi>
        <section class="panel"><h2>个人简介</h2><p>{{ member.bio }}</p></section>
        <section class="panel"><h2>关联成员</h2><p>父母：{{ relations(member.id).parent?.name || '未记录' }}</p><p>配偶：{{ relations(member.id).spouses.map((item) => item.name).join('、') || '未记录' }}</p><p>子女：{{ relations(member.id).children.map((item) => item.name).join('、') || '未记录' }}</p></section>
      </n-gi>
      <n-gi>
        <section class="panel"><h2>家族故事</h2><TimelineView :items="storyItems" /></section>
      </n-gi>
    </n-grid>
    <section class="panel"><h2>老照片</h2><MediaGallery :items="galleryItems" /></section>
    <section class="panel"><h2>遗产规划</h2><n-list><n-list-item v-for="plan in memberPlans" :key="plan.id">{{ legacyTypeLabels[plan.type] }} · {{ plan.status }} · {{ plan.content }}</n-list-item></n-list></section>
    <n-modal v-model:show="mergeOpen" preset="card" title="合并重复档案" class="form-modal merge-modal">
      <template v-if="mergePreview">
        <h3>第一步：选定主档（合并后保留的档案）</h3>
        <n-radio-group :value="mergePrimaryId" @update:value="changePrimary">
          <n-space vertical>
            <n-radio v-for="id in mergePair" :key="id" :value="id">{{ sideSummary(id) }}</n-radio>
          </n-space>
        </n-radio-group>
        <template v-if="mergePreview.fills.length">
          <h3>自动补齐（主档为空，将采用另一份的值）</h3>
          <p v-for="fill in mergePreview.fills" :key="fill.field" class="merge-fill">{{ mergeFieldLabels[fill.field] }}：{{ formatValue(fill.field, fill.value) }}</p>
        </template>
        <template v-if="mergePreview.conflicts.length">
          <h3>待选择（两边都有值且不同，逐项选择后才会写入）</h3>
          <div v-for="conflict in mergePreview.conflicts" :key="conflict.field" class="merge-conflict">
            <p>{{ mergeFieldLabels[conflict.field] }}</p>
            <n-radio-group v-model:value="resolutions[conflict.field]">
              <n-space vertical>
                <n-radio value="primary">保留主档：{{ formatValue(conflict.field, conflict.primaryValue) }}</n-radio>
                <n-radio value="secondary">采用另一份：{{ formatValue(conflict.field, conflict.secondaryValue) }}</n-radio>
              </n-space>
            </n-radio-group>
          </div>
        </template>
        <n-alert v-else type="info">两份资料没有冲突字段，可直接合并。</n-alert>
        <p class="merge-note">合并后，另一份档案的亲属关系、家族故事、照片人物标注和遗产受益人都会改指向主档，旧编号不再保留。</p>
      </template>
      <template #footer>
        <n-space justify="end">
          <n-button @click="mergeOpen = false">取消</n-button>
          <n-button type="primary" :disabled="hasUnresolvedConflicts" :loading="merging" @click="confirmMerge">确认合并</n-button>
        </n-space>
      </template>
    </n-modal>
  </section>
  <EmptyState v-else title="成员不存在" description="请回到家谱树选择一个有效成员。" />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import MemberAvatar from '@/components/common/MemberAvatar.vue'
import TimelineView from '@/components/common/TimelineView.vue'
import MediaGallery from '@/components/common/MediaGallery.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useFamily } from '@/hooks/useFamily'
import { useStory } from '@/hooks/useStory'
import { usePhoto } from '@/hooks/usePhoto'
import { useMergeMembers } from '@/hooks/useMergeMembers'
import { useLegacyStore } from '@/stores/legacyStore'
import { Gender, genderLabels, legacyTypeLabels } from '@/constants/enums'
import { lifeYears } from '@/utils/member-status'
import { notifyError } from '@/utils/error-handler'
import type { MergeResolutions, MergeableField } from '@/types/merge'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const { hydrate, getById, relations } = useFamily()
const story = useStory()
const photo = usePhoto()
const legacy = useLegacyStore()
const merge = useMergeMembers()
const memberId = computed(() => String(route.params.id))
const member = computed(() => getById(memberId.value))
const storyItems = computed(() => story.byMember(memberId.value).map((item) => ({ id: item.id, title: item.title, description: item.content, date: item.date })))
const galleryItems = computed(() => photo.byMember(memberId.value).map((item) => ({ id: item.id, url: item.restoredUrl || item.imageUrl, caption: item.caption, year: item.year, meta: item.location })))
const memberPlans = computed(() => legacy.byMember(memberId.value))
const duplicates = computed(() => (member.value ? merge.duplicatesOf(member.value.id) : []))

const mergeFieldLabels: Record<MergeableField, string> = {
  gender: '性别',
  birthDate: '出生日期',
  deathDate: '逝世日期',
  birthPlace: '籍贯',
  bio: '个人简介',
  avatar: '头像'
}

const mergeOpen = ref(false)
const merging = ref(false)
const mergePair = ref<string[]>([])
const mergePrimaryId = ref('')
const resolutions = reactive<MergeResolutions>({})
const mergeSecondaryId = computed(() => mergePair.value.find((id) => id !== mergePrimaryId.value) || '')
const mergePreview = computed(() => (mergePrimaryId.value && mergeSecondaryId.value ? merge.previewMerge(mergePrimaryId.value, mergeSecondaryId.value) : undefined))
const hasUnresolvedConflicts = computed(() => Boolean(mergePreview.value?.conflicts.some((conflict) => !resolutions[conflict.field])))

function sideSummary(id: string) {
  const item = getById(id)
  if (!item) return ''
  const counts = `故事 ${story.byMember(id).length} · 照片 ${photo.byMember(id).length} · 规划 ${legacy.byMember(id).length}`
  return `${item.name} · ${genderLabels[item.gender]} · ${lifeYears(item)} · ${item.birthPlace || '籍贯未知'}（${counts}）`
}

function formatValue(field: MergeableField, value: string) {
  if (!value) return '（空）'
  if (field === 'gender') return genderLabels[value as Gender] || value
  if (field === 'avatar') return '已设置头像'
  return value
}

function clearResolutions() {
  for (const key of Object.keys(resolutions)) delete resolutions[key as MergeableField]
}

function openMerge(secondaryId: string) {
  mergePair.value = [memberId.value, secondaryId]
  mergePrimaryId.value = memberId.value
  clearResolutions()
  mergeOpen.value = true
}

function changePrimary(value: string) {
  // 主档互换后“主档/另一份”的含义变化，之前的选择作废，避免写错方向
  mergePrimaryId.value = value
  clearResolutions()
}

async function confirmMerge() {
  if (!mergePreview.value || hasUnresolvedConflicts.value) return
  merging.value = true
  try {
    await merge.mergeMembers(mergePrimaryId.value, mergeSecondaryId.value, { ...resolutions })
    mergeOpen.value = false
    message.success('合并完成，关系与资料已指向主档')
    if (memberId.value !== mergePrimaryId.value) {
      await router.replace(`/members/${mergePrimaryId.value}`)
    }
  } catch (error) {
    notifyError(error)
  } finally {
    merging.value = false
  }
}

onMounted(async () => {
  await Promise.all([hydrate(), story.hydrate(), photo.hydrate(), legacy.hydrate()])
})
</script>
