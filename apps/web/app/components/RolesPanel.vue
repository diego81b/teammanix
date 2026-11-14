<template>
  <section class="space-y-4" aria-labelledby="title-roles">
    <div>
      <h2 id="title-roles" class="text-lg font-semibold">{{ $t('roles.title') }}</h2>
      <p class="text-sm text-muted">{{ $t('roles.text') }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <p v-if="data.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('roles.empty') }}</p>
      <template v-else>
        <table class="hidden w-full text-left text-sm md:table">
          <caption class="sr-only">{{ $t('roles.title') }}</caption>
          <thead class="border-b border-default text-muted">
            <tr>
              <th scope="col" class="py-2 pr-3 font-medium">{{ $t('roles.person') }}</th>
              <th scope="col" class="px-3 py-2 font-medium">{{ $t('invitation.role') }}</th>
              <th scope="col" class="px-3 py-2 font-medium">{{ $t('invitation.scope') }}</th>
              <th scope="col" class="py-2 pl-3"><span class="sr-only">{{ $t('common.actions') }}</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="r in data" :key="r.id">
              <th scope="row" class="py-3 pr-3 font-medium">
                {{ fullName(r) }}
                <span class="block text-sm font-normal text-muted">{{ r.email }}</span>
              </th>
              <td class="px-3 py-3">{{ $t(`roles.${r.role}`) }}</td>
              <td class="px-3 py-3">{{ scope(r) }}</td>
              <td class="py-3 pl-3 text-right">
                <UButton
                  color="error"
                  variant="ghost"
                  class="min-h-11"
                  :disabled="lastAdmin(r, data ?? [])"
                  :aria-describedby="lastAdmin(r, data ?? []) ? 'note-last-admin' : undefined"
                  :label="$t('roles.remove')"
                  @click="toRemove = r"
                />
              </td>
            </tr>
          </tbody>
        </table>

        <ul class="space-y-2 md:hidden">
          <li v-for="r in data" :key="r.id" class="space-y-2 rounded-lg border border-default bg-elevated p-3">
            <div>
              <p class="font-semibold">{{ fullName(r) }}</p>
              <p class="truncate text-sm text-muted">{{ r.email }}</p>
            </div>
            <p class="text-sm">{{ $t(`roles.${r.role}`) }} · {{ scope(r) }}</p>
            <UButton
              color="error"
              variant="ghost"
              class="min-h-11"
              :disabled="lastAdmin(r, data ?? [])"
              :aria-describedby="lastAdmin(r, data ?? []) ? 'note-last-admin' : undefined"
              :label="$t('roles.remove')"
              @click="toRemove = r"
            />
          </li>
        </ul>
        <p v-if="data.some(r => lastAdmin(r, data ?? []))" id="note-last-admin" class="text-sm text-muted">{{ $t('roles.lastAdmin') }}</p>
      </template>
    </template>

    <UModal
      :open="!!toRemove"
      :title="$t('roles.removeTitle', { name: toRemove ? fullName(toRemove) : '' })"
      :description="$t('roles.removeText')"
      @update:open="(v) => { if (!v) toRemove = null }"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="toRemove = null" />
        <UButton color="error" size="lg" :loading="removing" :label="$t('roles.remove')" @click="remove" />
      </template>
    </UModal>
  </section>
</template>

<script setup lang="ts">
import type { RoleDto } from '~/types/api'
import { lastAdmin } from '~/utils/roles'
import { fullName } from '~/utils/roster'

const { t } = useI18n()
const access = useAccess()
const toast = useToast()
const { data, loading, error, reload: load } = useLoad(() => access.roles())

const toRemove = ref<RoleDto | null>(null)
const removing = ref(false)
const errorAction = ref('')

const scope = (r: RoleDto) => (r.destination ? `${t(`scope.${r.scope}`)}: ${r.destination}` : t(`scope.${r.scope}`))

async function remove() {
  const r = toRemove.value
  if (!r) return
  removing.value = true
  errorAction.value = ''
  try {
    await access.removeRole(r.id)
    toRemove.value = null
    toast.add({ title: t('roles.removed'), color: 'success' })
    await load()
  }
  catch (e) {
    toRemove.value = null
    errorAction.value = errorText(e)
  }
  finally {
    removing.value = false
  }
}

onMounted(load)
</script>
