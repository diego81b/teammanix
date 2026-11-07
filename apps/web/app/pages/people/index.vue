<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold">{{ $t('person.title') }}</h1>
        <p class="text-sm text-muted">{{ $t('person.text') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" size="lg" class="min-h-11" icon="i-tm-archive" to="/archive" :label="$t('archive.title')" />
        <UButton size="lg" class="min-h-11" icon="i-tm-user-plus" :label="$t('person.new')" @click="fresh = true" />
      </div>
    </div>

    <UInput v-model="search" type="search" size="xl" icon="i-tm-search" class="w-full" :placeholder="$t('person.searchPlaceholder')" :aria-label="$t('person.search')" />

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <p v-if="data.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        {{ search.trim() ? $t('common.noResult') : $t('person.empty') }}
      </p>
      <ul v-else class="divide-y divide-default rounded-lg border border-default">
        <li v-for="p in data" :key="p.id">
          <NuxtLink :to="`/people/${p.id}`" class="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted">
            <UIcon name="i-tm-user" class="size-5 shrink-0 text-muted" aria-hidden="true" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ fullName(p) }}</span>
              <span v-if="p.email || p.phone" class="block truncate text-sm text-muted">{{ [p.email, p.phone].filter(Boolean).join(' · ') }}</span>
            </span>
            <UBadge v-if="p.toComplete" color="warning" variant="subtle" :label="$t('person.toComplete')" />
            <UIcon name="i-tm-chevron-right" class="size-4 shrink-0 text-muted" aria-hidden="true" />
          </NuxtLink>
        </li>
      </ul>
    </template>

    <NewPerson v-model:open="fresh" @created="(p) => navigateTo(`/people/${p.id}`)" />
  </div>
</template>

<script setup lang="ts">
import { fullName } from '~/utils/roster'

const { t } = useI18n()
useHead({ title: () => `${t('person.title')} · TeamManix` })
const people = usePeople()
const search = ref('')
const fresh = ref(false)

const { data, loading, error, reload: load } = useLoad(() => people.list(search.value))

let timer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(load, 300)
})
onBeforeUnmount(() => clearTimeout(timer))
onMounted(load)
</script>
