# AP-15-00 — Conversation Intelligence Engine: Architektur-, Domain-, Security- und Produkt-Audit

## 1. Audit-Metadaten

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-06-AP15-00-CONVERSATION-INTELLIGENCE-ENGINE-V1` |
| Datum | 2026-08-06 |
| Paket | AP-15-00 |
| Typ | Audit, Analyse und Dokumentation; keine Implementierung |
| Branch | `codex/audit-ap15-00-conversation-intelligence-engine` |
| Baseline | sauberer lokaler HEAD `2e93097d1e19adeb9e4f8f098928207207681819` |
| Remote | Kein Git-Remote konfiguriert; Fetch und Vergleich mit `origin/main` waren nicht möglich. Die Baseline muss im Review gegen den tatsächlichen Hauptbranch verifiziert werden. |
| Auditstatus | **READY FOR OWNER DECISION** |
| Freigabestatus | ausdrücklich **nicht** `APPROVED FOR IMPLEMENTATION` |

## 2. Scope

Dieses Dokument prüft ausschließlich Produktmodell, Domainbegriffe, Sicherheitsgrenzen und eine mögliche Zielarchitektur für eine kanalunabhängige Conversation Intelligence Engine. Untersucht wurden Kunden, Projekte, Notizen, Medien, Rollen, Permissions, Reviewgrenzen, Schemas, Audit Logging, Soft Delete, Status-/Kategoriemodelle, Actions/Services, Supabase-Clients, Tests sowie vorhandene Workflow- und Medienaudits.

Ausgeschlossen sind Implementierung, UI, Routes, Actions, Services, Datenbankobjekte, Migrationen, SQL/RPC/RLS/Grants, Storageänderungen, Queue/Scheduler, WhatsApp- oder KI-Providerintegration, produktive Prompts, Preis- und Angebotslogik, Rollenänderungen, Tests, Dependencies und `package.json`. Beispielverträge in diesem Audit sind Diskussionsgrundlagen, keine endgültigen TypeScript- oder Datenbankverträge.

## 3. Ausgangslage und Produktziel

Die Engine soll wie eine fachkundige, verständliche Erstaufnahme arbeiten, nicht wie ein Formular. WhatsApp ist später lediglich ein Transport. Derselbe fachliche Kern muss über internen Simulator, Mitarbeiterdialog oder andere Kanäle funktionieren. Text und Medien liefern Evidenz; daraus entstehen ein strukturierter Wissensstand, explizite Unsicherheit, ersetzbare Hypothesen, offene Informationsbedarfe, kontrollierte nächste Fragen und jederzeit ein ehrlicher Zwischenstand. Maschinelle Vorschläge bleiben vorläufig; technische und Angebotsfreigabe bleiben menschlich.

Heute existiert keine Conversation-, Message-, Evidence-, Assessment-, Hypothesis-, Question- oder Offer-Domain. Der bestehende Projektstatus enthält zwar Phasen wie `collecting_information`, `technical_review`, `quote_draft` und `human_review`; diese sind Workflowstatus und weder Conversation State noch Readinessnachweis.

## 4. Bestehende Repositoryarchitektur

### 4.1 Modularer Monolith und Zugriffsgrenzen

- Next.js App Router mit internen, sessiongeschützten Server-Component-Seiten. Kunden erhalten heute keinen eigenen Zugang.
- Fachkonstanten, Mapper, Zod-Schemas und Permissionfunktionen liegen in `lib/domain`. Externe Eingaben werden in Server Actions auf kleine Inputs abgebildet; Services prüfen Authentifizierung, Profil/Rolle, aktive Parent-Entität und allowlisten Mutationspayloads.
- Normale App-Zugriffe verwenden den cookiegebundenen Supabase-Serverclient mit öffentlicher URL und Anon-Key. Der Browserclient existiert für kontrollierte Browseroperationen. Kein allgemeiner Service-Role-Client ist Teil der normalen Architektur.
- Services sind datenquelleninjizierbar und werden durch Actions orchestriert. Eng getrennte Actions existieren unter anderem für Projektkern, Status, Klasse, Summary, Human-Review-Flag, Notizen und Medienphasen. Das ist ein geeigneter Präzedenzfall für schmale Conversation-Verträge, nicht für einen allmächtigen Orchestrator.

### 4.2 Kunden, Projekte und vorhandene Textfelder

- `customers`: UUID, Vor-/Nachname, optionale E-Mail und Telefonnummer, Actor/Zeitstempel, `deleted_at`. Admin erstellt/ändert/löscht fachlich; Admin und Reviewer lesen aktive Datensätze.
- `projects`: UUID und Customer-FK, Titel, Montageadresse/PLZ/Ort, freie `summary` bis 4.000 Zeichen, Workflowstatus, Projektklasse A–D, `requires_human_review` (Default `true`), Actor/Zeitstempel und Soft Delete.
- Projektklassen bedeuten derzeit A Standard, B Rückfragen, C Vor-Ort-Termin, D Sonderfall/Ablehnung. Sie können ein Assessment anzeigen, sind aber zu grob als Knowledge-, Confidence- oder Readinessmodell.
- Die freie Summary ist für eine menschliche Zusammenfassung geeignet, aber keine kanonische Ablage für Fakten, Quellen, Widersprüche oder Hypothesen. Projektnotizen sind interne Freitexte bis 4.000 Zeichen und ebenfalls kein Chatverlauf oder Knowledge Store.
- Projektstatusübergänge werden zentral allowlistet. Admin und Reviewer dürfen Status und Klasse ändern; nur Admin darf Projektkern, Summary und Human-Review-Flag ändern. Das Flag allein beweist keine erfolgte Freigabe.

### 4.3 Projektnotizen, Medien und Soft Delete

- Notizen sind projektgebunden, intern, actorbezogen, chronologisch und soft-deletable. Admin/Reviewer lesen und erstellen; Admin ändert/löscht jede aktive Notiz, Reviewer nur eigene. Ursprüngliche gelöschte Inhalte werden nicht als allgemeine Conversation-Evidenz angeboten.
- `project_media` ist die vorhandene Medienquelle: private Objekte, UUID/FK, kanonischer PII-freier Storagepfad, MIME/Größe, Kategorie, Source, Uploadstatus, Uploader, Caption, Zeitstempel und Soft Delete. Erlaubt sind JPEG, PNG, WebP und PDF; Kategorien decken Innen-/Außenbereich, Gerätepositionen, Leitungs-/Kondensatweg, Elektro, Fassade, Dach, Balkon, Grundriss und Dokumente ab.
- Upload ist admin-only; aktive `ready`-Medien sind für Admin und Reviewer sichtbar. Reservierung, Signed Upload und Compare-and-set-Finalisierung sind getrennt, ohne Upsert und ohne Public URL. Medien dürfen künftig per ID referenziert, aber Inhalt, Signed URL oder Binärdaten nicht in Knowledge/Audit dupliziert werden.
- Fachliche Haupttabellen nutzen Soft Delete; normale Rollen haben keine physischen Deletewege. Conversation-Daten brauchen vor Implementierung eine eigene Lösch-/Retentionentscheidung und dürfen diese Semantik nicht ungeprüft erben.

### 4.4 Rollen, Reviewer und Audit Logging

- Genau zwei menschliche App-Rollen existieren: `admin` und `reviewer`. Reviewer ist eine authentifizierte Person, keine technische Identität.
- RLS ist für fachliche Tabellen aktiv. Datenbanktrigger begrenzen Reviewer-Projektupdates; App-Permissions sind zusätzliche, nicht alleinige Kontrollen. Role Change ist ein enges, serialisiertes RPC mit Last-Admin-Schutz und Audit Event.
- `audit_log` ist UUID-basiert, enthält Actor, Entitytyp/-ID, Action, JSON-Metadaten und Zeitstempel; Clientrollen haben keinen direkten Tabellenzugriff. Es protokolliert fachlich sensible Änderungen, ist aber kein technischer Run Store, kein Event Stream und keine Ablage für Nachrichten/Prompts/Providerantworten.
- Reviewer-E-Mail-Einladung ist vorbereitet, automatisiertes Onboarding bleibt laut Vorgabe zurückgestellt.

### 4.5 Tests und Dokumentation

Vitest deckt Domainkonstanten/-defaults, Schemas, Berechtigungen, Statusübergänge, schmale Payloads, Auth/Rollen, aktive Parentfilter, Soft Delete, RLS-/Migrationstexte, Medienzustände, Idempotenz-/CAS-Aspekte, UI-Grenzen und Revalidation ab. Architekturtests lesen teilweise Quelltexte/Migrationen als Regression. Diese Muster sind später auf Domaintrennung, Quellenbindung, Planner, Readiness, PII-Logging und Concurrency zu übertragen. In AP-15-00 wurden keine Tests ausgeführt oder geändert.

## 5. Verbindliche Produktprinzipien

1. Kein starrer oder linearer Fragenkatalog; Informationsbedarfe werden situationsbezogen priorisiert.
2. Unvollständigkeit und „weiß ich nicht“ sind normale Zustände, keine Validierungsfehler.
3. Jeder Informationsbedarf besitzt mindestens einen zulässigen Ausweg: Ersatzfrage, Erklärung, zweckgebundenes Foto, sichere Annahme, Zurückstellen, Überspringen, Vor-Ort-Prüfung oder Mensch.
4. Nach wenigen Antworten entsteht ein Zwischenstand, der Fakten, Annahmen, Unsicherheiten, Risiken und nächste Schritte sichtbar trennt.
5. Grobe Eingrenzung ist erwünscht; falsche Genauigkeit, ungesicherter Festpreis und Schätzung sicherheitskritischer Punkte sind verboten.
6. Auswahl der nächsten Information folgt erwartetem Erkenntniswert bei Sicherheits-, Machbarkeits-, Preis- und Kundenaufwandsabwägung.
7. Fotoanforderungen nennen Zweck und konkrete Aufnahme; Text und Bild werden gemeinsam, quellengebunden bewertet.
8. Hypothesen sind vorläufig, begründet, widerlegbar, ersetzbar und reviewbar.
9. Maschinelle Outputs sind gekennzeichnet und niemals technische oder finale Angebotsfreigabe. Ein menschlicher Reviewer ist verbindliches Quality Gate.
10. Kanal, Provider und menschliche Rollen bleiben voneinander unabhängig. Kunden erhalten keinen internen Browserzugang.

## 6. Fachliche Definitionen und Persistenzentscheidung

| Begriff | Präzise Bedeutung | MVP-Entscheidung |
|---|---|---|
| Bestätigter Fakt | Aussage, die durch eine dafür ausreichende Quelle oder explizite menschliche Bestätigung als aktuell gültig gilt | strukturierter Knowledge-Wert plus Evidenzreferenz und Bestätigungsstatus persistieren |
| Kundenangabe | Behauptung des Kunden; authentisch als Aussage, aber nicht automatisch technisch wahr | Event/Evidenz persistieren; daraus Knowledge-Kandidat ableiten |
| Bildbeobachtung | Sichtbare, quellgebundene Beobachtung; keine unsichtbare technische Schlussfolgerung | Beobachtung bei späterer Analyse als maschinellen Vorschlag persistieren/reviewen, niemals Bild duplizieren |
| Schätzung | Näherungswert aus unvollständigen Indizien mit Bandbreite/Einheit und Methode | nur wenn assessment-/angebotsrelevant versioniert persistieren, sonst berechnen |
| Annahme | bewusst gesetzte, ersetzbare Arbeitsprämisse trotz fehlender Bestätigung | persistieren, wenn sie Output/Frage/Readiness beeinflusst; Quelle/Owner/Ablaufbedingung angeben |
| Hypothese | prüfbare fachliche Erklärung oder Installationsoption mit Pro/Contra-Evidenz | im MVP als Teil versionierten Assessments; eigene Tabelle erst nach Nutzungsmuster |
| Offene Frage | konkrete Kundenfrage; unterscheidet sich vom Informationsbedarf | ausgewählte/gestellte Frage als Event persistieren; Kandidaten zur Laufzeit ableiten |
| Unbekannt | relevante Information ist nicht bekannt, ggf. nach expliziter Antwort | Knowledge-Status persistieren, wenn explizit; fehlender Key allein reicht nicht |
| Nicht anwendbar | Information gilt für diesen Fall begründet nicht | Status samt Begründung/Evidenz persistieren |
| Widerspruch | mindestens zwei gleichzeitig nicht vereinbare Claims | als abgeleiteter Konflikt plus Referenzen persistieren, bis aufgelöst; Originale nie überschreiben |
| Sicherheitskritische Unklarheit | ungeklärter Punkt mit möglicher Personen-, Sach-, Elektro-, Statik-, Brandschutz- oder Genehmigungswirkung | persistenter Blocker/Vor-Ort-Prüfpunkt; keine automatische Annahme |
| Technische Empfehlung | fachlich geprüfte Empfehlung mit ausreichender Evidenz und menschlicher Entscheidung | nur menschlich freigegeben so benennen und versionieren |
| Vorläufige Empfehlung | nicht freigegebener Vorschlag mit Voraussetzungen/Unsicherheit | versioniertes Assessment persistieren |
| Reviewer-Korrektur | menschliche, begründete Nachfolgeaussage zu einem Claim/Assessment | append-only Korrektur mit Actor/Zeit/Referenz persistieren; Ursprung erhalten |
| Verworfene Hypothese | Hypothese mit dokumentierter Widerlegung/Reviewerentscheidung | im Assessmentverlauf erhalten, nicht löschen |
| Bestätigte Hypothese | Hypothese, deren notwendige Bestätigung erfüllt und menschlich akzeptiert ist | Status/Entscheidung persistieren; nicht automatisch mit finaler Freigabe gleichsetzen |
| Angebotsannahme | Annahme, von der Umfang oder Preis eines Entwurfs abhängt | zwingend versioniert mit Auswirkung, Ausschluss und Sichtbarkeit persistieren |
| Vor-Ort-Prüfpunkt | nicht remote zuverlässig bestätigbarer oder risikorelevanter Punkt | persistente Checkliste und Readinesswirkung |

Laufzeitderivate sind Question Candidates, Prioritätsscores, gegenwärtige Missing-Information-Liste und aggregierte Readiness, sofern sie deterministisch aus versioniertem State reproduzierbar sind. Ausgewählte Fragen, ausgegebene Assessments, wirksame Annahmen, Reviewerentscheidungen und Konfliktauflösungen müssen aus Auditgründen erhalten bleiben.

## 7. Conversation-State-Varianten

Skala: `++` stark, `+` gut, `0` gemischt, `-` schwach, `--` ungeeignet.

| Kriterium | A Chat rekonstruiert | B Chat + Materialized State | C Event Sourcing + Snapshots | D Fragebogen + Freitext | E Events + Knowledge + Assessment |
|---|---:|---:|---:|---:|---:|
| Nachvollziehbarkeit/Rekonstruktion | +, aber semantisch teuer | + | ++ | - | ++ |
| Korrekturen/Widersprüche/Mensch | -, erneute Interpretation | + | ++ | - | ++ |
| Wiederholungen/WhatsApp-Duplikate | 0 | + | ++ | - | ++ |
| Kosten/LLM-Abhängigkeit | -- | 0 | + | ++ | + |
| Datenschutz/Datensparsamkeit | -, Volltext primär | 0 | 0 | + | + bei Referenzen/Retention |
| Testbarkeit/Wiederholbarkeit | - | + | ++ | ++ | ++ |
| Race Conditions/Versionierung | - | + | ++ | 0 | ++ |
| verlorene/verspätete Webhooks und Idempotenz | - | + | ++ | -- | ++ |
| MVP-Komplexität | + scheinbar, Betrieb teuer | + | -- | ++ | 0, reduzierbar |

**A:** Ein Chat ist wertvolle Evidenz, aber keine stabile fachliche Wahrheit. Jede Rekonstruktion kann durch Modell-/Promptwechsel abweichen, kostet erneut und erschwert Korrekturen.

**B:** Pragmatisch, solange Nachrichten identifiziert und Stateversionen geschützt werden. Ohne unveränderliche fachliche Events bleibt jedoch unklar, wodurch State geändert wurde.

**C:** Maximale Rekonstruktion, aber vollständiges generisches Event Sourcing verlangt Projektionen, Eventversionierung, Rebuild- und Betriebswerkzeuge; für den MVP unverhältnismäßig.

**D:** Einfach und testbar, verletzt jedoch Nichtlinearität, freie Antworten, multimodale Evidenz und Sackgassenprinzip.

**E:** Empfohlenes Zielbild. Unveränderliche fachliche Conversation Events bilden Eingänge, gestellte Fragen und Korrekturen ab; ein strukturierter, versionierter Knowledge State ist Arbeitsgrundlage; versionierte Assessments frieren jeweils ausgegebenen Zwischenstand ein. Das ist kein Auftrag, sofort drei Tabellen oder vollständiges Event Sourcing zu bauen.

## 8. Empfohlenes State-Modell

**Architekturentscheidung: reduzierte Variante E als Ziel, schrittweise umgesetzt.**

1. `Conversation Event`: append-only fachlicher Umschlag mit servergenerierter ID, Projektbindung, Richtung/Art, Actor-Klasse, Kanalreferenz, Zeitpunkt, Idempotenzreferenz und optionalen Referenzen auf Nachricht/Medium. Rohinhalt bleibt in genau einer autorisierten Quelle und unter Retention.
2. `Knowledge State`: versionierte Claims pro stabiler Domain-Property und betroffener Entität; Claim-Wert, epistemischer Status, Evidenzreferenzen, Gültigkeit und Konfliktzustand. Updates benötigen erwartete Stateversion/CAS.
3. `Assessment`: unveränderliche Version des extern oder intern gezeigten Zwischenstands mit Readinessstufe, erlaubten Aussagen, Annahmen, Risiken, offenen Punkten und menschlichem Status.
4. Korrekturen werden neue Events/Claims/Assessmentversionen. Keine Mutation löscht historische Evidenz; fachlich aktuelle Werte können Vorgänger `superseded` markieren.
5. Conversation-Lebenszyklus (`active`, `waiting_customer`, `waiting_human`, `paused`, `closed`) darf nicht mit Projektworkflowstatus oder Offer Readiness vermischt werden.

Im ersten Paket werden nur Begriffe, Schemas und pure Regeln geprüft; Persistenzdesign folgt erst nach separatem Daten-/RLS-Audit.

## 9. Knowledge-State-Modell

### 9.1 Form

Kein unkontrolliertes JSON-Patch und keine Tabelle pro Begriff. Ein Claim braucht mindestens stabilen `property_key`, `subject` (`project`, `room`, `outdoor_option`, `installation_option`), typisierten Wert, Einheit, epistemischen Status, Quellenreferenzen, Erfassungs-/Gültigkeitszeit, Stateversion und ggf. `supersedes`. Property Keys und Werttypen sind serverseitig allowlistet. Räume benötigen stabile IDs; Arraypositionen sind ungeeignet.

### 9.2 Informationsklassen für den MVP

| Klasse | Beispiele | Behandlung |
|---|---|---|
| MVP-Pflicht für Stufe 1/2 | gewünschter Umfang, Anzahl/Identität relevanter Räume, grobe Raumgröße oder belastbare Näherung, Nutzung, Gebäude-/Etagenkontext | früh erfragen; unbekannt erlaubt, dann eingeschränkter Output |
| Genauigkeitsverbesserer | Höhe, Fenster-/Sonnenlast, Dachgeschoss, Zeitrahmen, vorhandene Kühlung, präferierte Innenposition | nach Erkenntniswert, nicht pauschal |
| Optional | Designpräferenzen, Komfortdetails, alternative Wunschpositionen | darf ohne Readinessverlust übersprungen werden |
| Sicherheits-/Machbarkeitskritisch | tragfähige/zulässige Montage, Elektro, sichere Kernbohrung, Kondensat, Zugang/Höhe, Genehmigung, Schall/Nachbarschaft | nie unbesehen bestätigen/schätzen; Blocker, Reviewer oder Vor-Ort |
| zuverlässig vor Ort | verborgener Wandaufbau/Leitungen, finale Bohrstelle, tatsächliche Elektroreserve, genaue lange/verdeckt geführte Wege, statische Sonderfälle | ausdrücklich `vor_ort_pruefen`; Remote-Evidenz kann nur eingrenzen |

Angebotsbezogene Werte wie Geräteanzahl, Leistungsklasse, Splitart, Aufwand und Material sind abgeleitete Empfehlungen/Annahmen, keine Kundenfakten. Adresse/Region bleibt im Projektstamm und wird im Knowledge State nur referenziert, nicht dupliziert. Vorhandene `summary`, Projektklasse und Status bleiben Präsentations-/Workflowfelder, nicht Quelle des neuen State.

## 10. Evidence-Modell

### 10.1 Quellen und Bindung

Unterstützte Quellklassen: Kundennachricht, Mitarbeiterantwort, vorhandenes Projektmedium/Bild/PDF, manuelle Admin-Eingabe, Reviewer-Korrektur, später maschinelle Bildbeobachtung, regelbasierte Ableitung, technische Standardannahme und Vor-Ort-Befund. Jede Evidence Reference enthält Quelltyp, opaque Source-ID, Projektbindung, Erfassungszeit, Actor-Klasse (`customer`, `human_user`, `machine_run`, `rule`, `field_visit`), optional menschliche Actor-ID, Locator innerhalb der Quelle (z. B. Seiten-/Regionsreferenz ohne Bildkopie) und Status.

Quellenvertrauen ist eine kontrollierte Provenienz-/Qualitätsklasse, keine Wahrheit: `direct_customer_claim`, `human_observation`, `machine_suggestion`, `rule_derived`, `verified_on_site`. Technische Verlässlichkeit folgt zusätzlich Property-spezifischen Regeln. Ein Kundenwert kann präzise wiedergegeben und dennoch unbestätigt sein.

Status: `active`, `superseded`, `invalidated`, `manually_confirmed`, `manually_corrected`. Widersprüche halten beide Quellen fest, erzeugen einen Konflikt und blockieren betroffene Ableitungen. Eine Korrektur verweist auf Ursprung und Nachfolger, überschreibt weder Nachricht noch Beobachtung.

### 10.2 Datensparsamkeit

Nicht duplizieren: vollständige Nachrichten in Claims/Assessments/Audit, Binärbild/PDF, EXIF/GPS, Originaldateiname, Telefonnummer, E-Mail, Adresse, Signed URL, Providerrohantwort oder Prompt. Referenz plus notwendiger normalisierter fachlicher Wert genügt. Zitate nur als minimaler, redigierter Ausschnitt, wenn fachlich zwingend und nach festgelegter Retention.

## 11. Hypothesenmodell

Diskussionsvertrag:

```text
Hypothesis {
  id, type, subject_ref, statement,
  supporting_evidence_refs[], contradicting_evidence_refs[],
  status: proposed | needs_confirmation | confirmed | rejected | superseded,
  uncertainty_class,
  required_confirmation[], offer_impact,
  replacement_hypothesis_ref?, reviewer_decision_ref?, assessment_version
}
```

`statement` ist eine kontrolliert begrenzte fachliche Aussage, kein freier ausführbarer Prompt. `offer_impact` ist z. B. `none`, `scope`, `feasibility`, `price_risk`, `blocker`, keine Preisberechnung. Bestätigungskriterien sind maschinenlesbare Informationsbedarfe. Nur Mensch/Vor-Ort-Regel darf `confirmed` setzen, sofern dies fachlich vorgeschrieben ist; maschinell vorgeschlagen bleibt gekennzeichnet.

Für den ersten MVP werden wenige aktive Hypothesen als Bestandteil des versionierten Assessments persistiert. Eine eigene Hypothesentabelle ist erst gerechtfertigt, wenn unabhängiger Lebenszyklus, viele Beziehungen oder Auswertung nachgewiesen sind. Verworfene/ersetzte Hypothesen bleiben in älteren Assessmentversionen nachvollziehbar.

## 12. Unsicherheitsmodell

| Variante | Bewertung |
|---|---|
| A globale Zahl | leicht anzeigbar, aber vermischt unabhängige Risiken, schlecht kalibrierbar und erzeugt gefährliche Scheingenauigkeit |
| B Zahl pro Datenpunkt | differenzierter, aber hoher Kalibrierungsaufwand; LLM-Selbsteinschätzung ist kein belastbarer Messwert |
| C qualitative Klassen | verständlich/testbar, aber Evidenzqualität und Status können vermischt werden |
| D Status + Evidenzqualität + Zahl | langfristig auswertbar, im MVP unnötig komplex; Zahl bleibt ohne Kalibration irreführend |
| E keine Zahl, regelbasierte Readiness + Klassen | **MVP-Empfehlung**: sicher, erklärbar, testbar, angebotsrisikogerecht |

MVP trennt (a) epistemischen Status `bestätigt`, `wahrscheinlich`, `geschätzt`, `unbekannt`, `nicht_anwendbar`, `vor_ort_pruefen`, (b) Quellenqualität und (c) Readinessregel. `wahrscheinlich`/`geschätzt` müssen Begründung und Spannbreite tragen. Sicherheitskritische Punkte können nur `bestätigt`, `unbekannt` oder `vor_ort_pruefen` sein, sofern keine freigegebene sichere Zwischenklasse definiert wurde.

**„78 %“ darf im MVP weder Kunden noch Reviewer als Projekt- oder technische Confidence gezeigt und nicht aus LLM-Selbsteinschätzung übernommen werden.** Später ist eine Zahl nur als empirisch kalibrierte, dimensionsspezifische Modellmetrik mit Stichprobe, Definition, Version und Qualitätsgrenzen intern zulässig; nie als Ersatz für Evidenz, Readiness oder Freigabe.

## 13. Frageplanung und Frageverträge

### 13.1 Varianten

| Variante | Vorhersagbarkeit/Sicherheit | UX/Sprache | Kosten/Testbarkeit | Urteil |
|---|---|---|---|---|
| A fester Baum | hoch | starr, Sackgassen/irrelevante Äste | günstig/gut | allein ungeeignet |
| B generatives LLM | niedrig, Halluzinationsrisiko | potenziell natürlich | teuer/schlecht reproduzierbar | ausschließen |
| C Pflichtfelder + LLM-Text | Regeln sicher, Formulierung variabel | gut | mittel | später möglich, Formulierung muss kontrolliert sein |
| D Scoring offener Bedarfe + Vorlagen | hoch | adaptiv ohne freien Planner | günstig/sehr gut | **MVP-Empfehlung** |
| E vollständiger Information-Gain-Planner | theoretisch stark | adaptiv | hohe Modellierungs-/Messkomplexität | später evaluieren |

Question Candidates werden deterministisch aus Missing Information, Konflikten, Blockern und Abhängigkeiten erzeugt. Rankingdimensionen, zunächst als ordinale Regeln statt produktiver Formel: Sicherheitsrelevanz; Machbarkeits- und Preiswirkung; erwartete Unsicherheitsreduktion; Freischaltung abhängiger Erkenntnisse; Antwortwahrscheinlichkeit; Kundenaufwand; Kanal-/Medieneignung; Alter/Dringlichkeit; bereits gestellte/ignorierte Fragen; Wiederholungsgrenze. Harte Sicherheitsblocker vor Komfortdaten, aber eine unzumutbare Frage erhält Alternative/Mensch-Pfad. Tie-Breaker ist stabil, damit Tests reproduzierbar bleiben.

### 13.2 Fragevertrag

```text
QuestionDefinition {
  question_id, target_information_key, subject_ref,
  customer_text_template, short_reason,
  expected_answer_type, allowed_alternatives[],
  unknown_path, skip_policy, optional_media_request_ref,
  max_repetitions, priority_class, blocker_kind,
  examples[], prerequisites[]
}
```

Kontrollierte Antworttypen: Freitext, Ja/Nein, Auswahl, Zahl, ungefähre Zahl, Maß mit Einheit, Adresse, Foto, mehrere Fotos, Dokument, unbekannt, überspringen. Freitext bleibt als natürliche Kundenoberfläche erlaubt; Klassifizierung extrahiert nur Vorschläge. Der Kunde muss keinen internen Enum kennen. Serverregeln bestimmen IDs, Zielinformation, Status, Quelle und Confidence; Client/Kanal liefert nur Antwortinhalt und Korrelation. Nach maximal einer verständlicheren Wiederholung (Owner-Gate) folgt Alternative, Skip/Vor-Ort oder Mensch statt Schleife.

## 14. Fotoanforderungen

Ein `MediaRequest` enthält Zweck, Motiv, Fotografenposition, Blickrichtung, gewünschten Ausschnitt, Licht-/Abstands-Hinweis, Alternative, Qualitätskriterien, Subject/Room, akzeptierte Medientypen und maximale Wiederholungen. Beispiel: „Damit wir die mögliche Innengeräteposition einschätzen können: Stelle dich bitte in die Wohnzimmertür und fotografiere Richtung Fenster, sodass die gesamte Außenwand sichtbar ist. Falls das nicht möglich ist, beschreibe Wandbreite und Hindernisse.“

Nach Upload entsteht nur ein Qualitäts-/Eignungsvorschlag: `ausreichend`, `unscharf`, `falscher_raum`, `zu_nah`, `zu_dunkel`, `relevante_wand_fehlt`, `aussenbezug_fehlt`, `alternative_noetig`, jeweils mit geprüften Kriterien und Referenz. Ein Modell darf nicht allein sicherheitskritische Unsicherheit auflösen. Höchstens eine gezielte Wiederholung; danach Alternative, vorhandene Teilinformation oder Vor-Ort. AP-15-MVP nutzt vorhandene `ready`-Projektmedien nur referenziell; keine neue Upload- oder Bildanalysefunktion.

## 15. Sackgassenvermeidung

| Situation | Verbindliche Fortsetzung |
|---|---|
| „weiß ich nicht“ | Status unbekannt; einfachere Ersatzfrage, zweckgebundenes Foto, sichere Annahme oder Vor-Ort |
| Frage ignoriert | nicht identisch wiederholen; später zurückstellen, Alternative anbieten, nach Grenze Mensch/Skip |
| falsches/ungenügendes Bild | konkreter Qualitätsgrund + genau eine verbesserte Anleitung; dann Alternative/Vor-Ort |
| nur Teil geliefert | Teil als Evidenz sichern, Restbedarf neu und kleiner formulieren |
| Abbruch | State konsistent pausieren, ehrlichen Zwischenstand sichern, spätere Wiederaufnahme ermöglichen |
| Widerspruch | beide Claims erhalten, neutral nachfragen; betroffene Ableitung blockieren; bei Risiko Mensch |
| Themenwechsel | neue relevante Evidenz aufnehmen, offene Frage zurückstellen statt Kunden zurechtweisen |
| sofortiger Preiswunsch | nur zulässige Spanne mit Annahmen/Risiken oder erklären, welche eine Information dafür fehlt; nie erfundener Festpreis |
| keine Maße | ungefähre Spanne, bekannte Referenz, Foto mit Größenbezug oder Vor-Ort |
| keine Außenaufnahme | Beschreibung/Skizze/zulässiges vorhandenes Dokument; Außenposition offen/Vor-Ort |
| Mieter/Genehmigung unklar | Genehmigung als Blocker, keine automatische Zulässigkeitsannahme, Eigentümerklärung/Vor-Ort |
| nur vor Ort prüfbar | als Prüfpunkt erfassen; Remote-Gespräch mit übrigen wertvollen Fragen fortsetzen |

Jede Plannerentscheidung muss mindestens `ask`, `clarify`, `request_media`, `defer`, `assume_safely`, `skip`, `mark_on_site` oder `handover` liefern können. „Keine nächste Aktion“ ist nur bei bewusst pausiert/geschlossen zulässig.

## 16. Zwischenstände und garantierter Output

Alternative zu einer einzigen Leiter wäre ein dimensionsweises Readinessprofil. Empfehlung: **beides** — kundenverständliche Stufe plus interne Dimensionen; niedrigste kritische Dimension begrenzt erlaubte Aussage.

Jeder Output enthält: `known`, `assumptions`, `unknowns`, `contradictions`, `safety/on_site`, erlaubte Empfehlung, Preisform, nächste Schritte, Assessmentversion und Reviewstatus. Auch Stufe 0 liefert strukturiert „noch nicht eingrenzbar“ plus nächste beste Aktion.

| Stufe | Mindestinformation | Erlaubt | Verboten / Preis | Mensch |
|---|---|---|---|---|
| 0 keine technische Aussage | Projekt/Conversation identifizierbar | Bedarf noch offen, fehlende Schlüsselinformation, nächste Frage | System-/Machbarkeitsbehauptung; kein Preis | bei Abbruch/Risiko erreichbar |
| 1 grobe Bedarfseingrenzung | Zweck, grobe Raumanzahl/-größe oder Näherung | z. B. mögliche Single-/Multi-Richtung als Bandbreite | konkrete Montage/Festpreis; höchstens keine oder ownerfreigegebene sehr grobe Spanne | noch nicht freigegeben |
| 2 vorläufige Systemempfehlung | relevante Räume/Nutzung/Lasttreiber ausreichend, Unsicherheiten benannt | vorläufige Geräteanzahl/Leistungsklasse mit Voraussetzungen | finale Dimensionierung/Freigabe; nur regelbasiert zulässige Spanne | Review vor Außenkommunikation nach Owner-Gate |
| 3 vorläufiger Installationsansatz | plausible Innen-/Außenoption und Leitungs-/Kondensat-/Zugangsbild | Installationshypothese und Alternativen | verdeckte/sicherheitskritische Details als bestätigt; kein Festpreis | technische Prüfung erforderlich |
| 4 angebotsfähiger Entwurf | alle Entwurfsblocker gelöst oder explizit tolerierte Annahme/Ausschluss; Preisrisiken sichtbar | Entwurf, Spanne/Positionen/Ausschlüsse gemäß deterministischer Preislogik | automatisch versenden/freigeben; keine LLM-Preiszahl | zwingend menschlich |
| 5 menschlich geprüft/freigegeben | dokumentierte Reviewerentscheidung, kritische Gates erfüllt | freigegebener Stand im erlaubten Geschäftsprozess | maschinelle Freigabe oder rückwirkendes Verbergen von Annahmen | verbindliches Quality Gate |

Die Stufe ist keine Garantie technischer Machbarkeit. Beispieloutput: „Voraussichtlich eine Single-Split-Lösung für einen Raum von ungefähr 20–30 m². Außengeräteposition und Leitungsweg sind offen; ein Festpreis ist nicht möglich. Nächster Schritt: Außenposition beschreiben oder vor Ort prüfen.“ Preisbereiche werden in diesem Paket weder definiert noch berechnet.

## 17. Offer Readiness

Dimensionen: Leistungsdimensionierung, Geräteanzahl, Raumabdeckung, Innenposition, Außenposition, Leitungsweg/-länge, Kernbohrung, Kondensat, Elektro, Zugang, Genehmigung, Schall, Montageaufwand und Preisrisiko. Jede Dimension hat `satisfied`, `warning`, `assumption_allowed`, `on_site_required`, `blocker`, `not_applicable` plus Gründe/Evidenz.

- **Harte Blocker:** ungelöste sicherheitskritische Unklarheit; unklare Genehmigung bei Miete/genehmigungspflichtigem Aufbau; keine plausible Außenposition/Entwässerung; nicht bewertbarer sicherer Zugang; kritischer Widerspruch; ungeklärte Elektro-/Bohr-/Statikfrage, soweit für die versprochene Stufe erforderlich.
- **Warnungen:** Genauigkeitsverbesserer fehlen, plausible Alternative vorhanden, Preisrisiko mit Bandbreite abbildbar.
- **Tolerierbare Annahmen:** nur ownerfreigegebene, konservative, nicht sicherheitskritische Standardannahmen mit sichtbarer Auswirkung und Ersatzregel; niemals als Fakt.
- **Vor Ort:** verborgene Leitungen/Wandaufbau, finale Bohrstelle, Elektroreserve, statische/komplexe Höhen- und Zugangsfragen.
- **Preisspanne:** erst wenn Systemumfang grob, Geräteanzahl/Leistungsklasse plausibel, Montagegrundtyp bekannt und größte Preisrisiken begrenzt/ausgewiesen sind; ausschließlich deterministische Preisquelle.
- **Angebotsentwurf:** Dimensionen entweder erfüllt, explizit toleriert oder als Ausschluss/Vor-Ort-Punkt modelliert; keine harten Sicherheits-/Genehmigungsblocker für behaupteten Umfang.
- **Menschliche Freigabe:** Reviewer sieht Evidenz, Annahmen, Widersprüche, Preisrisiken und Prüfpflichten und bestätigt eine konkrete Assessment-/Entwurfsversion. Rolle/Verfahren ist Owner-Gate; `requires_human_review=false` darf diese Regel nicht automatisch umgehen.

## 18. Human Review und Korrekturen

Revieweransicht (später) muss Summary, Fakten, Kundenclaims, Annahmen, Hypothesen, Unsicherheit, relevante Medienreferenzen, offene Fragen, Angebotsentwurf, Begründungen und Sicherheits-/Vor-Ort-Punkte nach Assessmentversion bündeln. Aktionen: bestätigen, korrigieren, unbekannt setzen, Kundenfrage anfordern, Vor-Ort verlangen, Hypothese verwerfen/ersetzen, Entwurf zurückstellen und — nur bei entsprechender fachlicher Permission — freigeben.

Korrektur ist append-only: `correction_id`, Zielclaim/-assessmentversion, vorheriger Wert/Status als Referenz, kontrollierter neuer Wert/Status, Reason Code plus knappe Begründung, menschliche Actor-ID, Zeitpunkt und erwartete Stateversion. Danach neuer Knowledge State/Assessment; ursprüngliche Evidenz bleibt unverändert. Freigabe bindet exakt eine Version und verfällt bei relevanter Änderung.

Korrekturen dürfen später aggregiert für Qualitätsmessung oder kuratierte Prompt-/Regelverbesserung verwendet werden, aber nur redigiert, zweckgebunden, mit Zugriff/Retention und menschlicher Freigabe. Kein automatisches Online-Lernen, kein ungeprüftes Training und keine automatische Regeländerung.

## 19. KI-Actor- und Rollengrenzen

`reviewer` bleibt ausschließlich menschliche Anwendungsrolle. Ein KI-Lauf erhält keinen normalen Reviewer-Login, keine frei nutzbare Service Role und keine menschliche Freigabefähigkeit. Zielmodell: getrennte serverseitige `machine_run`-/technische Actor-Klasse mit minimalem, operationbezogenem Capability-Adapter; Ausgabe trägt Run-, Modellalias- und `machine_generated`-Kennzeichnung. Persistenz erfolgt erst nach Schema-/Policyprüfung und ggf. menschlichem Gate.

Maschinelle Analyse, menschliche Bestätigung und Angebotsfreigabe sind getrennte Statusdimensionen. Workeridentität, Service Role und App-Rolle dürfen nicht in einem `role`-Enum zusammengeworfen werden. Ob eine technische Actor-Struktur als DB-Entität nötig ist, bleibt Owner-/Security-Gate; fachlich ist die Trennung zwingend.

## 20. WhatsApp-Grenzen

Spätere Schichten: (1) providerabhängiger Transport/Signatur, (2) validierende Message Ingestion, (3) Idempotenz/Ordering, (4) providerunabhängige Engine, (5) Media Download/privater Storage, (6) Knowledge Extraction, (7) Question Planner, (8) kontrollierter Outbound Adapter, (9) Human Takeover. Provider-IDs bleiben Transportreferenzen, Telefonnummern Customer-/Contactdaten und nie Conversation-Schlüssel.

- Doppelte Webhooks: Unique Provider Event ID/Idempotency Key; gleicher Payload führt zu keinem zweiten fachlichen Event/Outbound.
- Verspätung/Reihenfolge: Providerzeit + Ingestzeit, per Conversation sequenzieren; alte Antwort darf auf alte `question_id` korrelieren und Stateversion neu bewerten.
- Mehrere Bilder sowie getrenntes Bild/Text: als einzelne Events derselben optionalen Message Group; erst nach definierter Ruhe-/Completionregel bewerten, ohne Vollständigkeit zu behaupten.
- Verlorene Webhooks: Provider-Reconciliation/Status später auditieren; Engine darf Zustellung nicht aus lokalem Sendeversuch ableiten.
- Gelöschte Nachricht: Tombstone/Invalidierung statt historische Claims still zu löschen; Rechts-/Retention-Gate beachten.
- Telefonnummern/Kundenwechsel: verifizierte Zuordnung, keine automatische Zusammenführung; Konflikt an Mensch.
- Opt-in/Abbruch: Consent-/Kanalstatus vor Outbound; STOP pausiert Automatik, löscht nicht ungeprüft Fachakte.
- Human Takeover: Lease/Mode verhindert parallele automatische Antworten; Mensch kann später kontrolliert zurückgeben.
- Wiederaufnahme nach Stunden/Tagen: Stateversion und offene Frage laden, Änderungen/Timeouts neu bewerten, nicht blind wiederholen.
- Sprachnachrichten sind späterer Scope. Keine WhatsApp-API wird hier ausgewählt.

## 21. Datenschutz und Datensparsamkeit

Hochsensible bzw. personenbezogene Inhalte sind Nachrichten, Telefon/E-Mail, Adresse, private Wohnraumfotos, Personenabbildungen, EXIF/GPS, Dokumente/Grundrisse. Vor jeder Providerübertragung sind Zweck, Rechtsgrundlage/Einwilligung, AV-Vertrag/Region, Subprozessoren, Trainingsausschluss, Löschung und Datenminimierung als Owner-/Datenschutz-Gate zu klären; dieses Audit ist keine Rechtsberatung.

- EXIF/GPS grundsätzlich bei Ingestion entfernen, soweit nicht ausdrücklich fachlich erforderlich; Original-/Derivatstrategie rechtlich entscheiden.
- Gesichter/Personen und irrelevante Wohnraumbereiche nach Möglichkeit vermeiden/redigieren; Fotoanweisung fordert keine Personen.
- Provider erhält nur für konkrete Aufgabe nötige Ausschnitte/normalisierte Werte; keine gesamte Kundenakte. Trainingsnutzung standardmäßig ausgeschlossen, bis ausdrücklich freigegeben.
- Production, Preview und lokale Tests strikt trennen. Keine Production-Kundendaten in Preview, Analytics oder Fixtures; synthetische, nicht personenbezogene Testfälle verwenden.
- Soft Delete ist keine Löschung aus Storage, Backups oder Providern. Retention und kaskadierende Lösch-/Legal-Hold-Prozesse sind offene Production Gates.

**Niemals in technische Logs/Auditmetadaten/Analytics/Fehlertexte/Testfixtures:** Vollnachrichten, Telefonnummer, E-Mail, Adresse, Bild-/Dokumentinhalt, EXIF/GPS, Signed URLs, Secrets, Tokens, Rohprompts/-antworten. **Nicht in DTOs:** Daten außerhalb des konkreten Use Cases, frei gesetzte Actor-/Rollen-/Source-/Statuswerte. **Nicht in Prompts:** direkte Identifikatoren, unnötige Kontaktdaten/Adresse, Signed URLs/Secrets, irrelevante Dokumentseiten oder Bilder; notwendige Inhalte vorher minimieren/redigieren. Audit Events enthalten nur IDs, kontrollierte Reason/Result Codes und Versionen.

## 22. LLM-/Vision-Architektur

| Variante | Risiko/Konsistenz | Debug/Test/Wechsel | Kosten/Teilfehler | Urteil |
|---|---|---|---|---|
| A ein großes Modell für alles | höchste Halluzination, State drift, Prompt Injection | schlecht | unkontrolliert | ausschließen |
| B regelbasierter Orchestrator, getrennte Modellaufgaben | klare Autorität/Validierung | gut | Aufgaben einzeln begrenzbar | **MVP-Ziel** |
| C Workflow mit strukturierten Tools/Schemaoutputs | sehr gut bei enger Toolautorität | gut, aber Infrastruktur höher | Timeouts/Resume modellierbar | spätere Evolution von B |
| D mehrere Agents | Koordinations-/Emergenzrisiko | schwer reproduzierbar | teuer, viele Teilfehler | nicht MVP |

MVP basiert zunächst vollständig auf Regeln/kontrollierten Vorlagen. Spätere begrenzte Modellaufgaben: Nachricht klassifizieren, Claim-Kandidaten extrahieren, sichtbare Bildbeobachtungen vorschlagen, Hypothesen vorschlagen, ausgewählte Frage sprachlich vereinfachen, Summary-Entwurf erzeugen. Jede Aufgabe besitzt minimierten Input, striktes versioniertes Schema/Zod-Validierung, Timeout, Kostenlimit, Provideralias, keine Mutationsberechtigung und regel-/menschengesteuerte Annahme. Preisberechnung und Freigabe sind nie LLM-Aufgaben. Prompt Injection in Nachrichten/Dateien wird als untrusted content behandelt; Inhalte dürfen keine System-/Toolautorität erhalten.

## 23. Synchronität, Jobs und Teilfehler

Zielbewertung, ohne Queueimplementierung:

| Operation | Charakter | Garantie |
|---|---|---|
| Nachricht/Event speichern | synchroner Ingest-Kern | validiert, idempotent, vor Ack dauerhaft |
| Bild speichern | synchron reservieren/transferieren, Finalisierung separat | privater Storage, Statusmaschine, kein Analyseversprechen |
| Bildanalyse | asynchron | retrybar, versioniert, dedupliziert, Ergebnis Vorschlag |
| Knowledge aktualisieren | kurz synchron für Regeln oder asynchron nach Analyse | CAS auf Stateversion, deterministisch replaybar |
| nächste Frage planen | nach konsistentem State, meist kurzer Job | Input-/Outputversion, nur ein aktiver Vorschlag |
| Antwort senden | separat asynchron | Outbox-/Idempotenzkonzept vor WhatsApp, Zustellstatus getrennt |
| Angebotsentwurf aktualisieren | asynchron/explicit command | deterministische Preisquelle, Assessmentversion |
| Reviewer benachrichtigen | asynchron best effort | keine fachliche Statusänderung durch Versand |

Retries nutzen stabile Operation-ID und dürfen keine zweite Modellantwort/Frage erzeugen. Timeouts enden als kontrollierter Fehler, nicht als leerer Erfolg. Nach begrenzten Retries: Dead-Letter-Konzept bzw. manuell prüfbarer Fehlerzustand (keine konkrete Tabelle vorweggenommen). Manuelle Wiederholung erzeugt neuen Versuch unter derselben fachlichen Operation. Kostenbudgets pro Projekt/Run, keine Endlosschleifen.

## 24. Race Conditions

- Zwei Nachrichten: serialisierte/optimistische Aktualisierung je Conversation; Verlierer liest neue Version und plant neu.
- Verspätete Bildanalyse: Ergebnis trägt Input-Media- und Stateversion; als Evidenzvorschlag aufnehmen, aktuelle Frage nur nach Re-Evaluation ändern.
- Reviewer korrigiert während Run: menschliche Korrektur gewinnt nicht durch stilles Last-write-wins; Run-CAS scheitert und wird gegen neuen State neu bewertet.
- Doppelte Webhooks/Modellantworten/Outbound: Unique operation/provider key und idempotente Statusübergänge.
- Veralteter Question Candidate: Auswahl verlangt erwartete Stateversion und offene Zielinformation.
- Mehrfacher Outbound: persistierte Sendeabsicht vor Transport, stabile Provider-Idempotenz soweit verfügbar; Sendestatus ist nicht Zustellstatus.
- Projekt/Medium soft-deleted während Run: aktive Parentprüfung an jeder Mutationsgrenze; Run verwirft Output ohne Daten wiederherzustellen.

Erforderlich sind monotone `state_version`, erwartete Version in Commands, immutable Assessmentversion, serverseitige Zeit/IDs und kontrollierte Konfliktcodes. Keine freien Updates und kein blindes LLM-Merge.

## 25. Observability und Audit

Technische Telemetrie: pseudonyme `conversation_run_id`, interne `message_id`, `state_version`, kontrollierte Operation, Dauer, Modell-/Provideralias (keine Credentials), Result Code, Retryzahl, aggregierte Token-/Kostenmetrik, ausgewählte `question_id` plus Reason Codes, Korrektur-ID und Fehlerkategorie. Metriken haben Environment und Version, aber keine PII.

Nicht speichern: Vollnachrichten, Bilder, Prompt-/Providerrohtext, Tokens/Secrets, Signed URLs, Telefonnummern, E-Mails oder Adressen. „Tokenmetrik“ bedeutet Anzahl/Kosten, niemals Tokeninhalt.

Das vorhandene `audit_log` eignet sich für knappe fachliche menschliche Entscheidungen (Korrektur, Freigabe, Takeover) mit kontrollierten Metadaten. Es eignet sich nicht für hochvolumige Runs, Retries, Timing oder Providerdiagnostik. Vor KI/WhatsApp ist eine getrennte technische Run-/Telemetry-Struktur mit Retention und Zugriff zu auditieren; nicht zwingend eine einzelne Tabelle. Fachliches Audit und technische Observability bleiben getrennt und über IDs korrelierbar.

## 26. API-/DTO-Grenzen (illustrativ, nicht implementiert)

Alle Verträge sind strict, versioniert, Zod-validiert und projektgebunden. IDs, Actor, Source, technische Statuswerte, Confidence und Stateversion werden serverseitig ermittelt; keine freien Patchobjekte.

```text
IncomingMessage { channel_message_ref, conversation_ref, occurred_at, kind, text_or_media_refs[] }
ConversationEvent { event_id, project_id, sequence, event_type, actor_class, source_ref, occurred_at, ingested_at }
KnowledgeUpdate { project_id, expected_state_version, operations: TypedClaimOperation[] }
EvidenceReference { evidence_id, source_type, source_id, subject_ref, observed_at, actor_class, status }
QuestionCandidate { definition_id, subject_ref, target_key, reason_codes[], eligibility, burden_class }
SelectedQuestion { event_id, definition_id, state_version, rendered_text, reason_codes[], alternatives[] }
MediaRequest { request_id, purpose_code, subject_ref, instruction_fields, quality_criteria[], max_repetitions }
IntermediateAssessment { assessment_id, version, readiness_stage, facts[], assumptions[], unknowns[], risks[], next_steps[], review_status }
OfferReadiness { assessment_version, dimensions[], blockers[], warnings[], on_site_items[], permitted_price_form }
ReviewerCorrection { target_ref, expected_state_version, correction_kind, typed_value?, reason_code, note? }
```

`IncomingMessage` enthält keinen clientbestimmten `customer_id`; Zuordnung erfolgt serverseitig. `KnowledgeUpdate` erlaubt nur benannte, typisierte Operationen wie Claim hinzufügen, superseden, als unbekannt/nicht anwendbar markieren; kein `Record<string, unknown>`-Patch. Output-DTOs geben keine internen Prompts, Storagepfade oder Providerantworten aus.

## 27. MVP-Vergleich

| Aspekt | Interner Simulationsmodus | Sofortiger WhatsApp-Agent |
|---|---|---|
| Scope | ein kontrolliertes Projekt, Text + vorhandene Medienreferenzen | Transport, Consent, Identität, Webhooks, Medien, Outbound und Engine gleichzeitig |
| Risiko | intern, Mensch vor jeder Frage | reale PII und externe Fehlkommunikation |
| Lernen | Domain-/Readiness-/Plannerfehler isolierbar | Kanalfehler verschleiern Domainfehler |
| Testbarkeit/Kosten | deterministisch, ohne Provider | hohe Integrations-/Betriebskomplexität |
| Empfehlung | **zuerst** | nach separatem Transportaudit und validierter Engine |

Bewusster MVP: interner Simulationsfall für genau ein aktives Projekt; textbasierte simulierte Kundeneingaben; vorhandene `ready`-Projektmedien nur referenzieren; strukturierter In-Memory-/Vertrags-Knowledge-State; regelbasierte Missing-Information-/Readiness-Auswertung; kontrollierter Next-Question-Vorschlag; Admin prüft und sendet nichts automatisch; einfacher Zwischenstand; keine Preisberechnung, KI oder WhatsApp.

## 28. Klare Architekturentscheidung

1. Zielbild ist reduzierte Variante E: unveränderliche fachliche Events + strukturierter versionierter Knowledge State + versionierte Assessments.
2. Kein vollständiges Event-Sourcing-Framework im MVP; kein Begriff-pro-Tabelle. Persistenz folgt nach validiertem Domainvertrag und eigenem Daten-/RLS-Audit.
3. Qualitative Unsicherheitsklassen + Provenienz + regelbasierte Readiness, keine Prozent-Confidence.
4. Question Planner Variante D: deterministische Kandidaten/Rankingregeln und kontrollierte Vorlagen; optional spätere begrenzte Sprachformulierung.
5. Regelbasierter Orchestrator mit isolierten, schema-validierten Modellaufgaben als spätere Evolution; kein autonomer Agent.
6. Menschliche Rolle, technische Machine-Run-Identität und Transport getrennt; keine automatische Kundenantwort oder Freigabe.
7. Bestehende Projekte/Medien/Status/Notizen werden referenziert und nicht als Conversation State umgedeutet oder dupliziert.

## 29. Owner-Entscheidungen

Keine der folgenden noch offenen Entscheidungen wird durch dieses Audit finalisiert. „Empfehlung“ ist die technische Präferenz zur Entscheidung.

| # | Owner-Entscheidung | Technische Empfehlung |
|---:|---|---|
| 1 | intern ohne WhatsApp beginnen? | Ja, kontrollierter Simulator zuerst |
| 2 | Fragen vorschlagen oder senden? | nur Vorschlag; Admin bestätigt/manuell verwendet |
| 3 | Readiness-Stufen? | Stufe 0–5 wie Abschnitt 16 plus Dimensionen; fachlich abnehmen |
| 4 | numerische Confidence? | im MVP nein; keine „78 %“ |
| 5 | zwingende Angebotsblocker? | Safety, Genehmigung, Machbarkeit, kritische Widersprüche und nicht begrenzbares Preisrisiko fachlich bestätigen |
| 6 | automatische Annahmen? | nur ownerfreigegebene, konservative, nicht sicherheitskritische Standards, sichtbar und ersetzbar |
| 7 | wann Vor-Ort-Termin? | ungelöste Safety-/Genehmigungs-/Zugangs-/verdeckte Technikpunkte oder nicht remote begrenzbare Machbarkeit |
| 8 | was überspringbar? | optionale/Genauigkeitsdaten; Blocker dürfen übersprungen, aber nur als offen/Vor-Ort weitergeführt werden |
| 9 | Rückfragen je Punkt? | eine vereinfachte Wiederholung, danach Alternative/Skip/Vor-Ort/Mensch |
| 10 | wann Mensch? | Kunde verlangt ihn, Konflikt/Safety, Wiederholungsgrenze, Providerfehler, niedrige Readiness vor bindender Aussage, jede Freigabe |
| 11 | Bildtypen MVP? | vorhandene JPEG/PNG/WebP anzeigen/referenzieren; keine Analyse; PDF separat |
| 12 | Grundrisse analysieren? | zunächst nur vorhandenes privates Medium speichern/anzeigen, keine Analyse |
| 13 | früher Angebotsentwurf sichtbar? | interner vorläufiger Zwischenstand ja, klar als nicht freigegeben; kein echter Angebotsumfang in erstem Paket |
| 14 | Preisspanne? | erst nach deterministischer Preislogik, Readinessminimum und Ownerfreigabe; nie LLM-generiert |
| 15 | wer gibt frei? | benannte menschliche Permission/Prozess festlegen; Empfehlung Reviewer/Admin mit Separation-of-Duties-Prüfung, niemals Maschine |
| 16 | Nutzung von Korrekturen? | versioniertes Quality Reporting und kuratierte Verbesserung; kein autonomes Lernen |
| 17 | Daten an externen KI-Anbieter? | minimal/redigiert pro Aufgabe erst nach Datenschutz-/Security-Gate; keine Kontakt-/Adressdaten standardmäßig |
| 18 | Retention Nachrichten/Fotos? | Rechts-/Ownerentscheidung vor Persistenz/Provider; getrennte Fristen und nachweisbarer Löschpfad |
| 19 | technische KI-Actor-Struktur? | fachlich ja getrennte Actor-Klasse; konkrete Persistenz erst eigenständig auditieren |
| 20 | erster Testfall? | Owner wählt ein synthetisches, nicht personenbezogenes Standardprojekt mit einem Raum und vorhandenen anonymen Beispielmedien |

## 30. Test- und Validierungsstrategie (später)

- **Domain:** Fact/Customer Claim/Image Observation/Estimate/Assumption/Hypothesis/Unknown sauber unterscheiden; nicht anwendbar; Konflikt; Evidenzreferenz; Supersede/Invalidierung; State-/Assessmentversion.
- **Conversation:** lineare und unvollständige Antworten, „weiß ich nicht“, Themenwechsel, Antwort auf alte Frage, mehrere Events, Abbruch/Wiederaufnahme, immer zulässige Fortsetzung.
- **Planner:** Safety-/Blockerpriorität, stabile Tie-Breaker, keine Wiederholung über Limit, niedrige Belastung, verständliche Alternative, zweckgebundenes Foto, Skip/Vor-Ort.
- **Readiness:** Stufen 0–5, grobe Eingrenzung, erlaubte Preisspanne, Entwurf, Vor-Ort-Pflicht, Konflikt senkt Readiness, nie unbegründeter Festpreis.
- **Security:** fremdes/gelöschtes Projekt, manipulierte IDs, Rollenmatrix, Machine Actor statt Reviewer, Mass Assignment, PII in Logs/Errors/Audit, Prompt Injection, schädliche Dateiinhalte, Providerfehler.
- **Race:** zwei Nachrichten, verspätete Bildanalyse, Korrektur während Run, doppelte Webhooks/Retry/Outbound, veraltete Candidate-/Assessmentversion.
- **Production:** ausschließlich kontrollierter interner synthetischer Simulationsfall; Kosten/Laufzeit/Trace/Reason Codes, menschliche Korrektur und reproduzierbarer Zwischenstand. Keine echten Kundendaten als Fixture.

Vor späterer Implementierung: pure Domain-/Zod-/Permission-/Defaulttests, Architekturregressionen und adapterisolierte Contracttests; danach Integrations-/Concurrencytests. AP-15-00 selbst enthält und startet keine Anwendungstests.

## 31. Production Gates

1. Ownerentscheidungen aus Abschnitt 29 dokumentiert und fachlich abgenommen.
2. Domain-/Property-Katalog, Readinessregeln, Safetyblocker und zulässige Annahmen durch Klima-Fachverantwortliche geprüft.
3. Datenschutzentscheidung zu Zweck, Rechtsgrundlage/Opt-in, Provider, Region, Retention/Löschung, Fotos/EXIF/Personen, Betroffenenrechten und Trainingsausschluss.
4. Persistenz-, Migration-, RLS-, Grants-, Soft-Delete-/Hard-Delete-, Backup- und Auditdesign separat auditiert.
5. Machine-Actor/Worker-Capabilities getrennt von Human Roles; keine Service Role im normalen Pfad.
6. Idempotenz, CAS, Retry/Timeout/Dead Letter, Kostenlimits und Human Takeover getestet.
7. Modelloutputs strict validiert, als maschinell markiert, prompt-injection-resistent behandelt und vor Speicherung/Verwendung gegated.
8. Deterministische Preisengine separat validiert; keine LLM-Preisberechnung; keine automatische Freigabe/Versendung.
9. Datensparsame Observability ohne PII/Raw Content nachgewiesen; technische Runs vom fachlichen Audit getrennt.
10. Synthetischer interner Pilot mit nachvollziehbaren Reason Codes, Zwischenständen und Reviewer-Korrektur erfolgreich; WhatsApp erst nach eigenem Transport-/Securityaudit.

## 32. Folgepakete

| Paket | enger Scope | ausdrücklicher Ausschluss |
|---|---|---|
| AP-15-01 | Conversation Domain and Knowledge State Baseline: Begriffe, Property-MVP, pure Zustands-/Readiness-Verträge und Zod-Schemas nach Ownerentscheidung | DB, UI, KI, WhatsApp |
| AP-15-02 | Evidence and Hypothesis Model einschließlich Provenienz/Korrektursemantik; Persistenzentscheidung auditieren | Analyseprovider |
| AP-15-03 | Missing Information and Readiness Engine als pure deterministische Regeln | Preisberechnung |
| AP-15-04 | Controlled Next-Question Planner, Templates, Wiederholungs-/Fallbackregeln | automatischer Versand/LLM |
| AP-15-05 | interner Conversation Simulator für ein Projekt nach separatem UI/Security-Scope | WhatsApp |
| AP-15-06 | Media Analysis Contract, Qualitätscodes, Datenschutz/Provideraudit | produktive Visionintegration |
| AP-15-07 | Human Review and Correction Workflow, Versionbindung und Permissions | autonome Freigabe |
| AP-15-08 | WhatsApp Transport-, Consent-, Datenschutz- und Provideraudit | Implementierung |
| AP-15-09 | Ingestion/Idempotenz/Ordering/Outbound/Takeover schrittweise | Engine-Neudesign |
| AP-15-10 | Offer Draft Integration mit deterministischer Pricing-/Freigabegrenze | LLM-Preislogik |

Zwischen AP-15-01 und Persistenz ist bei Bedarf ein eigenes Data/RLS-Paket einzuschieben; die Tabelle-pro-Konzept-Aufteilung ist nicht vorentschieden.

## 33. Kleinstes nächstes Arbeitspaket

**AP-15-01 — Conversation Domain and Knowledge State Baseline** ist der kleinste sinnvolle nächste vertikale Schritt, erst nach Ownerentscheidung. Scope: nur provider-/kanalunabhängige Domainkonstanten und strikte Schemas für einen synthetischen Ein-Raum-Fall; typisierte Claim-Zustände, Evidence References, qualitative Unsicherheit, Missing-Information- und Readiness-Ausgabe als pure Regeln; gezielte Vitest-Spezifikationen. Noch keine Persistenz, Migration, UI, Action/Service, Medienanalyse, KI, WhatsApp, Preis- oder Angebotsgenerierung. Dieses Paket validiert zuerst, ob Fakten, unbekannt, Annahmen, Konflikte und ein Stufe-0/1-Zwischenstand fachlich tragfähig modelliert sind.

## 34. Statusentscheidung

- **AP-12 PROJECT MEDIA CORE — PRODUCTION VALIDATED**
- **AP-13 PROJECT MEDIA GALLERY — IMPLEMENTED**
- **AP-14 INTERNAL ADMIN AND REVIEWER ROLES — VALIDATED FOR MVP USE**
- **AUTOMATED REVIEWER EMAIL ONBOARDING — DEFERRED**
- **CONVERSATION INTELLIGENCE ENGINE — NOT IMPLEMENTED**
- **WHATSAPP INTEGRATION — NOT IMPLEMENTED**
- **AI ANALYSIS — NOT IMPLEMENTED**
- **OFFER GENERATION — NOT IMPLEMENTED**
- **OVERALL PRODUCT — NOT PRODUCTION READY**

**Auditstatus: READY FOR OWNER DECISION.** Dieses Audit ist keine Implementierungsfreigabe und ausdrücklich nicht `APPROVED FOR IMPLEMENTATION`.

## 35. Scope-Bestätigung

Die einzige Änderung dieses Pakets ist dieses Auditdokument. Es enthält ausschließlich Audit, Analyse und Dokumentation. Es enthält **keine** Implementierung, UI, Komponente, Route, Server Action, Service, Domain-TypeScript-Datei, Migration, Tabelle, SQL/RPC/RLS-/Grant-/Storageänderung, Queue, Scheduler, WhatsApp-API/-Integration, KI-API/-Integration, Providercode, produktiven Prompt, Preis-/Angebotslogik, Benutzer-/Rollenänderung, technische Service Role, Environmentvariable, Secrets, Kundendaten, echte Kontaktdaten/Bilder, Tests/Teständerungen, externe Abhängigkeit oder `package.json`-Änderung.
