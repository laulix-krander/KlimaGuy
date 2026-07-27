# AP-11 Abschlussvalidierung – Projektbearbeitung

**Audit-ID:** `KG-AUDIT-2026-07-24-AP11-FINAL-V1`  
**Audit-Datum:** 24.07.2026  
**Geprüfter Branch:** `codex/ap11-final-validation`  
**Geprüfte Baseline:** `358f780`  
**Charakter:** Abschlussaudit des aktuellen Repositorystands, ohne Implementierung

## 1. Scope, Methodik und Ergebnis

Dieses Audit prüft ausschließlich den beim Auditbeginn vorhandenen Repositorystand. Als fachliche Ausgangsdokumente wurden vollständig gelesen:

- `docs/audits/2026-07-23-project-edit-audit.md`;
- `docs/audits/2026-07-23-ap11-06-ux-audit.md` einschließlich aller sieben `Implementation Result`-Abschnitte;
- `docs/audits/2026-07-23-ap11-06-workflow-analysis.md` einschließlich `Decision and Implementation Result`;
- die im Git-Verlauf sichtbaren AP-11-Implementierungsstände von AP-11-00 bis AP-11-06-07.

Geprüft wurden die produktiven Projektseiten und Formulare, die projektbezogenen Server Actions und Services, Domain-Permissions und Zod-Schemas, Revalidation-Helfer, die vorhandenen AP-11-Tests als statische Architekturbelege sowie Referenzen auf den entfernten Sammelworkflow. Es wurden keine Tests ausgeführt und keine Laufzeit-, Browser- oder Production-Datenbankprüfung vorgenommen.

**Gesamtergebnis:** Die fünf vorgesehenen Projektbearbeitungsbereiche sind im Repository feldgranular und durchgängig getrennt umgesetzt. Der Legacy-Sammelworkflow ist aus dem produktiven Code vollständig entfernt. Im statisch geprüften AP-11-Umfang wurden keine verwaisten Imports, Exporte oder Revalidation-Helfer festgestellt. Für die Code- und Architekturperspektive ist AP-11 abnahmefähig. Die Production-Readiness bleibt hinsichtlich realer Rollen-/RLS-Wirkung, paralleler Nutzung und Browserabläufen von der nachstehenden manuellen Production-Checkliste abhängig.

## 2. Validierte Arbeitspakete

