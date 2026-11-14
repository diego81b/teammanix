<template>
  <section class="space-y-4" aria-labelledby="title-staff-roles">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1 basis-64">
        <h2 id="title-staff-roles" class="text-lg font-semibold">{{ $t('settings.staffRoles.title') }}</h2>
        <p class="text-sm text-muted">{{ $t('settings.staffRoles.text') }}</p>
      </div>
      <UButton size="lg" icon="i-tm-plus" :label="$t('settings.staffRoles.add')" @click="openNew" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <p v-if="data.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('settings.staffRoles.empty') }}</p>
      <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li v-for="r in data" :key="r.id" class="flex flex-wrap items-center justify-between gap-3 p-4">
          <div class="min-w-0 flex-1 basis-56 space-y-1">
            <p class="flex flex-wrap items-center gap-2 font-medium" :class="{ 'text-muted': r.archived }">
              <span class="break-words">{{ r.name }}</span>
              <UBadge v-if="r.archived" color="neutral" variant="subtle" :label="$t('staffRoles.archived')" />
              <UBadge v-if="r.mustBeAvailable" color="primary" variant="subtle" :label="$t('staffRoles.mustBeAvailableBadge')" />
            </p>
            <p class="text-sm text-muted">{{ $t(`staffRoles.model.${r.policyModel}`) }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton color="neutral" variant="outline" class="min-h-11" :label="$t('settings.staffRoles.edit')" @click="openEdit(r)" />
            <UButton
              color="neutral"
              variant="ghost"
              class="min-h-11"
              :loading="working === r.id"
              :disabled="working !== null"
              :label="r.archived ? $t('settings.staffRoles.restore') : $t('settings.staffRoles.archive')"
              @click="toggleArchived(r)"
            />
          </div>
        </li>
      </ul>
    </template>

    <StaffRoleForm v-model:open="formOpen" :role="editing" @saved="onSaved" />
  </section>
</template>

<script setup lang="ts">
import type { StaffRoleItem } from '~/types/api'

const { t } = useI18n()
const catalog = useStaffRoles()
const toast = useToast()
const { data, loading, error, reload: load } = useLoad(() => catalog.list())

const formOpen = ref(false)
const editing = ref<StaffRoleItem | null>(null)
const working = ref<string | null>(null)
const errorAction = ref('')

function openNew() {
  editing.value = null
  formOpen.value = true
}

function openEdit(r: StaffRoleItem) {
  editing.value = r
  formOpen.value = true
}

async function onSaved(role: StaffRoleItem | null) {
  toast.add({ title: t(role && editing.value ? 'settings.staffRoles.saved' : 'settings.staffRoles.created'), color: 'success' })
  await load()
}

async function toggleArchived(r: StaffRoleItem) {
  working.value = r.id
  errorAction.value = ''
  try {
    await catalog.edit(r.id, { archived: !r.archived })
    toast.add({ title: t(r.archived ? 'settings.staffRoles.restored' : 'settings.staffRoles.archivedDone'), color: 'success' })
    await load()
  }
  catch (e) {
    errorAction.value = errorText(e)
  }
  finally {
    working.value = null
  }
}

onMounted(load)
</script>
