<template>
  <n-modal :show="show" preset="card" title="合并疑似重复成员" class="merge-modal" :bordered="false" @update:show="(value: boolean) => !value && $emit('close')">
    <n-spin :show="merging">
      <n-alert type="warning" class="merge-alert">
        两份资料姓名相同（{{ primary?.name }}）。请先选定主档，空字段会自动从另一份补齐；
        <strong>两边都有值且不同的字段必须逐一手选</strong>，未选择前不会写入，系统不会悄悄覆盖任何内容。
      </n-alert>

      <section class="merge-block">
        <h3>1. 选择主档</h3>
        <p class="merge-hint">副档将被删除，其关系、故事、照片、遗产受益人均改指向主档（编号 {{ primary?.id }}）。</p>
        <n-radio-group :value="primaryId" @update:value="switchPrimary">
          <n-space>
            <n-radio v-for="member in pair" :key="member.id" :value="member.id">
              保留 <strong>{{ member.name }}</strong>（编号 {{ member.id }}）
              <span class="merge-sub">{{ lifeYears(member) }} · {{ member.birthPlace || '籍贯未知' }}</span>
            </n-radio>
          </n-space>
        </n-radio-group>
      </section>

      <section v-if="effectivePreview" class="merge-block">
        <h3>2. 逐字段确认</h3>
        <div class="field-table" role="table">
          <div class="field-row field-head" role="row">
            <span role="columnheader">字段</span>
            <span role="columnheader">主档</span>
            <span role="columnheader">另一份</span>
            <span role="columnheader">处理方式</span>
          </div>
          <div v-for="field in effectivePreview.fields" :key="field.key" class="field-row" role="row">
            <span class="field-label">{{ field.label }}</span>
            <span class="field-val" :class="{ chosen: chooseSide(field) === 'primary' }">{{ displayValue(field.key, field.primaryValue) || '—' }}</span>
            <span class="field-val" :class="{ chosen: chooseSide(field) === 'other' }">{{ displayValue(field.key, field.otherValue) || '—' }}</span>
            <span class="field-action">
              <n-tag v-if="field.status === 'same'" size="small" :bordered="false">两边一致</n-tag>
              <n-tag v-else-if="field.status === 'only-a'" size="small" type="success" :bordered="false">主档已有</n-tag>
              <n-tag v-else-if="field.status === 'only-b'" size="small" type="info" :bordered="false">自动补齐</n-tag>
              <n-radio-group v-else :value="field.resolution" size="small" @update:value="(value: MergeResolution) => resolve(field, value)">
                <n-radio-button value="primary">取主档</n-radio-button>
                <n-radio-button value="other">取另一份</n-radio-button>
              </n-radio-group>
            </span>
          </div>
        </div>
        <n-alert v-if="unresolved > 0" type="error" class="merge-alert">
          还有 {{ unresolved }} 个冲突字段未选择，全部决定后才能合并。
        </n-alert>
      </section>

      <section class="merge-block">
        <h3>3. 合并影响范围</h3>
        <ul class="impact-list">
          <li>关系：配偶 / 子女 / 父母的引用改指向主档，旧编号「{{ other?.id }}」删除，不残留。</li>
          <li>故事：{{ storyCount }} 篇挂在两份资料下的故事将统一归到主档。</li>
          <li>照片：照片归属与人物标注改指向主档。</li>
          <li>遗产：规划关联成员与受益人改指向主档，受益人自动去重。</li>
        </ul>
      </section>
    </n-spin>

    <template #footer>
      <n-space justify="end">
        <n-button @click="$emit('close')" :disabled="merging">取消</n-button>
        <n-button type="primary" :loading="merging" :disabled="!effectivePreview || unresolved > 0" @click="confirmMerge">
          确认合并
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import type { FamilyMember } from '@/types/family'
import type { MergeFieldKey, MergeFieldState, MergeResolution } from '@/types/merge'
import { buildMergePreview, conflictFields, hasUnresolvedConflict } from '@/utils/merge-preview'
import { genderLabels } from '@/constants/enums'
import { lifeYears } from '@/utils/member-status'
import { useMemberMerge } from '@/hooks/useMemberMerge'
import { useStoryStore } from '@/stores/storyStore'

const props = defineProps<{
  show: boolean
  /** 初始视为主档的成员 */
  primary: FamilyMember | undefined
  /** 初始视为副档（待合并）的成员 */
  other: FamilyMember | undefined
}>()

const emit = defineEmits<{
  close: []
  /** 合并完成，传出最终主档 */
  merged: [member: FamilyMember]
}>()

