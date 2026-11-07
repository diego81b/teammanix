<template>
  <span v-if="summary" class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
    <UBadge :color="variantCertificate(summary.status)" variant="subtle" :label="$t(`status.certificate.${summary.status}`)" />
    <span v-if="summary.expiry" class="text-xs text-muted">{{ formatDate(summary.expiry, locale) }}</span>
  </span>
  <span v-else class="text-muted" :aria-label="$t('certificate.notExpected')">-</span>
</template>

<script setup lang="ts">
import type { SummaryCertificate } from '~/types/api'
import { variantCertificate } from '~/utils/certificate'
import { formatDate } from '~/utils/date'

defineProps<{ summary: SummaryCertificate | null }>()
const { locale } = useI18n()
</script>
