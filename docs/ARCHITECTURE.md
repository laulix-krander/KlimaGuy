# Architektur

KlimaGuy ist ein modularer Monolith auf Next.js App Router. Fachlogik liegt in `lib/domain`, serverseitige Mutationen in `lib/actions`, Supabase-Zugriffe in `lib/supabase` und UI-Komponenten in `components`.

## Frontend
React Server Components, deutschsprachige responsive Tailwind-Oberfläche und kleine Client-Komponenten für Pending-Buttons und Bestätigungsdialoge.

## API Layer
Der aktuelle API-Layer besteht aus Server Actions. Jede Mutation ermittelt den eingeloggten Benutzer, prüft das Profil, validiert Eingaben mit Zod, schreibt Audit-Ereignisse und revalidiert betroffene Seiten.

## Datenbank
Supabase PostgreSQL enthält Profile, Kunden, Projekte, Notizen und Audit-Log. Fachliche Tabellen nutzen UUIDs, Indizes, `updated_at` Trigger, Soft Delete und RLS. Notizen besitzen seit der Workflow-Migration ebenfalls `deleted_at`.

## Authentifizierung
Supabase Auth stellt Sessions bereit. Middleware schützt interne Routen. Registrierung ist nicht öffentlich vorgesehen.

## Geplante Module
- WhatsApp Integration: spätere Inbound/Outbound-Webhooks.
- AI Orchestrator: spätere strukturierte Assistenz, niemals automatische Freigabe.
- Image Analysis: spätere Bild- und Grundrissauswertung.
- Knowledge Base: Hersteller- und Montagewissen.
- Pricing Engine: deterministische Preislogik ohne Sprachmodell.
- Quote Generator: Angebotsentwürfe, keine automatische Versendung.
- Human Review: verbindliche menschliche Prüfung und Freigabe.
