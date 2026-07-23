# KG-AUDIT-2026-07-23-PROJECT-EDIT-V1 – AP-11 Projekt bearbeiten

Status: **DRAFT – NICHT ZUR IMPLEMENTIERUNG FREIGEGEBEN**

Datum: 2026-07-23  
Projekt: KlimaGuy  
Baseline: aktueller Arbeitsstand auf `main`-Nachfolger; AP-10 ist laut Vorgabe abgeschlossen und in Production validiert.  
Audit-Ziel: Architektur- und Sicherheitsaudit für den nächsten Entwicklungsschritt **AP-11 – Projekt bearbeiten**. Dieses Dokument ist ausschließlich Analyse und Planung.

## Scope und harte Abgrenzung

- Es wurde keine Anwendungscode-Implementierung vorgenommen.
- Es wurden keine Refactorings vorgenommen.
- Es wurden keine Tests geschrieben oder geändert.
- Es wurden keine Migrationen, RLS-Policies, Trigger oder SQL-Dateien erstellt oder geändert.
- Die einzige vorgesehene Änderung dieses Branches ist diese Audit-Datei.

## Referenzen im Repository

- `docs/audits/2026-07-21-admin-workflows-audit.md` inklusive AP-01 bis AP-10 Ergebnisnotizen.
- `docs/audits/2026-07-22-ap10-note-delete-failure-audit.md` als AP-10-Hotfix-/Fehleranalysekontext.
- `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DATA_MODEL.md`.
- Relevante App-Routen unter `app/(app)/projects`.
- Projektbezogene Server Actions und Services unter `lib/actions`.
- Domain-Regeln unter `lib/domain`.
- Supabase-Migrationen unter `supabase/migrations`.
- Projektbezogene Tests unter `test`.

## Prüfung 1 – Bestehende Architektur

### Projektladung

1. **Projektliste `/projects`:**
   - Serverseitige Page lädt aktive Projekte aus `projects` mit `deleted_at IS NULL`.
   - Selektierte Spalten: `id`, `title`, `status`, `project_class`, `requires_human_review`, `created_at` und relationale Kundendaten.
   - Sortierung nach `created_at DESC`.
   - Die UI zeigt Kundenname, Status, Projektklasse, Human-Review-Flag und Erstellzeitpunkt.

2. **Projektdetail `/projects/[id]`:**
   - Die Route validiert `params.id` mit `projectIdSchema` und antwortet bei ungültiger UUID mit `notFound()`.
   - Das Projekt wird serverseitig über Supabase geladen mit `id,title,status,project_class,requires_human_review,installation_address,postal_code,city,summary,created_at,updated_at,customers(id,first_name,last_name)`.
   - Der Query filtert per `eq("id", parsedId.data)` und `is("deleted_at", null)`.
   - Fehlendes oder soft gelöschtes Projekt führt zu `notFound()`.
   - Anschließend lädt die Seite Auth-User, Profilrolle, aktive Projektnotizen und Autorenprofile für Notizen.

3. **Projektbearbeiten `/projects/[id]/edit`:**
   - Die Route validiert ebenfalls `params.id` mit `projectIdSchema`.
   - Sie lädt Auth-User und Profilrolle serverseitig.
   - Sie lädt das aktive Projekt minimal mit `id,title,installation_address,postal_code,city,summary` und `deleted_at IS NULL`.
   - Fehlendes Projekt führt zu `notFound()`.
   - Fehlendes/ungültiges Profil oder fehlende Admin-Berechtigung wird als deutsche Hinweiskarte ausgegeben; es erfolgt kein Redirect.

### Beteiligte Server Components

- `app/(app)/projects/page.tsx`: Projektliste und Link zur Anlage.
- `app/(app)/projects/[id]/page.tsx`: Detailseite, Lesemodell, Rollenprüfung, Einbindung von Review- und Notiz-Clientkomponenten.
- `app/(app)/projects/[id]/edit/page.tsx`: Bearbeitungsseite für Projektstammdaten inklusive Rollen-Gating.
- `app/(app)/projects/new/page.tsx`: Anlagekontext für Projekte; für AP-11 nur als Vergleich relevant.
- `app/(app)/layout.tsx`: geschützter App-Rahmen mit serverseitiger Auth-Prüfung.

