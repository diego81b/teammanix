<template>
  <section class="space-y-4" aria-labelledby="titolo-inviti">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="title-invitations" class="text-lg font-semibold">{{ $t('invitation.listTitle') }}</h2>
      <UButton icon="i-tm-user-plus" size="lg" class="min-h-11" :label="$t('invitation.new')" @click="fresh = true" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <p v-if="data.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('invitation.empty') }}</p>
      <template v-else>
        <table class="hidden w-full text-left text-sm md:table">
          <caption class="sr-only">{{ $t('invitation.listTitle') }}</caption>
          <thead class="border-b border-default text-muted">
            <tr>
              <th scope="col" class="py-2 pr-3 font-medium">{{ $t('person.email') }}</th>
              <th scope="col" class="px-3 py-2 font-medium">{{ $t('invitation.role') }}</th>
              <th scope="col" class="px-3 py-2 font-medium">{{ $t('season.status') }}</th>
              <th scope="col" class="px-3 py-2 font-medium">{{ $t('invitation.expiry') }}</th>
              <th scope="col" class="py-2 pl-3"><span class="sr-only">{{ $t('common.actions') }}</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="i in data" :key="i.id">
              <th scope="row" class="py-3 pr-3 font-medium">{{ i.email }}</th>
              <td class="px-3 py-3">{{ $t(`roles.${i.role}`) }}</td>
              <td class="px-3 py-3"><UBadge :color="variantInvitation(invitationStatus(i))" variant="subtle" :label="$t(`status.invitation.${invitationStatus(i)}`)" /></td>
              <td class="px-3 py-3">{{ formatDate(i.expiresAt.slice(0, 10), locale) }}</td>
              <td class="py-3 pl-3 text-right">
                <span class="inline-flex gap-1">
                  <UButton v-if="open(i)" color="neutral" variant="outline" class="min-h-11" :loading="ongoing === `r${i.id}`" :label="$t('invitation.resend')" @click="resend(i)" />
                  <UButton v-if="open(i)" color="error" variant="ghost" class="min-h-11" :label="$t('invitation.revoke')" @click="toRevoke = i" />
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <ul class="space-y-2 md:hidden">
          <li v-for="i in data" :key="i.id" class="space-y-2 rounded-lg border border-default bg-elevated p-3">
            <p class="truncate font-semibold">{{ i.email }}</p>
            <p class="flex flex-wrap items-center gap-2 text-sm text-muted">
              {{ $t(`roles.${i.role}`) }}
              <UBadge :color="variantInvitation(invitationStatus(i))" variant="subtle" :label="$t(`status.invitation.${invitationStatus(i)}`)" />
              <span>{{ $t('invitation.expiry') }} {{ formatDate(i.expiresAt.slice(0, 10), locale) }}</span>
            </p>
            <p v-if="open(i)" class="flex flex-wrap gap-2">
              <UButton color="neutral" variant="outline" class="min-h-11" :loading="ongoing === `r${i.id}`" :label="$t('invitation.resend')" @click="resend(i)" />
              <UButton color="error" variant="ghost" class="min-h-11" :label="$t('invitation.revoke')" @click="toRevoke = i" />
            </p>
          </li>
        </ul>
      </template>
    </template>

    <NewInvitation v-model:open="fresh" @sent="load" />

    <UModal :open="!!toRevoke" :title="$t('invitation.revokeTitle', { email: toRevoke?.email ?? '' })" :description="$t('invitation.revokeText')" @update:open="(v) => { if (!v) toRevoke = null }">
      <template #footer>
        <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="toRevoke = null" />
        <UButton color="error" size="lg" :loading="ongoing === 'revoke'" :label="$t('invitation.revoke')" @click="revoke" />
      </template>
    </UModal>
  </section>
</template>

<script setup lang="ts">
import type { InvitationDto, InvitationStatus } from '~/types/api'
import type { VariantBadge } from '~/utils/certificate'
import { formatDate } from '~/utils/date'
import { invitationStatus } from '~/utils/invitation'

const { locale, t } = useI18n()
const access = useAccess()
const toast = useToast()
const { data, loading, error, reload: load } = useLoad(() => access.invitations())

const fresh = ref(false)
const toRevoke = ref<InvitationDto | null>(null)
const ongoing = ref('')
const errorAction = ref('')

const open = (i: InvitationDto) => i.status === 'sent'
const variantInvitation = (s: InvitationStatus): VariantBadge => (s === 'sent' ? 'warning' : s === 'accepted' ? 'success' : 'neutral')

async function run<T>(key: string, action: () => Promise<T>, ok?: string) {
  ongoing.value = key
  errorAction.value = ''
  try {
    await action()
    if (ok) toast.add({ title: ok, color: 'success' })
    await load()
  }
  catch (e) {
    errorAction.value = errorText(e)
  }
  finally {
    ongoing.value = ''
  }
}

const resend = (i: InvitationDto) => run(`r${i.id}`, () => access.resend(i.id), t('invitation.resent'))
async function revoke() {
  const i = toRevoke.value
  if (!i) return
  await run('revoke', () => access.revoke(i.id), t('invitation.revoked'))
  toRevoke.value = null
}

onMounted(load)
</script>
