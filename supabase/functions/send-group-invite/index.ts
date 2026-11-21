// Supabase Edge Function: send-group-invite
// Creates a group invitation as the signed-in caller (permissions are enforced by the
// create_invitation() database function) and emails the invitee a join link.
//
// Delivery order:
//   1. RESEND_API_KEY set → branded email via Resend (from INVITE_FROM)
//   2. otherwise Supabase Auth email: an "invite" for new addresses, a sign-in link for existing accounts
// The join link is always returned so the app can also offer "Send with Gmail" / "Copy link".
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

  let delivered: 'resend' | 'supabase_invite' | 'supabase_signin_link' | 'failed' = 'failed'
  let deliveryError: string | undefined

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (resendKey) {
    const from = Deno.env.get('INVITE_FROM') ?? 'PocketLedger <onboarding@resend.dev>'
    const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
      <p style="font-size:32px;margin:0">${esc(group?.icon ?? '👥')}</p>
      <h2 style="margin:8px 0">${esc(inviter)} invited you to “${esc(groupName)}”</h2>
      <p>Join the group on PocketLedger to save and track shared money together.</p>
      <p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Join ${esc(groupName)}</a></p>
      <p style="color:#666;font-size:13px">This invitation is for ${esc(email)} and expires in 7 days. If you weren't expecting it, you can ignore this email.</p></div>`
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: `${inviter} invited you to ${groupName} on PocketLedger`, html }),
    })
    if (r.ok) delivered = 'resend'
    else deliveryError = `Resend: ${(await r.text()).slice(0, 200)}`
  } else {
    // Supabase Auth email (subject to the project's email settings and rate limits).
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: link,
      data: { name: undefined, invited_to_group: body.group_id },
    })
    if (!error) delivered = 'supabase_invite'
    else if (/already|registered|exists/i.test(error.message)) {
      const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
      const { error: e2 } = await anon.auth.signInWithOtp({ email, options: { emailRedirectTo: link, shouldCreateUser: false } })
      if (!e2) delivered = 'supabase_signin_link'
      else deliveryError = e2.message
    } else deliveryError = error.message
  }

  await admin
    .from('group_invitations')
    .update({ last_sent_at: new Date().toISOString(), send_count: delivered === 'failed' ? 0 : 1 })
    .eq('id', row.invitation_id)

  return json({ invitation_id: row.invitation_id, expires_at: row.expires_at, link, delivered, delivery_error: deliveryError, group_name: groupName, inviter })
})
