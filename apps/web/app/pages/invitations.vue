<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold">{{ $t('access.title') }}</h1>
      <p class="text-sm text-muted">{{ $t('access.text') }}</p>
    </div>

    <div role="tablist" :aria-label="$t('access.title')" class="flex gap-1 overflow-x-auto border-b border-default">
      <button
        v-for="s in sections"
        :id="`tab-${s}`"
        :key="s"
        type="button"
        role="tab"
        class="min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium"
        :class="section === s ? 'border-primary text-default' : 'border-transparent text-muted hover:text-default'"
        :aria-selected="section === s"
        :aria-controls="`panel${s}`"
        :tabindex="section === s ? 0 : -1"
        @click="section = s"
        @keydown.right.prevent="move(1)"
        @keydown.left.prevent="move(-1)"
      >
        {{ $t(`access.${s}`) }}
      </button>
    </div>

    <div :id="`panel${section}`" role="tabpanel" :aria-labelledby="`tab-${section}`">
      <InvitationsPanel v-if="section === 'invitations'" />
      <RolesPanel v-else-if="section === 'roles'" />
      <PermissionsPanel v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => `${t('access.title')} · TeamManix` })

const sections = ['invitations', 'roles', 'permissions'] as const
type Section = typeof sections[number]
const section = ref<Section>('invitations')

async function move(step: number) {
  const i = (sections.indexOf(section.value) + step + sections.length) % sections.length
  section.value = sections[i] as Section
  await nextTick()
  document.getElementById(`tab-${section.value}`)?.focus()
}
</script>
