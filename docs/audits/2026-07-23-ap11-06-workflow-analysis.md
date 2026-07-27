# Analyse des kombinierten Projektprüfungsworkflows

**Audit-ID:** `KG-AUDIT-2026-07-23-AP11-06-UX-V1`
**Arbeitspaket:** `AP-11-06-06`
**Audit-Datum:** 23.07.2026
**Scope:** ausschließlich der bestehende kombinierte Projektprüfungsworkflow
**Charakter:** Bestandsanalyse ohne Entscheidung oder Implementierung

## 1. Gegenstand und Kurzfazit

Der kombinierte Projektprüfungsworkflow besteht weiterhin vollständig aus Client-Komponente, Server Action, Service, Schema, Domain-Helfern, Revalidation und Erfolgsmeldung. Im produktiven Seitenbaum ist seine Komponente jedoch nicht mehr importiert oder gerendert. Direkte Verwendungen bestehen nur noch in Tests; die Server Action bleibt als exportierter, prinzipiell aufrufbarer Einstieg vorhanden.

Seine drei fachlichen Felder `status`, `project_class` und `requires_human_review` werden auf der Projektdetailseite inzwischen jeweils durch eigene Formulare, Actions und Services bearbeitet. Der kombinierte Workflow hat damit aktuell keinen exklusiven fachlichen Schreibumfang. Sein einziges unterscheidbares Bedienkonzept ist die gemeinsame Übermittlung der drei Werte in einem Submit. Ob diese Bündelung fachlich als atomarer Prüfschritt benötigt wird, lässt sich aus dem Anwendungscode nicht belegen.

Technisch ist der Workflow deshalb weitgehend redundant, aber nicht folgenlos entfernbar. Dieses Audit trifft ausdrücklich **keine Entscheidung** zwischen Beibehalten, erneuter Integration und späterer Entfernung.

## 2. Verwendung und Erreichbarkeit

### 2.1 Produktiver Anwendungscode

- `app/(app)/projects/[id]/project-review-form.tsx` exportiert `ProjectReviewForm` und bindet `updateProjectReviewAction` mit `useActionState`.
- Außerhalb dieser Datei gibt es im aktuellen Anwendungscode keinen Import und keinen Render von `ProjectReviewForm`.
- `app/(app)/projects/[id]/page.tsx` importiert und rendert stattdessen `ProjectStatusForm`, `ProjectClassForm` und `ProjectHumanReviewForm`, jeweils hinter einer eigenen serverseitig berechneten Berechtigung.
- `lib/actions/projects.ts` exportiert `updateProjectReviewAction`. Die Action ist somit implementiert, wird aber von keinem aktuell gerenderten Formular aufgerufen.
- `app/(app)/projects/[id]/project-success-message.tsx` kennt weiterhin `review_updated=1` und die Meldung „Projektprüfung wurde aktualisiert.“. Dieser Erfolgspfad wäre bei einem direkten beziehungsweise später wieder eingebundenen Aufruf vollständig auswertbar.

Der kombinierte Workflow ist damit **im aktuellen UI nicht erreichbar**, serverseitig aber nicht entfernt oder deaktiviert.

### 2.2 Tests und Dokumentation

Direkte Testverwendungen bestehen in:

- `test/project-review.test.ts` für Schema, Mapper, Berechtigungen, Statusübergänge, Update-Allowlist und Konfliktverhalten;
- `test/project-pending-states.test.tsx` für den Pending-Zustand des kombinierten Formulars;
- `test/project-error-presentation.test.tsx` für allgemeine und feldbezogene Fehler des kombinierten Formulars;
- `test/project-success-message.test.tsx` für `review_updated` und die zugehörige Erfolgsmeldung;
- `test/project-ux-architecture.test.ts` für die Zuordnung der kombinierten Action zur Revalidation.

Ältere Audits beschreiben außerdem die ursprüngliche Integration. Die Git-Historie zeigt, dass der Sammelworkflow zunächst auf der Projektdetailseite eingebunden war und die getrennten Formulare später hinzukamen. Diese Historie belegt die frühere Nutzung, nicht jedoch einen heutigen fachlichen Bedarf.

## 3. Zugehörige Bausteine

### 3.1 Unmittelbar workflow-spezifisch

