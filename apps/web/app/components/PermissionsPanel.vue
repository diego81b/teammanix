<template>
  <section class="space-y-4" aria-labelledby="title-permissions">
    <div>
      <h2 id="title-permissions" class="text-lg font-semibold">{{ $t('permissions.title') }}</h2>
      <p class="text-sm text-muted">{{ $t('permissions.text') }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <div v-if="data" class="grid gap-4 md:grid-cols-[minmax(0,18rem)_1fr]">
      <ul class="divide-y divide-default self-start rounded-lg border border-default" :aria-label="$t('permissions.people')">
        <li v-for="p in data" :key="p.userId">
          <button
            type="button"
            class="flex min-h-14 w-full flex-col items-start justify-center gap-0.5 px-3 py-2 text-left hover:bg-muted"
            :class="p.userId === chosenId ? 'bg-primary/10' : ''"
            :aria-pressed="p.userId === chosenId"
            @click="choose(p)"
          >
            <span class="flex w-full items-center gap-2">
              <span class="min-w-0 flex-1 truncate font-medium">{{ fullName(p) }}</span>
              <UBadge v-if="custom(p)" color="primary" variant="subtle" :label="$t('permissions.custom')" />
            </span>
            <span class="truncate text-sm text-muted">{{ labelsRoles(p) }}</span>
          </button>
        </li>
      </ul>

      <div v-if="chosen" class="space-y-4 rounded-lg border border-default bg-elevated p-4">
        <div>
          <h3 class="text-base font-semibold">{{ fullName(chosen) }}</h3>
          <p class="text-sm text-muted">{{ chosen.email }}</p>
        </div>
        <UAlert v-if="!chosen.editable" color="neutral" variant="subtle" icon="i-tm-lock" :title="$t('permissions.adminAll')" />
        <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />

        <fieldset v-for="g in POLICY_GROUPS" :key="g.key" class="space-y-3 border-t border-default pt-3 first-of-type:border-t-0 first-of-type:pt-0">
          <legend class="text-sm font-semibold">{{ $t(`permissions.groups.${g.key}`) }}</legend>
          <USwitch
            v-for="c in g.policy"
            :key="c"
            :model-value="wanted.includes(c)"
            :disabled="!chosen.editable"
            :label="$t(`permissions.items.${c}`)"
            @update:model-value="wanted = togglePolicy(wanted, c)"
          />
        </fieldset>

        <div v-if="chosen.editable" class="flex flex-wrap justify-end gap-2 border-t border-default pt-3">
          <UButton color="neutral" variant="outline" size="lg" class="min-h-11" :disabled="!custom(chosen) || submit" :label="$t('permissions.restore')" @click="restore" />
          <UButton size="lg" class="min-h-11" :disabled="!modified" :loading="submit" :label="$t('common.save')" @click="save" />
        </div>
      </div>
      <p v-else class="self-start rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('permissions.choose') }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PolicyKey, PermissionDto, PermissionDtoRole } from '~/types/api'
import { togglePolicy, computeDiff, POLICY_GROUPS, custom } from '~/utils/permissions'
import { fullName } from '~/utils/roster'

const { t } = useI18n()
const access = useAccess()
const toast = useToast()
const { data, loading, error, reload: load } = useLoad(() => access.permissions())

const chosenId = ref('')
const wanted = ref<PolicyKey[]>([])
const submit = ref(false)
const errorAction = ref('')

const chosen = computed(() => data.value?.find(p => p.userId === chosenId.value) ?? null)
const modified = computed(() => {
  const s = chosen.value
  if (!s) return false
  return wanted.value.length !== s.effective.length || wanted.value.some(c => !s.effective.includes(c))
})

function choose(p: PermissionDto) {
  chosenId.value = p.userId
  wanted.value = [...p.effective]
  errorAction.value = ''
}

const roleName = (r: PermissionDtoRole) =>
  (['admin', 'manager', 'player'].includes(r.role) ? t(`roles.${r.role}`) : (r.staffRoleName ?? ''))
// Scope and target: "Dirigente, Under 15" or "Allenatore, Under 15 (2025/2026)"; for the whole club only the role.
const roleLabel = (r: PermissionDtoRole) => {
  if (r.scope === 'club' || !r.destination) return roleName(r)
  return `${roleName(r)}, ${r.destination}${r.season ? ` (${r.season})` : ''}`
}
const labelsRoles = (p: PermissionDto) => p.roles.map(roleLabel).join(', ')

// After saving, the list is realigned and the selection restarts from the server values.
async function apply(diff: Parameters<typeof access.setPermissions>[1], message: string) {
  submit.value = true
  errorAction.value = ''
  try {
    await access.setPermissions(chosenId.value, diff)
    await load()
    if (chosen.value) wanted.value = [...chosen.value.effective]
    toast.add({ title: message, color: 'success' })
  }
  catch (e) {
    errorAction.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}

const save = () => apply(computeDiff(chosen.value?.defaultValue ?? [], wanted.value), t('permissions.saved'))
const restore = () => apply({}, t('permissions.restored'))

onMounted(load)
</script>
