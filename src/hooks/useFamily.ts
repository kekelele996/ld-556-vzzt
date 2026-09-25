import { storeToRefs } from 'pinia'
import { useFamilyStore } from '@/stores/familyStore'

export function useFamily() {
  const store = useFamilyStore()
  return {
    ...storeToRefs(store),
    hydrate: store.hydrate,
    getById: store.getById,
    duplicateGroupOf: store.duplicateGroupOf,
    relations: store.relations,
    addMember: store.addMember,
    updateMember: store.updateMember,
    removeMember: store.removeMember
  }
}
