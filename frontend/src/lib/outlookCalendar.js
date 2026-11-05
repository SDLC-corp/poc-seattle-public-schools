import { useCallback } from 'react'
import { useAuth } from '../auth/authContext'
import { SCOPES } from '../auth/msalConfig'
import { graph } from '../auth/graph'
import { request } from './api'

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const HOURS = 2 // an inspection is booked as a 2-hour event

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const addHours = (date, time, h) => {
  const d = new Date(`${date}T${time}:00`)
  d.setHours(d.getHours() + h)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

/** The Outlook event for an inspection (details from GET /inspection-records/records/:id/calendar-event). */
function eventFor(d, invite) {
  const time = d.scheduledTime || '09:00'
  const where = [d.schoolName, d.buildingName, d.floorName, d.roomNumber && `Room ${d.roomNumber} ${d.roomName}`.trim()].filter(Boolean).join(', ')
  const link = `${window.location.origin}/inspections/records/${d.id}`
  const row = (k, v) => (v ? `<tr><td style="padding:3px 12px 3px 0;color:#5b6b7b;vertical-align:top">${esc(k)}</td><td style="padding:3px 0"><b>${v}</b></td></tr>` : '')
  const acms = d.acms.map((a) => `${esc(a.name)}${a.location ? ` <span style="color:#5b6b7b">(${esc(a.location)})</span>` : ''}`).join('<br>')
  const body = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px">
<p style="margin:0 0 10px">Asbestos <b>${esc(d.type)}</b> scheduled in the Seattle Public Schools asbestos compliance app.</p>
<table style="border-collapse:collapse">
${row('Inspection', esc(d.id))}${row('Type', esc(d.type))}${row('School', esc(d.schoolName))}${row('Location', esc(where))}
${row(`ACM${d.acms.length > 1 ? `s (${d.acms.length})` : ''}`, acms)}${row('Inspector', esc(d.inspector?.name))}${row('Scheduled by', esc(d.scheduledBy))}
${row('Follow-up of', esc(d.parentId))}${row('From surveillance', esc(d.surveillanceId))}${row('Notes', esc(d.notes))}
</table>
<p style="margin:12px 0 0"><a href="${esc(link)}">Open the inspection in the app</a></p></div>`
  return {
    subject: `Asbestos ${d.type} – ${d.schoolName} (${d.id})`,
    start: { dateTime: `${d.scheduledDate}T${time}:00`, timeZone: TZ },
    end: { dateTime: addHours(d.scheduledDate, time, HOURS), timeZone: TZ },
    location: { displayName: where },
    body: { contentType: 'HTML', content: body },
    categories: ['Asbestos Inspection'],
    showAs: 'busy',
    reminderMinutesBeforeStart: 60,
    attendees: invite ? [{ emailAddress: { address: invite.email, name: invite.name }, type: 'required' }] : [],
    // Graph returns the same event for a repeat of this id, so a retry can't book it twice
    transactionId: `sps-inspection-${d.id}`,
  }
}

/**
 * Adds inspections to the signed-in user's Outlook calendar (Microsoft Graph, delegated Calendars.ReadWrite) and
 * records the event on each inspection. The assigned inspector is invited when their email is in the signed-in
 * user's own organisation (same email domain), so invitations never go to outside addresses.
 *
 * interactive: false (after saving) only uses an Outlook permission already granted; true (a button click) may
 * open Microsoft's consent popup.
 */
export function useOutlookCalendar() {
  const { configured, account, getToken } = useAuth()
  const available = Boolean(configured && account)

  const addInspections = useCallback(async (ids, { interactive = false } = {}) => {
    if (!available) return { status: 'unavailable', added: [] }
    let token
    try {
      token = await getToken(SCOPES.outlook, { interactive })
    } catch (e) {
      return { status: e.consentRequired ? 'needsConsent' : 'error', error: e.message, added: [] }
    }
    const domain = account.email?.split('@')[1]?.toLowerCase()
    const added = []
    const failed = []
    for (const id of ids) {
      try {
        const d = await request(`/inspection-records/records/${id}/calendar-event`)
        if (d.outlook) { added.push({ id, ...d.outlook, existing: true }); continue }
        if (!d.scheduledDate) { failed.push({ id, error: 'No date set' }); continue }
        const email = d.inspector?.email?.toLowerCase()
        const invite = email && domain && email.endsWith(`@${domain}`) && email !== account.email.toLowerCase() ? d.inspector : null
        const ev = await graph(token, '/me/events', { method: 'POST', body: eventFor(d, invite) })
        const saved = await request(`/inspection-records/records/${id}/outlook`, {
          method: 'POST', body: { eventId: ev.id, webLink: ev.webLink, invited: invite ? `${invite.name} <${invite.email}>` : null },
        })
        added.push({ id, ...saved.outlook })
      } catch (e) {
        failed.push({ id, error: e.message })
      }
    }
    return { status: failed.length && !added.length ? 'error' : 'ok', added, failed, error: failed[0]?.error }
  }, [available, account, getToken])

  return { available, addInspections }
}

/** One-line toast text for the result of addInspections after an inspection was created. */
export function outlookNote(res) {
  if (!res || res.status === 'unavailable') return ''
  if (res.status === 'needsConsent') return ' Connect Outlook (Microsoft 365 › Outlook Calendar) to add it to your calendar.'
  if (!res.added.length) return ` Couldn't add it to Outlook (${res.error}).`
  const invited = res.added.find((a) => a.invited)?.invited
  return ` Added to your Outlook calendar${invited ? ` and invited ${invited.replace(/ <.*>$/, '')}` : ''}.`
}
