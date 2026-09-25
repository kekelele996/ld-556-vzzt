import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { defaultMembers } from '@/constants/default-templates'
import type { FamilyMember, FamilyTreeNode, MemberRelationSummary } from '@/types/family'
import type { DuplicateGroup } from '@/types/merge'
import { readFamilyMembers, writeFamilyMembers } from '@/db/family-db'
import { getMemberStatus } from '@/utils/member-status'
import { buildDuplicateIndex, collectDuplicateIds, findDuplicateGroups } from '@/utils/duplicate-detect'

function buildTree(members: FamilyMember[], duplicateIds: Set<string>): FamilyTreeNode[] {
  const map = new Map<string, FamilyTreeNode>()
  for (const member of members) {
    map.set(member.id, { ...member, status: getMemberStatus(member), duplicate: duplicateIds.has(member.id), children: [] })
  }
  const roots: FamilyTreeNode[] = []
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)?.children?.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

export const useFamilyStore = defineStore('family', () => {
  const members = ref<FamilyMember[]>([])
  const loading = ref(false)

  /** 疑似重复成员分组（按归一化姓名） */
  const duplicateGroups = computed<DuplicateGroup[]>(() => findDuplicateGroups(members.value))
  const duplicateIndex = computed(() => buildDuplicateIndex(duplicateGroups.value))
  const duplicateIds = computed(() => collectDuplicateIds(duplicateGroups.value))

  const tree = computed(() => buildTree(members.value, duplicateIds.value))
  const memberOptions = computed(() => members.value.map((member) => ({ label: member.name, value: member.id })))

  async function hydrate() {
    loading.value = true
    try {
      const stored = await readFamilyMembers()
      members.value = stored.length ? stored : defaultMembers
      if (!stored.length) await persist()
    } finally {
      loading.value = false
    }
  }

  async function persist() {
    await writeFamilyMembers(members.value)
  }

  function getById(id: string) {
    return members.value.find((member) => member.id === id)
  }

  /** 该成员所在的疑似重复组（若有） */
  function duplicateGroupOf(id: string): DuplicateGroup | undefined {
    return duplicateIndex.value.get(id)
  }

  function relations(id: string): MemberRelationSummary {
    const current = getById(id)
    return {
      spouses: current ? current.spouseIds.map(getById).filter(Boolean) as FamilyMember[] : [],
      children: current ? current.childrenIds.map(getById).filter(Boolean) as FamilyMember[] : [],
      parent: current?.parentId ? getById(current.parentId) : undefined
    }
  }

  async function addMember(member: FamilyMember) {
    members.value.push(member)
    if (member.parentId) {
      const parent = getById(member.parentId)
      if (parent && !parent.childrenIds.includes(member.id)) parent.childrenIds.push(member.id)
    }
    await persist()
  }

  async function updateMember(member: FamilyMember) {
    members.value = members.value.map((item) => (item.id === member.id ? member : item))
    await persist()
  }

  async function removeMember(id: string) {
    const descendantIds = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const member of members.value) {
        if (member.parentId && descendantIds.has(member.parentId) && !descendantIds.has(member.id)) {
          descendantIds.add(member.id)
          changed = true
        }
      }
    }
    members.value = members.value
      .filter((member) => !descendantIds.has(member.id))
      .map((member) => ({
        ...member,
        spouseIds: member.spouseIds.filter((spouseId) => !descendantIds.has(spouseId)),
        childrenIds: member.childrenIds.filter((childId) => !descendantIds.has(childId))
      }))
    await persist()
  }

  return {
    members,
    loading,
    tree,
    memberOptions,
    duplicateGroups,
    duplicateIds,
    hydrate,
    persist,
    getById,
    duplicateGroupOf,
    relations,
    addMember,
    updateMember,
    removeMember
  }
})
