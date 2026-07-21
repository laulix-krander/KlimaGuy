# KG-AUDIT-2026-07-21-ADMIN-WORKFLOWS-V1 – Admin Workflows Audit

## 1. Audit Metadaten

- **Audit ID:** KG-AUDIT-2026-07-21-ADMIN-WORKFLOWS-V1
- **Status:** DRAFT – NICHT ZUR IMPLEMENTIERUNG FREIGEGEBEN
- **Datum:** 2026-07-21
- **Repository:** KlimaGuy
- **Arbeitsbranch:** `codex/audit-admin-workflows`
- **Produktiver Branch laut Auftrag:** `main`
- **Produktiver Baseline Commit laut Auftrag:** `f359d22`
- **Zu analysierender geschlossener Commit laut Auftrag:** `5a7eb3f` ausschließlich lesend
- **Audit-Umfang:** technische Analyse für Admin-Workflows Kunden, Projekte, Projektnotizen, Audit-System und Rollenmodell.
- **Explizite Einschränkung:** Dieses Audit implementiert keine Features, UI-Änderungen, Datenbankänderungen, Migrationen, Komponenten, Paketupdates oder Bugfixes.

## 2. Executive Summary

Der aktuelle Stand auf Commit `f359d22` bildet ein schlankes Next.js-/Supabase-Fundament mit Login, geschützten Routen, Listen-/Anlagefunktionen für Kunden und Projekte, Projektdetailseite, Notizen, Basismigration, RLS-Policies und Domain-Schemas. Für die geplanten Admin-Workflows ist das Fundament geeignet, aber noch nicht fein genug abgesichert.

Wesentliche Befunde:

- **Build-Baseline:** `npm install`, `npm run typecheck`, `npm run lint` und `npm run build` waren erfolgreich. `npm test` schlägt fehl, weil Vitest den Alias `@/lib/domain/schemas` nicht auflösen kann.
- **Vercel-Ursache:** Die konkrete Vercel-Fehlerursache ist anhand der verfügbaren Informationen nicht belegbar.
- **Geschlossener Commit `5a7eb3f`:** Der Commit ist in diesem lokalen Repository nach `git fetch --all --prune` nicht erreichbar. Es konnte daher keine belastbare datei- oder diffbasierte Analyse dieses Commits erstellt werden.
- **Höchste Risiken:** Reviewer-Update-Policy und Trigger sind für das Zielrollenmodell zu grob, Statusübergänge fehlen als zentrale Domainregel, Notizen haben aktuell kein Soft Delete, Audit-Log hat keine sichere serverseitige Schreibschnittstelle, Formulare/Server Actions enthalten noch keine systematische Fehlerbehandlung und kein explizites Rollen-Gating vor Mutationen.
- **Empfehlung:** Umsetzung nur in kleinen, freigegebenen Arbeitspaketen AP-01 bis AP-13 mit Pflichtreferenz auf diese Audit-ID und harten Merge Gates.

## 3. Ausgangszustand

Der produktive Ausgangszustand ist gemäß Auftrag der Commit `f359d22` auf `main`. Der aktuelle lokale Branch wurde für dieses Audit von diesem Stand abgezweigt.

Vorhandene Struktur:

- Next.js App Router unter `app/`.
- UI-Grundbausteine unter `components/`.
- Domain-Typen, Schemas und Mapper unter `lib/domain/`.
- Supabase Server-/Browser-Clients unter `lib/supabase/`.
- Eine initiale Supabase-Migration unter `supabase/migrations/202607210001_initial_schema.sql`.
- Projektweite Dokumentation unter `docs/`.
- Vitest-Testdatei unter `test/domain.test.ts`.

## 4. Produktiver Baseline Commit

- **Baseline Commit:** `f359d22`
- **Lokaler HEAD vor Audit-Dateien:** `f359d22 Merge pull request #2 from laulix-krander/codex/erstelle-technische-dokumentation-und-fundament-dtoi0j`
- **Bewertung:** Der Baseline-Commit ist lokal vorhanden und wurde als Ausgangspunkt für den Audit-Branch verwendet.

## 5. Analyse des geschlossenen Branches

### Erreichbarkeit

Der laut Auftrag bekannte Commit `5a7eb3f` wurde ausschließlich lesend geprüft. Folgende Befehle wurden verwendet:

- `git show --stat --oneline --decorate --no-renames 5a7eb3f || true`
- `git fetch --all --prune && git show --stat --oneline --decorate --no-renames 5a7eb3f || true`
- `git branch -a --contains 5a7eb3f || true`
- `git log --oneline --decorate --all --max-count=20`

Ergebnis: `5a7eb3f` ist in diesem lokalen Repository nicht erreichbar. Außerdem ist kein Remote `origin` konfiguriert, sodass der geschlossene Branch `codex/erstelle-technische-dokumentation-und-fundament-8ura76` nicht nachgeladen werden konnte.

### Geänderte Dateien

Nicht belegbar. Ohne erreichbaren Commit oder Branch kann keine Dateiliste aus `git show` oder `git diff` verifiziert werden.

### Risiken des geschlossenen Branches

Nicht belegbar auf Dateiebene. Allgemein gilt für einen späteren großen Implementierungsversuch als Prozessrisiko: Ein großer, nicht gemergter Umfang erschwert Review, Build-Ursachenanalyse, Rollback und die getrennte Bewertung von Datenbank-, Rollen- und UI-Änderungen. Diese Aussage ist eine Prozessbewertung und keine belegte Aussage über konkrete Inhalte von `5a7eb3f`.

### Umfangsbewertung

Nicht belegbar. Der Umfang von `5a7eb3f` kann ohne Commit-Daten nicht seriös bewertet werden.

### Mögliche Build-Risiken

Nicht belegbar für `5a7eb3f`. Für künftige Pakete sind Build-Risiken insbesondere Alias-Auflösung in Vitest, Next.js/ESLint-Konfiguration, Server-Action-Typisierung und Supabase-Typannahmen.

### Mögliche Datenbankrisiken

Nicht belegbar für `5a7eb3f`. Für künftige Pakete sind Datenbankrisiken insbesondere nicht additive Migrationen, unvollständige RLS-Policies, fehlende Soft-Delete-Filter und fehlende Trigger/Constraints.

### Mögliche Architekturprobleme

Nicht belegbar für `5a7eb3f`. Für künftige Pakete besteht das Risiko, Domainregeln direkt in UI/Server Actions zu duplizieren, statt zentrale Mapper, Statusregeln und Berechtigungsfunktionen zu verwenden.

