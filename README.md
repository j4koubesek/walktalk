# WalkTalk + Supabase (MVP v2.4)

Co je nově:
- **Webhook payloady** (z frontendu):
  - `joined`: `{ walk, host, joiner, participantsEmails, counts }`
  - `capacity_reached`: `{ walk, host, lastJoiner, participantsEmails, counts, ics }`
- `ics` je generovaný přímo na webu (posílá se jako `data.ics`).
- Vzhled: větší mezery/paddingy, lepší rozestupy.

Nasazení: nahraj obsah složky `walktalk-supabase/` do kořene repa, nastav env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON`, `VITE_WEBHOOK_URL`), redeploy.
