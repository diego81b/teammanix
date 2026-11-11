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
        <NuxtLink :to="`/calendar/${data.event.seasonId}`" class="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-default">
          <UIcon name="i-tm-chevron-left" class="size-4" aria-hidden="true" />
          {{ $t('callup.back') }}
        </NuxtLink>
        <h1 class="text-2xl font-bold">{{ $t('callup.title') }}</h1>
        <p class="text-sm text-muted">
          <span class="font-semibold text-default">{{ eventHeading(data.event, key => t(key)) }}</span>
          · {{ formatDate(splitInstant(data.event.start).date, locale) }} · {{ splitInstant(data.event.start).time }} - {{ splitInstant(data.event.end).time }}
          <template v-if="data.event.venue"> · {{ data.event.venue.name }}</template>
        </p>
        <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
      </div>

      <!-- Player: only who is called up and the answers. -->
      <section v-if="data.view === 'player'" class="space-y-3" :aria-label="$t('callup.calledUp')">
        <UAlert
          :color="data.iAmCalledUp ? 'success' : 'neutral'"
          variant="subtle"
          :icon="data.iAmCalledUp ? 'i-tm-check-circle' : 'i-tm-info'"
          :title="data.iAmCalledUp ? $t('callup.youAreCalledUp') : $t('callup.notCalledUp')"
        />
        <!-- The player answers in one tap. A decline asks for a reason from the closed list. -->
        <div v-if="data.iAmCalledUp" class="space-y-2 rounded-lg border border-default bg-elevated p-3" role="group" :aria-label="$t('callup.answerTitle')">
          <p class="flex items-center gap-2 text-sm font-semibold">
            {{ $t('callup.answerTitle') }}
            <UBadge v-if="mine" :color="RESPONSE_COLOR[mine]" variant="subtle" :label="$t(`callup.response.${mine}`)" />
          </p>
          <div class="flex gap-2">
            <UButton
              class="min-h-11 flex-1 justify-center"
              size="lg"
              :variant="mine === 'confirmed' ? 'solid' : 'outline'"
              :color="mine === 'confirmed' ? 'success' : 'neutral'"
              :aria-pressed="mine === 'confirmed'"
              :loading="answering === 'confirmed'"
              :label="$t('callup.iCome')"
              @click="respond('confirmed')"
            />
            <UButton
              class="min-h-11 flex-1 justify-center"
              size="lg"
              :variant="mine === 'declined' ? 'solid' : 'outline'"
              :color="mine === 'declined' ? 'error' : 'neutral'"
              :aria-pressed="mine === 'declined'"
              :label="$t('callup.iDontCome')"
              @click="open.decline = true"
            />
          </div>
        </div>
        <h2 class="font-semibold">{{ $t('callup.calledUp') }} ({{ data.calledUp.length }})</h2>
        <p v-if="data.calledUp.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('callup.emptyCalledUp') }}</p>
        <ul v-else class="space-y-2">
          <li v-for="p in data.calledUp" :key="p.enrollmentId" class="flex items-center gap-3 rounded-lg border border-default bg-elevated p-3" :class="p.mine ? 'border-primary' : ''">
            <span class="min-w-0 flex-1 truncate font-medium">{{ personName(p) }}</span>
            <span v-if="p.jerseyNumber !== null" class="text-sm text-muted">#{{ p.jerseyNumber }}</span>
            <UBadge :color="RESPONSE_COLOR[p.response]" variant="subtle" :label="$t(`callup.response.${p.response}`)" />
          </li>
        </ul>
        <h2 class="pt-2 font-semibold">{{ $t('callup.staffAvailableTitle') }} ({{ data.staff.length }})</h2>
        <p v-if="data.staff.length === 0" class="rounded-lg border border-dashed border-default p-4 text-center text-sm text-muted">{{ $t('callup.staffEmptyAvailable') }}</p>
        <ul v-else class="space-y-2">
          <li v-for="s in data.staff" :key="s.enrollmentId" class="flex items-center gap-3 rounded-lg border border-default bg-elevated p-3">
            <span class="min-w-0 flex-1 truncate font-medium">{{ personName(s) }}</span>
            <span v-if="s.staffRole" class="text-sm text-muted">{{ $t(`staffRole.${s.staffRole}`) }}</span>
          </li>
        </ul>
      </section>

      <!-- Staff, managers, admin: the three lists. -->
      <template v-else>
        <UAlert v-if="data.view === 'read'" color="neutral" variant="subtle" icon="i-tm-lock" :title="$t('callup.readOnly')" />
        <UAlert v-if="data.noCoachWarning" color="warning" variant="subtle" icon="i-tm-warning" :title="$t('callup.noCoachWarning')" />
        <p class="text-sm text-muted">{{ data.blockCertificate ? $t('callup.certificateBlocks') : $t('callup.certificateWarns') }}</p>

        <UTabs v-model="tab" :items="tabs" :content="false" class="w-full" :aria-label="$t('callup.lists')" />

        <p v-if="current.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t(`callup.empty${capital(tab)}`) }}</p>
        <ul v-else class="space-y-2">
          <li v-for="r in current" :key="r.enrollmentId" class="space-y-2 rounded-lg border border-default bg-elevated p-3">
            <div class="flex items-center gap-3">
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">
                  {{ personName(r) }}
                  <span v-if="r.jerseyNumber !== null" class="text-sm font-normal text-muted">#{{ r.jerseyNumber }}</span>
                </p>
                <p class="flex flex-wrap items-center gap-1.5 pt-1">
                  <UBadge v-if="tab === 'calledUp' && r.response" :color="RESPONSE_COLOR[r.response]" variant="subtle" :label="$t(`callup.response.${r.response}`)" />
                  <UBadge v-if="tab === 'calledUp' && !r.notified" color="neutral" variant="outline" :label="$t('callup.toSend')" />
                  <UBadge v-for="x in blockers(r)" :key="x.code" color="error" variant="subtle" icon="i-tm-ban" :label="reasonText(x)" />
                  <UBadge v-for="x in warnings(r)" :key="x.code" color="warning" variant="subtle" icon="i-tm-warning" :label="reasonText(x)" />
                </p>
              </div>
              <template v-if="data.view === 'manage'">
                <UButton
                  v-if="rowAction(tab, r) === 'remove'"
                  color="neutral"
                  variant="outline"
                  size="lg"
                  class="min-h-11"
                  icon="i-tm-user-minus"
                  :label="$t('callup.remove')"
                  :aria-label="$t('callup.removeAria', { name: personName(r) })"
                  :loading="busy === r.enrollmentId"
                  @click="remove(r)"
                />
                <UButton
                  v-else-if="rowAction(tab, r) === 'add'"
                  size="lg"
                  class="min-h-11"
                  icon="i-tm-user-plus"
                  :label="$t('callup.add')"
                  :aria-label="$t('callup.addAria', { name: personName(r) })"
                  :loading="busy === r.enrollmentId"
                  @click="add(r, false)"
                />
                <UButton
                  v-else-if="rowAction(tab, r) === 'add_confirm'"
                  color="warning"
                  variant="outline"
                  size="lg"
                  class="min-h-11"
                  icon="i-tm-user-plus"
                  :label="$t('callup.addAnyway')"
                  :aria-label="$t('callup.addAria', { name: personName(r) })"
                  @click="askConfirm(r)"
                />
              </template>
              <!-- Rule 13: from a match the suspension counts from the next one. Only who can record sees it. -->
              <UButton
                v-if="canSuspendHere && !isSuspendedHere(r)"
                color="neutral"
                variant="ghost"
                size="lg"
                class="min-h-11"
                icon="i-tm-ban"
                :label="$t('callup.suspend')"
                :aria-label="$t('callup.suspendAria', { name: personName(r) })"
                @click="askSuspend(r)"
              />
            </div>
            <!-- Starter or bench: staff only, only for sports that use it. -->
            <div v-if="data.view === 'manage' && data.starterBench && tab === 'calledUp'" class="flex gap-2" role="group" :aria-label="$t('callup.placementAria', { name: personName(r) })">
              <UButton
                v-for="p in PLACEMENTS"
                :key="p"
                size="lg"
                class="min-h-11 min-w-11"
                :variant="r.placement === p ? 'solid' : 'outline'"
                :color="r.placement === p ? 'primary' : 'neutral'"
                :label="$t(`callup.${p}`)"
                :aria-label="$t(`callup.${p}Label`)"
                :aria-pressed="r.placement === p"
                @click="mark(r, p)"
              />
            </div>
            <!-- Every change of answer is kept with its date. -->
            <UButton
              v-if="tab === 'calledUp' && r.response && r.response !== 'pending'"
              color="neutral"
              variant="link"
              size="lg"
              class="min-h-11 px-0"
              icon="i-tm-clock"
              :label="$t('callup.history.open')"
              :aria-label="$t('callup.history.openAria', { name: personName(r) })"
              @click="showHistory(r)"
            />
          </li>
        </ul>

        <!-- Staff availability: staff, managers and the admin see every answer. -->
        <section class="space-y-3 pt-2" :class="data.view === 'manage' ? 'pb-24' : ''" :aria-label="$t('callup.staffTitle')">
          <h2 class="font-semibold">{{ $t('callup.staffTitle') }}</h2>
          <div v-if="ownStaff" class="space-y-2 rounded-lg border border-default bg-elevated p-3" role="group" :aria-label="$t('callup.myAvailability')">
            <p class="text-sm font-semibold">{{ $t('callup.myAvailability') }}</p>
            <UAlert
              v-if="ownAbsence"
              color="warning"
              variant="subtle"
              icon="i-tm-info"
              :title="ownAbsence.until ? $t(ownAbsence.key, { date: formatDate(ownAbsence.until, locale) }) : $t(ownAbsence.key)"
            />
            <UAlert
              v-if="ownSuspension"
              color="error"
              variant="subtle"
              icon="i-tm-ban"
              :title="$t('callup.suspendedNotice', { match: ownSuspension.match, total: ownSuspension.total })"
            />
            <div class="flex gap-2">
              <UButton
                class="min-h-11 flex-1 justify-center"
                size="lg"
                :variant="ownStaff.response === 'confirmed' ? 'solid' : 'outline'"
                :color="ownStaff.response === 'confirmed' ? 'success' : 'neutral'"
                :aria-pressed="ownStaff.response === 'confirmed'"
                :disabled="ownAbsence !== null || ownSuspension !== null"
                :loading="answering === 'staff-confirmed'"
                :label="$t('callup.setAvailable')"
                @click="declare('confirmed')"
              />
              <UButton
                class="min-h-11 flex-1 justify-center"
                size="lg"
                :variant="ownStaff.response === 'declined' ? 'solid' : 'outline'"
                :color="ownStaff.response === 'declined' ? 'error' : 'neutral'"
                :aria-pressed="ownStaff.response === 'declined'"
                :loading="answering === 'staff-declined'"
                :label="$t('callup.setNotAvailable')"
                @click="declare('declined')"
              />
            </div>
          </div>
          <ul class="space-y-2">
            <li v-for="s in staffRows" :key="s.enrollmentId" class="flex flex-wrap items-center gap-3 rounded-lg border border-default bg-elevated p-3">
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">{{ personName(s) }}</p>
                <p v-if="s.staffRole" class="text-sm text-muted">{{ $t(`staffRole.${s.staffRole}`) }}</p>
              </div>
              <UBadge :color="STAFF_COLOR[staffState(s)]" variant="subtle" :label="$t(`callup.${STAFF_LABEL[staffState(s)]}`)" />
              <UButton
                v-if="staffState(s) !== 'noAnswer'"
                color="neutral"
                variant="link"
                size="lg"
                class="min-h-11 px-0"
                icon="i-tm-clock"
                :label="$t('callup.history.open')"
                :aria-label="$t('callup.history.openAria', { name: personName(s) })"
                @click="showHistory(s)"
              />
            </li>
          </ul>
        </section>

        <div v-if="data.view === 'manage'" class="fixed inset-x-0 bottom-0 z-10 border-t border-default bg-default p-3">
          <div class="mx-auto flex max-w-3xl items-center gap-3">
            <UButton
              size="lg"
              class="min-h-11 flex-1 justify-center"
              icon="i-tm-send"
              :disabled="unsent === 0"
              :loading="sending"
              :label="unsent > 0 ? $t('callup.sendNew', { count: unsent }) : $t('callup.send')"
              @click="send"
            />
          </div>
          <p v-if="unsent === 0" class="pt-1 text-center text-xs text-muted">{{ $t('callup.nothingToSend') }}</p>
        </div>
      </template>

      <SuspensionForm
        v-model:open="open.suspend"
        :fixed="suspending ? { enrollmentId: suspending.enrollmentId, name: personName(suspending) } : null"
        :origin="{ eventId: data.event.id, label: eventHeading(data.event, key => t(key)) }"
        :used="used"
        @saved="load"
      />

      <UModal v-model:open="open.confirm" :title="$t('callup.confirmTitle')" :description="pending ? confirmMessage(personName(pending), pending, t, day => formatDate(day, locale)) : ''">
        <template #footer>
          <UButton color="neutral" variant="outline" size="lg" :label="$t('common.back')" @click="open.confirm = false" />
          <UButton size="lg" :loading="busy !== ''" :label="$t('callup.addAnyway')" @click="pending && add(pending, true)" />
        </template>
      </UModal>

      <!-- A decline names a reason from the closed list: only staff and managers see it. -->
      <UModal v-model:open="open.decline" :title="$t('callup.declineTitle')" :description="$t('callup.declineText')">
        <template #body>
          <div class="grid gap-2" role="radiogroup" :aria-label="$t('callup.declineTitle')">
            <UButton
              v-for="r in DECLINE_REASONS"
              :key="r"
              size="lg"
              class="min-h-11 justify-start"
              :variant="reasonChosen === r ? 'solid' : 'outline'"
              :color="reasonChosen === r ? 'primary' : 'neutral'"
              role="radio"
              :aria-checked="reasonChosen === r"
              :label="$t(`callup.declineReason.${r}`)"
              @click="reasonChosen = r"
            />
          </div>
        </template>
        <template #footer>
          <UButton color="neutral" variant="outline" size="lg" :label="$t('common.back')" @click="open.decline = false" />
          <UButton size="lg" :disabled="!canSend('declined', reasonChosen)" :loading="answering === 'declined'" :label="$t('callup.declineConfirm')" @click="respond('declined', reasonChosen)" />
        </template>
      </UModal>

      <!-- The trail of one person's answers, with dates. -->
      <UModal v-model:open="open.history" :title="$t('callup.history.title')" :description="historyOf ? personName(historyOf) : ''">
        <template #body>
          <p v-if="historyLoading" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>
          <p v-else-if="historyError" class="text-sm text-error">{{ historyError }}</p>
          <p v-else-if="changes.length === 0" class="text-sm text-muted">{{ $t('callup.history.empty') }}</p>
          <ol v-else class="space-y-2">
            <li v-for="(c, i) in changes" :key="i" class="rounded-lg border border-default p-3 text-sm">
              {{ $t('callup.history.line', { answer: $t(historyParts(c).responseKey), reason: historyParts(c).reasonKey ? ` (${$t(historyParts(c).reasonKey as string)})` : '', when: formatChangeTime(c.changedAt, locale) }) }}
            </li>
          </ol>
        </template>
      </UModal>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AnswerChange, CallupReason, CallupResponse, CallupRow, Placement, ReasonDecline, StaffAnswerRow, StaffCallups } from '~/types/api'
