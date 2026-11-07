<template>
  <span class="inline-flex">
    <img
      src="/logo.svg"
      alt="TeamManix"
      class="tm-logo-light w-auto"
      :style="{ height: `${height}px` }"
    >
    <img
      src="/logo-dark.svg"
      alt=""
      aria-hidden="true"
      class="tm-logo-dark w-auto"
      :style="{ height: `${height}px` }"
    >
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ height?: number }>(), { height: 40 })
</script>
