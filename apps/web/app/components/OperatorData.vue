<template>
  <span v-if="value">{{ value }}</span>
  <mark v-else class="rounded bg-warning/20 px-1 text-default">[da completare: {{ LABELS_OPERATOR[field] }}]</mark>
</template>

<script setup lang="ts">
import type { Operator } from '~/utils/operator'

const props = defineProps<{ field: keyof Operator }>()
const value = computed(() => operator[props.field])
</script>
