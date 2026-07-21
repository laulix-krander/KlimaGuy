# Architektur

KlimaGuy ist ein modularer Monolith auf Next.js App Router. Fachlogik liegt in `lib/domain`, Supabase-Zugriffe im Server- oder Browser-Client und UI-Komponenten in `components`.

## Frontend

React Server Components, deutschsprachige responsive Tailwind-Oberfläche, Formulare mit Zod-validierten Server Actions.

## API Layer

Der aktuelle API-Layer besteht aus Server Actions und Route Handlern. Externe Daten dürfen nur nach Zod-Validierung verarbeitet werden.

## Datenbank

Supabase PostgreSQL enthält Profile, Kunden, Projekte, Notizen und Audit-Log. Fachliche Tabellen nutzen UUIDs, Indizes, `updated_at` Trigger, Soft Delete und RLS.

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
