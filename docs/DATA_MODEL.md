# Datenmodell

## profiles

Benutzerprofil zu `auth.users`: `id`, `display_name`, `role`, `created_at`, `updated_at`. Rollen: `admin`, `reviewer`.

## customers

Kundenstamm mit `id`, Name, optionaler E-Mail/Telefonnummer, `created_by`, Zeitstempeln und `deleted_at` für Soft Delete.

## projects

Projektakte mit Kunde, Titel, Status, optionaler Projektklasse A-D, Montageadresse, Zusammenfassung, `requires_human_review` standardmäßig `true`, Ersteller, Zeitstempeln und Soft Delete. Statuswerte: `new`, `collecting_information`, `technical_review`, `quote_draft`, `human_review`, `quote_sent`, `accepted`, `rejected`, `closed`.

## project_notes

Interne Notizen je Projekt mit Inhalt, Ersteller, Zeitstempeln und `deleted_at` für Soft Delete. Aktive Notizen haben `deleted_at IS NULL`; bestehende Notizen bleiben nach der AP-09-Migration aktiv.

## audit_log

Nachvollziehbarkeit mit Actor, Entity, Action und nicht-sensiblen JSON-Metadaten. Keine direkte Client-Bearbeitung.
