<template>
  <div class="space-y-6">
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1 space-y-1">
        <h1 class="text-2xl font-bold">{{ $t('notifications.title') }}</h1>
        <p class="text-sm text-muted">{{ $t('notifications.intro') }}</p>
      </div>
      <UButton to="/profile" color="neutral" variant="ghost" size="lg" icon="i-tm-user" class="min-h-11" :label="$t('notifications.settings')" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="reload" />
      </template>
    </UAlert>
    <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <div v-if="data.items.length" class="flex justify-end">
        <UButton
          color="neutral"
          variant="outline"
          size="lg"
          class="min-h-11"
          icon="i-tm-check-all"
          :disabled="data.unread === 0"
          :loading="marking"
          :label="$t('notifications.markAll')"
          @click="readAll"
        />
      </div>

      <p v-if="data.items.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        {{ $t('notifications.empty') }}<br>{{ $t('notifications.emptyHint') }}
      </p>

      <ul v-else class="space-y-2">
        <li v-for="n in data.items" :key="n.id">
          <button
            type="button"
            class="flex min-h-14 w-full items-start gap-3 rounded-lg border bg-elevated p-3 text-left transition-colors hover:bg-accented"
            :class="n.readAt ? 'border-default' : 'border-primary'"
            @click="open(n)"
          >
            <span
              class="mt-1.5 size-2.5 shrink-0 rounded-full"
              :class="n.readAt ? 'bg-transparent' : 'bg-primary'"
              :aria-label="n.readAt ? undefined : $t('notifications.unread')"
              :role="n.readAt ? undefined : 'img'"
            />
            <span class="min-w-0 flex-1">
              <span class="block text-sm" :class="n.readAt ? 'font-medium' : 'font-semibold'">{{ view(n).title }}</span>
              <span class="mt-0.5 block text-sm text-muted">{{ view(n).body }}</span>
              <span class="mt-1 block text-xs text-muted">{{ ago(n.createdAt) }}</span>
            </span>
            <UIcon v-if="n.link" name="i-tm-chevron-right" class="mt-1 size-5 shrink-0 text-muted" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { notificationText, type NotificationItem } from '~/utils/notification'
import { formatDate } from '~/utils/date'
import { splitInstant } from '~/utils/event'

const { t, locale } = useI18n()
useHead({ title: () => `${t('notifications.title')} · TeamManix` })
const notifications = useNotifications()
const store = useNotificationsStore()

const { data, loading, error, reload: load } = useLoad(() => notifications.list())
const errorAction = ref('')
const marking = ref(false)

async function reload() {
  await load()
  if (data.value) store.set(data.value.unread)
}
onMounted(reload)

const view = (n: NotificationItem) => notificationText(n, locale.value, (key, params) => t(key, params ?? {}))

/** "10/12/2026 · 18:00": when the notification arrived, in the club's time. */
const ago = (iso: string) => {
  const { date, time } = splitInstant(iso)
  return `${formatDate(date, locale.value)} · ${time}`
}

/** Opening a notification reads it. A failed read must not stop the person from getting where the notification points. */
async function open(n: NotificationItem) {
  errorAction.value = ''
  if (!n.readAt) {
    try {
      await notifications.markRead(n.id)
      n.readAt = new Date().toISOString()
      if (data.value) data.value.unread = Math.max(0, data.value.unread - 1)
      store.dropOne()
    }
    catch (e) {
      errorAction.value = errorText(e)
    }
  }
  if (n.link) await navigateTo(n.link)
}

async function readAll() {
  marking.value = true
  errorAction.value = ''
  try {
    await notifications.markAllRead()
    const now = new Date().toISOString()
    for (const n of data.value?.items ?? []) n.readAt ??= now
    if (data.value) data.value.unread = 0
    store.set(0)
  }
  catch (e) {
    errorAction.value = errorText(e)
  }
  finally {
    marking.value = false
  }
}
</script>