## 6. Nicht belegbare Informationen

- Die konkrete Vercel-Fehlerursache ist anhand der verfügbaren Informationen nicht belegbar.
- Die eigentliche Vercel-Fehlermeldung liegt nicht vor.
- Der geschlossene Commit `5a7eb3f` ist lokal nicht erreichbar.
- Die konkret geänderten Dateien des geschlossenen Branches sind nicht belegbar.
- Ob der geschlossene Branch selbst den Vercel-Fehler verursacht hat, ist nicht belegbar.

## 7. Dependency Analyse

Aktuelle produktive Dependencies laut `package.json`:

- Next.js `^15.0.3`; der lokale Build meldet effektiv Next.js `15.5.20`.
- React und React DOM `^19.0.0`.
- Supabase: `@supabase/ssr ^0.6.1`, `@supabase/supabase-js ^2.45.4`.
- Validierung: `zod ^3.23.8`.
- Styling-Helfer: `clsx`, `tailwind-merge`.
- Tooling: TypeScript, ESLint 9, Vitest 2, Tailwind 3.

Befunde:

- `npm install` war erfolgreich, erzeugte aber bei diesem Lauf ohne bestehende Lockdatei temporär eine `package-lock.json`. Diese wurde nicht beibehalten, da Paket-/Lockfile-Änderungen in diesem Audit ausgeschlossen sind.
- NPM meldet die Warnung `Unknown env config "http-proxy"`.
- Vitest meldet eine Vite-CJS-Deprecation-Warnung.
- Der Build meldet eine Next.js-ESLint-Plugin-Warnung.

Risiko: Ohne committed Lockfile können Vercel und lokale Umgebung unterschiedliche transitive Versionen installieren. Da keine Paketupdates erlaubt sind, wird dies nur dokumentiert und nicht behoben.

## 8. Build Baseline

| Befehl | Ergebnis | Exit Code | Warnungen / Hinweise |
| --- | --- | ---: | --- |
| `npm install` | erfolgreich | 0 | `npm warn Unknown env config "http-proxy"`; keine Audit-Änderung an Dependencies übernommen. |
| `npm run typecheck` | erfolgreich | 0 | `npm warn Unknown env config "http-proxy"`. |
| `npm run lint` | erfolgreich | 0 | `npm warn Unknown env config "http-proxy"`. |
| `npm test` | fehlgeschlagen | 1 | Vitest kann `@/lib/domain/schemas` aus `test/domain.test.ts` nicht auflösen; zusätzlich Vite-CJS-Deprecation-Warnung. |
| `npm run build` | erfolgreich | 0 | Next.js `15.5.20`; Webpack-Cache-Warnungen zu großen Strings; Next.js-ESLint-Plugin wurde nicht erkannt. |

Bewertung: Die Anwendung baut lokal erfolgreich, die Test-Baseline ist jedoch nicht grün. Dieser Testfehler wurde nicht behoben, weil dieser Auftrag ausschließlich ein Audit ist.

## 9. Aktuelle Architektur

### Positiv

- Modularer Monolith entspricht dem Projektziel.
- Domain-Konstanten und Zod-Schemas existieren zentral.
- Server Actions werden für Mutationen verwendet.
- Supabase Auth und Middleware schützen interne Routen.
- RLS ist in der initialen Migration aktiviert.
- `SUPABASE_SERVICE_ROLE_KEY` ist dokumentiert, wird im Code aber aktuell nicht verwendet.

### Grenzen

- Server Actions validieren Eingaben, aber bilden noch keine konsistente Fehlerantwort ab.
- Rollenprüfung wird überwiegend RLS überlassen; explizite serverseitige Berechtigungsmapper sind nur minimal vorhanden.
- Statusübergänge sind nicht als zentrale Domainregel modelliert.
- Es gibt keine serverseitige Audit-Helferfunktion.
- Tabellenzugriffe und UI-Rendering liegen in Page-Dateien eng beieinander.
- Es gibt keine generierten Supabase-Typen; viele Datenbankantworten werden implizit genutzt.

## 10. Datenbankschema

Aktuelle Tabellen:

- `profiles`: Benutzerprofil mit Rolle `admin` oder `reviewer`.
- `customers`: Kundenstamm mit `deleted_at` für Soft Delete.
- `projects`: Projektakte mit Status, Klasse, Human-Review-Flag und `deleted_at`.
- `project_notes`: Notizen ohne `deleted_at`.
- `audit_log`: Auditdaten mit JSONB-Metadaten.

Aktuelle Enums:

- `app_role`: `admin`, `reviewer`.
- `project_status`: `new`, `collecting_information`, `technical_review`, `quote_draft`, `human_review`, `quote_sent`, `accepted`, `rejected`, `closed`.
- `project_class`: `A`, `B`, `C`, `D`.

Befunde:

- `customers` und `projects` erfüllen Soft Delete grundsätzlich.
- `project_notes` erfüllen die geplante Soft-Delete-Anforderung noch nicht.
- Statusübergänge sind nicht als Constraint, Trigger oder Domainfunktion abgebildet.
- Audit-Log ist gegen direkte Rollenrechte entzogen, aber es fehlt ein dokumentierter sicherer Schreibpfad.
- Es gibt keine Datenbankconstraint, die gelöschte Kunden vor neuen Projekten schützt.

## 11. RLS Analyse

### Vorhanden

RLS ist auf `profiles`, `customers`, `projects`, `project_notes` und `audit_log` aktiviert. Policies unterscheiden grundsätzlich Admin und Reviewer.

### Befunde nach Risiko

- **Reviewer-Projektupdates – hoch:** Die Policy `reviewers update project review fields` erlaubt Updates für Reviewer mit `using` und `with check` nur auf Rollenebene. Die konkrete Feldbegrenzung liegt in einem Trigger. Der Trigger verbietet `requires_human_review`-Änderungen, obwohl das Zielmodell Reviewer diese Änderung erlauben soll. Gleichzeitig erlaubt der Trigger Status und Klasse, ohne Statusübergangslogik zu prüfen.
- **Notizen-Update – mittel:** Reviewer und Admins dürfen aktuell alle Notizen updaten. Das Zielmodell sagt Reviewer: eigene Notizen. Dafür fehlt eine Einschränkung auf `created_by = auth.uid()`.
- **Notizen-Soft-Delete – mittel:** `project_notes` haben kein `deleted_at`; Soft Delete ist für das geplante Paket nicht möglich.
- **Lesen gelöschter Datensätze – mittel:** RLS-Select-Policies begrenzen nicht auf `deleted_at is null`. Die Anwendung filtert zwar teilweise, aber direkte Client-Abfragen mit gültiger Session könnten gelöschte Kunden/Projekte lesen, sofern RLS sie nicht ausschließt.
- **Audit-Log-Zugriff – mittel:** `revoke all` reduziert direkten Zugriff, jedoch existiert keine definierte RPC/Server-Action zum sicheren Schreiben/Lesen von Auditdaten.