### Beteiligte Client Components

- `app/(app)/projects/[id]/edit/project-edit-form.tsx`: Formular für Projektstammdaten mit `useActionState(updateProjectCoreAction)`.
- `app/(app)/projects/[id]/project-review-form.tsx`: Formular für Status, Projektklasse und Human-Review-Flag mit `useActionState(updateProjectReviewAction)`.
- `app/(app)/projects/[id]/project-note-form.tsx`: Formular zum Erstellen interner Notizen.
- `app/(app)/projects/[id]/project-note-item.tsx`: Bearbeiten/Soft-Löschen einzelner Notizen.
- `app/(app)/projects/new/project-form.tsx`: Anlageformular; für wiederverwendbare Validierungs-/UX-Muster relevant.

### Bestehende Server Actions mit Projektbezug

Alle projektbezogenen Actions sind in `lib/actions/projects.ts` gebündelt:

- `createProjectAction`: Projektanlage.
- `updateProjectCoreAction`: Bearbeitung der Projektstammdaten `title`, `installation_address`, `postal_code`, `city`, `summary`.
- `updateProjectReviewAction`: Bearbeitung von `status`, `project_class`, `requires_human_review`.
- `createProjectNoteAction`: Notiz anlegen.
- `updateProjectNoteAction`: Notizinhalt bearbeiten.
- `softDeleteProjectNoteAction`: Notiz soft löschen.

### Bestehende Services mit Projektbezug

- `lib/actions/project-create-service.ts`: Projektanlage, aktive Kundenprüfung, Admin-Gating, Insert-Allowlist.
- `lib/actions/project-update-service.ts`: Projektstammdaten-Update, Admin-Gating, UUID-/Zod-Validierung, Patch-Allowlist.
- `lib/actions/project-review-service.ts`: Review-Update, Admin-/Reviewer-Gating, Statusübergangsprüfung, optimistischer Statusfilter.
- `lib/actions/project-note-create-service.ts`: Notizanlage mit aktiver Projektprüfung.
- `lib/actions/project-note-update-service.ts`: Notizupdate mit aktiver Projekt-/Notizprüfung und Ownership-Regeln.
- `lib/actions/project-note-delete-service.ts`: Notiz-Soft-Delete über eng begrenzte RPC nach AP-10-Hotfix.

### Domain-Utilities

- `lib/domain/types.ts`: Rollen, Projektstatuswerte, Projektklassen, Default `requires_human_review`.
- `lib/domain/schemas.ts`: Zod-Schemas für IDs, Projektanlage, Projektstammdaten, Projektprüfung und Notizen.
- `lib/domain/permissions.ts`: zentrale Berechtigungshelper.
- `lib/domain/project-status.ts`: Statusübergangsmatrix und Validierungsfunktionen.
- `lib/domain/mappers.ts`: deutsche Labels für Rollen, Status und Projektklassen.
- `lib/domain/display.ts`: Anzeigehelper für optionale Felder, Projektklasse, Human Review und Zusammenfassung.

### Vorhandene Berechtigungsprüfungen

- UI-Gating auf Detailseite:
  - Bearbeiten-Link nur bei `canEditProjectCoreFields(role)`.
  - Review-Formular nur wenn Status-, Klassen- und Human-Review-Rechte gemeinsam vorliegen.
  - Notizformular nur bei `canCreateProjectNote(role)`.
  - Notiz-Edit/Delete nach Admin- oder Owner-Regeln.
- Server-Gating:
  - `updateProjectCoreWithDataSource`: Auth, Profil, `roleSchema`, `canEditProjectCoreFields`.
  - `updateProjectReviewWithDataSource`: Auth, Profil, `roleSchema`, `canChangeProjectStatus`, `canChangeProjectClass`, `canChangeHumanReview`.
  - Notizservices: Auth, Profil, Rollenvalidierung, Projektaktivität, Notizaktivität und Owner/Admin-Regeln.
- Datenbank-Gating:
  - RLS für `projects` ist aktiviert.
  - Admins dürfen Projekte per Policy updaten.
  - Reviewer haben eine Update-Policy mit Trigger-Schutz für Projektfelder. Aktueller Trigger blockiert allerdings `requires_human_review` für Reviewer, was im Abschnitt Risiken/Berechtigungen als Inkonsistenz dokumentiert ist.

