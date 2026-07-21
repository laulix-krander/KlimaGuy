# KlimaGuy

KlimaGuy ist das technische Fundament für einen internen WhatsApp- und Angebotsassistenten eines Klimaanlagen-Fachbetriebs. Aktuell werden nur Admin-Grundlagen umgesetzt: Auth, Dashboard, Kunden, Projekte, Notizen, Supabase-Schema und Dokumentation. Automatische Kundenkommunikation und verbindliche Angebote sind ausdrücklich nicht enthalten.

## Lokales Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase Setup

1. Supabase-Projekt anlegen.
2. Werte aus `.env.example` in `.env.local` setzen.
3. Migrationen aus `supabase/migrations` anwenden.
4. Benutzer in Supabase Auth manuell anlegen; keine öffentliche Registrierung.
5. Passende Zeile in `profiles` mit Rolle `admin` oder `reviewer` anlegen.

## Vercel Deployment

Repository mit Vercel verbinden, Environment-Variablen setzen und Next.js-Standardbuild verwenden. Der `SUPABASE_SERVICE_ROLE_KEY` ist nur serverseitig zu setzen und wird aktuell nicht verwendet.

## Environment Variablen

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Aktueller Funktionsumfang

- Login/Logout via Supabase Auth
- Geschützte Routen per Middleware
- Dashboard mit Projektkennzahlen
- Kundenliste, Suche und Anlage
- Projektliste, Filter und Anlage
- Projektdetailseite mit Notizen
- Supabase Migration mit RLS und Soft Delete

## Noch nicht implementiert

WhatsApp-Anbindung, OpenAI API, Bildanalyse, Angebotskalkulation, PDF-Erstellung, Herstellerdatenbank und automatische Kundenkommunikation.