## 12. Sicherheitsanalyse

| Thema | Bewertung | Befund | Gegenmaßnahme |
| --- | --- | --- | --- |
| RLS | hoch | RLS existiert, bildet Zielrechte aber noch nicht vollständig ab. | Policies und Trigger pro AP prüfen, reviewerfähige Felder explizit begrenzen, gelöschte Datensätze in RLS ausschließen. |
| Service Role Nutzung | niedrig | Im aktuellen Code keine Nutzung gefunden. | Weiterhin nicht im Client verwenden; falls nötig nur in serverseitigem, eng gekapseltem Admin-Pfad. |
| Rechteeskalation | hoch | Reviewer-Updates hängen an Triggerlogik; keine zentrale Domainberechtigung in Server Actions. | Server Actions zusätzlich mit Rollenmappern absichern; DB bleibt letzte Schutzschicht. |
| IDOR | mittel | Detailseiten fragen nach ID; RLS schützt grundsätzlich, aber Soft-Delete-Filter fehlen im Projektdetail und Notizenpfad teilweise. | `.is("deleted_at", null)` konsequent und RLS-seitig erzwingen; Notizen nur zu sichtbaren Projekten. |
| Mass Assignment | mittel | Inserts spreaden geparste Daten; Schemas reduzieren Risiko, aber zukünftige Edit-Forms brauchen Allowlist. | Pro Aktion explizite Payload-Allowlist und Rollen-/Feldmapper. |
| Manipulation von Formulardaten | mittel | Zod validiert Grundfelder; Statusübergänge, Rollenrechte und Cross-Entity-Regeln fehlen. | Server Actions niemals UI-Werten vertrauen; Status-/Rollen-Domainregeln zentral. |
| Soft Delete Umgehungen | hoch | Select-RLS erlaubt potenziell gelöschte Datensätze; Notizen haben kein Soft Delete. | RLS-Select mit `deleted_at is null`; Soft Delete-Spalten/Policies für Notizen. |
| Personenbezogene Daten in Logs | niedrig | Keine aktive PII-Logging-Stelle gefunden. | Logging-Regel beibehalten; keine FormData-/Supabase-Payloads loggen. |
| Personenbezogene Daten in Auditdaten | mittel | Audit-Metadaten sind frei als JSONB modelliert; sichere Metadatenregeln fehlen. | Audit-Helper mit Allowlist und PII-Redaktion, keine Namen/E-Mails/Telefonnummern im Audit. |
| Reviewer Rechte | hoch | Zielmodell stimmt nicht vollständig mit aktueller DB-Logik überein. | Reviewer dürfen lesen, erlaubte Review-Felder ändern und eigene Notizen verwalten; alles andere sperren. |
| Audit Log Schutz | mittel | Direkte Bearbeitung ist entzogen, aber Lese-/Schreibmodell fehlt. | Security-definer RPC oder serverseitiger Helper; Client niemals direkt schreiben lassen. |
| Zugriff auf gelöschte Datensätze | mittel | App filtert Listen, RLS nicht vollständig. | RLS-Policies und Queries auf aktive Datensätze begrenzen; Detailseiten absichern. |

## 13. Build Risiken

- **Vitest-Alias fehlt:** Aktuelle Tests schlagen fehl, weil `@/` in Vitest nicht aufgelöst wird.
- **Kein Lockfile im Repository:** Reproduzierbarkeit zwischen lokalem Build und Vercel ist eingeschränkt.
- **Next.js ESLint Plugin-Warnung:** Build meldet, dass das Next.js-Plugin in ESLint nicht erkannt wurde.
- **Server Action Parsing:** Direkte `parse`-Aufrufe können bei ungültigen Formulardaten harte Fehler werfen; spätere Implementierung braucht kontrolliertes Fehlermodell.
- **Supabase Env Defaults:** Leere Strings für Supabase-URL/-Key können lokal andere Fehlerbilder erzeugen als Vercel-Umgebung.

## 14. Datenbank Risiken

- Fehlende Statusübergangsprüfung in Datenbank oder Domain-Service.
- Reviewer darf laut Ziel Human Review ändern, aktueller Trigger blockiert dies.
- Reviewer-Notizen sind nicht auf eigene Notizen beschränkt.
- `project_notes` fehlen `deleted_at` und Soft-Delete-Policies.
- RLS-Select-Policies schließen gelöschte Kunden/Projekte nicht aus.
- Audit-Log-Metadaten sind ohne strukturelle PII-Absicherung.
- Änderungen an Enums können nicht trivial zurückgerollt werden; Status-/Klassenänderungen müssen vorsichtig additiv geplant werden.

## 15. Testlücken

- Statusübergänge sind nicht getestet.
- Reviewer/Admin-Berechtigungsmatrix ist nur minimal getestet.
- Zod-Schemas für Edit- und Patch-Fälle fehlen.
- RLS-Policies sind nicht per Integrationstest abgedeckt.
- Soft-Delete-Verhalten für Kunden, Projekte und Notizen ist nicht abgedeckt.
- Audit-Metadaten-Redaktion ist nicht getestet.
- Such-/Filterparameter sind nicht gegen unerwartete Werte getestet.
- Vitest-Konfiguration ist aktuell nicht lauffähig für `@/`-Imports.

## 16. Empfohlene Zielarchitektur

Empfohlen wird eine kleine, schrittweise Erweiterung des modularen Monolithen:

- `lib/domain/status-transitions.ts`: zentrale erlaubte Statusübergänge inklusive Tests.
- `lib/domain/permissions.ts`: Rollen- und Feldrechte für Admin/Reviewer.
- `lib/domain/audit.ts`: sichere Audit-Metadaten-Builder mit Allowlist.
- Server Actions pro Fachbereich mit expliziten Payload-Allowlists und Zod-Patch-Schemas.
- Supabase-Migrationen nur additiv und je Arbeitspaket klein.
- RLS als verbindliche letzte Schutzschicht; Server Actions zusätzlich als erste Schutzschicht.
- Audit-Anzeige nur lesend, metadatensparsam und rollenbeschränkt.