## Prüfung 2 – Datenmodell `projects`

### Vorhandene Felder

Die Initialmigration definiert `projects` mit folgenden Spalten:

| Feld | Typ / Default | Zweck | Aktueller Nutzungsstand |
| --- | --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | technische Projekt-ID | für Routing, Detail-/Update-/Notizbezug erforderlich |
| `customer_id` | `uuid not null references customers(id)` | Kundenzuordnung | Anlage, Listen-/Detailanzeige, Revalidation Kundenseite |
| `title` | `text not null` | Projektbezeichnung | Anlage, Anzeige, AP-06/AP-11-Stammdatenbearbeitung |
| `status` | `project_status not null default 'new'` | Workflowstatus | Anzeige und Review-Bearbeitung |
| `project_class` | `project_class` nullable | A-D-Klassifikation | Anzeige und Review-Bearbeitung; bei Anlage `null` |
| `installation_address` | `text` nullable | Montageadresse | Anzeige und Stammdatenbearbeitung |
| `postal_code` | `text` nullable | PLZ | Anzeige und Stammdatenbearbeitung |
| `city` | `text` nullable | Ort | Anzeige und Stammdatenbearbeitung |
| `summary` | `text` nullable | interne Zusammenfassung | Anlage, Anzeige und Stammdatenbearbeitung |
| `requires_human_review` | `boolean not null default true` | manuelle Prüfung erzwingen | Anzeige und Review-Bearbeitung |
| `created_by` | `uuid not null references auth.users(id)` | Ersteller | Anlage, Audit-/Nachvollziehbarkeit; nicht editierbar |
| `created_at` | `timestamptz not null default now()` | Erstellzeit | Anzeige und Sortierung |
| `updated_at` | `timestamptz not null default now()` | Änderungszeit | Anzeige, Trigger-gepflegt |
| `deleted_at` | `timestamptz` nullable | Soft Delete | aktive Projektfilter in App; kein aktueller Projekt-Delete-Workflow im AP-11-Scope |

### Für aktuellen Admin-Workflow ausreichende Felder

- Für Projektanlage und Projektstammdaten reichen `customer_id`, `title`, optionale Adresse/PLZ/Ort und `summary` aus.
- Für Projektprüfung reichen `status`, `project_class` und `requires_human_review` fachlich aus.
- Für Betriebs- und Sicherheitseigenschaften sind `created_by`, `created_at`, `updated_at`, `deleted_at` bereits passend vorhanden.
- Für die Listen- und Detailansicht reichen die vorhandenen Spalten plus Kundendaten derzeit aus.

### Empfehlungen für spätere KI-gestützte Angebotserstellung – nur Dokumentation, keine Migration

Mögliche spätere Felder oder Nebenmodelle sollten nicht unkontrolliert in `projects` wachsen. Empfehlenswert sind kleine fachliche Erweiterungen oder separate Tabellen:

- `site_assessment` / `technical_requirements` als strukturierte technische Anforderungen, z. B. Raumgröße, Außengerät-Position, Leitungswege, Elektroanschluss.
- `ai_input_snapshot` oder separates Audit-/Snapshot-Modell für geprüfte, nicht personenbezogen überladene KI-Eingaben.
- `quote_requirements_status` für Angebotsreife, getrennt vom allgemeinen Projektstatus.
- `pricing_basis_id` / `catalog_version_id`, damit Preisberechnung reproduzierbar und nicht durch ein Sprachmodell erfolgt.
- `review_notes_for_quote` oder separate Review-Tabelle, um menschliche Freigaben nachweisbar zu machen.
- `source_channel` / `lead_origin`, falls WhatsApp, Telefon oder Formular später unterschiedlich behandelt werden sollen.
- `consent_flags` / `data_processing_state`, falls WhatsApp- und KI-Verarbeitung weitere Zustimmungsschritte benötigt.

## Prüfung 3 – Projektdetailseite `/projects/[id]`

### Angezeigte Informationen

