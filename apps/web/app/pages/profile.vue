<template>
  <div class="space-y-8">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold">{{ $t('profile.title') }}</h1>
      <p class="text-sm text-muted">{{ $t('profile.intro') }}</p>
    </div>

    <section class="space-y-3" aria-labelledby="profile-theme">
      <div class="space-y-1">
        <h2 id="profile-theme" class="font-semibold">{{ $t('profile.themeTitle') }}</h2>
        <p class="text-sm text-muted">{{ $t('profile.themeText') }}</p>
      </div>
      <URadioGroup
        v-model="theme"
        :items="themes"
        orientation="horizontal"
        variant="card"
        size="lg"
        :aria-label="$t('profile.themeTitle')"
      />
    </section>

    <section class="space-y-3" aria-labelledby="profile-push">
      <h2 id="profile-push" class="font-semibold">{{ $t('profile.pushTitle') }}</h2>
      <UAlert v-if="errorPush" color="error" variant="subtle" icon="i-tm-error" :title="errorPush" />
      <p v-if="pushLoading" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>
      <div v-else class="flex items-center gap-3 rounded-lg border border-default bg-elevated p-3">
        <UIcon name="i-tm-bell" class="size-5 shrink-0 text-muted" aria-hidden="true" />
        <p class="min-w-0 flex-1 text-sm">{{ pushText }}</p>
        <UButton
          v-if="pushStatus === 'off'"
          size="lg"
          class="min-h-11"
          :loading="pushBusy"
          :label="$t('profile.pushEnable')"
          @click="togglePush(true)"
        />
        <UButton
          v-else-if="pushStatus === 'on'"
          color="neutral"
          variant="outline"
          size="lg"
          class="min-h-11"
          :loading="pushBusy"
          :label="$t('profile.pushDisable')"
          @click="togglePush(false)"
        />
      </div>
    </section>

    <section class="space-y-3" aria-labelledby="profile-channels">
      <div class="space-y-1">
        <h2 id="profile-channels" class="font-semibold">{{ $t('profile.channelsTitle') }}</h2>
        <p class="text-sm text-muted">{{ $t('profile.channelsText') }}</p>
      </div>

      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
        <template #actions>
          <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
        </template>
      </UAlert>
      <UAlert v-if="errorSave" color="error" variant="subtle" icon="i-tm-error" :title="errorSave" />
      <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

      <ul v-if="data" class="space-y-3">
        <li v-for="p in data" :key="p.clubId" class="space-y-3 rounded-lg border border-default bg-elevated p-4">
          <h3 class="truncate font-semibold">{{ p.name }}</h3>
          <USwitch
            v-for="c in CHANNELS"
            :key="c"
            :model-value="p[c]"
            :label="$t(`profile.${c}`)"
            :disabled="saving === p.clubId"
            :aria-label="`${p.name}: ${$t(`profile.${c}`)}`"
            @update:model-value="(v: boolean) => change(p, c, v)"
          />
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { NotificationPreference, PushState } from '~/utils/notification'

const CHANNELS = ['inApp', 'email', 'push'] as const

const { t } = useI18n()
useHead({ title: () => `${t('profile.title')} · TeamManix` })
const notifications = useNotifications()
const toast = useToast()
const colorMode = useColorMode()

// Theme: kept by the color mode module in this browser, so it is still there when the app is reopened.
const theme = computed({
  get: () => colorMode.preference,
  set: (v: string) => { colorMode.preference = v },
})
const themes = computed(() => [
  { value: 'system', label: t('shell.themeAutomatic') },
  { value: 'light', label: t('shell.themeLight') },
  { value: 'dark', label: t('shell.themeDark') },
])

// Channels of every club of the account.
const { data, loading, error, reload: load } = useLoad(() => notifications.preferences())
const errorSave = ref('')
const saving = ref('')

/** The switch moves at once and goes back if the server refuses, so what is shown is what is saved. */
async function change(p: NotificationPreference, channel: (typeof CHANNELS)[number], value: boolean) {
  const before = p[channel]
  p[channel] = value
  saving.value = p.clubId
  errorSave.value = ''
  try {
    const saved = await notifications.savePreference(p.clubId, { inApp: p.inApp, email: p.email, push: p.push })
    Object.assign(p, saved)
    toast.add({ title: t('profile.saved'), color: 'success' })
  }
  catch (e) {
    p[channel] = before
    errorSave.value = errorText(e)
  }
  finally {
    saving.value = ''
  }
}

// Web Push of this browser. The permission is asked only when the person taps the button.
const push = usePush()
const pushStatus = ref<PushState>('unavailable')
const pushLoading = ref(true)
const pushBusy = ref(false)
const errorPush = ref('')

const pushText = computed(() => ({
  unsupported: t('profile.pushUnsupported'),
  unavailable: t('profile.pushUnavailable'),
  blocked: t('profile.pushBlocked'),
  off: t('profile.pushOff'),
  on: t('profile.pushOn'),
})[pushStatus.value])

async function togglePush(on: boolean) {
  pushBusy.value = true
  errorPush.value = ''
  try {
    pushStatus.value = on ? await push.enable() : await push.disable()
    if (on && pushStatus.value === 'on') toast.add({ title: t('profile.pushEnabled'), color: 'success' })
    if (!on && pushStatus.value !== 'on') toast.add({ title: t('profile.pushDisabled'), color: 'success' })
  }
  catch (e) {
    errorPush.value = errorText(e)
  }
  finally {
    pushBusy.value = false
  }
}

onMounted(async () => {
  void load()
  try {
    pushStatus.value = await push.status()
  }
  catch (e) {
    errorPush.value = errorText(e)
  }
  finally {
    pushLoading.value = false
  }
})
</script>