import {
  DECLINE_REASONS, blockers, callupCounts, canSend, confirmMessage, formatChangeTime, groupStaff, historyParts, myAnswer, ownStaffRow, reasonLabel, absenceNotice, suspensionNotice, rowAction, togglePlacement, unsentCount, warnings,
  type CallupList,
} from '~/utils/callup'
import { eventHeading } from '~/utils/calendar'
import { formatDate } from '~/utils/date'
import { splitInstant } from '~/utils/event'

const { t, locale } = useI18n()
const route = useRoute()
const toast = useToast()
const callups = useCallups()
const events = useEvents()
const eventId = computed(() => String(route.params.id))

const { data, loading, error, reload: load } = useLoad(() => callups.lists(eventId.value))
useHead({ title: () => `${t('callup.title')} · TeamManix` })

const RESPONSE_COLOR = { pending: 'neutral', confirmed: 'success', declined: 'error' } as const
const PLACEMENTS: Placement[] = ['starter', 'bench']

const tab = ref<CallupList>('calledUp')
const staff = computed<StaffCallups | null>(() => (data.value && data.value.view !== 'player' ? data.value : null))
const current = computed<CallupRow[]>(() => staff.value?.[tab.value] ?? [])
const counts = computed(() => (staff.value ? callupCounts(staff.value) : { calledUp: 0, callable: 0, notCallable: 0 }))
const tabs = computed(() =>
  (['calledUp', 'callable', 'notCallable'] as const).map(value => ({ label: t(`callup.${value}`), value, badge: counts.value[value] })),
)
const unsent = computed(() => (staff.value ? unsentCount(staff.value.calledUp) : 0))
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const personName = (p: { name: string, surname: string | null }) => [p.name, p.surname].filter(Boolean).join(' ')
const reasonText = (r: CallupReason) => reasonLabel(r, t, day => formatDate(day, locale.value))