- Projektbezeichnung als Seitenüberschrift.
- Erfolgsbanner für Anlage, Stammdatenupdate, Reviewupdate, Notizanlage, Notizupdate und Notizlöschung.
- Kunde mit Link zur Kundendetailseite, sofern Kundendaten vorhanden sind.
- Status als Badge mit deutschem Label.
- Projektklasse mit deutschem Displaytext oder Fallback.
- Human-Review-Anzeige.
- Installationsadresse, Postleitzahl, Ort.
- Erstellzeitpunkt und letzter Änderungszeitpunkt.
- Interne Zusammenfassung.
- Abschnitt `Projektprüfung` für berechtigte Rollen.
- Abschnitt `Interne Notizen` mit aktiven Notizen, Autor-Anzeige und Zeitstempel sowie optionalen Edit-/Delete-Funktionen.

### Editierbare Bereiche

- **Projektstammdaten:** über separaten Link `/projects/[id]/edit`; aktuell Admin-only. Felder: `title`, `installation_address`, `postal_code`, `city`, `summary`.
- **Projektprüfung:** direkt auf der Detailseite, falls berechtigt. Felder: `status`, `project_class`, `requires_human_review`.
- **Interne Notizen:** direkte Anlage; Bearbeitung/Soft Delete je nach Admin-/Owner-Recht.

### Read-only Bereiche

- Kundenzuordnung auf der Projektdetailseite ist read-only.
- `created_at`, `updated_at`, `created_by`, `deleted_at`, `id` sind nicht editierbar.
- Projektliste ist read-only und verweist nur auf Details.
- Projektklasse/Status/Human Review sind für nicht berechtigte oder nicht validierte Rollen read-only, weil das Review-Formular gar nicht gerendert wird.

### Verantwortliche Komponenten

- Projektdetails und Lesedaten: `app/(app)/projects/[id]/page.tsx`.
- Stammdatenformular: `app/(app)/projects/[id]/edit/project-edit-form.tsx`.
- Stammdaten-Bearbeitungsroute und Berechtigungsentscheidung: `app/(app)/projects/[id]/edit/page.tsx`.
- Reviewformular: `app/(app)/projects/[id]/project-review-form.tsx`.
- Notizanlage: `app/(app)/projects/[id]/project-note-form.tsx`.
- Notizbearbeitung/-löschung: `app/(app)/projects/[id]/project-note-item.tsx`.

## Prüfung 4 – Berechtigungen im Vergleich mit AP-01

AP-01 führte zentrale Berechtigungshelper ein. Relevant für AP-11 sind `canEditProjectCoreFields`, `canChangeProjectStatus`, `canChangeProjectClass`, `canChangeHumanReview` und `canEditProjectSummary`.

| Aktion | Admin nach Domainhelpern | Reviewer nach Domainhelpern | Aktuelle UI/Service-Realität | Bewertung |
| --- | --- | --- | --- | --- |
| Projekttitel ändern | erlaubt über `canEditProjectCoreFields` | nicht erlaubt | nur Stammdatenformular, Admin-only; Server-Service Admin-only | konsistent |
| Status ändern | erlaubt | erlaubt | Reviewformular für Admin/Reviewer; Server-Service erlaubt Admin/Reviewer | grundsätzlich konsistent |
| Projektklasse ändern | erlaubt | erlaubt | Reviewformular für Admin/Reviewer; Server-Service erlaubt Admin/Reviewer | grundsätzlich konsistent |
| Zusammenfassung ändern | `canEditProjectSummary` erlaubt Admin | `canEditProjectSummary` erlaubt Reviewer | aktuelles Stammdatenformular ist über `canEditProjectCoreFields` Admin-only; Server-Service Admin-only | **Inkonsistenz:** Domainhelper erlaubt Reviewer-Zusammenfassung, AP-06/AP-11-Realität nicht |
| Human-Review-Flag ändern | erlaubt | erlaubt | UI und Server-Service erlauben Admin/Reviewer | **potenzielle DB-Inkonsistenz:** Initialmigration-Trigger blockiert Reviewer-Änderung an `requires_human_review` |

Weitere Beobachtungen:

