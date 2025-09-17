# WalkTalk + Supabase (MVP v2.1)

Změny oproti v2:
- Tlačítko **Přidat se** po úspěchu okamžitě přepne na **Přihlášen/a** (lokální odezva).
- UI „vidí“, které procházky máš už přihlášené (dle `joiner_email`), i po reloadu.
- Po přihlášení zobrazí krátké potvrzení (alert). Webhooky `joined` a `capacity_reached` zůstávají.

## Nasazení
1) Nahraj obsah složky `walktalk-supabase/` do kořene GitHub repa (přepiš soubory).  
2) Vercel: zkontroluj env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON`, `VITE_WEBHOOK_URL` → Redeploy.  
3) Supabase: tabulky `walks` a `walk_participants` + RLS (viz předchozí SQL).  
4) Make: router 2 větve (joined, capacity_reached) → SMTP e-maily.

Poznámka: Po přihlášení neukazujeme celkový stav `1/3`. To doplníme přes view s agregací v dalším kroku.