const errorAction = ref('')
const busy = ref('')
const sending = ref(false)
const open = reactive({ confirm: false, decline: false, history: false, suspend: false })
const pending = ref<CallupRow | null>(null)

/** One action, then the lists are read again: the API recomputes who is in which list. */
async function run(id: string, action: () => Promise<unknown>) {
  busy.value = id
  errorAction.value = ''
  try {
    await action()
    open.confirm = false
    await load()
  }
  catch (e) {
    open.confirm = false
    errorAction.value = errorText(e)
    await load()
  }
  finally {
    busy.value = ''
  }
}

const add = (r: CallupRow, confirm: boolean) => run(r.enrollmentId, () => callups.add(eventId.value, r.enrollmentId, confirm))
const remove = (r: CallupRow) => run(r.enrollmentId, () => callups.remove(eventId.value, r.enrollmentId))
const mark = (r: CallupRow, p: Placement) => run(r.enrollmentId, () => callups.placement(eventId.value, r.enrollmentId, togglePlacement(r.placement, p)))

function askConfirm(r: CallupRow) {
  pending.value = r
  open.confirm = true
}

async function send() {
  sending.value = true
  errorAction.value = ''
  try {
    const r = await callups.send(eventId.value)
    toast.add({ title: t('callup.sent', { count: r.notified.length }), color: 'success' })
    await load()
  }
  catch (e) {
    errorAction.value = errorText(e)
  }
  finally {
    sending.value = false
  }
}

