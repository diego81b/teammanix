<template>
  <div class="tm-page tm-page--narrow">
    <div class="space-y-1">
      <h1>{{ $t('settings.title') }}</h1>
      <p class="text-muted">{{ $t('settings.text') }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <UAlert v-if="saveError" color="error" variant="subtle" icon="i-tm-error" :title="saveError" />

    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <section v-for="g in settingGroups()" :key="g.id" class="space-y-2" :aria-labelledby="`settings-${g.id}`">
        <h2 :id="`settings-${g.id}`" class="tm-section-title">{{ $t(`settings.groups.${g.id}`) }}</h2>
        <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li v-for="s in g.settings" :key="s.key" class="p-4">
            <USwitch
              :model-value="data[s.key]"
              :loading="saving === s.key"
              :disabled="saving !== null"
              :label="$t(`settings.${s.key}.label`)"
              :description="$t(`settings.${s.key}.text`)"
              @update:model-value="(v: boolean) => change(s.key, { [s.key]: v })"
            />
          </li>
        </ul>
      </section>
    </template>

    <StaffRolesPanel />
  </div>
</template>

<script setup lang="ts">
import type { ClubSettings } from '~/types/api'
import { settingGroups } from '~/utils/club-settings'

const { t } = useI18n()
useHead({ title: () => `${t('settings.title')} · TeamManix` })

const club = useClubSettings()
const toast = useToast()
const { data, loading, error, reload: load } = useLoad(() => club.read())
const saving = ref<string | null>(null)
const saveError = ref<string | null>(null)

/** One PATCH per change; on failure the control returns to the stored value (the state only changes with the response). */
async function change(key: string, patch: Partial<ClubSettings>) {
  saving.value = key
  saveError.value = null
  try {
    data.value = await club.edit(patch)
    toast.add({ title: t('settings.saved'), color: 'success' })
  }
  catch (e) {
    saveError.value = errorText(e)
  }
  finally {
    saving.value = null
  }
}

onMounted(load)
</script>