| Datei / Export | Funktion im kombinierten Workflow |
|---|---|
| `app/(app)/projects/[id]/project-review-form.tsx` / `ProjectReviewForm` | Gemeinsames Client-Formular für Status, Projektklasse und Human Review; Fehler- und Pending-Darstellung |
| `lib/actions/projects.ts` / `updateProjectReviewAction` | Server-Adapter, Supabase-Datenquelle, Service-Aufruf, Revalidation und Redirect |
| `lib/actions/project-review-service.ts` | FormData-Mapping, Authentifizierung, Rollen-/Berechtigungsprüfung, Validierung, Statusübergangsprüfung und kombiniertes Update |
| `lib/domain/schemas.ts` / `updateProjectReviewSchema`, `ProjectReviewUpdateInput` | Gemeinsame Validierung und Typ des Drei-Feld-Payloads |
| `test/project-review.test.ts` | Workflow-spezifische Service-, Mapper- und Schemaabdeckung |

### 3.2 Mitbenutzte Bausteine

| Datei / Export | Verwendung |
|---|---|
| `lib/domain/permissions.ts` | `canChangeProjectStatus`, `canChangeProjectClass`, `canChangeHumanReview` |
| `lib/domain/project-status.ts` | Erlaubte Statusoptionen im Formular und Prüfung des Statusübergangs im Service |
| `lib/domain/mappers.ts` | Labels und Beschreibungen für Status und Projektklasse |
| `lib/domain/types.ts` | `ProjectStatus`, `ProjectClass`, `PROJECT_CLASSES` |
| `lib/actions/project-revalidation.ts` | `getProjectAndCustomerRevalidationPaths` nach erfolgreichem Sammelupdate |
| `app/(app)/projects/[id]/project-form-errors.tsx` | Gemeinsame allgemeine und feldbezogene Fehlerdarstellung |
| `app/(app)/projects/[id]/project-success-message.tsx` | Auswertung von `review_updated=1` |

Diese mitbenutzten Bausteine sind nicht exklusiv dem Sammelworkflow zugeordnet und dürfen bei einer späteren Änderung nicht pauschal als entfernbar gelten.

## 4. Ablauf, Action und Service

1. `ProjectReviewForm` sendet `project_id`, `status`, `project_class` und den Checkbox-Wert `requires_human_review` an `updateProjectReviewAction`.
2. `formDataToUpdateProjectReviewInput` bildet die FormData-Werte ab. Beim Checkbox-Feld werden nur `"on"` und `"true"` zu `true`; ein fehlender oder anderer Wert wird zu `false`.
3. `updateProjectReviewWithDataSource` prüft Anmeldung, Profilrolle, Status- und Klassenberechtigung, UUID und `updateProjectReviewSchema`.
4. Der Service lädt das nicht soft-gelöschte Projekt mit aktuellem Status und prüft einen gegebenenfalls gewünschten Statusübergang.
5. Der Patch enthält immer `status` und `project_class`. `requires_human_review` wird nur aufgenommen, wenn `canChangeHumanReview` für die Rolle erfüllt ist.
6. Das Update filtert auf Projekt-ID, bisherigen Status und `deleted_at IS NULL`. Damit erkennt es Statuskonflikte, nicht aber gleichzeitige Änderungen an Projektklasse oder Human-Review-Flag.
7. Nach Erfolg invalidiert die Action Projektübersicht, Projektdetail und Kundendetail über `getProjectAndCustomerRevalidationPaths` und redirectet auf `/projects/{id}?review_updated=1`.

Die verwendete Server Action ist ausschließlich `updateProjectReviewAction`; der verwendete fachliche Service ist `updateProjectReviewWithDataSource`, ergänzt durch den Mapper `formDataToUpdateProjectReviewInput`.

## 5. Bearbeitete und inzwischen separat abgedeckte Felder

| Feld | Verhalten im kombinierten Workflow | Heutiger separater Ersatz |
|---|---|---|
| `status` | Pflichtwert; Auswahl aus aktuellem Status und erlaubten Übergängen; Übergang serverseitig geprüft; immer Teil des Patches | `ProjectStatusForm` → `updateProjectStatusAction` → `updateProjectStatusWithDataSource` |
| `project_class` | Pflichtwert `A` bis `D`; `null` kann im kombinierten Formular nicht gespeichert werden; immer Teil des Patches | `ProjectClassForm` → `updateProjectClassAction` → `updateProjectClassWithDataSource` |
| `requires_human_review` | Checkbox wird auf Boolean gemappt; nur für Rollen mit eigener Human-Review-Berechtigung in den Patch übernommen | `ProjectHumanReviewForm` → `updateProjectHumanReviewAction` → `updateProjectHumanReviewWithDataSource` |