- Die AP-01-Domainregeln unterscheiden Projektstammdaten und Zusammenfassung; die bestehende AP-06-Stammdatenbearbeitung bündelt `summary` jedoch mit `title` und Adresse in einem Admin-only-Formular.
- Für Reviewer ist dadurch kein separater, service- oder UI-seitig erlaubter Zusammenfassungsworkflow vorhanden, obwohl `canEditProjectSummary("reviewer")` wahr ist.
- Die Datenbank-Policy `reviewers update project review fields` plus Trigger ist breiter bzw. anders ausgedrückt als die serverseitigen Allowlisten. Die konkrete Feldbegrenzung liegt beim Trigger, nicht in column-level Privileges.

## Prüfung 5 – Validierung

### Vorhandene Zod-Schemas

- `roleSchema`: Rollen `admin`, `reviewer`.
- `projectStatusSchema`: Statuswerte aus `PROJECT_STATUSES`.
- `projectClassSchema`: Klassen `A`, `B`, `C`, `D`.
- `nullableProjectClassSchema`: nullable Klasse für Anzeige/Domainmodell.
- `requiresHumanReviewSchema`: Boolean mit Default `true`.
- `projectIdSchema`: UUID für Projekt-ID.
- `createProjectSchema`: `customer_id`, `title`, `summary`.
- `updateProjectCoreSchema`: `title`, `installation_address`, `postal_code`, `city`, `summary`.
- `updateProjectReviewSchema`: `status`, `project_class`, `requires_human_review`.
- Notizschemas: `projectNoteSchema`, `updateProjectNoteSchema`, `deleteProjectNoteSchema`.

### Wiederverwendbare Schemas

- `projectIdSchema` sollte für alle projektbezogenen Mutationen weiterverwendet werden.
- `projectStatusSchema`, `projectClassSchema` und `requiresHumanReviewSchema` sind für getrennte Review-Arbeitspakete wiederverwendbar.
- `updateProjectCoreSchema` ist für Admin-Stammdaten geeignet.
- Die intern definierten `optionalText`-/`optionalProjectSummary`-Regeln sind wiederverwendbar, aber aktuell nicht als separate Exporte verfügbar.

### Fehlende oder zu grobe Schemas

- Kein dediziertes Schema nur für Projekttitel.
- Kein dediziertes Schema nur für Projektstatusänderung.
- Kein dediziertes Schema nur für Projektklasse.
- Kein dediziertes Schema nur für Zusammenfassung gemäß `canEditProjectSummary`.
- Kein dediziertes Schema nur für Human-Review-Flag.
- Kein Schema für getrennte Adresse-/Standortbearbeitung.
- Kein Schema für spätere technische Angebotsdaten oder KI-relevante strukturierte Anforderungen.

### Bestehende Eingabevalidierung

- Projekt-ID wird auf Routen- und Service-Ebene als UUID validiert.
- Projektstammdaten werden getrimmt, optionale leere Felder werden zu `null`, Titel ist Pflicht, Feldlängen sind begrenzt.
- Reviewdaten werden per Enum/Boolean validiert und unbekannte Felder werden durch `.strip()` entfernt.
- Server-Services bauen explizite Patch-Payloads und übernehmen keine Systemfelder aus FormData.
- Statuswechsel werden serverseitig gegen die zentrale Statusmatrix geprüft.

### Fehlende Eingabevalidierung / Lücken

- Clientseitige HTML-Constraints sind minimal; die Sicherheit liegt korrekt serverseitig, UX könnte pro Einzelformular verbessert werden.
- Optionalfelder `installation_address`, `postal_code`, `city` teilen eine generische 500-Zeichen-Regel; keine fachliche PLZ- oder Ortsvalidierung.
- `summary` ist für Admin-Stammdaten validiert, aber nicht getrennt für den laut AP-01 erlaubten Reviewer-Zusammenfassungsfall verfügbar.
- Reviewformular verlangt aktuell immer `project_class`; `null` ist damit für Reviewupdates nicht speicherbar. Fachlich ist das für abgeschlossene Prüfung plausibel, sollte aber bei AP-11 bewusst bestätigt werden.

## Prüfung 6 – Server Actions

### Projektbezogene Actions

1. `createProjectAction`
   - Wiederverwendbar für AP-11 nur als Muster für Auth-/Profilprüfung, aktive Fremdobjektprüfung, Allowlist, Revalidation und Redirect.