### Analysierte Statuslogik

Erlaubte Übergänge gemäß Auftrag:

- `new` → `collecting_information`, `rejected`, `closed`
- `collecting_information` → `technical_review`, `rejected`, `closed`
- `technical_review` → `collecting_information`, `quote_draft`, `human_review`, `rejected`, `closed`
- `quote_draft` → `technical_review`, `human_review`, `quote_sent`, `rejected`, `closed`
- `human_review` → `technical_review`, `quote_draft`, `quote_sent`, `rejected`, `closed`
- `quote_sent` → `accepted`, `rejected`, `closed`
- `accepted` → `closed`
- `rejected` → `closed`
- `closed` → keine Übergänge

Bewertung: Diese Logik ist deterministisch und sollte niemals durch KI-Ausgaben oder freie Formulardaten entschieden werden. Sie eignet sich für eine reine Domain-Konstante mit Tests und optionaler DB-Absicherung.

## 17. Empfohlene Implementierungspakete

### AP-01 – Domainregeln und Statusübergänge

- **Ziel:** Statusübergänge und Berechtigungsgrundlagen zentral modellieren.
- **Dateien:** `lib/domain/types.ts`, neues `lib/domain/status-transitions.ts`, neues/erweitertes `test/domain.test.ts` oder zusätzliche Domain-Tests.
- **Risiken:** Abweichung zwischen UI, Server Actions und RLS; falsch modellierte Endzustände.
- **Tests:** Alle erlaubten und ausgewählte verbotene Übergänge; `closed` ohne Übergänge.
- **Abhängigkeiten:** Keine fachliche Migration nötig.
- **Definition of Done:** Statusmatrix vollständig getestet; Audit-ID referenziert.
- **Rollback:** Entfernen der neuen Domaindatei und Tests; keine Datenmigration betroffen.

### AP-02 – Kunden anlegen

- **Ziel:** Kundenanlage mit Rollenprüfung, Validierung und Audit-Hook vorbereiten.
- **Dateien:** `app/(app)/customers/page.tsx` oder ausgelagerte Server Action, `lib/domain/schemas.ts`, `lib/domain/permissions.ts`, Tests.
- **Risiken:** PII in Logs/Audit, Mass Assignment, unklare Fehlerausgabe.
- **Tests:** Zod für Eingaben; Admin darf anlegen; Reviewer nicht.
- **Abhängigkeiten:** AP-01 empfohlen.
- **Definition of Done:** Explizite Allowlist, keine PII-Logs, RLS-kompatibel.
- **Rollback:** Server-Action-Änderung zurücknehmen; keine destruktive DB-Änderung.

### AP-03 – Kunden bearbeiten

- **Ziel:** Kundendaten sicher ändern.
- **Dateien:** Kunden-Server Actions, Edit-Schema, Permissions, UI nur falls freigegeben.
- **Risiken:** Mass Assignment, Änderung gelöschter Kunden, Reviewer-Eskalation.
- **Tests:** Admin-Update, Reviewer-Verbot, gelöschter Kunde nicht bearbeitbar.
- **Abhängigkeiten:** AP-02, AP-12.
- **Definition of Done:** Patch-Allowlist und RLS geprüft.
- **Rollback:** Action/UI zurücknehmen; Daten bleiben erhalten.

### AP-04 – Kunden Soft Delete

- **Ziel:** Kunden fachlich löschen ohne Hard Delete.
- **Dateien:** Kunden-Actions, ggf. additive Migration für RLS-Härtung, Tests.
- **Risiken:** Verwaiste aktive Projekte, Zugriff auf gelöschte Kunden, irreversible UI-Verwirrung.
- **Tests:** Admin darf soft löschen; Reviewer nicht; Listen/Details schließen gelöschte Kunden aus.
- **Abhängigkeiten:** AP-12.
- **Definition of Done:** `deleted_at` gesetzt, nicht direkt gelöscht, Audit ohne PII.
- **Rollback:** Soft-Delete-Action zurücknehmen; Datensatz kann administrativ reaktiviert werden.

### AP-05 – Projekte anlegen

- **Ziel:** Projektanlage mit aktiven Kunden, sicheren Defaults und Audit.
- **Dateien:** Projekt-Server Actions, `lib/domain/schemas.ts`, Permissions, Tests.
- **Risiken:** Projekt zu gelöschtem Kunden, manipuliertes Human-Review-Flag, Mass Assignment.
- **Tests:** Admin darf anlegen; Reviewer nicht; `requires_human_review` default true.
- **Abhängigkeiten:** AP-01, AP-12.
- **Definition of Done:** Kunde muss aktiv sein, Defaults serverseitig.
- **Rollback:** Action/UI zurücknehmen; keine destruktiven Migrationen.

### AP-06 – Projekt bearbeiten

- **Ziel:** Projektstammdaten administrativ bearbeiten.
- **Dateien:** Projekt-Actions, Edit-Schema, Permissions, Tests.
- **Risiken:** Reviewer verändert Stammdaten, gelöschte Projekte bearbeitbar, Status nebenbei manipulierbar.
- **Tests:** Admin-Stammdatenänderung; Reviewer-Verbot; getrennte Statusänderung.
- **Abhängigkeiten:** AP-01, AP-05, AP-12.
- **Definition of Done:** Stammdaten und Review-Felder getrennt.
- **Rollback:** Patch zurücknehmen; Daten bleiben im letzten Zustand.

### AP-07 – Status / Klasse / Human Review

- **Ziel:** Reviewer- und Admin-Änderungen an Status, Klasse und Human-Review-Flag gemäß Zielmodell.
- **Dateien:** Status-Action, `lib/domain/status-transitions.ts`, Permissions, ggf. RLS-Migration, Tests.
- **Risiken:** Unerlaubte Statussprünge, Angebotsfreigabe ohne Human Review, Trigger/RLS-Widerspruch.
- **Tests:** Vollständige Statusmatrix; Reviewer darf nur erlaubte Review-Felder; `closed` blockiert.
- **Abhängigkeiten:** AP-01, AP-12.
- **Definition of Done:** UI, Server Action und DB-Regeln stimmen überein.
- **Rollback:** Action deaktivieren; Migration nur additiv mit dokumentiertem Down-Pfad.

### AP-08 – Notizen

