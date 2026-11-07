<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <NuxtLink to="/people" class="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-default">
        <UIcon name="i-tm-chevron-left" class="size-4" aria-hidden="true" />
        {{ $t('person.title') }}
      </NuxtLink>
      <h1 class="text-2xl font-bold">{{ $t('archive.title') }}</h1>
      <p class="text-sm text-muted">{{ $t('archive.text') }}</p>
    </div>

    <UInput v-model="search" type="search" size="xl" icon="i-tm-search" class="w-full" :placeholder="$t('person.searchPlaceholder')" :aria-label="$t('person.search')" />

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <p v-if="visible.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        {{ search.trim() ? $t('common.noResult') : $t('archive.empty') }}
      </p>
      <ul v-else class="divide-y divide-default rounded-lg border border-default">
        <li v-for="p in visible" :key="p.id" class="flex min-h-14 items-center gap-3 px-3 py-2">
          <UIcon name="i-tm-user-x" class="size-5 shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <NuxtLink :to="`/people/${p.id}`" class="block truncate font-medium hover:underline">{{ fullName(p) }}</NuxtLink>
            <span v-if="p.email" class="block truncate text-sm text-muted">{{ p.email }}</span>
          </span>
          <UButton
            color="neutral"
            variant="outline"
            class="min-h-11"
            :loading="ongoing === p.id"
            :label="$t('person.reenable')"
            :aria-label="$t('person.reenableName', { name: fullName(p) })"
            @click="reenable(p.id)"
          />
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { fullName } from '~/utils/roster'

const { t } = useI18n()
useHead({ title: () => `${t('archive.title')} · TeamManix` })
const people = usePeople()
const toast = useToast()

const { data, loading, error, reload: load } = useLoad(() => people.disabled())

const search = ref('')
const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (data.value ?? []).filter(p => !q || fullName(p).toLowerCase().includes(q))
})

const ongoing = ref('')
const errorAction = ref('')
async function reenable(id: string) {
  ongoing.value = id
  errorAction.value = ''
  try {
    await people.reenable(id)
    toast.add({ title: t('person.reenabled'), color: 'success' })
    await load()
  }
  catch (e) {
    errorAction.value = errorText(e)
  }
  finally {
    ongoing.value = ''
  }
}

onMounted(load)
</script>
