<template>
  <UInput
    v-model="model"
    :type="visible ? 'text' : 'password'"
    :autocomplete="autocomplete"
    size="xl"
    class="w-full"
    :ui="{ trailing: 'pe-1' }"
  >
    <template #trailing>
      <UButton
        color="neutral"
        variant="link"
        size="sm"
        :icon="visible ? 'i-tm-eye-off' : 'i-tm-eye'"
        :aria-label="visible ? $t('password.hide') : $t('password.show')"
        :aria-pressed="visible"
        @click="visible = !visible"
      />
    </template>
  </UInput>
</template>

<script setup lang="ts">
const model = defineModel<string>({ default: '' })
withDefaults(defineProps<{ autocomplete?: 'current-password' | 'new-password' }>(), { autocomplete: 'current-password' })
const visible = ref(false)
</script>