- **Ziel:** Notizen erstellen, bearbeiten und soft löschen mit Rollenrechten.
- **Dateien:** Projektdetail-Actions, Notizschemas, additive Migration für `deleted_at`, RLS-Policies, Tests.
- **Risiken:** Reviewer bearbeitet fremde Notizen, PII in Notizen/Audit, gelöschte Notizen sichtbar.
- **Tests:** Eigene Notizen für Reviewer; Admin umfassend; Soft Delete; Projektzugriff.
- **Abhängigkeiten:** AP-12.
- **Definition of Done:** `deleted_at` statt Hard Delete; RLS- und Query-Filter aktiv.
- **Rollback:** UI/Action zurücknehmen; Spalte kann ungenutzt bleiben.

### AP-09 – Audit Anzeige

- **Ziel:** Audit-Einträge sicher anzeigen.
- **Dateien:** Audit-Helper, Audit-Read-Action/Page, RLS/RPC-Migration falls nötig, Tests.
- **Risiken:** PII-Leak in Metadaten, direkte Client-Manipulation, zu breite Leserechte.
- **Tests:** Metadaten-Allowlist; Rollenzugriff; keine direkten Writes.
- **Abhängigkeiten:** AP-01, AP-12.
- **Definition of Done:** Anzeige enthält nur sichere Metadaten und ist rollenbeschränkt.
- **Rollback:** Anzeige entfernen; Auditdaten bleiben erhalten.

### AP-10 – Suche und Filter

- **Ziel:** Kunden-/Projektlisten mit robusten Such- und Filterparametern.
- **Dateien:** Listenpages oder Query-Helfer, Zod-SearchParams-Schemas, Tests.
- **Risiken:** Query-Manipulation, Performance ohne passende Indizes, gelöschte Datensätze sichtbar.
- **Tests:** Ungültige Filterwerte, aktive Datensätze, Suchnormalisierung.
- **Abhängigkeiten:** AP-12 empfohlen.
- **Definition of Done:** Parameter validiert; RLS und Query schließen Soft Deletes aus.
- **Rollback:** Filter auf alte Listenlogik zurücksetzen.

### AP-11 – Rollen UI

- **Ziel:** UI zeigt nur erlaubte Aktionen je Rolle.
- **Dateien:** Layout/Page-Komponenten, Permissions-Mapper, Tests.
- **Risiken:** UI als einzige Schutzschicht missverstanden; falsche Rollenanzeige.
- **Tests:** Permissions-Mapper; Smoke-Tests für Admin/Reviewer-Anzeige.
- **Abhängigkeiten:** AP-01, AP-07, AP-12.
- **Definition of Done:** UI versteckt unzulässige Aktionen, Server/RLS erzwingen dennoch Rechte.
- **Rollback:** UI-Änderungen zurücknehmen; Sicherheitslogik bleibt server-/dbseitig.

### AP-12 – RLS Härtung

- **Ziel:** RLS-Policies an Zielmodell und Soft Delete anpassen.
- **Dateien:** Neue additive Migration, Security-Dokumentation, RLS-Tests.
- **Risiken:** Nutzer ausgesperrt, Reviewer zu breit berechtigt, Migration nicht reversibel.
- **Tests:** Admin/Reviewer/unauthenticated-Matrix; gelöschte Datensätze; Audit-Log-Schutz.
- **Abhängigkeiten:** AP-01 für Status-/Rechtebezug.
- **Definition of Done:** RLS ist dokumentiert, getestet und Preview-geprüft.
- **Rollback:** Dokumentierter SQL-Rollback für neue Policies/Trigger; keine destruktiven Änderungen.

### AP-13 – Integrationstests

- **Ziel:** End-to-End-nahe Absicherung der wichtigsten Workflows.
- **Dateien:** Testkonfiguration, Domain-/Action-/RLS-Testdateien, ggf. Testhelpers.
- **Risiken:** Tests benötigen Supabase-Testumgebung; instabile CI bei fehlenden Env Vars.
- **Tests:** Kunden, Projekte, Statuswechsel, Notizen, Soft Delete, Rollenmatrix.
- **Abhängigkeiten:** AP-01 bis AP-12 je nach Testumfang.
- **Definition of Done:** Lokale und CI-kompatible Teststrategie dokumentiert; `npm test` grün.
- **Rollback:** Testdateien/Config zurücknehmen; Produktionscode unverändert.

## 18. Merge Gates

Jeder spätere PR muss folgende Gates erfüllen:

- Audit-Referenz Pflicht: `KG-AUDIT-2026-07-21-ADMIN-WORKFLOWS-V1` im PR und relevanten Implementierungsplan nennen.
- Nur freigegebene Arbeitspakete umsetzen.
- Keine Vermischung mehrerer großer Pakete ohne explizite Freigabe.
- Migrationen nur additiv; destruktive Änderungen separat freigeben.
- `npm run typecheck` erfolgreich.
- `npm run lint` erfolgreich.
- `npm test` erfolgreich.
- `npm run build` erfolgreich.
- Vercel Preview erfolgreich.
- Keine Secrets im Repository.
- Keine personenbezogenen Daten in Logs.
- Keine personenbezogenen Daten in Audit-Metadaten.
- Rollback dokumentiert.
- RLS-Änderungen nachvollziehbar dokumentiert und getestet.

## 19. Rollback Strategie

- Kleine PRs pro Arbeitspaket ermöglichen Git-Revert ohne Seiteneffekte.
- Migrationen additiv gestalten, sodass Rückbau über Deaktivieren von UI/Actions und ergänzende Rollback-SQLs möglich bleibt.
- Für Policies und Trigger konkrete vorherige Definitionen dokumentieren.
- Feature-Exposition in UI von Server-/DB-Sicherheitslogik trennen.
- Bei Build-/Vercel-Problemen zuerst letzten grünen Commit `f359d22` als bekannte Baseline verwenden.
- Bei Datenfehlern Soft Deletes nicht hart löschen; Reaktivierung administrativ dokumentieren.

## 20. Offene Entscheidungen

1. Soll ein Lockfile verbindlich ins Repository aufgenommen werden, um Vercel-Reproduzierbarkeit zu erhöhen?
2. Soll Statusübergangslogik nur in TypeScript oder zusätzlich per Datenbanktrigger abgesichert werden?
3. Welche Rolle darf Audit-Logs lesen: nur Admin oder auch Reviewer projektbezogen?
4. Welche Audit-Metadaten sind ausdrücklich erlaubt, ohne PII zu riskieren?
5. Wie sollen Kunden mit aktiven Projekten soft gelöscht werden: blockieren, kaskadierend markieren oder nur nach Abschluss erlauben?
6. Darf ein Reviewer `requires_human_review` auf `false` setzen, oder nur setzen/markieren?
7. Welche Projektklassen A-D bedeuten fachlich was, und sind zusätzliche Validierungsregeln nötig?
8. Welche Supabase-Teststrategie wird für RLS-Integrationstests akzeptiert?
9. Soll die Projektdetailseite gelöschte Projekte für Admins archiviert anzeigen oder vollständig verbergen?
10. Wie lange sollen Audit-Logs und Soft-Delete-Datensätze aufbewahrt werden?