| Arbeitspaket | Im aktuellen Stand validiertes Ergebnis | Bewertung |
|---|---|---|
| `AP-11-00` | Scope-Freeze und Permissions-Härtung: Projektstammdaten, Zusammenfassung und Human Review sind Admin-only; Status und Klasse sind für Admin und Reviewer erlaubt. Damit entsprechen UI-Gating und Services den zentralen Permission-Helpern. | umgesetzt |
| `AP-11-02` | Projektstatus besitzt ein eigenes Formular, eine eigene Action, einen eigenen Service und ein Ein-Feld-Schema. Statusübergänge werden serverseitig geprüft; der bisherige Status dient als Konfliktfilter. | umgesetzt |
| `AP-11-03` | Projektklasse besitzt ein eigenes Formular, eine eigene Action, einen eigenen Service und ein Ein-Feld-Schema. Die Allowlist umfasst ausschließlich `project_class`; der geladene Klassenwert einschließlich `null` dient als Konfliktfilter. | umgesetzt |
| `AP-11-04` | Projektzusammenfassung besitzt ein eigenes Formular, eine eigene Action, einen eigenen Service und ein Ein-Feld-Schema. Leere Eingabe wird zu `null` normalisiert; der vorherige Zusammenfassungswert dient als Konfliktfilter. | umgesetzt |
| `AP-11-05` | Human Review besitzt ein eigenes Ja/Nein-Formular, eine eigene Action, einen eigenen Service und ein Boolean-Schema. Der vorherige Boolean-Wert dient als Konfliktfilter. | umgesetzt |
| `AP-11-06-01` | Erfolgsparameter und Meldungen sind in `project-success-message.tsx` zentral abgebildet; je Aufruf wird höchstens die erste bekannte Erfolgsmeldung angezeigt. Der entfernte Parameter `review_updated` ist nicht mehr unterstützt. | umgesetzt |
| `AP-11-06-02` | Drei klar getrennte Revalidation-Helfer bilden die sichtbaren Datenabhängigkeiten ab: Detail; Übersicht plus Detail; Übersicht plus Detail plus Kundendetail. | umgesetzt |
| `AP-11-06-03` | Alle fünf erreichbaren Formulare setzen während Pending `aria-busy`, deaktivieren editierbare Controls und Submit und verwenden „Wird gespeichert …“. Beim Stammdatenformular ist auch Abbrechen deaktiviert. | umgesetzt |
| `AP-11-06-04` | Allgemeine und feldbezogene Fehler werden über gemeinsame Komponenten ausgegeben. Feldfehler sind konditional mit `aria-describedby` und `aria-invalid` zugeordnet. | umgesetzt |
| `AP-11-06-05` | Vorhandene Regressionstests decken laut Repositorystand Erfolgsfeedback, Pending, Fehlerbeziehungen, Allowlists, Revalidation und Architekturgrenzen ab. In diesem Abschlussaudit wurden sie ausdrücklich nicht ausgeführt. | umgesetzt; nur statisch verifiziert |
| `AP-11-06-06` | Die Analyse dokumentierte den alten Sammelworkflow, seine vollständige Überschneidung und die Entscheidung für unabhängige Projekteigenschaften. | umgesetzt als Entscheidungs-/Analysepaket |
| `AP-11-06-06-01` | Sammelformular, Sammel-Action, Sammel-Service, Sammel-Schema/-Typ, exklusiver Testpfad und Erfolgsparameter wurden entfernt; spezialisierte Workflows blieben bestehen. | umgesetzt |
| `AP-11-06-07` | Die Formulare verwenden den gemeinsamen Reset-Hook. Erfolg setzt unkontrollierte Controls auf Server-Defaults zurück; beim eingebetteten Stammdatenformular endet zusätzlich der Bearbeitungsmodus. Fehler und Konflikte lösen keinen Reset aus. | umgesetzt |

`AP-11-01` ist in der vorgegebenen Abschlussliste nicht enthalten. Sein früherer fachlicher Inhalt wurde im aktuellen Zielbild durch `AP-11-00` und den bestehenden, nun zusammenfassungsfreien Stammdatenpfad eingegrenzt. Die validierte Paketliste wird daher nicht um ein nicht angefordertes Arbeitspaket erweitert.

## 3. Fachbereiche und Berechtigungen

| Bereich | UI/Route | Rollen im aktuellen Domainmodell | Schreibfeld(er) | Ergebnis |
|---|---|---|---|---|
| Projekt-Stammdaten | eingebettetes `ProjectMetadataForm`; zusätzlich bestehende Edit-Route mit demselben Core-Action-Pfad | Admin | `title`, `installation_address`, `postal_code`, `city` | getrennt und eng begrenzt |
| Projektstatus | `ProjectStatusForm` auf der Detailseite | Admin, Reviewer | `status` | getrennt; Übergangsmatrix aktiv |
| Projektklasse | `ProjectClassForm` auf der Detailseite | Admin, Reviewer | `project_class` | getrennt; `A` bis `D` |
| Projektzusammenfassung | `ProjectSummaryForm` auf der Detailseite | Admin | `summary` | getrennt; nullable Textwert |
| Human Review | `ProjectHumanReviewForm` auf der Detailseite | Admin | `requires_human_review` | getrennt; explizites Boolean |

