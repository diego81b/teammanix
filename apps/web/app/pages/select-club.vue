<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold">{{ $t('selectClub.title') }}</h1>
      <p class="text-sm text-muted">{{ $t('selectClub.text') }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" />

    <ul class="space-y-2">
      <li v-for="a in session.memberships" :key="a.clubId">
        <button
          type="button"
          class="flex min-h-14 w-full items-center gap-3 rounded-lg border border-default bg-elevated px-4 py-3 text-left transition-colors hover:bg-accented disabled:opacity-60"
          :class="a.clubId === session.activeClubId ? 'border-primary' : ''"
          :disabled="!!ongoing"
          :aria-current="a.clubId === session.activeClubId ? 'true' : undefined"
          @click="choose(a.clubId)"
        >
          <UIcon name="i-tm-building" class="size-6 shrink-0 text-muted" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ a.name }}</span>
            <span class="block text-sm text-muted">{{ roles(a) }}</span>
          </span>
          <UIcon
            :name="ongoing === a.clubId ? 'i-tm-loader' : 'i-tm-chevron-right'"
            class="size-5 shrink-0 text-muted"
            :class="ongoing === a.clubId ? 'animate-spin' : ''"
          />
        </button>
      </li>
    </ul>

    <UButton to="/club/new" block size="xl" color="neutral" variant="outline" icon="i-tm-plus" :label="$t('selectClub.new')" />

    <p class="text-center text-sm">
      <button type="button" class="text-muted underline underline-offset-2" @click="logout">{{ $t('common.logout') }}</button>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { Membership, SessionDto } from '~/types/api'

definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useHead({ title: () => `${t('selectClub.title')} · TeamManix` })

const api = useApi()
const session = useSessionStore()
const ongoing = ref('')
const error = ref('')

// The API does not yet expose staff and player as roles: for now we only say "Tesserato".
function roles(a: Membership): string {
  const r: string[] = []
  if (a.roles.some(x => x.role === 'admin')) r.push(t('roles.admin'))
  if (a.roles.some(x => x.role === 'manager')) r.push(t('roles.manager'))
  if (a.linkedToPerson) r.push(t('roles.registeredMember'))
  return r.join(', ') || t('roles.member')
}

async function choose(clubId: string) {
  ongoing.value = clubId
  error.value = ''
  try {
    session.set(await api<SessionDto>('/auth/select-club', { body: { clubId } }))
    await navigateTo('/')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    ongoing.value = ''
  }
}

async function logout() {
  session.clear()
  await navigateTo('/login')
}
</script>