Alle drei Felder sind damit durch eigene, aktuell gerenderte Formulare ersetzt. Der Sammelworkflow bearbeitet weder Projekttitel noch Adresse, PLZ, Ort, Zusammenfassung, Notizen oder andere Projektfelder.

## 6. Alleinstellungsmerkmale und Redundanz

### 6.1 Verbleibende Unterschiede

Der kombinierte Workflow besitzt noch folgende technische beziehungsweise interaktive Unterschiede:

- **Ein Submit für drei Felder:** Status, Klasse und Human Review werden gemeinsam aus einem Formular übertragen.
- **Ein gemeinsamer Rückkanal:** Validierungsfehler aller drei Felder und eine gemeinsame Erfolgsmeldung laufen über einen Action-State beziehungsweise `review_updated`.
- **Teilweise gemeinsamer Berechtigungsweg:** Der Service verlangt Status- und Klassenberechtigung. Das Human-Review-Feld wird abhängig von einer zusätzlichen Berechtigung still aus dem Patch ausgelassen.
- **Ein gemeinsames Status-Konfliktkriterium:** Das gesamte Update wird gegen den zuvor gelesenen Status abgesichert.

Keines dieser Merkmale belegt aus sich heraus eine fachliche Alleinstellung. Insbesondere ist keine separate Freigabe, keine Prüfentscheidung, kein Audit-Ereignis, keine Transaktion über mehrere Tabellen und keine zusätzliche Domain-Regel mit dem Sammelworkflow verbunden. Das gemeinsame Speichern ist daher das einzige erkennbare Bedienmerkmal.

### 6.2 Technische Bewertung ohne Entscheidung

Aus Sicht des heute gerenderten Produkts ist der Workflow technisch redundant:

- keine produktive Komponentennutzung;
- vollständige Feldüberschneidung mit drei spezialisierten Workflows;
- doppelte UI-Auswahlen für Status und Klasse sowie eine zweite Human-Review-Eingabe;
- parallele Action-, Service-, Schema-, Test- und Erfolgsparameterpfade.

Eine vollständige Gleichwertigkeit besteht dennoch nicht. Die spezialisierten Services verwenden jeweils das tatsächlich bearbeitete Feld als optimistisches Konfliktkriterium, während der Sammelservice nur den Status vergleicht. Außerdem erlaubt die getrennte UI unterschiedliche Rollen pro Feld, während das frühere Sammelformular nur sinnvoll angezeigt werden konnte, wenn die benötigten Rechte gemeinsam vorlagen. Deshalb ist „redundant“ hier eine Wartungsbewertung und keine automatische Löschfreigabe.

## 7. Risiken einer späteren Entfernung

| Risiko | Mögliche Auswirkung | Vor einer Entfernung zu klären |
|---|---|---|
| Nicht im Repository sichtbare Aufrufer | Externe oder manuelle Clients könnten die exportierte Action nicht mehr verwenden | Verbindlich klären, ob Server Actions ausschließlich durch das ausgelieferte UI aufgerufen werden und ob gespeicherte/alte Client-Bundles relevant sind |
| Unbekannter fachlicher Bedarf nach gebündelter Prüfung | Ein gewünschter „alles gemeinsam prüfen“-Ablauf wäre nicht mehr vorhanden | Produktverantwortliche zu einem atomaren Sammelschritt, Rollenmodell und erwarteter Teilvalidierung befragen |
| Abweichende Nebenwirkungen | Wegfall von `review_updated` und der Drei-Pfad-Revalidation könnte versteckte Annahmen brechen | Verbraucher der Erfolgsmeldung, Cache-Pfade und eventuelle Telemetrie außerhalb des untersuchten Codes prüfen |
| Zu breite Bereinigung | Gemeinsam genutzte Domain-Helfer oder Fehlerkomponenten könnten versehentlich entfernt werden | Nur nach Referenzprüfung workflow-exklusive Exporte/Dateien entfernen |
| Verlust gezielter Sicherheits-/Domain-Abdeckung | `project-review.test.ts` prüft Regeln, die teilweise auch für Einzelservices relevant sind | Testfälle den spezialisierten Workflows zuordnen, bevor workflow-spezifische Tests entfallen |
| Historische oder geplante Integration | Frühere Audits und Planungen könnten weiterhin vom Sammelworkflow ausgehen | Dokumentation und offene Arbeitspakete auf explizite Abhängigkeiten prüfen |