Die Detailseite berechnet die fünf Anzeigeentscheidungen einzeln aus der validierten Profilrolle. Jeder Service wiederholt Authentifizierung, Profil-/Rollenvalidierung und die jeweils passende Permission-Prüfung serverseitig. UI-Sichtbarkeit ist damit nicht die einzige Sicherheitsbarriere.

### Admin

Admins erhalten im aktuellen Domainmodell alle fünf Bearbeitungswege. Stammdaten bleiben von der Zusammenfassung getrennt; Status, Klasse und Human Review werden nicht gemeinsam übermittelt. Die expliziten Service-Payloads enthalten nur die jeweils erlaubten Felder.

### Reviewer

Reviewer erhalten ausschließlich Status- und Klassenbearbeitung. Projekt-Stammdaten, Projektzusammenfassung und Human Review sind sowohl beim serverseitigen Render-Gating als auch über die Services ausgeschlossen. Damit ist die im Ausgangsaudit genannte Abweichung zwischen Domain-Helpern, Service und möglichem DB-Trigger im aktuellen Anwendungscode aufgelöst, ohne dass AP-11 SQL, RLS oder Trigger ändern musste.

## 4. Bestätigte feldgranulare Architektur

### 4.1 Getrennte Formulare

Bestätigt sind fünf produktiv gerenderte Komponenten:

- `project-metadata-form.tsx` für `title`, `installation_address`, `postal_code`, `city`;
- `project-status-form.tsx` für `status`;
- `project-class-form.tsx` für `project_class`;
- `project-summary-form.tsx` für `summary`;
- `project-human-review-form.tsx` für `requires_human_review`.

Die Detailseite importiert und rendert genau diese spezialisierten Komponenten. Ein `ProjectReviewForm` wird weder importiert noch gerendert und die frühere Datei existiert nicht.

### 4.2 Getrennte Server Actions

Bestätigt sind `updateProjectCoreAction`, `updateProjectStatusAction`, `updateProjectClassAction`, `updateProjectSummaryAction` und `updateProjectHumanReviewAction`. Jede Action:

1. erstellt ausschließlich ihren passenden Supabase-Adapter;
2. ruft ausschließlich ihren passenden FormData-Mapper und Service auf;
3. gibt Fehler als Action-State zurück;
4. revalidiert erst nach einem erfolgreichen Service-Ergebnis;
5. redirectet mit einem bereichsspezifischen Erfolgsparameter.

Eine `updateProjectReviewAction` ist nicht mehr exportiert.

### 4.3 Getrennte Services

Bestätigt sind:

- `project-update-service.ts`;
- `project-status-update-service.ts`;
- `project-class-update-service.ts`;
- `project-summary-update-service.ts`;
- `project-human-review-update-service.ts`.

Jeder Service besitzt einen expliziten FormData-Mapper, einen bereichsspezifischen Data-Source-Vertrag, eine Permission-Prüfung und einen explizit typisierten Patch. `lib/actions/project-review-service.ts` existiert nicht.

### 4.4 Getrennte Schemas und Allowlists

Die aktiven Schemas sind `updateProjectMetadataSchema`, `updateProjectStatusSchema`, `updateProjectClassSchema`, `updateProjectSummarySchema` und `updateProjectHumanReviewSchema`. Alle sind `.strip()`-Schemas und werden in ihrem jeweiligen Service ausgewertet. Die Services bauen danach erneut explizite Patchobjekte:

| Bereich | Exakte Patch-Allowlist |
|---|---|
| Stammdaten | `title`, `installation_address`, `postal_code`, `city` |
| Status | `status` |
| Klasse | `project_class` |
| Zusammenfassung | `summary` |
| Human Review | `requires_human_review` |

Insbesondere sind `customer_id`, `created_by`, Zeitstempel, `deleted_at` und alle jeweils fremden Fachfelder in keinem AP-11-Patch enthalten. Das alte `updateProjectReviewSchema` und der Typ `ProjectReviewUpdateInput` existieren nicht im Domainmodul.

### 4.5 Getrennte Konfliktfilter

