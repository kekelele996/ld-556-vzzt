<template>
  <g :transform="`translate(${x},${y})`" class="tree-node" @click.stop="$emit('select', node.id)" @contextmenu.prevent="$emit('menu', node.id)">
    <circle :r="32" :class="node.status.toLowerCase()" />
    <circle v-if="node.duplicate" :r="6" :cx="26" :cy="-26" class="dup-dot">
      <title>疑似重复成员</title>
    </circle>
    <text y="-3" text-anchor="middle">{{ node.name }}</text>
    <text y="16" text-anchor="middle" class="life">{{ lifeYears(node) }}</text>
  </g>
</template>

<script setup lang="ts">
import type { FamilyTreeNode } from '@/types/family'
import { lifeYears } from '@/utils/member-status'

defineProps<{ node: FamilyTreeNode; x: number; y: number }>()
defineEmits<{ select: [id: string]; menu: [id: string] }>()
</script>