2. `updateProjectCoreAction`
   - Direkt relevant für Projekt-Stammdatenbearbeitung.
   - Aktuell geeignet für Admin-only Bearbeitung von Titel, Adresse, PLZ, Ort und Zusammenfassung.
   - Nicht geeignet, wenn die Zusammenfassung getrennt reviewerfähig bearbeitet werden soll, ohne den Service aufzuteilen.
3. `updateProjectReviewAction`
   - Direkt relevant für Status, Projektklasse und Human-Review-Flag.
   - Für kleine APs eventuell zu breit, weil sie drei Felder gleichzeitig patcht.
4. `createProjectNoteAction`
   - Nicht für Projektbearbeitung selbst, aber Detailseiten-Kontext und Revalidation-Muster.
5. `updateProjectNoteAction`
   - Nicht für Projektbearbeitung selbst; zeigt Ownership-/Allowlist-Muster.
6. `softDeleteProjectNoteAction`
   - Nicht für Projektbearbeitung selbst; wichtig für Soft-Delete-/RPC-Erfahrungen aus AP-10.

### Wiederverwendbarkeit für spätere Bearbeitungsfunktionen

- Für AP-11-01 kann `updateProjectCoreAction` bestehen bleiben oder als Grundlage dienen.
- Für AP-11-02 bis AP-11-05 sollte geprüft werden, ob getrennte Actions/Services pro Feld die Risiken reduzieren:
  - weniger Mass-Assignment-Fläche,
  - klarere Berechtigung pro Feld,
  - granularere Tests,
  - präzisere Fehlermeldungen,
  - einfachere spätere Audit-Logs.
- `updateProjectReviewAction` ist funktional vorhanden, aber für “möglichst kleine Arbeitspakete” nicht ideal granular.

## Prüfung 7 – Tests

### Bestehende Tests

- `test/domain.test.ts`: Rollen, Statuswerte, Statusübergänge, Projektklassen, Labels, Displayhelper und Berechtigungshelper.
- `test/project-create.test.ts`: Projektanlage, Schema, Defaults, aktive Kundenprüfung, Insert-Allowlist, Mass-Assignment-Schutz.
- `test/project-update.test.ts`: Stammdatenupdate, Admin-only, UUID, aktives Projekt, Allowlist, FormData-Mapping.
- `test/project-review.test.ts`: Reviewschema, Rollen, Statusübergänge, gelöschte Projekte, Optimistic-Concurrency-Filter, Allowlist, FormData-Boolean-Mapping.
- `test/project-note-create.test.ts`: Notizanlage.
- `test/project-note-security.test.ts`: AP-09/AP-10-bezogene Migration-/RLS-/RPC-Textprüfungen.
- `test/project-note-update-delete.test.ts`: Notizupdate und Soft Delete.

### Fehlende Tests für AP-11

- Tests für getrennte Titelbearbeitung, falls AP-11 in kleinere Actions aufgeteilt wird.
- Tests für getrennte Statusänderung ohne gleichzeitige Projektklasse/Human-Review-Änderung.
- Tests für getrennte Projektklassenänderung.
- Tests für getrennte Zusammenfassungsbearbeitung inklusive Reviewer-Recht aus `canEditProjectSummary`.
- Tests für getrennte Human-Review-Änderung inklusive Datenbank-/Trigger-Erwartung.
- Regressionstests, dass `customer_id`, `created_by`, `created_at`, `updated_at`, `deleted_at`, `status`, `project_class`, `requires_human_review` nicht in falschen Actions übernommen werden.
- Tests für leere/fehlende FormData-Werte pro Einzelaction.
- Tests für Revalidation-/Redirect-Ziel je Einzelworkflow.
- Migrations-/RLS-Tests, falls AP-11 später DB-Härtung oder Trigger-Anpassung freigibt.

### Potenzielle Regressionen