const router = useRouter()
const route = useRoute()
const message = useMessage()
const { mergeMembers } = useMemberMerge()
const storyStore = useStoryStore()

const primaryId = ref('')
const merging = ref(false)
/** 以 `${primaryId}::${otherId}` 为键缓存冲突选择，切换主档时不串选择 */
const resolutions = ref<Record<string, MergeResolution>>({})

const pair = computed<FamilyMember[]>(() => {
  if (!props.primary || !props.other) return []
  return [props.primary, props.other]
})

const primary = computed(() => pair.value.find((member) => member.id === primaryId.value))
const other = computed(() => pair.value.find((member) => member.id !== primaryId.value))

const preview = computed(() => (primary.value && other.value ? buildMergePreview(primary.value, other.value) : null))

/** 将缓存的选择灌回当前预览 */
const effectivePreview = computed(() => {
  if (!preview.value) return null
  return {
    ...preview.value,
    fields: preview.value.fields.map((field) => ({
      ...field,
      resolution: resolutions.value[resolutionKey(primaryId.value, other.value!.id, field.key)] ?? field.resolution
    }))
  }
})

const unresolved = computed(() => (effectivePreview.value ? conflictFields(effectivePreview.value).filter((field) => field.resolution === null).length : 0))

const storyCount = computed(() => {
  if (!props.primary || !props.other) return 0
  const ids = new Set([props.primary.id, props.other.id])
  return storyStore.stories.filter((story) => ids.has(story.memberId)).length
})

watch(
  () => [props.show, props.primary?.id, props.other?.id],
  () => {
    if (props.show && props.primary) primaryId.value = props.primary.id
  },
  { immediate: true }
)

function switchPrimary(value: string) {
  primaryId.value = value
}

function resolutionKey(primary: string, otherId: string, key: MergeFieldKey) {
  return `${primary}::${otherId}::${key}`
}

function chooseSide(field: MergeFieldState): 'primary' | 'other' | null {
  if (field.status === 'same' || field.status === 'only-a') return 'primary'
  if (field.status === 'only-b') return 'other'
  return field.resolution
}

function resolve(field: MergeFieldState, value: MergeResolution) {
  if (!other.value) return
  resolutions.value[resolutionKey(primaryId.value, other.value.id, field.key)] = value
}

function displayValue(key: MergeFieldKey, value: string): string {
  if (!value) return ''
  if (key === 'gender') return genderLabels[value as keyof typeof genderLabels] || value
  if (key === 'avatar') return '已设置头像'
  return value
}

async function confirmMerge() {
  if (!effectivePreview.value || !primary.value || !other.value) return
  if (hasUnresolvedConflict(effectivePreview.value)) {
    message.warning('请先为所有冲突字段选择取值')
    return
  }
  merging.value = true
  try {
    const result = await mergeMembers(primary.value, other.value, effectivePreview.value.fields)
    message.success(`已合并到主档「${result.merged.name}」，旧编号已清除`)
    emit('merged', result.merged)
    // 若当前正停留在被删除的副档详情页，跳转到主档以展示合并结果
    if (route.name === 'member-detail' && route.params.id === result.removedId) {
      router.replace(`/members/${result.merged.id}`)
    }
    emit('close')
  } finally {
    merging.value = false
  }
}
</script>

<style scoped>
.merge-modal {
  max-width: 860px;
}

.merge-block {
  margin-top: 18px;
}

.merge-block h3 {
  margin: 0 0 8px;
}

.merge-hint {
  margin: 0 0 10px;
  color: #7a5e37;
  font-size: 13px;
}

.merge-sub {
  margin-left: 8px;
  color: #7a6f60;
  font-size: 12px;
}

.merge-alert {
  margin-top: 6px;
}

.field-table {
  border: 1px solid #d8ceba;
  border-radius: 8px;
  overflow: hidden;
}

.field-row {
  display: grid;
  grid-template-columns: 120px 1fr 1fr 150px;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-top: 1px solid #e6ddcb;
}

.field-row:first-child {
  border-top: none;
}

.field-head {
  background: #f4ead8;
  font-weight: 700;
  font-size: 13px;
}

.field-val {
  padding: 6px 8px;
  border-radius: 6px;
  word-break: break-all;
  font-size: 13px;
}

.field-val.chosen {
  background: #e7f0e9;
  box-shadow: inset 0 0 0 1px #9bb5a1;
}

.field-action {
  display: flex;
  justify-content: center;
}

.impact-list {
  margin: 0;
  padding-left: 18px;
  color: #5a5346;
  font-size: 13px;
  line-height: 1.9;
}
</style>