const playerView = computed(() => (data.value?.view === 'player' ? data.value : null))
const mine = computed(() => (playerView.value ? myAnswer(playerView.value.calledUp) : null))
const staffRows = computed<StaffAnswerRow[]>(() => {
  const g = staff.value ? groupStaff(staff.value.staff) : { available: [], notAvailable: [], noAnswer: [] }
  return [...g.available, ...g.notAvailable, ...g.noAnswer]
})
const ownStaff = computed(() => (staff.value ? ownStaffRow(staff.value.staff) : null))
const ownAbsence = computed(() => (ownStaff.value ? absenceNotice(ownStaff.value) : null))
const ownSuspension = computed(() => (ownStaff.value ? suspensionNotice(ownStaff.value) : null))
const STAFF_COLOR = { available: 'success', notAvailable: 'error', noAnswer: 'neutral' } as const
const STAFF_LABEL = { available: 'staffAvailable', notAvailable: 'staffNotAvailable', noAnswer: 'staffNoAnswer' } as const
const staffState = (s: Pick<StaffAnswerRow, 'response'>) => (s.response === 'confirmed' ? 'available' : s.response === 'declined' ? 'notAvailable' : 'noAnswer')

const answering = ref('')
const reasonChosen = ref<ReasonDecline | null>(null)

