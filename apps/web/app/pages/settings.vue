<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold">{{ $t('settings.title') }}</h1>
      <p class="text-sm text-muted">{{ $t('settings.text') }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <UAlert v-if="saveError" color="error" variant="subtle" icon="i-tm-error" :title="saveError" />

    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li v-for="s in BOOLEAN_SETTINGS" :key="s.key" class="p-4">
          <USwitch
            :model-value="data[s.key]"
            :loading="saving === s.key"
            :disabled="saving !== null"
            :label="$t(`settings.${s.key}.label`)"
            :description="$t(`settings.${s.key}.text`)"
            @update:model-value="(v: boolean) => change(s.key, { [s.key]: v })"
          />
        </li>
        <li v-if="data.warnNoCoachAvailable" class="p-4">
          <fieldset class="space-y-3" :aria-describedby="saveErrorRoles ? 'coach-roles-error' : undefined">
            <legend class="font-medium">{{ $t('settings.coachRoles.label') }}</legend>
            <p class="text-sm text-muted">{{ $t('settings.coachRoles.text') }}</p>
            <div class="flex flex-wrap gap-x-6 gap-y-2">
              <UCheckbox
                v-for="r in COACH_ROLE_CHOICES"
                :key="r"
                :model-value="data.coachRoles.includes(r)"
                :disabled="saving !== null"
                :label="$t(`staffRole.${r}`)"
                class="min-h-11"
                @update:model-value="() => toggleRole(r)"
              />
            </div>
            <p v-if="saveErrorRoles" id="coach-roles-error" class="text-sm text-error" role="alert">{{ $t('settings.coachRoles.atLeastOne') }}</p>
          </fieldset>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ClubSettings, StaffRole } from '~/types/api'
import { BOOLEAN_SETTINGS, COACH_ROLE_CHOICES, toggleCoachRole } from '~/utils/club-settings'

const { t } = useI18n()
useHead({ title: () => `${t('settings.title')} · TeamManix` })

const club = useClubSettings()
const toast = useToast()
const { data, loading, error, reload: load } = useLoad(() => club.read())
const saving = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saveErrorRoles = ref(false)

/** One PATCH per change; on failure the control returns to the stored value (the state only changes with the response). */
async function change(key: string, patch: Partial<ClubSettings>) {
  saving.value = key
  saveError.value = null
  saveErrorRoles.value = false
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

function toggleRole(role: StaffRole) {
  if (!data.value) return
  const next = toggleCoachRole(data.value.coachRoles, role)
  if (!next) {
    saveError.value = null
    saveErrorRoles.value = true
    return
  }
  void change('coachRoles', { coachRoles: next })
}

onMounted(load)
</script>