## 8. Risiken eines Beibehaltens

| Risiko | Mögliche Auswirkung |
|---|---|
| Drift zwischen Sammel- und Einzelworkflows | Berechtigungen, Validierung, Fehlermeldungen, Revalidation oder Konfliktlogik entwickeln sich unterschiedlich |
| Zusätzliche Wartungs- und Testlast | Jede Querschnittsänderung muss weiterhin für einen nicht erreichbaren Workflow umgesetzt und geprüft werden |
| Versehentliche Reaktivierung | Ein späterer Import könnte ohne erneute fachliche Prüfung einen veralteten Workflow wieder sichtbar machen |
| Gleichzeitiges Rendern | Parallele Einzel- und Sammelcontrols erzeugen doppelte Bedienwege; insbesondere die generische DOM-ID `status` würde kollidieren |
| Breiter Mehrfeld-Patch | Eine beabsichtigte Einzelfeldänderung sendet stets aktuelle UI-Werte der anderen Felder mit und kann parallele Änderungen überschreiben |
| Unvollständige Konflikterkennung | Änderungen an Klasse oder Human Review zwischen Lesen und Schreiben werden nicht als Konflikt erkannt, solange der Status unverändert bleibt |
| Stilles Auslassen eines Feldes | Reviewer können Status und Klasse ändern; ihr gesendeter Human-Review-Wert wird ohne feldspezifisches Feedback nicht gespeichert |
| Abweichende Eingabesemantik | Der Sammelworkflow nutzt eine Checkbox, das separate Human-Review-Formular eine explizite Ja/Nein-Auswahl; versehentliche Zustände und Validierung unterscheiden sich |
| Unnötig breite Revalidation | Auch reine Klassen- oder Human-Review-Änderungen im Sammelworkflow invalidieren weiterhin den Kundenpfad |
| Unklarer Produktstatus | Vollständig implementierter, getesteter, aber nicht erreichbarer Code kann fälschlich als unterstütztes Feature verstanden werden |

## 9. Potenziell betroffene Dateien einer späteren Änderung

### 9.1 Bei Entfernung unmittelbar zu prüfen

- `app/(app)/projects/[id]/project-review-form.tsx`
- `lib/actions/projects.ts`
- `lib/actions/project-review-service.ts`
- `lib/domain/schemas.ts`
- `app/(app)/projects/[id]/project-success-message.tsx`
- `test/project-review.test.ts`
- `test/project-pending-states.test.tsx`
- `test/project-error-presentation.test.tsx`
- `test/project-success-message.test.tsx`
- `test/project-ux-architecture.test.ts`

### 9.2 Bei erneuter Integration zusätzlich zu prüfen

- `app/(app)/projects/[id]/page.tsx`
- `app/(app)/projects/[id]/project-status-form.tsx`
- `app/(app)/projects/[id]/project-class-form.tsx`
- `app/(app)/projects/[id]/project-human-review-form.tsx`
- `lib/actions/project-status-update-service.ts`
- `lib/actions/project-class-update-service.ts`
- `lib/actions/project-human-review-update-service.ts`
- `lib/domain/permissions.ts`
- `lib/domain/project-status.ts`
- `lib/actions/project-revalidation.ts`

Die Listen beschreiben Prüf- und möglichen Änderungsumfang, nicht eine Freigabe, alle genannten Dateien tatsächlich zu ändern.

## 10. Später erforderliche Regressionstests

Unabhängig von der späteren Entscheidung wären mindestens folgende Regressionen abzusichern:

1. **Erreichbarkeit und Rollen:** Admin und Reviewer sehen exakt die fachlich vorgesehenen Controls; unberechtigte Rollen sehen sie nicht und werden auch serverseitig abgewiesen.
2. **Feldisolation:** Änderungen an Status, Klasse oder Human Review verändern keine jeweils anderen Projektfelder. Bei einem Sammelworkflow muss stattdessen die ausdrücklich gewünschte gemeinsame Patch-Semantik belegt werden.
3. **Statusübergänge:** gleicher Status und alle erlaubten Übergänge funktionieren; verbotene Übergänge werden abgewiesen.
4. **Projektklasse:** `A` bis `D` funktionieren; fehlende und ungültige Werte werden feldbezogen behandelt; der Umgang mit einem bestehenden `null` ist ausdrücklich festgelegt.
5. **Human Review:** `true` und `false` funktionieren; Admin-/Reviewer-Unterschiede führen weder zu stiller Fehlannahme noch zu unerlaubtem Schreiben.
6. **Optimistische Konflikte:** parallele Änderungen an Status, Klasse und Human Review werden entsprechend der gewählten Workflow-Semantik erkannt und überschreiben nichts unbemerkt.
7. **Soft Delete und Projekt-ID:** ungültige IDs, nicht vorhandene und soft-gelöschte Projekte werden neutral abgewiesen.
8. **Allowlist:** Titel, Kundenzuordnung, Zusammenfassung, Ersteller und Löschzeitpunkt gelangen nicht in einen Review-Patch.
9. **Fehlerdarstellung:** allgemeine Fehler, Feldfehler, `aria-invalid`, `aria-describedby`, Fokus und Pending-Zustände bleiben für alle verbleibenden Formulare korrekt.
10. **Erfolg und Navigation:** exakt eine passende Erfolgsmeldung erscheint; verwaiste Parameter wie `review_updated` bleiben weder produziert noch ausgewertet, falls der Sammelpfad entfernt wird.
11. **Revalidation:** Projektübersicht, Projektdetail und Kundendetail werden nur entsprechend den belegten Datenabhängigkeiten invalidiert.
12. **DOM-Eindeutigkeit:** keine doppelten IDs und keine parallelen Controls für dasselbe Feld, falls ein Sammelworkflow sichtbar ist.
13. **Referenz- und Architekturprüfung:** keine verwaisten Imports, Exporte, Schematypen, Action-Zweige oder ausschließlich für den entfernten Pfad vorhandenen Test-Mocks.

## 11. Dokumentierte Empfehlung ohne Entscheidung

Vor einem Folgepaket sollte fachlich geklärt und schriftlich festgehalten werden, ob Status, Projektklasse und Human Review eine gemeinsame, atomare „Projektprüfung“ bilden oder drei unabhängig berechtigte und speicherbare Eigenschaften sind. Erst danach sollte eines von zwei getrennten Folgepaketen geplant werden:

- entweder die bewusste Integration eines einzigen Sammelworkflows mit geklärter Rollen-, Teilfeld-, Konflikt- und Feedback-Semantik;
- oder die referenzgeprüfte Entfernung ausschließlich der workflow-spezifischen Altbestandteile bei vollständigem Erhalt der drei spezialisierten Workflows.

Bis zu dieser fachlichen Klärung empfiehlt dieses Audit **weder Beibehalten noch Entfernen**. Eine parallele sichtbare Integration von Sammel- und Einzelformularen sollte in keinem Zielbild vorgesehen werden.

## 12. Audit-Bestätigung

Dieses Dokument ist ausschließlich eine Analyse des bestehenden kombinierten Projektprüfungsworkflows. Es enthält keine Implementierung und trifft keine Produkt- oder Architekturentscheidung. Es wurden keine UI, Tests, Server Actions, Services, Schemas, Migrationen, SQL oder RLS geändert.

## Decision and Implementation Result

Die fachliche Entscheidung für Variante A wurde umgesetzt: Projektstatus, Projektklasse und Human Review bleiben unabhängige Projekteigenschaften und werden weiterhin ausschließlich über ihre spezialisierten Formulare, Server Actions und Services bearbeitet. Der alte Sammelworkflow einschließlich seiner exklusiven Action, seines Services und seines Schemas wurde entfernt; die spezialisierten Workflows bleiben erhalten. Da keine andere aktive Quelle bestand, wurde auch `review_updated` aus den unterstützten Erfolgsparametern entfernt. Production-Build, Tests, Typecheck und Lint wurden erfolgreich ausgeführt.