- Reviewer können UI/Service-seitig Human Review ändern, könnten aber an der DB durch den bestehenden Trigger scheitern.
- Eine Aufteilung der Reviewaction kann Statusübergangsprüfung oder Race-Condition-Schutz versehentlich verlieren.
- Eine separate Zusammenfassungsaction für Reviewer kann unbeabsichtigt Titel-/Adressfelder mitöffnen.
- Änderungen am Reviewformular können die bisherige Anforderung `project_class` nicht-null lockern oder unbeabsichtigt verschärfen.
- Revalidation kann Listen, Kunden-Detailseiten oder Projekt-Detailseite inkonsistent halten, wenn Pfade vergessen werden.

## Prüfung 8 – Risiken

### Mass Assignment

- Aktuell mitigiert durch `.strip()` in Zod-Schemas und explizite Payloads in Services.
- Risiko steigt, wenn AP-11 größere kombinierte Formulare oder generische `Object.fromEntries(formData)`-Patches einführt.
- Empfehlung: pro Arbeitspaket explizite FormData-Mapper und Payload-Allowlisten beibehalten.

### Server Actions

- Server Actions prüfen Auth und Rollen erneut, nicht nur UI-Gating; das ist positiv.
- Risiko: `updateProjectReviewAction` ist dreifeldrig. Kleine Änderungen an einem Feld transportieren immer die aktuelle UI-Ausprägung aller drei Reviewfelder.
- Empfehlung: bei fachlicher Granularität getrennte Services/Actions erwägen.

### Soft Delete

- Lese- und Mutationspfade filtern aktive Projekte mit `deleted_at IS NULL`.
- `projects` hat Soft Delete, aber im aktuellen Scope keinen Projekt-Soft-Delete-Workflow.
- Risiko: bestehende `projects read`-RLS-Policy filtert gelöschte Projekte nicht selbst; App-Code muss konsequent filtern.
- Empfehlung: bei künftigem Projekt-Delete eigenes Audit/Arbeitspaket, RLS-Härtung und Tests.

### RLS

- RLS ist aktiviert, aber `projects read` erlaubt Rollen ohne `deleted_at IS NULL` auf Policy-Ebene.
- Reviewer-Update-Policy ist breit; Feldbegrenzung passiert durch Trigger.
- Bekannte Inkonsistenz: Trigger blockiert `requires_human_review` für Reviewer, obwohl Domainhelper und Service es erlauben.
- Empfehlung: vor Freigabe von Reviewer-Human-Review in Production DB-Verhalten prüfen und ggf. separates DB-Sicherheitsarbeitspaket definieren.

### Race Conditions und Parallel Updates

- Reviewupdates laden aktuellen Status und filtern beim Update zusätzlich nach altem Status. Das reduziert parallele Statuswechselkonflikte.
- Stammdatenupdate filtert nur nach `id` und `deleted_at IS NULL`; parallele Stammdatenänderungen können “last write wins” auslösen.
- Projektklasse und Human Review haben keinen eigenen Versions-/Timestamp-Vergleich.
- Empfehlung: falls Fachlichkeit parallele Bearbeitung erwartet, `updated_at`-basierte Konflikterkennung oder feldgranulare Actions prüfen.

### Optimistic UI

- `useActionState` zeigt pending-Status; es gibt keine optimistische lokale Datenänderung. Das reduziert Rollback-Risiken.
- Risiko entsteht, wenn spätere APs optimistic UI ergänzen, ohne Serverkonflikte sichtbar zu machen.

### Redirects

- Erfolgreiche Mutationen redirecten auf `/projects/[id]` mit Query-Flag.
- Fehler bleiben im Formularzustand.
- Risiko: Query-Flags sind rein UI-bezogen und nicht sicherheitsrelevant, können aber manuell gesetzt werden und Erfolg suggerieren.
- Empfehlung: für kritische Aktionen keine sicherheitsrelevante Bedeutung aus Query-Flags ableiten.

### Revalidation

- Projektanlage und Updates revalidieren `/projects`, Projekt-Detailseite und Kundendetailseite.
- Notizmutationen revalidieren nur die Projektdetailseite.
- Risiko: bei aufgeteilten AP-11-Actions kann ein Pfad vergessen werden.
- Empfehlung: pro Action Revalidation explizit testen oder dokumentieren.

### Security