| Bereich | Filter gegen Paralleländerung | Bewertung |
|---|---|---|
| Stammdaten | nur `id` und `deleted_at IS NULL` | bewusst kein optimistischer Werte-/Versionsvergleich; Last-Write-Wins bleibt als Risiko |
| Status | aktueller `status` | feldspezifisch |
| Klasse | aktuelle `project_class`, null-sicher über `is` bzw. sonst `eq` | feldspezifisch |
| Zusammenfassung | aktuelle `summary`, null-sicher über `is` bzw. sonst `eq` | feldspezifisch |
| Human Review | aktuelles `requires_human_review` | feldspezifisch |

Damit sind die Konfliktfilter der vier Einzelwert-Workflows voneinander getrennt. Das Stammdatenverhalten wird nicht fälschlich als konfliktgeschützt bewertet.

### 4.6 Getrennte Revalidation

- Stammdaten und Status verwenden `getProjectAndCustomerRevalidationPaths`: `/projects`, Projektdetail und Kundendetail.
- Projektklasse und Human Review verwenden `getProjectOverviewRevalidationPaths`: `/projects` und Projektdetail.
- Projektzusammenfassung verwendet `getProjectDetailRevalidationPaths`: nur Projektdetail.

Die Komposition dedupliziert Pfade. Alle drei exportierten Revalidation-Helfer werden in produktiven Actions verwendet; ein toter oder ausschließlich dem Sammelworkflow dienender Revalidation-Helfer wurde nicht gefunden.

## 5. Legacy-Sammelworkflow und verlangte Repository-Suche

Der produktive Legacy-Sammelworkflow ist vollständig entfernt. Die verbleibenden Treffer sind historische Dokumentation oder explizite Negativ-Regressionen; kein Treffer stellt einen produktiven Import, Export, Service, Action, Schema oder Erfolgsparameter dar.

| Suchbegriff | Verbleibende Treffer | Einordnung |
|---|---|---|
| `project-review-form` | `test/project-ux-architecture.test.ts`; `2026-07-21-admin-workflows-audit.md`; die drei AP-11-Audits vom 23.07.2026 | Negativtest auf nicht vorhandene Datei sowie historische Bestands-/Entfernungsdokumentation |
| `updateProjectReviewAction` | `test/project-ux-architecture.test.ts`; die drei AP-11-Audits vom 23.07.2026 | Negativtest auf entfernten Export sowie historische Dokumentation |
| `project-review-service` | `test/project-ux-architecture.test.ts`; `2026-07-21-admin-workflows-audit.md`; die drei AP-11-Audits vom 23.07.2026 | Negativtests auf entfernten Import und entfernte Datei sowie historische Dokumentation |
| exaktes Wort `review_updated` | `test/project-success-message.test.tsx`; `2026-07-21-admin-workflows-audit.md`; beide AP-11-06-Audits vom 23.07.2026 | Negativtest, dass der entfernte Parameter ignoriert wird, sowie historische Dokumentation. `human_review_updated` ist ein anderer, aktiver Parameter. |
| `updateProjectReviewSchema` | `test/project-ux-architecture.test.ts`; `2026-07-21-admin-workflows-audit.md`; die drei AP-11-Audits vom 23.07.2026 | Negativtest auf entfernten Export sowie historische Dokumentation |
| `ProjectReviewUpdateInput` | `2026-07-23-ap11-06-workflow-analysis.md` | ausschließlich historische Bausteinbeschreibung |

Die älteren Audittexte wurden bewusst nicht nachträglich umgeschrieben: Sie dokumentieren den damals geprüften Stand, während ihre nachgestellten Implementation-Result-Abschnitte die spätere Entscheidung und Entfernung festhalten. Dieses Abschlussaudit ist die maßgebliche Zustandsbewertung für die Baseline `358f780`.

## 6. Tote Imports, Exporte und Revalidation-Helfer

