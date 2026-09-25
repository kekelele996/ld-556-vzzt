<template>
  <section class="page-grid">
    <div class="page-heading">
      <p>家谱树</p>
      <h1>三代关系、婚姻连线与成员档案</h1>
    </div>
    <FamilyTreeView :roots="tree" @select="selectMember" @menu="selectMember" @add="openAdd = true" />
    <n-drawer v-model:show="drawerOpen" width="380">
      <n-drawer-content v-if="selected" title="成员详情">
        <MemberAvatar :member="selected" size="lg" :deceased="Boolean(selected.deathDate)" />
        <h2>
          {{ selected.name }}
          <n-tag v-if="drawerDuplicates.length" size="small" type="warning">疑似重复</n-tag>
        </h2>
        <p>{{ genderLabels[selected.gender] }} · {{ lifeYears(selected) }} · {{ getMemberStatus(selected) }}</p>
        <p>{{ selected.bio }}</p>
        <n-alert v-if="drawerDuplicates.length" type="warning" class="drawer-dup">
          <p class="drawer-dup-title">发现 {{ drawerDuplicates.length }} 份同名资料：</p>
          <div v-for="candidate in drawerDuplicates" :key="candidate.id" class="drawer-dup-row">
            <span>{{ candidate.id }} · {{ lifeYears(candidate) }} · {{ candidate.birthPlace || '籍贯未知' }}</span>
            <n-button size="tiny" type="primary" @click="openMerge(candidate)">合并</n-button>
          </div>
        </n-alert>
        <n-space>
          <n-button tag="a" :href="`/members/${selected.id}`" type="primary">查看详情</n-button>
          <n-button @click="removeMember(selected.id)">删除成员</n-button>
        </n-space>
      </n-drawer-content>
    </n-drawer>
    <MemberMergeDialog :show="mergeOpen" :primary="selected" :other="mergeCandidate" @close="mergeOpen = false" @merged="onMerged" />
    <n-modal v-model:show="openAdd" preset="card" title="新增成员" class="form-modal">
      <n-form :model="form" label-placement="top">
        <n-form-item label="姓名"><n-input v-model:value="form.name" /></n-form-item>
        <n-form-item label="性别"><n-select v-model:value="form.gender" :options="genderOptions" /></n-form-item>
        <n-form-item label="父/母节点"><n-select v-model:value="form.parentId" clearable :options="memberOptions" /></n-form-item>
        <n-form-item label="简介"><n-input v-model:value="form.bio" type="textarea" /></n-form-item>
      </n-form>
      <template #footer><n-button type="primary" @click="createMember">保存成员</n-button></template>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import FamilyTreeView from '@/components/tree/FamilyTreeView.vue'
import MemberAvatar from '@/components/common/MemberAvatar.vue'
import MemberMergeDialog from '@/components/common/MemberMergeDialog.vue'
import { useFamily } from '@/hooks/useFamily'
import { Gender, genderLabels } from '@/constants/enums'
import { getMemberStatus, lifeYears } from '@/utils/member-status'
import type { FamilyMember } from '@/types/family'

const { tree, hydrate, getById, duplicateGroupOf, removeMember, addMember, memberOptions } = useFamily()
const selectedId = ref('')
const drawerOpen = ref(false)
const openAdd = ref(false)
const mergeOpen = ref(false)
const mergeCandidate = ref<FamilyMember | undefined>(undefined)
const selected = computed(() => (selectedId.value ? getById(selectedId.value) : undefined))
const drawerDuplicates = computed<FamilyMember[]>(() => {
  if (!selected.value) return []
  const group = duplicateGroupOf(selected.value.id)
  return group ? group.members.filter((member) => member.id !== selected.value!.id) : []
})
const genderOptions = Object.entries(genderLabels).map(([value, label]) => ({ value, label }))
const form = reactive({ name: '', gender: Gender.OTHER, parentId: '', bio: '' })

function selectMember(id: string) {
  selectedId.value = id
  drawerOpen.value = true
}

function openMerge(candidate: FamilyMember) {
  mergeCandidate.value = candidate
  mergeOpen.value = true
}

function onMerged() {
  mergeOpen.value = false
  mergeCandidate.value = undefined
}

async function createMember() {
  await addMember({
    id: crypto.randomUUID(),
    name: form.name || '新成员',
    gender: form.gender,
    birthDate: '',
    deathDate: '',
    birthPlace: '',
    bio: form.bio,
    avatar: '',
    parentId: form.parentId || '',
    spouseIds: [],
    childrenIds: [],
    generation: form.parentId ? (getById(form.parentId)?.generation || 1) + 1 : 1
  })
  openAdd.value = false
}

onMounted(hydrate)
</script>

<style scoped>
.drawer-dup {
  margin: 10px 0;
}

.drawer-dup-title {
  margin: 0 0 6px;
  font-weight: 700;
}

.drawer-dup-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 3px 0;
  font-size: 12px;
}
</style>