- Keine Secrets im Client erkennbar in den geprüften Projektpfaden.
- Keine personenbezogenen Daten werden in den geprüften Server Actions geloggt.
- Audit-Log-Schreibpfad fehlt weiterhin für Projektänderungen; das ist kein AP-11-Blocker, aber für Nachvollziehbarkeit relevant.
- Preisberechnung und KI-Ausgaben sind aktuell nicht Teil des Workflows; spätere KI-Felder müssen strikt von Angebotsfreigabe und Preisberechnung getrennt bleiben.

## Prüfung 9 – Empfohlene kleine Arbeitspakete

### AP-11-00 – Freigabeentscheidung und Scope-Freeze

- Entscheiden, ob AP-11 bestehende AP-06/AP-07-Funktionen nur auditkonform dokumentiert oder feldgranular aufteilt.
- Festlegen, ob Reviewer die Zusammenfassung in AP-11 wirklich bearbeiten dürfen.
- Festlegen, ob `requires_human_review` für Reviewer DB-seitig freigegeben werden soll.

### AP-11-01 – Projekt-Stammdaten bearbeiten

- Scope: `title`, `installation_address`, `postal_code`, `city`.
- Admin-only.
- Bestehenden `updateProjectCoreAction` ggf. auf Stammdaten ohne `summary` zuschneiden oder bewusst unverändert lassen, falls Zusammenfassung Admin-only bleiben soll.

### AP-11-02 – Projektstatus bearbeiten

- Scope: ausschließlich `status`.
- Admin und Reviewer.
- Statusübergangsmatrix zwingend serverseitig prüfen.
- Race-Condition-Schutz mit aktuellem Status beibehalten.

### AP-11-03 – Projektklasse bearbeiten

- Scope: ausschließlich `project_class`.
- Admin und Reviewer.
- Entscheiden, ob `null` erlaubt bleibt oder beim Speichern abgewiesen wird.

### AP-11-04 – Projektzusammenfassung bearbeiten

- Scope: ausschließlich `summary`.
- Rollenentscheidung explizit treffen:
  - Variante A: Admin-only, dann `canEditProjectSummary`/Dokumentation später angleichen.
  - Variante B: Admin und Reviewer, dann separater Service und DB-Trigger/RLS-Abgleich erforderlich.

### AP-11-05 – Human-Review-Flag bearbeiten

- Scope: ausschließlich `requires_human_review`.
- Admin und Reviewer nach AP-01-Domainhelpern.
- Vor Implementierung DB-Inkonsistenz mit Reviewer-Trigger klären.

### AP-11-06 – Revalidation, Redirects und UX-Meldungen

- Einheitliche deutsche Erfolgs-/Fehlermeldungen pro Einzelworkflow.
- Revalidation-Pfade je Workflow festlegen.
- Query-Flags dokumentieren und nicht sicherheitsrelevant nutzen.

### AP-11-07 – Regressionstests

- Unit-Tests für neue oder aufgeteilte Schemas, Mapper und Services.
- Mass-Assignment-Regressionsfälle je Action.
- Berechtigungsfälle Admin/Reviewer getrennt.
- Race-Condition- und Soft-Delete-Fälle.

### AP-11-08 – Datenbank-/RLS-Folgeaudit nur falls notwendig

- Kein Bestandteil dieses Audits als Implementierung.
- Falls Reviewer `summary` oder `requires_human_review` bearbeiten dürfen, RLS/Trigger gezielt in einem separaten DB-Arbeitspaket prüfen und ändern.

## Gesamtbewertung

Die Architektur ist bereits modular genug, um AP-11 sicher in kleine Pakete zu schneiden: Pages laden serverseitig, Clientkomponenten sind formularorientiert, Actions delegieren in testbare Services, Domainregeln sind zentralisiert und Zod-Schemas/Allowlisten schützen gegen Mass Assignment. Die wichtigsten offenen Punkte sind nicht fehlende Grundarchitektur, sondern Granularität und Konsistenz: `summary` ist domainseitig reviewerfähig, aber aktuell in einem Admin-only-Stammdatenworkflow gebündelt; `requires_human_review` ist domain- und serviceseitig reviewerfähig, kann aber DB-seitig durch den bestehenden Reviewer-Trigger blockiert werden. Diese Punkte sollten vor einer AP-11-Implementierungsfreigabe entschieden werden.