## 21. Freigabe Abschnitt

- **Audit ID:** KG-AUDIT-2026-07-21-ADMIN-WORKFLOWS-V1
- **Status:** DRAFT – NICHT ZUR IMPLEMENTIERUNG FREIGEGEBEN
- **Freigegeben von:** _offen_
- **Freigabedatum:** _offen_
- **Freigegebene Arbeitspakete:** _keine_
- **Hinweis:** Spätere Implementierungen dürfen erst nach expliziter Freigabe dieses Audits und ausschließlich mit Referenz auf freigegebene Arbeitspakete erfolgen.

## Baseline Stabilization Result

- **Audit Referenz:** KG-AUDIT-2026-07-21-ADMIN-WORKFLOWS-V1
- **Arbeitspaket:** AP-00 – Baseline Stabilisierung
- **Ursache:** `tsconfig.json` definiert den TypeScript-Pfadalias `@/*`, aber `vitest.config.ts` hatte keine entsprechende Vite/Vitest-Resolve-Alias-Konfiguration. TypeScript konnte die Imports typisieren, Vitest konnte sie zur Laufzeit beim Transformieren der Tests jedoch nicht auflösen.
- **Lösung:** `vitest.config.ts` wurde minimal um `resolve.alias` für `@` auf das Repository-Root erweitert. Es wurden keine Features, UI-Änderungen, Datenmodelländerungen, Migrationen oder Paketupdates vorgenommen.
- **Betroffene Dateien:** `vitest.config.ts`, `docs/audits/2026-07-21-admin-workflows-audit.md`
- **Build Status:** `npm install`, `npm run typecheck`, `npm run lint`, `npm test` und `npm run build` laufen nach AP-00 erfolgreich mit Exit Code 0. AP-00 führt keine neuen Warnungen ein; die bereits in der Audit-Baseline dokumentierten npm-, Vite- und Next.js-Hinweise bleiben unverändert.

## Abschlussbericht – KG-AUDIT-2026-07-21-ADMIN-WORKFLOWS-V1

1. **Audit ID:** KG-AUDIT-2026-07-21-ADMIN-WORKFLOWS-V1
2. **Baseline Commit:** `f359d22`
3. **Analysierter geschlossener Commit:** `5a7eb3f`, lokal nicht erreichbar; daher keine belegbare Diff-Analyse möglich.
4. **Erstellte Dateien:** `docs/audits/2026-07-21-admin-workflows-audit.md`
5. **Build Ergebnisse:** `npm install` 0, `npm run typecheck` 0, `npm run lint` 0, `npm test` 1, `npm run build` 0.
6. **Bekannte Risiken:** RLS-Zielmodell unvollständig, Reviewer-Rechte zu grob/teils widersprüchlich, fehlende Statusübergangsregeln, fehlendes Notizen-Soft-Delete, fehlender Audit-Helper, Test-Baseline rot.
7. **Nicht belegbare Ursachen:** Die konkrete Vercel-Fehlerursache ist anhand der verfügbaren Informationen nicht belegbar. Inhalte des Commits `5a7eb3f` sind nicht belegbar.
8. **Empfohlene Arbeitspakete:** AP-01 bis AP-13 wie oben beschrieben.
9. **Offene Entscheidungen:** Siehe Abschnitt 20.
10. **Bestätigung:** Es wurde keinerlei funktionaler Code geändert.
11. **Pull Request Link:** Wird nach Commit und PR-Erstellung ergänzt.

## AP-01 Implementation Result

- **Audit-ID:** KG-AUDIT-2026-07-21-ADMIN-WORKFLOWS-V1
- **Arbeitspaket:** AP-01 – Domainregeln und Statusübergänge
- **Implementierungsstatus:** Implementiert auf Branch `codex/ap-01-domain-rules`; der Gesamt-Audit-Status bleibt unverändert und wird nicht rückwirkend umgeschrieben.
- **Betroffene Dateien:**
  - `lib/domain/types.ts`
  - `lib/domain/schemas.ts`
  - `lib/domain/mappers.ts`
  - `lib/domain/project-status.ts`
  - `lib/domain/permissions.ts`
  - `test/domain.test.ts`
  - `docs/audits/2026-07-21-admin-workflows-audit.md`
- **Umgesetzte Domainregeln:**
  - Zentrale Typen und Konstanten für Rollen `admin` und `reviewer`, Projektstatuswerte `new`, `collecting_information`, `technical_review`, `quote_draft`, `human_review`, `quote_sent`, `accepted`, `rejected`, `closed` sowie Projektklassen `A`, `B`, `C`, `D`.
  - Zentrale, unveränderliche Statusübergangsmatrix inklusive explizit leerer Folgeliste für `closed`.
  - Reine Helfer für erlaubte Statusübergänge und abrufbare Folgestatus ohne Supabase-, HTTP- oder Datenbankabhängigkeit.
  - Deutsche Labels für Status, Projektklassen und Rollen sowie Beschreibungen für Projektklassen.
  - Zentraler Standard `DEFAULT_REQUIRES_HUMAN_REVIEW = true` und Zod-Default für neue Projektdaten.
  - Reine Domain-Berechtigungshelfer für Kunden, Projekte, Human Review, Zusammenfassung und Notizen gemäß Admin-/Reviewer-Zielmodell. Diese Helfer ersetzen keine serverseitige Authentifizierung und keine RLS-Policies.
- **Testumfang:** Unit-Tests für gültige und ungültige Statuswerte, alle erlaubten Matrixübergänge, definierte verbotene Übergänge, Unveränderlichkeit der Matrix, Projektklassen inklusive Nullable-Schema, Rollen, Human-Review-Default und ungültige Werte sowie Admin-/Reviewer-Berechtigungen inklusive Besitzprüfung für Notizen.
- **Ausgeführte Merge Gates:**
  - Baseline vor Implementierung: `npm install`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` erfolgreich.
  - Nach Implementierung: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` erfolgreich.
