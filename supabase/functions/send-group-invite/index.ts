// Supabase Edge Function: send-group-invite
// Creates a group invitation as the signed-in caller (permissions are enforced by the
// create_invitation() database function) and emails the invitee a join link.
//
// Delivery:
//   • RESEND_API_KEY set → branded email via Resend (from INVITE_FROM)
//   • otherwise nothing is emailed here and the app opens a ready-made Gmail draft.
// We deliberately do NOT use Supabase Auth emails for invitations: they create a passwordless
// placeholder account (which then blocks normal sign-up) and use up the small hourly email
// allowance that sign-up confirmations need.
// The join link always points at the app's canonical address (PUBLIC_APP_URL secret if set).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const URL_ = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Only send links that point back at this app. */
function appOrigin(req: Request, requested?: string) {
  const canonical = Deno.env.get('PUBLIC_APP_URL')?.replace(/\/+$/, '')
  if (canonical) return canonical
  const allowed = (Deno.env.get('APP_URLS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const ok = (u?: string | null) =>
    !!u && (allowed.includes(u) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(u) || /^http:\/\/localhost:\d+$/.test(u))
  if (ok(requested)) return requested!
  const origin = req.headers.get('origin')
  if (ok(origin)) return origin!
  return allowed[0] ?? null
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'Not signed in' }, 401)

  let body: { group_id?: string; email?: string; role?: string; app_url?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!body.group_id || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'A group and a valid email are required' }, 400)

  const app = appOrigin(req, body.app_url)
  if (!app) return json({ error: 'Unknown app address' }, 400)

  // Act as the caller: create_invitation() checks they are an owner/admin of the group.
  const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: inv, error: invErr } = await asUser.rpc('create_invitation', {
    p_group_id: body.group_id,
    p_email: email,
    p_role: body.role ?? 'member',
  })
  if (invErr) return json({ error: invErr.message }, 400)
  const row = Array.isArray(inv) ? inv[0] : inv
  const link = `${app}/?invite=${row.token}`

  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
  const [{ data: group }, { data: me }] = await Promise.all([
    admin.from('groups').select('name, icon').eq('id', body.group_id).single(),
    asUser.auth.getUser(),
  ])
  const inviter = (me.user?.user_metadata?.name as string | undefined) || me.user?.email?.split('@')[0] || 'A friend'
  const groupName = group?.name ?? 'a group'

  let delivered: 'resend' | 'not_sent' | 'failed' = 'not_sent'
  let deliveryError: string | undefined

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (resendKey) {
    const from = Deno.env.get('INVITE_FROM') ?? 'My Ullu <onboarding@resend.dev>'
    const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
      <p style="font-size:32px;margin:0">${esc(group?.icon ?? '👥')}</p>
      <h2 style="margin:8px 0">${esc(inviter)} invited you to “${esc(groupName)}”</h2>
      <p>Join the group on My Ullu to save and track shared money together.</p>
      <p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Join ${esc(groupName)}</a></p>
      <p style="color:#666;font-size:13px">Sign in or create an account with ${esc(email)} to join. The link works once and expires in 7 days.</p></div>`
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: `${inviter} invited you to ${groupName} on My Ullu`, html }),
    })
    if (r.ok) delivered = 'resend'
    else {
      delivered = 'failed'
      deliveryError = `Resend: ${(await r.text()).slice(0, 200)}`
    }
  }

  await admin
    .from('group_invitations')
    .update({ last_sent_at: new Date().toISOString(), send_count: delivered === 'resend' ? 1 : 0 })
    .eq('id', row.invitation_id)

  return json({ invitation_id: row.invitation_id, expires_at: row.expires_at, link, delivered, delivery_error: deliveryError, group_name: groupName, inviter })
})