### Imports

Die statische Referenzprüfung der AP-11-Produktionspfade sowie ESLint ergaben keine ungenutzten Imports. Die fünf Formulare werden von der Detailseite verwendet; ihre fünf Actions werden von den Formularen verwendet; Actions verwenden die zugehörigen Mapper, Services und Revalidation-Helfer.

### Exporte

Für die im AP-11-Scope eingeführten Runtime-Exporte wurden Verbraucher gefunden. Exportierte Data-Source- und Patchtypen werden durch `projects.ts` beziehungsweise die statischen Service-Tests als Verträge genutzt. Es bleiben keine workflow-exklusiven Exporte des alten Sammelpfads zurück. Eine repositoryweite allgemeine Public-API-Minimierung außerhalb AP-11 war nicht Gegenstand dieses Audits.

### Revalidation-Helfer

Alle drei Helfer sind live:

- `getProjectDetailRevalidationPaths` wird direkt von der Zusammenfassungsaction und intern von den zusammengesetzten Helfern genutzt;
- `getProjectOverviewRevalidationPaths` wird von Klassen- und Human-Review-Action sowie intern vom Kunden-Helper genutzt;
- `getProjectAndCustomerRevalidationPaths` wird von Stammdaten- und Statusaction genutzt.

**Ergebnis:** keine toten AP-11-Imports, keine toten AP-11-Exporte und keine toten Revalidation-Helfer festgestellt.

## 7. UX- und Zustandsvalidierung aus dem Repositorystand

| Zustand | Statische Bestätigung |
|---|---|
| Pending | Formulare markieren `aria-busy`, sperren Felder und Submit und zeigen denselben Pending-Text. |
| Erfolg | Actions revalidieren und redirecten mit eindeutig zuordenbarem Parameter; die zentrale Komponente zeigt genau eine bekannte Meldung. |
| Fehler | Actions redirecten nicht; allgemeine Fehler verwenden `role="alert"`, Feldfehler werden dem betroffenen Control zugeordnet. |
| Konflikt | Status, Klasse, Zusammenfassung und Human Review liefern beim leeren konfliktgefilterten Update eine neutrale Reload-Aufforderung und kein Erfolgssignal. |
| Reset | Der gemeinsame Hook setzt Formulare nur bei `state.success` zurück; der Stammdatenmodus wird dann geschlossen. |
| Reload | Ein Reload lädt serverseitige Werte neu. Ein Fehlerentwurf geht dabei erwartungsgemäß verloren; ein Erfolgsparameter bleibt in der URL und kann die Erfolgsmeldung erneut anzeigen. |

## 8. Production-Readiness

### Production-ready auf Code-/Architekturebene

- **Projekt-Stammdaten:** Admin-only, eigenes Schema und Patch; revalidiert alle Ansichten, die Titel/Stammdaten verwenden.
- **Projektstatus:** Admin/Reviewer, Statusmatrix und feldbezogener Konfliktschutz.
- **Projektklasse:** Admin/Reviewer, feste A–D-Allowlist und null-sicherer Konfliktschutz.
- **Projektzusammenfassung:** Admin-only, eigene Validierung/Normalisierung und engste Revalidation.
- **Human Review:** Admin-only, explizite Boolean-Eingabe und feldbezogener Konfliktschutz.
- **Gemeinsame UX-Qualitäten:** einheitliches Pending, zentrale Fehlerbausteine, zentrale Erfolgsmeldung und definierter Erfolgsreset.

Diese Einschätzung bedeutet: Die Struktur ist für Production geeignet und es wurde kein statischer AP-11-Blocker gefunden. Sie ersetzt nicht die manuelle Production-Abnahme mit echten Rollen und echten parallelen Sessions.

### Verbleibende Risiken

