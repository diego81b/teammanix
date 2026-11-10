<template>
  <div class="space-y-6">
    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <div class="space-y-3">
        <NuxtLink :to="`/calendar/${seasonId}`" class="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-default">
          <UIcon name="i-tm-chevron-left" class="size-4" aria-hidden="true" />
          {{ $t('certificatesDue.toCalendar') }}
        </NuxtLink>
        <div>
          <h1 class="text-2xl font-bold">{{ $t('certificatesDue.title') }}</h1>
          <p v-if="season" class="text-sm text-muted">{{ season.teamName }} · {{ season.seasonName }}</p>
        </div>
        <p class="text-sm text-muted">{{ $t('certificatesDue.intro') }}</p>
      </div>

      <p v-if="data.rows.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('certificatesDue.none') }}</p>
      <ul v-else class="space-y-2">
        <li v-for="r in data.rows" :key="r.personId" class="flex items-start justify-between gap-3 rounded-lg border border-default bg-elevated p-3">
          <div class="min-w-0">
            <p class="font-semibold">{{ fullName(r) }}</p>
            <p class="text-sm text-muted">
              {{ $t(r.status === 'expired' ? 'certificatesDue.expiredOn' : 'certificatesDue.expiresOn', { date: formatDate(r.expiry, locale) }) }}
              · {{ when(r.daysLeft) }}
            </p>
          </div>
          <UBadge :color="variantCertificate(r.status)" variant="subtle" :label="$t(`status.certificate.${r.status}`)" />
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { dueText, variantCertificate } from '~/utils/certificate'
import { formatDate } from '~/utils/date'
import { fullName } from '~/utils/roster'

const { t, locale } = useI18n()
const route = useRoute()
const seasonId = computed(() => String(route.params.seasonId))
const certificates = useCertificates()
const calendar = useCalendar()

const { data, loading, error, reload: load } = useLoad(async () => {
  const [rows, seasons] = await Promise.all([certificates.due(seasonId.value), calendar.seasons()])
  return { rows, seasons }
})
useHead({ title: () => `${t('certificatesDue.title')} · TeamManix` })

const season = computed(() => data.value?.seasons.find(s => s.seasonId === seasonId.value) ?? null)
const when = (daysLeft: number) => {
  const { key, count } = dueText(daysLeft)
  return t(`certificatesDue.when.${key}`, { count })
}

onMounted(load)
</script>
