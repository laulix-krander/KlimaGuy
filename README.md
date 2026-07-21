# KlimaGuy

KlimaGuy ist das technische Fundament für einen internen WhatsApp- und Angebotsassistenten eines Klimaanlagen-Fachbetriebs. Aktuell umfasst die App Admin-Workflows für Auth, Dashboard, Kunden, Projekte, Notizen, Audit-Verlauf, Supabase-Schema und Dokumentation. Automatische Kundenkommunikation und verbindliche Angebote sind ausdrücklich nicht enthalten.

## Lokales Setup
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase Setup
1. Supabase-Projekt anlegen.
2. Werte aus `.env.example` in `.env.local` setzen.
3. Migrationen aus `supabase/migrations` in Reihenfolge anwenden, zum Beispiel über Supabase CLI oder SQL Editor.
4. Benutzer in Supabase Auth manuell anlegen; öffentliche Registrierung ist nicht vorgesehen.
5. Passende Zeile in `profiles` anlegen:
   ```sql
   insert into profiles (id, display_name, role) values ('<auth-user-id>', 'Admin', 'admin');
   insert into profiles (id, display_name, role) values ('<auth-user-id>', 'Reviewer', 'reviewer');
   ```

## Vercel Deployment prüfen
In Vercel dieselben Environment-Variablen setzen, Deployment starten und danach Login, Kundenliste, Projektliste sowie eine Projektdetailseite prüfen. Vor einem Produktivdeploy lokal `npm run typecheck`, `npm run lint`, `npm test` und `npm run build` ausführen.

## Environment Variablen
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Der Service Key ist nur serverseitig zu setzen und wird für normale Benutzeraktionen nicht verwendet.

## Rollen
Admin darf Kunden und Projekte anlegen, bearbeiten und soft löschen sowie alle Notizen verwalten. Reviewer darf Kunden und Projekte lesen, Projektstatus, Projektklasse, Human-Review-Flag und Zusammenfassung ändern sowie eigene Notizen verwalten.

## Aktueller Funktionsumfang
- Login/Logout via Supabase Auth
- Geschützte Routen per Middleware
- Dashboard mit Projektkennzahlen
- Kundenliste, Suche, Detail, Anlage, Bearbeitung und Soft Delete
- Projektliste mit Suche/Filtern, Detail, Anlage, Bearbeitung und Soft Delete
- Statusübergänge mit serverseitiger Prüfung
- Projektklassen A-D mit Erklärung
- Notizen mit Anlage, Bearbeitung und Soft Delete
- Audit-Verlauf auf Projektdetailseiten
- Supabase Migrationen mit RLS und Soft Delete

## Noch nicht implementiert
WhatsApp-Anbindung, OpenAI API, Bildanalyse, Angebotskalkulation, PDF-Erstellung, Herstellerdatenbank und automatische Kundenkommunikation.
