<template>
  <section v-if="member" class="detail-page">
    <n-alert v-if="duplicateCandidates.length" type="warning" class="duplicate-alert">
      <div class="duplicate-head">
        <span>
          疑似重复：发现 <strong>{{ duplicateCandidates.length }}</strong> 份与「{{ member.name }}」同名的资料，
          日期或籍贯记录不一致，故事与照片分开存放。
        </span>
        <n-button size="small" type="primary" @click="openMerge(duplicateCandidates[0])">合并资料</n-button>
      </div>
      <ul class="duplicate-list">
        <li v-for="candidate in duplicateCandidates" :key="candidate.id">
          <n-tag size="small" :bordered="false">旧档</n-tag>
          <span class="dup-name">{{ candidate.name }}（编号 {{ candidate.id }}）</span>
          <span>{{ lifeYears(candidate) }} · {{ candidate.birthPlace || '籍贯未知' }}</span>
          <n-button text size="small" type="primary" @click="openMerge(candidate)">与此份合并</n-button>
        </li>
      </ul>
    </n-alert>

    <div class="profile-hero">
      <MemberAvatar :member="member" size="lg" :deceased="Boolean(member.deathDate)" />
      <div>
        <p>成员档案</p>
        <h1>
          {{ member.name }}
          <n-tag v-if="duplicateCandidates.length" size="small" type="warning" class="dup-badge">疑似重复</n-tag>
        </h1>
        <span>{{ genderLabels[member.gender] }} · {{ lifeYears(member) }} · {{ member.birthPlace || '籍贯未知' }}</span>
      </div>
    </div>
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

    <MemberMergeDialog :show="mergeOpen" :primary="member" :other="mergeCandidate" @close="mergeOpen = false" @merged="onMerged" />
  </section>
  <EmptyState v-else title="成员不存在" description="请回到家谱树选择一个有效成员。" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import MemberAvatar from '@/components/common/MemberAvatar.vue'
import TimelineView from '@/components/common/TimelineView.vue'
import MediaGallery from '@/components/common/MediaGallery.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MemberMergeDialog from '@/components/common/MemberMergeDialog.vue'
import { useFamily } from '@/hooks/useFamily'
import { useStory } from '@/hooks/useStory'
import { usePhoto } from '@/hooks/usePhoto'
import { useLegacyStore } from '@/stores/legacyStore'
import { genderLabels, legacyTypeLabels } from '@/constants/enums'
import { lifeYears } from '@/utils/member-status'
import type { FamilyMember } from '@/types/family'

const route = useRoute()
const { hydrate, getById, duplicateGroupOf, relations } = useFamily()
const story = useStory()
const photo = usePhoto()
const legacy = useLegacyStore()
const member = computed(() => getById(String(route.params.id)))
const duplicateCandidates = computed<FamilyMember[]>(() => {
  if (!member.value) return []
  const group = duplicateGroupOf(member.value.id)
  return group ? group.members.filter((item) => item.id !== member.value!.id) : []
})
const storyItems = computed(() => story.byMember(String(route.params.id)).map((item) => ({ id: item.id, title: item.title, description: item.content, date: item.date })))
const galleryItems = computed(() => photo.byMember(String(route.params.id)).map((item) => ({ id: item.id, url: item.restoredUrl || item.imageUrl, caption: item.caption, year: item.year, meta: item.location })))
const memberPlans = computed(() => legacy.byMember(String(route.params.id)))

const mergeOpen = ref(false)
const mergeCandidate = ref<FamilyMember | undefined>(undefined)

function openMerge(candidate: FamilyMember) {
  mergeCandidate.value = candidate
  mergeOpen.value = true
}

function onMerged() {
  mergeOpen.value = false
  mergeCandidate.value = undefined
}

onMounted(async () => {
  await Promise.all([hydrate(), story.hydrate(), photo.hydrate(), legacy.hydrate()])
})
</script>

<style scoped>
.duplicate-alert {
  margin-bottom: 4px;
}

.duplicate-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.duplicate-list {
  margin: 8px 0 0;
  padding-left: 18px;
}

.duplicate-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
}

.dup-name {
  font-weight: 700;
}

.dup-badge {
  margin-left: 10px;
  vertical-align: middle;
}
</style>