/** The player answers. Declining sends the reason chosen in the modal. */
async function respond(response: Exclude<CallupResponse, 'pending'>, reason: ReasonDecline | null = null) {
  answering.value = response
  errorAction.value = ''
  try {
    await callups.answer(eventId.value, response, reason ?? undefined)
    open.decline = false
    reasonChosen.value = null
    toast.add({ title: t('callup.answerSaved'), color: 'success' })
    await load()
  }
  catch (e) {
    open.decline = false
    errorAction.value = errorText(e)
  }
  finally {
    answering.value = ''
  }
}

/** A staff member declares available or not available, with no call-up and no reason. */
async function declare(response: Exclude<CallupResponse, 'pending'>) {
  answering.value = `staff-${response}`
  errorAction.value = ''
  try {
    await callups.availability(eventId.value, response)
    toast.add({ title: t('callup.answerSaved'), color: 'success' })
    await load()
  }
  catch (e) {
    errorAction.value = errorText(e)
  }
  finally {
    answering.value = ''
  }
}

const historyOf = ref<{ enrollmentId: string, name: string, surname: string | null } | null>(null)
const changes = ref<AnswerChange[]>([])
const historyLoading = ref(false)
const historyError = ref('')

async function showHistory(who: { enrollmentId: string, name: string, surname: string | null }) {
  historyOf.value = who
  changes.value = []
  historyError.value = ''
  historyLoading.value = true
  open.history = true
  try {
    changes.value = (await callups.history(eventId.value, who.enrollmentId)).changes
  }
  catch (e) {
    historyError.value = errorText(e)
  }
  finally {
    historyLoading.value = false
  }
}

// Rule 13: a suspension can start from a match, by who may record it in the team. For the screen only: the API checks again.
const canSuspend = ref(false)
const used = ref<string[]>([])
const suspending = ref<CallupRow | null>(null)
const canSuspendHere = computed(() => canSuspend.value && data.value?.event.type === 'match' && staff.value !== null)
const isSuspendedHere = (r: CallupRow) => r.reasons.some(x => x.code === 'suspended')

async function askSuspend(r: CallupRow) {
  suspending.value = r
  open.suspend = true
  used.value = await events.competitions(data.value?.event.seasonId ?? '').catch(() => [])
}

async function readAccess() {
  await load()
  if (data.value && data.value.view !== 'player' && data.value.event.type === 'match') {
    canSuspend.value = await events.access(data.value.event.seasonId).then(a => a.canSuspend).catch(() => false)
  }
}

onMounted(readAccess)
</script>