1. **Stammdatenkonflikte:** Stammdaten verwenden keinen vorherigen Feldwert und keinen `updated_at`-Vergleich. Parallele Admin-Updates können nach Last-Write-Wins überschrieben werden.
2. **Supabase-Fehlerklassifikation:** Bei den Einzelwert-Services wird ein von Supabase als `error` gemeldeter Nullzeilen-/`.single()`-Fall vor `!project` behandelt. Abhängig vom konkreten Client-/PostgREST-Verhalten kann ein Konflikt daher als allgemeiner Speicherfehler statt als spezifische Konfliktmeldung erscheinen. Der Schreibschutz durch den Filter bleibt bestehen.
3. **Erfolg nach Reload:** Erfolgsparameter werden nicht aus der URL entfernt; ein Reload kann dieselbe Meldung erneut anzeigen. Das ist ein UX-, kein Sicherheitsrisiko.
4. **Keine Laufzeitabnahme in diesem Audit:** Browserfokus, Screenreader-Ansage, echte Redirect-/Cachewirkung und Production-RLS wurden nicht manuell ausgeführt.
5. **Historische Dokumenttreffer:** Frühere Audits nennen den entfernten Sammelworkflow im Präsens ihres damaligen Untersuchungsstands. Die Result-Abschnitte und dieses Abschlussaudit lösen die Historie auf; Suchende müssen dennoch den Dokumentzeitpunkt beachten.
6. **Zwei Stammdatenoberflächen:** Die eingebettete Detailseitenbearbeitung und die bestehende Edit-Route verwenden dieselbe Action. Das ist kein Legacy-Review-Sammelworkflow, erhöht aber die manuell zu prüfende Oberfläche.

### Ausdrücklich nicht Bestandteil von AP-11

- Projektanlage und Änderung der Kundenzuordnung;
- Projekt-Soft-Delete sowie allgemeine Soft-Delete-/RLS-Härtung;
- Projektnotizen einschließlich Anlage, Bearbeitung und Löschung;
- Änderungen an Datenmodell, SQL, Migrationen, RLS-Policies oder Triggern;
- Audit-Log für Projektänderungen;
- technische Angebotsdaten, Angebotsworkflow und automatische Angebotsfreigabe;
- KI-Eingaben/-Ausgaben, WhatsApp-Integration und Preisberechnung;
- neue Rollen oder Änderungen an Supabase Auth;
- allgemeine Refactorings, Designänderungen oder neue UI;
- Browser-/E2E-, Screenreader-, Last- oder Production-Datenbanktests.

## 9. Manuelle Production-Checkliste

Die folgenden Prüfungen wurden in diesem reinen Repositoryaudit **nicht ausgeführt**. Sie bilden das verpflichtende manuelle Abnahmeprotokoll für Production oder eine produktionsgleiche Umgebung.

### Admin

- [ ] Als Admin eine aktive Projektdetailseite öffnen; alle fünf Bearbeitungsbereiche sind sichtbar.
- [ ] Stammdaten einzeln ändern und prüfen, dass Zusammenfassung, Status, Klasse und Human Review unverändert bleiben.
- [ ] Status, Klasse, Zusammenfassung und Human Review nacheinander ändern und jeweils die Isolation der übrigen Felder prüfen.
- [ ] Die separate Edit-Route für Stammdaten prüfen; Rückkehr und angezeigte Serverwerte müssen mit der eingebetteten Bearbeitung übereinstimmen.
- [ ] Soft-gelöschte oder nicht vorhandene Projekte dürfen nicht bearbeitbar sein.

### Reviewer

- [ ] Als Reviewer eine aktive Projektdetailseite öffnen; nur Status und Projektklasse sind bearbeitbar.
- [ ] Stammdaten-, Zusammenfassungs- und Human-Review-Controls sind nicht sichtbar.
- [ ] Direkte/manipulierte Aufrufe der drei Admin-only Actions werden serverseitig neutral abgewiesen.
- [ ] Ein erlaubter Statusübergang und eine Klassenänderung funktionieren in der echten Production-RLS-Konfiguration.
- [ ] Ein verbotener Statusübergang wird abgewiesen und ändert keine Daten.

