# Datenmodell

## profiles
Benutzerprofil zu `auth.users`: `id`, `display_name`, `role`, `created_at`, `updated_at`. Rollen: `admin`, `reviewer`.

## customers
Kundenstamm mit `id`, Name, optionaler E-Mail/Telefonnummer, `created_by`, Zeitstempeln und `deleted_at` für Soft Delete. Normale Listen zeigen nur Datensätze mit `deleted_at is null`. Kunden dürfen nur soft gelöscht werden, wenn keine aktiven Projekte existieren; `rejected` und `closed` gelten als nicht aktiv.

## projects
Projektakte mit Kunde, Titel, Status, optionaler Projektklasse A-D, Montageadresse, Zusammenfassung, `requires_human_review` standardmäßig `true`, Ersteller, Zeitstempeln und Soft Delete. Statuswerte: `new`, `collecting_information`, `technical_review`, `quote_draft`, `human_review`, `quote_sent`, `accepted`, `rejected`, `closed`.

## Statusübergänge
- `new` → `collecting_information`, `rejected`, `closed`
- `collecting_information` → `technical_review`, `rejected`, `closed`
- `technical_review` → `collecting_information`, `quote_draft`, `human_review`, `rejected`, `closed`
- `quote_draft` → `technical_review`, `human_review`, `quote_sent`, `rejected`, `closed`
- `human_review` → `technical_review`, `quote_draft`, `quote_sent`, `rejected`, `closed`
- `quote_sent` → `accepted`, `rejected`, `closed`
- `accepted` → `closed`
- `rejected` → `closed`
- `closed` → keine weiteren Übergänge

## project_notes
Interne Notizen je Projekt mit Inhalt, Ersteller, Zeitstempeln und `deleted_at`. Notizen werden nicht hart gelöscht. Reviewer dürfen eigene Notizen bearbeiten und soft löschen; Admins dürfen alle Notizen verwalten.

## audit_log
Nachvollziehbarkeit mit Actor, Entity, Action und nicht-sensiblen JSON-Metadaten. Direkte Client-Bearbeitung bleibt gesperrt; Einträge werden serverseitig über eine Security-Definer-Funktion erstellt.

Audit-Aktionen: `customer.created`, `customer.updated`, `customer.soft_deleted`, `project.created`, `project.updated`, `project.status_changed`, `project.class_changed`, `project.review_flag_changed`, `project.soft_deleted`, `project_note.created`, `project_note.updated`, `project_note.soft_deleted`.

## Indizes und RLS
Die zweite Migration ergänzt Such-/Filterindizes für aktive Kunden, Projekte, Notizen und Audit-Verlauf. RLS erlaubt internen Nutzern Lesen, Admins vollständige Stammdatenpflege und Reviewern nur Review-Felder sowie eigene Notizen.