- **Bekannte Einschränkungen:** Keine Datenbankmigration, keine RLS-Änderung, keine Server Actions und keine UI-Änderung in AP-01; spätere Arbeitspakete müssen die Domainregeln serverseitig und in RLS/Triggern audit-konform anbinden.
- **Rollback-Hinweis:** PR beziehungsweise Commit `Implement AP-01 domain rules and status transitions` zurücksetzen; es sind keine Datenbankänderungen rückabzuwickeln.

## AP-02 Implementation Result

- **Audit-ID:** KG-AUDIT-2026-07-21-ADMIN-WORKFLOWS-V1
- **Arbeitspaket:** AP-02 – Kunden anlegen und Kundendetail
- **Implementierungsstatus:** Implementiert auf Branch `codex/ap-02-create-customer`; der Gesamt-Audit-Status bleibt unverändert und wird nicht rückwirkend umgeschrieben.
- **Baseline-Commit:** `7cd46b3745f5e87364f5dfda1ad1fa2a38e25f73`
- **Betroffene Dateien:**
  - `app/(app)/customers/page.tsx`
  - `app/(app)/customers/new/page.tsx`
  - `app/(app)/customers/new/customer-form.tsx`
  - `app/(app)/customers/[id]/page.tsx`
  - `lib/actions/customers.ts`
  - `lib/actions/customer-create-service.ts`
  - `lib/domain/display.ts`
  - `lib/domain/schemas.ts`
  - `test/customer-create.test.ts`
  - `docs/audits/2026-07-21-admin-workflows-audit.md`
- **Implementierte Funktionen:** Kundenliste zeigt nur aktive Kunden und verlinkt Detailseiten; Admins sehen den Button `Kunde anlegen`; `/customers/new` enthält ein validiertes Anlageformular; erfolgreiche Anlage führt zur Kundendetailseite; `/customers/[id]` lädt validierte UUIDs, blendet gelöschte Kunden aus und zeigt optionale Felder sicher an.
- **Rollenprüfung:** Die Kundenanlage lädt serverseitig Benutzer und Profil, validiert die Rolle mit `roleSchema` und prüft `canCreateCustomer(role)`. Reviewer und nicht authentifizierte Aufrufe werden serverseitig abgewiesen.
- **Validierungsregeln:** `createCustomerSchema` erlaubt ausschließlich `first_name`, `last_name`, `email` und `phone`; Namen werden getrimmt und müssen nach Trim gefüllt sein; optionale leere E-Mail und Telefonnummer werden `null`; Telefonnummern werden außen getrimmt, interne Formatzeichen bleiben erhalten.
- **Testumfang:** Unit-Tests für Kundenschema, Mass-Assignment-Schutz, Admin-/Reviewer-Berechtigung, Kundenanlage-Service mit Auth-/Profil-/Reviewer-/Validierungs-/Insert-Szenarien, serverseitiges `created_by`, neutrale Datenbankfehlermeldung und optionale Anzeige-Platzhalter.
- **Merge-Gates:** Baseline vor Implementierung: `npm install`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` erfolgreich. Nach Implementierung: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` erfolgreich.
- **Audit-Log-Status:** Kein sicherer, dokumentierter und getesteter Audit-Schreibmechanismus für `customer.created` existiert in AP-02. Es wurde kein Audit-Eintrag erzwungen, keine Migration erstellt, keine RLS-Änderung vorgenommen und kein Service-Role-Key verwendet.
- **Bekannte Einschränkungen:** Vercel-Deployment des aktuellen main konnte lokal nicht unabhängig verifiziert werden; AP-02 enthält keine Kundenbearbeitung, kein Soft Delete, keine Suche, keine Filter, keine RLS-Härtung und keinen Audit-Log-Schreibpfad.
- **Rollback-Anweisung:** PR beziehungsweise Commit `Implement AP-02 customer creation and detail view` zurücksetzen; es sind keine Datenbankänderungen rückabzuwickeln.

## AP-03 Implementation Result

- **Audit-ID:** KG-AUDIT-2026-07-21-ADMIN-WORKFLOWS-V1
- **Arbeitspaket:** AP-03 – Kunden bearbeiten
- **Implementierungsstatus:** Implementiert auf Branch `codex/ap-03-edit-customer`; der Gesamt-Audit-Status bleibt unverändert und wird nicht rückwirkend verändert.
- **Baseline-Commit:** `d3dfa4256c61a07f0e0531d88bdbc24323c94fd8`
- **Betroffene Dateien:**
  - `app/(app)/customers/[id]/page.tsx`
  - `app/(app)/customers/[id]/edit/page.tsx`
  - `app/(app)/customers/[id]/edit/customer-edit-form.tsx`
  - `lib/actions/customers.ts`
  - `lib/actions/customer-update-service.ts`
  - `lib/domain/display.ts`
  - `lib/domain/schemas.ts`
  - `test/customer-update.test.ts`
  - `docs/audits/2026-07-21-admin-workflows-audit.md`
- **Implementierte Route:** `/customers/[id]/edit` für die Bearbeitung bestehender, nicht gelöschter Kunden.
- **Implementierter Bearbeitungsworkflow:** Admins sehen auf der Kundendetailseite `Bearbeiten`, laden aktuelle Kundendaten im Formular, speichern validierte Änderungen und werden nach Erfolg zu `/customers/[id]?updated=1` zurückgeführt. Die Detailseite kann `Kundendaten wurden aktualisiert.` anzeigen.
- **Rollenprüfung:** Detailseite, Bearbeitungsseite und Update-Action laden Benutzerprofil, validieren `roleSchema` und prüfen `canEditCustomer(role)`. Reviewer erhalten keinen Bearbeiten-Button und werden serverseitig abgewiesen.
- **Zod-Validierung:** `updateCustomerSchema` erlaubt ausschließlich `first_name`, `last_name`, `email` und `phone`; Namen bleiben Pflichtfelder, optionale leere E-Mail und Telefonnummer werden `null`, Telefonnummern werden nicht aggressiv normalisiert.
- **Mass-Assignment-Schutz:** FormData und Update-Payload verwenden explizite Allowlists. `id`, `created_by`, `created_at`, `updated_at`, `deleted_at`, `role` und unbekannte Felder werden nicht an Supabase übergeben.
- **Schutz soft gelöschter Kunden:** Bearbeitungsseite und Update-Action filtern Kunden mit `deleted_at IS NULL`; ungültige, unbekannte oder soft gelöschte Kunden werden nicht regulär bearbeitet.
- **Testumfang:** Unit-Tests für Update-Schema, fremde Felder, Admin-/Reviewer-Berechtigung, Auth-/Profil-/Rollenfehler, ungültige UUID, Feldfehler, Update-Payload-Allowlist, ID-Filter, `deleted_at IS NULL`, erfolgreiche Updates, neutrale Fehler bei nicht betroffenen Datensätzen und DB-Fehlern sowie Formularwerte für optionale Felder.
- **Ausgeführte Merge-Gates:** Baseline vor Implementierung: `npm install`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` erfolgreich. Nach Implementierung: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` erfolgreich.
- **Audit-Log-Status:** Kein neuer Audit-Log-Schreibmechanismus. `customer.updated` wird in AP-03 nicht in `audit_log` geschrieben, weil kein sicherer, dokumentierter und getesteter Mechanismus existiert. Kein Service-Role-Key, keine Migration und keine RLS-Änderung.
- **Bekannte Einschränkungen:** Vercel-Production-Deployment von main konnte lokal nicht unabhängig verifiziert werden. AP-03 enthält kein Soft Delete, keine Suche, keine Filter, keine RLS-Härtung und keinen Audit-Schreibpfad.
- **Rollback-Anweisung:** PR beziehungsweise Commit `Implement AP-03 customer editing` zurücksetzen; es sind keine Datenbankänderungen rückabzuwickeln.

