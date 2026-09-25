import type { Gender, MemberStatus } from '@/constants/enums'

export interface FamilyMember {
  id: string
  name: string
  gender: Gender
  birthDate: string
  deathDate: string
  birthPlace: string
  bio: string
  avatar: string
  parentId: string
  spouseIds: string[]
  childrenIds: string[]
  generation: number
}

export interface FamilyTreeNode extends FamilyMember {
  status: MemberStatus
  /** 是否为疑似重复成员（存在同名的另一份资料） */
  duplicate?: boolean
  children?: FamilyTreeNode[]
}

export interface MemberRelationSummary {
  spouses: FamilyMember[]
  children: FamilyMember[]
  parent?: FamilyMember
}