### Konflikte

- [ ] Dasselbe Projekt in zwei getrennten Sessions öffnen.
- [ ] Status in Session A speichern; den alten Status in Session B speichern und Konflikt/Reload-Aufforderung ohne Überschreiben prüfen.
- [ ] Das gleiche Szenario getrennt für Projektklasse, Zusammenfassung und Human Review durchführen.
- [ ] Prüfen, ob Konflikte als spezifische Konfliktmeldung oder als allgemeiner Speicherfehler erscheinen; Abweichung dokumentieren.
- [ ] Für Stammdaten das bewusst verbleibende Last-Write-Wins-Verhalten fachlich akzeptieren oder als Folgepaket erfassen.

### Reload

- [ ] Nach jeder erfolgreichen Mutation reloaden; gespeicherte Werte bleiben erhalten.
- [ ] Prüfen und akzeptieren, dass der Erfolgsbanner wegen des Query-Parameters erneut sichtbar ist.
- [ ] Nach einem Validierungsfehler reloaden; Serverwert erscheint wieder und der ungespeicherte Entwurf ist verworfen.
- [ ] Nach externem Parallelupdate reloaden; alle fünf Anzeigen und Controls zeigen den neuen Serverstand.

### Pending

- [ ] Mit gedrosselter Verbindung jedes Formular absenden.
- [ ] Alle editierbaren Controls und Submit sind während der Anfrage deaktiviert; beim Stammdatenformular auch Abbrechen.
- [ ] Das Formular trägt `aria-busy="true"`, der Button `aria-disabled="true"` und der Text lautet „Wird gespeichert …“.
- [ ] Mehrfachsubmit und nachträgliche Änderung eines bereits gesendeten Werts sind während Pending nicht möglich.
- [ ] Pending endet sowohl nach Erfolg als auch nach Fehler.

### Erfolg

- [ ] Jeder der fünf Workflows zeigt genau seine verständliche Erfolgsmeldung und niemals mehrere Meldungen gleichzeitig.
- [ ] Nach Erfolg zeigen Projektliste, Projektdetail und – wo fachlich vorgesehen – Kundendetail die aktualisierten Werte.
- [ ] Das erfolgreich gespeicherte Formular ist auf Server-Defaults zurückgesetzt; die eingebettete Stammdatenbearbeitung ist geschlossen.
- [ ] `review_updated=1` erzeugt keine Meldung und kein produktiver Workflow erzeugt diesen Parameter.

### Fehler

- [ ] Ungültige/leere Pflichtwerte erzeugen genau einen allgemeinen Fehler und den erwarteten Feldfehler.
- [ ] `aria-invalid` und `aria-describedby` zeigen auf die sichtbare Feldmeldung.
- [ ] Bei Fehler bleiben eingegebene Werte erhalten und es erscheint kein Erfolgsbanner.
- [ ] Authverlust, ungültiges Profil, fehlende Berechtigung, ungültige UUID, fehlendes und soft-gelöschtes Projekt werden ohne Offenlegung interner Details behandelt.
- [ ] Ein temporärer Supabase-/Netzwerkfehler beendet Pending und erlaubt einen kontrollierten erneuten Versuch.

## 10. Abschlussbestätigung

Dieses Paket enthält ausschließlich diese Abschlussaudit-Datei. Es erfolgten:

- **keine Implementierung**;
- **keine UI-Änderung**;
- **keine Erstellung oder Änderung von Tests und keine Testausführung**;
- **keine Änderung an Server Actions**;
- **keine Änderung an Services**;
- **keine Änderung an Schemas**;
- **keine SQL-Änderung**;
- **keine Migration**;
- **keine RLS-Änderung**;
- **keine Trigger-Änderung**;
- **ausschließlich Abschlussaudit**.