## AP-04 Implementation Result

- **Audit-ID:** KG-AUDIT-2026-07-21-ADMIN-WORKFLOWS-V1
- **Arbeitspaket:** AP-04 – Kunden Soft Delete
- **Implementierungsstatus:** Implementiert auf Branch `codex/ap-04-soft-delete-customer`; der Gesamt-Audit-Status bleibt unverändert und ursprüngliche Audit-Erkenntnisse wurden nicht rückwirkend verändert.
- **Baseline-Commit:** `392c55d68e1e4b589d3c0ee335f1a1d9db79ca79`
- **Betroffene Dateien:**
  - `app/(app)/customers/page.tsx`
  - `app/(app)/customers/[id]/page.tsx`
  - `app/(app)/customers/[id]/delete-customer-form.tsx`
  - `lib/actions/customers.ts`
  - `lib/actions/customer-delete-service.ts`
  - `test/customer-delete.test.ts`
  - `docs/audits/2026-07-21-admin-workflows-audit.md`
- **Implementierter Soft-Delete-Workflow:** Admins sehen auf aktiven Kundendetailseiten `Kunde löschen`, müssen die Löschung bestätigen, und werden nach erfolgreichem serverseitigem Soft Delete zu `/customers?deleted=1` weitergeleitet. Die Kundenliste zeigt `Kunde wurde gelöscht.` und normale Listen-/Detail-/Edit-Abfragen blenden den Kunden durch vorhandene `deleted_at IS NULL`-Filter aus.
- **Rollenprüfung:** Die Soft-Delete-Action lädt den angemeldeten Benutzer, lädt das Profil, validiert `roleSchema` und prüft zwingend `canSoftDeleteCustomer(role)`. Reviewer und ungültige Rollen werden vor Kunden- oder Projektabfragen abgewiesen.
- **UUID-Validierung:** `deleteCustomerSchema` akzeptiert ausschließlich `customer_id` als UUID. Ungültige IDs lösen keine Update-Abfrage aus.
- **Projekt-Sperrregel:** Vor dem Kundenupdate wird minimal `projects.select("id").eq("customer_id", customerId).is("deleted_at", null).limit(1)` geprüft. Jedes nicht gelöschte Projekt blockiert die Löschung unabhängig vom Projektstatus.
- **Soft-Delete-Payload:** Das Update-Payload enthält ausschließlich `deleted_at` mit serverseitig erzeugtem ISO-Zeitstempel.
- **Mass-Assignment-Schutz:** FormData wird nur auf `customer_id` abgebildet; clientseitige Werte für `deleted_at`, Kundendaten, `created_by`, Rollen, Projektinformationen oder Metadaten werden nicht an Supabase übergeben.
- **IDOR-Schutz:** Kunden-ID, Authentifizierung, Profil, Rolle, RLS und `deleted_at IS NULL`-Filter wirken zusammen. Das Kundenupdate nutzt zusätzlich `eq("id", customerId)` und `is("deleted_at", null)`.
- **Verhalten für bereits gelöschte Kunden:** Bereits gelöschte oder nicht vorhandene Kunden werden vor dem Update als nicht verfügbar behandelt; ein zweiter Löschversuch wird nicht als Erfolg behandelt.
- **Revalidierungsverhalten:** Nach Erfolg werden `/customers` und `/customers/[id]` revalidiert.
- **Testumfang:** Unit-Tests für Delete-Input-Schema, fremde Felder, Admin-/Reviewer-Berechtigung, Auth-/Profil-/Rollenfehler, ungültige UUID, aktiver Kunde mit `deleted_at IS NULL`, Projekt-Sperrregel, minimale Projektabfrage, Update-Payload, serverseitige Zeitquelle, Projektsperre ohne Customer-Update, neutrale Fehler und nicht betroffene Datensätze.
- **Ausgeführte Merge-Gates:** Baseline vor Implementierung: `npm install`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` erfolgreich mit 57 Ausgangstests; `npm run build` meldete eine Netzwerk-/Lockfile-Patch-Warnung beim Zugriff auf `registry.npmjs.org`, beendete aber mit Exit Code 0. Nach Implementierung: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` erfolgreich.
- **Audit-Log-Status:** Kein neuer Audit-Log-Schreibmechanismus. `customer.deleted` wird in AP-04 nicht in `audit_log` geschrieben, weil kein sicherer, dokumentierter und getesteter Mechanismus existiert. Kein Service-Role-Key, keine Migration und keine RLS-Änderung.
- **Bekannte Einschränkungen:** Vercel-Production-Deployment von main konnte lokal nicht unabhängig verifiziert werden. AP-04 enthält keine Wiederherstellung, keine Papierkorbansicht, keine Suche, keine Filter, keine RLS-Härtung und keinen Audit-Schreibpfad.
- **Hinweis zur fehlenden Atomarität:** Die Prüfung auf verknüpfte Projekte und das anschließende Soft Delete erfolgen in AP-04 auf Anwendungsebene und sind ohne neue Datenbankfunktion nicht vollständig atomar.
- **Rollback-Anweisung:** PR beziehungsweise Commit `Implement AP-04 customer soft delete` zurücksetzen; es sind keine Datenbankänderungen rückabzuwickeln.
