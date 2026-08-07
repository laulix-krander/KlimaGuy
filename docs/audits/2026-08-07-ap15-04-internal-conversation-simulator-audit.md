# AP-15-04-00 — Internal Conversation Simulator and Intelligence Review Workspace Audit

## 1. Audit-Metadaten

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-07-AP15-04-00-INTERNAL-CONVERSATION-SIMULATOR-V1` |
| Datum | 2026-08-07 |
| Paket | `AP-15-04-00` |
| Typ | Audit, Analyse, Architektur- und UX-Planung; keine Implementierung |
| Branch | `codex/audit-ap15-04-internal-conversation-simulator` |
| Baseline | `b74d3f58de690fd678c772bc380ac24e6df1586f` (`Merge pull request #97 from laulix-krander/codex/implementiere-conversation-cycle-orchestrierung`) |
| Remote | Zum Auditzeitpunkt ist kein Git-Remote konfiguriert; Remote-Abgleich, Push und Remote-Baseline-Verifikation sind daher nicht möglich. |
| Auditstatus | **READY FOR OWNER DECISION** |
| Freigabestatus | ausdrücklich **nicht** `APPROVED FOR IMPLEMENTATION` und **nicht** Production Ready |

## 2. Scope

Dieses Dokument bewertet ausschließlich Zielbild, Architektur, UX, Berechtigungsgrenzen, lokale Laufzeitverträge und spätere Anschlussfähigkeit eines internen, synthetischen Conversation Simulators sowie eines künftigen Intelligence Review and Knowledge Workspace. Geprüft wurden die vier verbindlichen AP-15-Audits, sämtliche Module unter `lib/domain/conversation-intelligence`, die sieben benannten Tests, `app`, `components`, Rollen-/Permission-Mapper und vorhandene Admin-/Reviewer-Muster.

Ausgeschlossen sind Implementierung, UI-Komponenten, Routes, Server Actions, Services, Persistenz, Migrationen, SQL/RPC/RLS/Grants, Supabase, Knowledge- oder Quality-Datenbanken, Analytics oder berechnete Fehlerraten, Chatimporte, KI/LLM/Vision, WhatsApp, Foto- und Angebotslogik, echte Kundendaten, Tests/Teständerungen, externe Dependencies und `package.json`. Alle folgenden Verträge sind nicht ausführbare Planungsskizzen.

## 3. Ausgangslage

Die Conversation-Intelligence-Domain besitzt inzwischen einen puren, deterministischen Answer-to-Next-Action-Zyklus. Er nutzt synthetische Fixtures, injizierte IDs/Zeitpunkte, strikte Zod-Verträge und unveränderliche Daten. Er besitzt weder Persistenz noch UI, Kundenkanal oder Providerintegration.

Nicht implementiert sind insbesondere persistente Conversation Engine, interner Simulator, echte Kundenkonversation, WhatsApp, KI/LLM/Vision, Photo Planner, Wissensverwaltung, Quality Dashboard, Fehleranalyse, alte Chat-Auswertung, Expertenkorrektur-Workflow, Fachregelverwaltung und Analytics. Vorhandene Projektseiten sind sessiongeschützt; Administration erscheint derzeit als flache Navigation mit „Medien-Inventur“ und „Benutzer & Rollen“. Die Rollen sind `admin` und `reviewer`; Admin-Grenzen werden durch kleine Permissionfunktionen ausgedrückt.

## 4. Bestehender Conversation Cycle

Die verbindliche Pipeline lautet:

`Raw Answer → Normalized Answer → Interpretation → Claim/Evidence Proposal → Knowledge State Transition → Retry / Customer Effort → Missing Information → Readiness → Intermediate Assessment → Question Planner → Template Rendering → Conversation Events`.

`runConversationCycle` ist die einzige fachliche Orchestrierungsquelle. Ein Simulator darf die Einzelschritte nur aufrufen, um Debug-Zwischenergebnisse desselben Vertrags sichtbar zu machen; er darf keine alternative Berechnung, keine vereinfachte Schattenengine und keine UI-eigenen Entscheidungen einführen.

Wesentliche vorhandene Grenzen:

- State-, Assessment- und Planner-Version müssen zusammenpassen; stale Eingaben schließen kontrolliert und verlangen Replanning.
- Normalisierung bleibt autoritativ für `text`, `boolean`, `approximate_number`, `unknown` und `skip`.
- Interpretation erzeugt Proposals; Transition Application erhält Historie, Supersession und parallele Widersprüche.
- Retry zählt höchstens zwei Versuche pro Need; Customer Effort ist diskret und kein psychologisches Profil.
- Missing Information, Readiness und Assessment werden ausschließlich aus dem resultierenden State neu abgeleitet.
- Planner wählt höchstens eine Aktion oder einen kontrollierten Stop; Scorekomponenten sind diskret, keine Confidence.
- Rendering verwendet registrierte Templates, erfindet keine Frage und rendert Human Review nicht als Kundenfrage.
- Events sind strukturiert, deterministisch, sequenziert und PII-frei; ihre heutige Sequenz ist nur lokal, nicht persistent global.

## 5. Produktziel

Admin und später fachlich legitimierte Reviewer/Experten sollen die bestehende Engine ausschließlich mit synthetischen Fällen vollständig durchspielen können. Der Tester spielt einen künstlichen Kunden. Nach jeder Antwort werden normalisierte Antwort, Interpretation, Evidence/Claims, State vorher/nachher, Version, Widersprüche, Missing Information, Readiness-Dimensionen, Annahmen, Site Checks, Assessment, Plannerentscheidung, nächste gerenderte Interaktion, Retry/Effort und Events nachvollziehbar.

Der Simulator ist ein internes Entwicklungs- und Qualitätswerkzeug, kein Kundenchat. Er sendet keine Nachricht. Ein reproduzierbarer Lauf soll später Ausgangspunkt eines Regression Case sein können, ohne dass dieses Audit Export oder Speicherung implementiert.

## 6. Produktprinzipien

1. Internes Werkzeug, kein Kundenkanal und keine WhatsApp-Kopie.
2. Ausschließliche Wiederverwendung der bestehenden Domain Engine.
3. Keine zweite Fachlogik oder vereinfachte Schattenengine.
4. Keine KI, Vision, echte Nachricht oder automatische Freigabe.
5. Ausschließlich synthetische Standardfixtures; keine Production-Projektwahl.
6. Identischer Startvertrag plus identische Antwortsequenz ergibt identische fachliche Ergebnisse.
7. State, Versionen und Veränderungen sind sichtbar und erklärbar.
8. Widerspruch, Unknown, Skip, Annahme, Site Check und Human Review bleiben unterscheidbar.
9. Fachliche Standardansicht und technische Debugansicht sind getrennt.
10. Erklärungen stammen aus strukturierten Reason Codes, nie aus freier Chain-of-Thought.
11. Der normale Modus führt atomar den vollständigen Cycle aus; Debugstufen verändern dessen Semantik nicht.
12. Interessante Läufe sind langfristig als kontrollierte Regression Fixtures formulierbar.

## 7. Variantenvergleich

Skala: `++` sehr gut, `+` gut, `0` gemischt, `-` schwach, `--` ungeeignet. Aufwand: niedrig/mittel/hoch/sehr hoch.

| Kriterium | A JSON-Seite | B Chat + separater Inspector | C Debug-Konsole | D Chat + optionaler Experten-/Debugmodus | E externes Storybook/Testtool |
|---|---:|---:|---:|---:|---:|
| Laurie/Fachexperte | -- | + | - | ++ | - |
| Entwickler | + | + | ++ | ++ | + |
| fachliche Nachvollziehbarkeit | - | + | 0 | ++ | 0 |
| niedrige Lernkurve | -- | + | - | ++ | - |
| Debugbarkeit | + | + | ++ | ++ | + |
| Mobile | - | 0 | -- | + | 0 |
| Desktop | 0 | + | ++ | ++ | + |
| spätere Quality-Arbeit | - | + | + | ++ | 0 |
| Wiederverwendbarkeit | 0 | + | + | ++ | - bis 0 |
| Implementierungsaufwand | niedrig | mittel | hoch | hoch, gestuft reduzierbar | mittel plus Toolkopplung |

- **A** ist als Rohdaten-Fallback nützlich, aber fachlich schwer lesbar und ungeeignet als gemeinsamer Reviewraum.
- **B** trennt Gespräch und Domain sinnvoll, erzwingt jedoch Kontextwechsel zwischen Ansichten.
- **C** lokalisiert technische Fehler gut, überfordert Fachanwender und macht das Gespräch zweitrangig.
- **D** verbindet verständlichen Ablauf mit zuschaltbarer Tiefe. Eine fachliche Defaultansicht verhindert Debugrauschen; dieselben Daten können Expertenpanels speisen.
- **E** koppelt das interne Produktwerkzeug an eine externe Tooloberfläche, schwächt Rollen-/Navigationskonsistenz und ist für End-to-End-Domainläufe nicht überlegen.

## 8. Architekturentscheidung

**Empfehlung: Variante D — chatartige Hauptansicht mit optionalem Experten-/Debugmodus.** Desktop zeigt Conversation zentral/links und Intelligence Inspector rechts; klein wird der Inspector als Tabs oder einklappbare Sektionen dargestellt.

Geplante Schichten für AP-15-04-01:

1. **Access Boundary:** bestehende Session-/Profilprüfung plus neue explizite Permission; zunächst Admin-only.
2. **Synthetic Fixture Catalog:** readonly, versionierte Startfälle aus/auf Basis vorhandener synthetischer Domainfixtures; keine Production-Abfrage.
3. **Local Simulator Session:** flüchtiger Browser-/Seitenzustand mit Startsnapshot, aktueller Frage, Antwortsequenz, Cycle-Snapshots und selektiertem Schritt; keine dauerhafte Ablage.
4. **Cycle Adapter:** dünne, deterministische Komposition für IDs/Zeitpunkte/Sequenzen und Aufruf der bestehenden Domainfunktionen. Keine Fachentscheidung und keine Supabase-Nutzung.
5. **Presentation Mapper:** kontrollierte deutsche Labels, Gruppierung und Reason-Code-Texte; keine Ableitung neuer Claims/Readiness.
6. **Conversation View und Inspector:** unterschiedliche Projektionen derselben unveränderten Cycle-Ergebnisse.

„Lokal“ bedeutet im MVP flüchtig innerhalb der Simulator-Session, nicht `localStorage`, Datenbank oder versteckte globale Registry. Ein Reload darf den Lauf verlieren. IDs/Zeitpunkte müssen aus dem Scenario Seed beziehungsweise einer vorab erzeugten deterministischen Sequenz kommen, nicht aus Zufall oder Uhr als fachlicher Input.

## 9. Route

Bewertet:

- `/admin/conversation-simulator`: kurzfristig flach und ähnlich zu heutigen Adminpfaden, aber schlecht erweiterbar.
- `/admin/intelligence/simulator`: passt zum geplanten Bereich „Administration → Intelligence“ und lässt Quality Review, Wissensbasis, offene Fragen, Metriken und Regression Cases konsistent folgen.

**Technische Empfehlung:** `/admin/intelligence/simulator`. Die aktuelle Navigation besitzt noch keine gruppierte Intelligence-Struktur; AP-15-04-01 darf einen ausschließlich für Admin sichtbaren Intelligence-Einstieg ergänzen. Direkter URL-Aufruf muss serverseitig ebenfalls abgewiesen werden; versteckte Navigation allein ist keine Zugriffskontrolle. Kein öffentlicher Zugriff und kein Kundenlogin.

## 10. Permissions

Geplante, getrennte Capability-Begriffe:

| Permission | Bedeutung | MVP-Empfehlung |
|---|---|---|
| `canUseConversationSimulator` | synthetischen Lauf starten, beantworten, resetten/replayen | nur `admin` |
| `canViewConversationIntelligenceDebug` | technische Keys, IDs, Proposals, Scores und Stepdetails sehen | nur `admin` |
| `canReviewConversationOutcome` | Ergebnis fachlich beurteilen/Quality Issue erzeugen | später nach Review-Workflow; im Simulator-MVP nicht vergeben |

`reviewer` wird nicht automatisch freigeschaltet: Die technische Rolle beweist weder Fachkompetenz noch Freigabemandat. Keine neue Datenbankrolle. Später kann derselbe Role Mapper `reviewer` einzelne Capabilities geben; verbindliche Knowledge-Freigabe bleibt zunächst Admin. Unauthenticated wird serverseitig zum bestehenden Authpfad abgewiesen.

## 11. Layout

**Desktop:** responsives Zwei-Spalten-Raster. Der flexible Hauptbereich enthält Szenariokopf, Conversation-Verlauf, aktuelle Frage, vertragsgeleitete Antwortsteuerung und Reset. Der rechte, breitere Inspector ist sticky nur soweit barrierearm und zeigt Readiness, State, Missing Information, Claims, Annahmen, Widersprüche, Site Checks, Planner, Retry/Effort und Events.

**Kleine Bildschirme:** Conversation bleibt zuerst; Inspector folgt als Tastatur-bedienbare Tabs oder native einklappbare Bereiche. Kritische Hinweise (Widerspruch, Site Check, Human Review) dürfen nicht ausschließlich in einem geschlossenen Panel verborgen sein. Horizontale State-Diffs werden gestapelt. Fokus springt nach einem Cycle zur Ergebniszusammenfassung, nicht unkontrolliert ans Seitenende.

## 12. Conversation View

Die chatartige Darstellung verwendet keine WhatsApp-/Meta-Marke und simuliert keinen Versandstatus. Sichtbare Typen:

- **Systemfrage:** gerenderte registrierte Interaction samt optionaler Hilfe;
- **Testerantwort:** synthetische Eingabe, klar als Tester markiert;
- **Zwischenstand:** Assessment mit Annahmen, Grenzen und nächstem Ziel;
- **Site-Check-Hinweis:** remote ungeklärter Vor-Ort-Prüfpunkt;
- **Human-Review-Hinweis:** kontrollierter interner Übergabestatus, keine Kundenfrage.

Jeder Eintrag bindet intern Stateversion und Cycle-Schritt. Technische IDs bleiben im Debugmodus. Fehlgeschlagene Cycle-Versuche erscheinen als interne Fehlerkarte und nicht als erfolgreiche Testerantwort.

## 13. Answer Input

Die Steuerung wird ausschließlich aus dem vorhandenen `AnswerContract` der gerenderten Interaction projektiert:

| Vertrag | Steuerung | Grenze |
|---|---|---|
| `text` | beschriftetes Textfeld | Domainnormalisierung entscheidet Gültigkeit; UI trimmt/erfindet keine Fachbedeutung |
| `boolean` | kontrollierte Ja-/Nein-Optionen | stabile Optionwerte, keine freie Interpretation |
| `approximate_number` | Text- oder numerisch geeignete Eingabe mit sichtbarer Einheit | grob/exakt gemäß Vertrag; keine UI-Berechnung |
| `unknown` | explizite Aktion „Weiß ich nicht“ | eigenes Outcome, kein leerer Wert |
| `skip` | explizite Aktion „Überspringen“, nur wenn erlaubt | vom Unknown getrennt |

Es gibt keine zweite fachliche Validierung. Clientseitige Hinweise dürfen nur den Vertrag spiegeln; die Domainnormalisierung bleibt autoritativ und ihr strukturierter Fehler wird verständlich gemappt. Senden ist gegen Doppelauslösung gesperrt, aber es wird keine persistente Exactly-once-Garantie behauptet.

## 14. Step Mode

Geplanter Expertenpfad:

1. Raw Answer
2. Normalized Answer
3. Interpretation Proposal
4. State Transition
5. Recalculation (Retry/Effort, Missing Information, Readiness, Assessment)
6. Planner
7. Render

**Empfehlung:** Normalmodus führt immer den vollständigen `runConversationCycle` aus. Im ersten MVP sind die sieben Stufen nur als nachträglich inspizierbare, read-only Pipeline sichtbar; kein manuelles „Commit“ zwischen Stufen. Ein echter pausierbarer Step Runner folgt in AP-15-04-02, weil er Zwischenzustand, Fehlerfortsetzung und Invarianten deutlich verkompliziert. So bleibt Fehlerlokalisierung möglich, ohne eine zweite Orchestrierung einzuführen.

## 15. Knowledge State Inspector

Die fachliche Ansicht gruppiert nach **Projekt**, **Raum** und **Installation**. Pro Claim zeigt sie:

- verständliches Property-Label und formatierten Wert, zum Beispiel „Raumgröße — ≈ 25 m²“;
- epistemischen Status (Kundenangabe, angenommen, unbekannt, bestätigt);
- Evidence-Typ, State Version und aktiv/historisch;
- Supersessionbeziehung und Widerspruchsmarker.

Aktiv bedeutet „wirksam nach vorhandenen Domainregeln“, nicht „technisch wahr“. Historische Claims werden nicht entfernt. Debugmodus ergänzt `property_key`, Entity-/Claim-/Evidence-IDs, Actor-/Evidence-Status und rohe schema-validierte JSON-Projektion. UI-Labels sind Mapper, keine neuen Domainwerte.

## 16. State Diff

Nach jedem erfolgreichen Cycle zeigt ein kompakter Vergleich **Vorher → Nachher**:

- vorherige/neue State Version;
- neue Claims;
- supersedierte Claims mit Vorgänger/Nachfolger;
- neue Unknowns und Annahmen;
- neue beziehungsweise weiterhin offene Widersprüche.

No-change zeigt ausdrücklich „Knowledge State unverändert“, während Retry/Effort oder Planner sich dennoch verändert haben können. Der Diff wird aus zwei gespeicherten lokalen Snapshots berechnet und darf die Domainobjekte nicht mutieren. Keine komplexe Git-Diff-Oberfläche. **State Diff gehört in den ersten MVP**, da Versionstransparenz Kernziel ist.

## 17. Readiness

Die Ansicht nennt aktuelles Level und nächstes Ziel, zum Beispiel „Level 2 — Vorläufige Systemeinordnung“ und „Nächstes Ziel: Level 3 — Vorläufige Installation“. Keine Prozent-Confidence.

Dimensionen: Bedarf, Dimensionierung, Innenposition, Außenposition, Leitungsweg, Kernbohrung, Kondensat, Elektro und Zugänglichkeit. Je Dimension werden vorhandener diskreter Status, Blocker, Annahmen und Site Checks gezeigt. Nicht im aktuellen Domainvertrag vorhandene Dimensionen dürfen als „im Vertrag nicht bewertet“ erscheinen, niemals aus UI-Heuristik berechnet werden.

## 18. Missing Information

Offene Informationen werden gemäß vorhandener Domainpriorität dargestellt mit:

- fachlichem Label und Entitätskontext;
- Wichtigkeit und blockiertem Level;
- strukturiertem Reason Code;
- „Annahme möglich?“ und „Site Check möglich?“;
- kontrollierter Antwort auf „Warum fragt die Engine danach?“.

Die Warum-Erklärung ist ein versionierter Mapper von Reason Code zu kurzem Fachtext. Keine freie Begründung, Modellgedanken oder Chain-of-Thought. Unbekannt und bewusst übersprungen bleiben sichtbar, auch wenn beide Information offenlassen.

## 19. Planner Inspector

Pflichtfelder im MVP:

- ausgewählte nächste Aktion oder Stop Reason;
- Information Key (fachlich gelabelt, technisch optional);
- Template Key/Version, Priority Band;
- diskretes Score Breakdown;
- Retry Count und Customer Effort;
- Reason Codes und Bindung an State Version.

Der Score ist sichtbar, aber ausdrücklich Rankinghilfe, keine Confidence oder fachliche Wahrheit. Top verworfene Kandidaten mit Ranking und `Ineligibility Code` sind wertvoll, jedoch standardmäßig nur Debug und für AP-15-04-02 vorgesehen; AP-15-04-01 zeigt sie nur, falls der bestehende Plannerresultat-Vertrag sie ohne Neuberechnung bereits vollständig liefert. Keine versteckten Modellgedanken.

## 20. Events

Die lokale Timeline kann folgende vorhandene Eventtypen darstellen:

- `customer_answer_interpreted`
- `knowledge_claim_recorded`
- `knowledge_claim_superseded`
- `answer_unknown_recorded`
- `answer_skipped`
- `assumption_confirmed`
- `assumption_rejected`
- `assumption_deferred`
- `human_review_requested`
- `conversation_cycle_completed`

Fachansicht zeigt Label, Reihenfolge, Statebezug und minimales Ergebnis; Debug ergänzt Event-ID, Sequenz, Correlation-/Cycle-ID. Keine PII, Rohantwort, Adresse, Kontaktangabe, URL, Prompt oder Providerdaten. Die Timeline im ersten MVP ist lokal und gehört zum Cycle-Nachweis; sie behauptet keinen persistenten Audit Log.

## 21. Retry / Effort

Der Inspector trennt je Need Versuchszahl, Maximum, letztes Outcome (`answered`, `unknown`, `skipped`, `invalid`, `ignored`, `superseded`) und Reopen-Status von den aggregierten Customer-Effort-Werten. Sichtbar sind technische Folgefragen, unbeantwortete Fragen, Wiederholungen, optionale Fotobelastung als künftig/nicht aktiv und Cap-Status.

Es gibt keinen Prozentwert, keine psychologische Bewertung und keine UI-eigene Erhöhung. Die Ansicht erklärt kontrolliert, warum nach Retrylimit ein alternativer Pfad, Site Check, Zwischenstand oder Human Review folgt.

## 22. Reset / Replay

- **Reset Scenario (MVP):** verwirft ausschließlich den flüchtigen lokalen Lauf und stellt exakt das gewählte Startfixture wieder her; Bestätigungsdialog bei vorhandenen Schritten.
- **Restart from Step (später):** kopiert den Snapshot vor einem ausgewählten Schritt in einen neuen lokalen Branch des Laufs; bestehende Timeline bleibt zur Gegenüberstellung unverändert.
- **Replay (MVP read-only):** führt die gespeicherte lokale Antwortsequenz vom Startzustand mit denselben Fixture-IDs/-Zeitpunkten erneut aus und vergleicht erwartete Resultate. Eine veränderte Antwort erzeugt einen neuen Lauf, keine Historienmutation.

Reset ist kein Delete und löst keine Server-/Supabase-Mutation aus. Browserreload darf im ersten MVP alles verwerfen.

## 23. Fixtures

Aus vorhandenen synthetischen Normalisierungs-, Interpretations-, Transition-, Planner- und Cycle-Fixtures wird später ein kuratierter Katalog aufgebaut:

1. Minimaler Ein-Raum-Fall
2. Unbekannte Raumgröße
3. Widersprüchliche Angaben
4. Annahme nötig
5. Site Check nötig
6. Human Review
7. Retrylimit
8. Level 3 erreicht

Jedes Fixture besitzt stabilen Key/Version, deutsche Beschreibung, Zielphänomene, ausschließlich künstliche UUIDs/Werte und einen vollständigen validierten Startvertrag. „Leeres Projekt starten“ wird zusätzlich empfohlen: ein minimaler synthetischer State ohne Production-Projekt-ID oder Supabase-Auswahl. „Leer“ heißt schema-valider Baseline-State, nicht untypisiertes `{}`.

## 24. Reproduzierbarkeit

Planungsvertrag für späteren Export (keine Implementierung):

```text
ScenarioFixture
  scenario_key, scenario_version, title, description
  engine_contract_version, planner_version, template_versions
  deterministic_seed
  initial_knowledge_state, initial_retry_state, initial_customer_effort_state
  initial_selected_action, initial_rendered_interaction
  answer_sequence[]
    step_key, raw_answer, normalized_answer?, injected_ids, occurred_at, sequence_start
  expectations[]
    step_key, state_version, readiness_level, readiness_dimensions
    planner_action_or_stop, template_key?, event_types?, expected_error_code?
```

Export enthält keine Sessionidentität, PII oder echte Quellnachricht. Raw Answer ist nur synthetisch. Exakte Stateversionen, Readiness und Planneraktionen sind Mindestanforderung; Erwartungen können bewusst partiell sein, müssen aber versioniert werden. Kanonische Serialisierung, stabile Sortierung und Contractversionen ermöglichen späteren Regressionvergleich.

## 25. Fehler-Markierung

Eine Markierung ist fachlich sinnvoll, aber **nicht Teil von AP-15-04-01**, weil ohne Persistenz/Reviewworkflow ein Button falsche Dauerhaftigkeit suggeriert. AP-15-04-02 kann einen lokalen, exportierbaren Issue-Entwurf anbieten.

Planungsvertrag:

```text
QualityIssue
  issue_id, issue_version, category, severity, status
  scenario_ref, scenario_version, step_key, state_version
  planner_decision_ref, rule_version_refs[], template_version?
  structured_reason_codes[], concise_expert_note?
  expected_outcome_contract?, created_by, created_at
  reviewed_by?, reviewed_at?, resolution?, regression_case_ref?
```

UI-Auswahl „Fachlich falsch“, „Frage unverständlich“, „Frage zu früh“, „Frage zu spät“, „Falsche Annahme“, „Readiness falsch“, „Human Review nötig“, „Sonstiges“ wird auf die kontrollierten Kategorien in Abschnitt 31 gemappt; kein freier Typ.

## 26. Zukünftiger Intelligence Workspace

Zielbild unter `Administration → Intelligence`:

- Simulator
- Quality Review
- Wissensbasis
- Offene Fragen
- Metriken
- Regression Cases

Nur **Simulator** wird nach AP-15-04-01 sichtbar. Andere Einträge bleiben verborgen, bis Domain, Berechtigung, Persistenz, Datenschutz und Reviewprozess des jeweiligen Pakets implementiert und freigegeben sind. Keine leeren „Coming soon“-Seiten in produktiver Navigation.

## 27. Knowledge Base

Kein großes Freitextdokument als Regelquelle. Spätere Kategorien:

`installation_rule`, `safety_rule`, `question_rule`, `assumption_rule`, `readiness_rule`, `mapping_rule`, `photo_requirement`, `review_rule`, `offer_rule`, `knowledge_note`.

Planungsvertrag je Knowledge Item:

```text
KnowledgeItem
  knowledge_id, category, title
  structured_content
  status: draft | in_review | approved | deprecated | rejected
  version, source_type, source_reference?
  created_by, reviewed_by?
  created_at, updated_at, effective_from
  supersedes?
```

`structured_content` ist kategoriespezifisch, streng validiert und versionsgebunden; weder beliebiger ausführbarer Text noch Prompt. `approved` bedeutet fachlich freigegeben, nicht automatisch deployed. `source_reference` darf keine PII oder unkontrollierte externe Inhalte duplizieren. Knowledge Base ist in diesem Audit ausschließlich Zielbild.

## 28. Expertenwissen-Workflow

Empfohlener Ablauf für Laurie:

`Neue Erkenntnis → Knowledge Draft → strukturierte Kategorie → Beispiel/Begründung → synthetische Testfälle → Review → Admin-Freigabe → neue unveränderliche Version → Regressionstest → gesonderte Aktivierung`.

Laurie darf Fachwissen schnell als Draft erfassen und kommentieren, aber nicht direkt eine Production-Regel überschreiben. Bestehende technische Rolle und fachliche Expertenqualifikation sind getrennt. Reviewer kann später Fälle prüfen und Drafts kommentieren, wenn Capability und Fachmandat festgelegt sind. Für verbindliche Knowledge-Freigabe bleibt im MVP Admin erforderlich; sicherheitsrelevante Regeln sollten Vier-Augen-Prinzip plus benannten Fachowner erhalten.

## 29. Alte Chats

Langfristiger, separat zu auditierender Workflow:

`kontrollierter Import → Rechtsgrundlage/Retention/Access und PII-Behandlung → Redaction/Pseudonymisierung → strukturierte Conversation → fachliche Aussagen als Candidates → menschliches Review → freigegebene Knowledge Items und/oder Regression Cases`.

Alte Chats ändern niemals automatisch die Knowledge Base. Extraktion, auch wenn später KI-unterstützt, bleibt Vorschlag und muss Quellenbindung, Version und menschliche Entscheidung tragen. Productionfälle dürfen nur nach eigener Owner-/Datenschutzentscheidung, belastbarer Anonymisierung und Zweckbindung in Regression Cases überführt werden. Dieses Audit importiert keinen Chat und implementiert keine Extraktion/KI.

## 30. Open Questions

Zentrale fachliche Fragen verhindern, dass Unsicherheit als implizite Regel endet. Beispiele: ausreichende Remote-Stromangabe, zwingende Site Checks für Außenpositionen, sichere Annahmen, ausreichende Fotos und Monteurübernahme.

```text
OpenQuestion
  question_id, category, title, description
  severity: low | medium | high | critical
  status: open | investigating | resolved | deferred
  linked_rules[], linked_cases[], owner
  resolution?, created_at, resolved_at?
```

Eine Resolution wird nicht automatisch Regel: sie kann einen Knowledge Draft und Regression Case auslösen. Critical Fragen blockieren betroffene Freigabe, bis eine dokumentierte Entscheidung oder sichere Deaktivierung existiert.

## 31. Quality Issues

Geschlossene spätere Kategorien:

`wrong_question`, `question_too_early`, `question_too_late`, `wrong_interpretation`, `wrong_claim`, `wrong_assumption`, `wrong_readiness`, `missed_contradiction`, `missed_site_check`, `unnecessary_human_review`, `missing_human_review`, `bad_customer_wording`, `other`.

Jedes Issue bindet mindestens Scenario/Version, Step/State Version, Planner Decision und alle wirksamen Rule Versions. Kritisch sind zunächst Safety-Verletzung, fehlender notwendiger Human Review, verpasster zwingender Site Check, unterdrückter Widerspruch sowie jede falsche Aussage, die technische oder Angebotsfreigabe vortäuscht. Die endgültige Kritikalitätsmatrix bleibt Owner-/Fachentscheidung.

## 32. Quality Metrics

Keine globale „AI Accuracy“: Der Cycle ist deterministisch und die fachlichen Fehlerarten haben unterschiedliche Nenner und Risiken. Später zu definieren:

- `question_acceptance_rate`, `answerable_question_rate`, `unknown_rate`, `skip_rate`, `retry_rate`;
- `human_review_rate`, `site_check_rate`, `contradiction_rate`;
- `wrong_question_rate`, `wrong_interpretation_rate`, `wrong_claim_rate`, `wrong_readiness_rate`;
- `expert_correction_rate`, `regression_failure_rate`;
- `target_readiness_completion_rate`, `average_questions_to_level_3`.

Jede Metrik braucht Population, Zeitraum, Mindeststichprobe, Reviewstatus, Segmentierung, Versionen und Ausschlüsse. Keine Prozentanzeige ohne ausreichend geprüfte Stichprobe; absolute Zahlen und „unzureichende Daten“ sind dann ehrlicher.

Für die letzten 100 tatsächlich geprüften Fälle: ohne Korrektur, kleinere Korrektur, fachlich relevante Korrektur, sicherheitsrelevante Korrektur; außerdem Top Fehlerursachen, Knowledge Gaps, Human-Review-Gründe und Unknowns. „100“ ist ein Fenster, kein Garant statistischer Aussagekraft. In diesem Paket werden keine Metriken implementiert oder berechnet.

## 33. Rule Impact

Jede spätere Plannerentscheidung, Quality Issue und jeder Regression Case muss die tatsächlich wirksamen Knowledge-/Planner-/Template-/Mapping-/Readiness-Versionen referenzieren. Ändert sich beispielsweise Rule Version 3, kann ein Impact Index betroffene Regression Cases, historische Planner Decisions und Quality Issues finden.

Versionen sind unveränderlich; eine Änderung erzeugt Version 4 mit `supersedes`, Effective Date und Reviewentscheidung. Impactanalyse zeigt Betroffenheit, führt aber weder automatische Migration noch Regelaktivierung aus. Ohne diese Referenzen darf die Knowledge Base nicht Production-Quelle werden.

## 34. Rollen / Expert Review

- **Admin:** Simulator und Debug im MVP; später Knowledge-Freigabe/Activation nur nach definiertem Gate.
- **Reviewer (technische Rolle):** heute vorhandene Approlle mit ausgewählten Projekt-/Notizrechten, kein impliziter Fachexperte. Simulatorzugriff und Outcome Review erst nach Capability-Entscheidung.
- **Fachexperte:** Qualifikation/Mandat, kein neuer Datenbankrollenwert in diesem Audit. Kann Laurie fachlich beschreiben, muss aber über bestehende Rolle plus explizite Capability abgebildet werden.

Später kann Reviewer Fälle und maschinelle Vorschläge prüfen sowie Drafts kommentieren. Verbindliche Knowledge-Freigabe bleibt zunächst Admin; bei Safety sind benannter Fachreview und gegebenenfalls Vier-Augen-Freigabe zusätzlich nötig. Keine automatische Angebotsfreigabe.

## 35. UX-Zielbild

Die bestehende flache Administration entwickelt sich schrittweise:

```text
Administration
├─ Medien-Inventur
├─ Benutzer & Rollen
└─ Intelligence
   ├─ Simulator
   ├─ Quality Review
   ├─ Wissensbasis
   ├─ Offene Fragen
   ├─ Metriken
   └─ Regression Cases
```

AP-15-04-01 ergänzt nur den Admin-sichtbaren Simulator. Fachliche Defaultansicht verwendet deutsche Labels und Progressive Disclosure; Debugkeys, IDs, JSON, Scores und verworfene Kandidaten liegen im Expertenmodus. Warnungen nutzen Text/Icon zusätzlich zu Farbe, Tabellen besitzen mobile Alternativen und alle Controls eindeutige Labels/Fokuszustände.

## 36. Ownerentscheidungen

Die Empfehlungen sind technische Vorschläge, **keine ungefragte Finalisierung**:

| # | Ownerentscheidung | Technische Empfehlung |
|---:|---|---|
| 1 | Route? | `/admin/intelligence/simulator` |
| 2 | Admin oder Reviewer? | MVP Admin-only; Reviewer erst nach Fachmandat/Capability |
| 3 | Chat + Inspector oder Debug-only? | Variante D, Chat + optionaler Inspector |
| 4 | Standard fachlich oder technisch? | fachlich, Debug per explizitem Toggle |
| 5 | Step Mode im MVP? | vollständiger Cycle automatisch; Stufen read-only inspizierbar, pausierbar später |
| 6 | State Diff im MVP? | ja, kompakter fachlicher Diff |
| 7 | Event Timeline im MVP? | ja, PII-freie lokale Events |
| 8 | Planner Score sichtbar? | ja im Inspector, diskret und als Ranking erklärt |
| 9 | verworfene Candidates? | später/Debug; nur wenn vorhandener Vertrag sie liefert |
| 10 | Fixtures auswählbar? | ja, kuratierte synthetische Szenarien |
| 11 | leerer synthetischer Start? | ja, schema-valider künstlicher Baseline-State |
| 12 | Reset? | ja, rein lokal |
| 13 | Replay? | ja, deterministisch read-only; Branching später |
| 14 | Scenario Export? | später in AP-15-04-02 nach geplantem Vertrag |
| 15 | Fehler markieren im Simulator-MVP? | nein; separater lokaler Issue Draft/Quality-Workflow |
| 16 | Quality Workspace sofort? | später nach AP-15-05-00 |
| 17 | Knowledge Base sofort? | später, eigener Domain-/Security-Scope |
| 18 | Knowledge-Kategorien? | vorgeschlagene zehn Kategorien fachlich einzeln bestätigen |
| 19 | Wer gibt Knowledge frei? | zunächst Admin plus benannter Fachreview; Safety Vier-Augen prüfen |
| 20 | Laurie ändert Regeln direkt? | nein, zunächst Draft → Review → Version → Regression |
| 21 | alte Chats importieren? | separates AP-15-06-Audit mit Datenschutz/Redaction/Human Review |
| 22 | relevante Metrics? | fehlerartspezifisch; primär Safety/Human Review/Site Check/Regression/Readiness |
| 23 | globale Fehlerrate? | nein |
| 24 | kritische Fehler? | Safety, fehlender Review/Site Check, versteckter Konflikt, falsche Freigabe; Matrix bestätigen |
| 25 | wann Regression Case? | reproduzierter relevanter Fehler oder freigegebene Regeländerung mit erwarteten Ergebnissen |
| 26 | anonymisierte Productionfälle? | nur später nach Datenschutz-, Anonymisierungs- und Ownerfreigabe; nie automatisch |

## 37. MVP-Empfehlung

**AP-15-04-01 — Internal Conversation Simulator**:

- Admin-only Route und Navigation;
- synthetischer Fixture-Katalog plus leerer synthetischer Start;
- ausschließlich flüchtige lokale Simulator Session;
- chatartige Conversation und vollständiger Domain-Cycle;
- Controls direkt aus Answer Contract;
- fachlicher Knowledge State Inspector und kompakter State Diff;
- Missing Information, Readiness, Assessment und Plannerentscheidung;
- lokale Events, Retry/Effort, Reset und deterministischer Replay;
- read-only Step-Inspektion; technische Details per Debugtoggle.

Explizit ausgeschlossen: Persistenz, Quality-Markierung/-Datenbank, Knowledge Base, Metriken, Production-Daten, Supabase, KI/LLM/Vision, WhatsApp, Fotos sowie Preis-/Angebotslogik. Falls der Scope weiter verkleinert werden muss, fällt echter Replay vor State Diff/Event Timeline heraus; Reset und Cycle-Nachvollziehbarkeit bleiben Pflicht.

## 38. Teststrategie

Spätere Tests, **nicht in diesem Audit implementiert oder ausgeführt**:

- **Access:** Admin erlaubt; Reviewer und Unauthenticated serverseitig abgewiesen; Navigation entsprechend verborgen.
- **Simulator:** Fixture laden, Frage anzeigen, kontrollierte Antwort senden, Cycle ausführen, neue Frage, Reset, Replay und identisches Ergebnis.
- **Inspector:** Claim/Unknown/Assumption/Supersession/Contradiction, Missing Information, Readiness, Planner, Events, Retry und Effort korrekt aus Domainresultat.
- **Versionen:** vorher/nachher State, Assessmentversion und Planner-Stateversion exakt gebunden.
- **Errors:** invalid answer, stale state, Human Review, no eligible candidate, Retrylimit, Renderfehler und keine partielle UI-Übernahme.
- **Security:** keine Production-Auswahl/-Daten, keine Supabase-Mutation, echte Nachricht, WhatsApp, KI, PII oder Secret.
- **Architecture:** bestehende Domain Engine wiederverwendet; keine zweite Fachlogik, Persistenz, globale Mutable Registry oder neue Dependency; keine `package.json`-Änderung.
- **Accessibility/UX:** Labels, Tastatur, Fokus, semantische Statushinweise, mobile Inspector-Navigation und Fehlerankündigung.

Fixtures müssen ausschließlich synthetisch, tief unverändert und versionsgebunden sein. Unit-/Component-/Access-Tests dürfen nicht über Snapshot-only-Assertions fachliche Regeln duplizieren.

## 39. Production Gates

Vor produktionsnaher Nutzung oder Zugriff außerhalb des Admin-Entwicklungskreises:

1. Ownerentscheidungen 1–26 dokumentiert.
2. AP-15-04-01 separat implementiert/reviewt; Access serverseitig getestet.
3. Nachweis, dass Cycle/Normalizer/Planner/Renderer alleinige Fachautorität bleiben.
4. Ausschließlich synthetische Fixture-Allowlist und keine Production-Projektauswahl.
5. Fehler-, stale-, Retry-, Stop-, Site-Check- und Human-Review-Pfade vollständig sichtbar.
6. Reproduzierbarkeit über Engine-/Rule-/Templateversionen und injizierte IDs/Zeitpunkte nachgewiesen.
7. Keine Persistenz, Telemetrie oder Export ohne separates Daten-/Security-/Retention-Design.
8. Quality/Knowledge-Funktionen erst nach AP-15-05-00 und eigener Rollen-/Freigabearchitektur.
9. Historische Chats erst nach AP-15-06 inklusive Datenschutz, Rechtsgrundlage und Redaction.
10. Foto, Vision, LLM und WhatsApp ausschließlich nach ihren separaten Audits/Gates.
11. Keine automatische technische, Knowledge- oder Angebotsfreigabe.
12. Accessibility, responsive UX, Typecheck, Lint und spätere vorgesehene Tests erfolgreich.

## 40. Folgepakete

Die bestehende Auditroadmap verwendete ältere, inzwischen überholte Zuordnungen für AP-15-04/AP-15-05. Da der pure Cycle bereits bis AP-15-02-03-03 umgesetzt ist und dieser Auftrag AP-15-04-00 festlegt, wird folgende vorwärtsgerichtete Sequenz empfohlen; alte Dokumente werden nicht rückwirkend geändert:

| Paket | Inhalt | Grenze |
|---|---|---|
| AP-15-04-01 | Internal Conversation Simulator | lokal, synthetisch, Admin-only; keine Persistenz |
| AP-15-04-02 | Simulator Expert Debug and Regression Case Capture | zunächst Export-/Capture-Vertrag; keine automatische Productionübernahme |
| AP-15-05-00 | Intelligence Knowledge and Quality Workspace Audit | Audit, keine Implementierung |
| AP-15-05-01 | Knowledge Base Domain Baseline | versionierte Verträge, noch keine automatische Regelaktivierung |
| AP-15-05-02 | Quality Review Workflow | Rollen, Issues, Reviewentscheidung |
| AP-15-05-03 | Open Questions Workflow | Fragen, Verknüpfung, Resolution |
| AP-15-05-04 | Quality Metrics Baseline | Definitionen/Nenner/Mindeststichprobe |
| AP-15-06 | Historical Conversation Learning Audit | Datenschutz, Import, Candidates; keine Auto-Lernstrecke |
| AP-15-07 | Photo Request Planner | kontrollierte Fotoanfrage, keine Visionbestätigung |
| AP-15-08 | Vision Analysis Contract | Vorschlagsvertrag, keine autonome Wahrheit |
| AP-15-09 | LLM Language / Extraction Layer | begrenzter Adapter, keine Fach-/Preisautorität |
| AP-16-00 | WhatsApp Transport Audit | Transportaudit, keine fachliche Engineänderung |

Persistenz/RLS/Retention für echte Conversations sowie Preis-/Offer-Integration benötigen weiterhin eigene, ausdrücklich freigegebene Pakete.

## 41. Kleinstes nächstes Paket

**AP-15-04-01 — Internal Conversation Simulator.** Kleinster belastbarer Schnitt: Admin-only `/admin/intelligence/simulator`; kuratierte synthetische Fixtures; flüchtige lokale Session; chatartige Darstellung; vollständiger bestehender Cycle; Answer-Contract-Controls; Knowledge/State-Diff/Missing/Readiness/Assessment/Planner/Event/Retry-Effort-Inspektoren; Reset; deterministischer Replay; fachliche Defaultansicht mit read-only Debugdetails.

Nicht enthalten: pausierbarer Step Runner, persistenter Export, Quality Issue Capture, Regression-Datenbank, Knowledge Workspace, Metriken, Production-Projekte, Supabase, KI, Vision, WhatsApp oder Angebote. Umsetzung beginnt erst nach Ownerentscheidung; dieses Audit ist keine Implementierungsfreigabe.

## 42. Status

- **PURE CONVERSATION CYCLE — IMPLEMENTED**
- **INTERNAL CONVERSATION SIMULATOR — NOT IMPLEMENTED**
- **SIMULATOR PERSISTENCE — NOT IMPLEMENTED**
- **QUALITY REVIEW WORKSPACE — NOT IMPLEMENTED**
- **KNOWLEDGE BASE — NOT IMPLEMENTED**
- **OPEN QUESTIONS WORKFLOW — NOT IMPLEMENTED**
- **QUALITY METRICS — NOT IMPLEMENTED**
- **HISTORICAL CHAT LEARNING — NOT IMPLEMENTED**
- **PHOTO REQUEST PLANNER — NOT IMPLEMENTED**
- **VISION ANALYSIS — NOT IMPLEMENTED**
- **AI / LLM LAYER — NOT IMPLEMENTED**
- **WHATSAPP INTEGRATION — NOT IMPLEMENTED**
- **OFFER GENERATION — NOT IMPLEMENTED**
- **OVERALL PRODUCT — NOT PRODUCTION READY**

**Auditstatus: READY FOR OWNER DECISION.** Ausdrücklich nicht `APPROVED FOR IMPLEMENTATION` und nicht Production Ready.

## 43. Scope-Bestätigung

Dieses Paket enthält ausschließlich die neue Auditdatei und damit ausschließlich Audit, Analyse, Architektur-/UX-Planung und Dokumentation. Es enthält ausdrücklich:

- keine Simulatorimplementierung, UI-Komponente, Route, Action oder Service;
- keine Persistenz, Migration, SQL, RPC, RLS-/Grant-Änderung oder Supabase-Nutzung;
- keine implementierte Knowledge Base, Quality-Datenbank, Analytics, Fehlerrate oder Quality Metrics;
- keine alten Chatimporte und keine echten Kunden-/Production-Daten;
- keine KI-, LLM-, Vision-, Foto- oder WhatsApp-Integration;
- keine Preis-/Angebotslogik oder automatische Freigabe;
- keine Tests, Teständerungen oder Ausführung von Anwendungstests;
- keine externe Abhängigkeit und keine `package.json`-Änderung.

Alle Datenverträge, Routes, Permissions, Layouts und Workflows sind ausschließlich Planungsartefakte. Der nächste zulässige Schritt ist eine dokumentierte Ownerentscheidung und danach ein separates Implementierungspaket.

## AP-15-04-01 Internal Conversation Simulator Result

### Ownerentscheidungen, Zugriff und Architektur

Die verbindlichen Ownerentscheidungen wurden für den ersten MVP umgesetzt: Der Simulator liegt unter `/admin/intelligence/simulator`, ist ausschließlich für `admin` freigeschaltet und weist `reviewer`, fehlende Sessions, fehlende beziehungsweise ungültige Profile fail closed ab. Die zentrale Capability `canUseConversationSimulator` ist die einzige Sichtbarkeitsregel des neuen Administration-Navigationseintrags. Es wurde keine Rolle ergänzt.

Die Route bleibt eine Server Component und übernimmt ausschließlich Session-, Profil- und Rollenprüfung. Die interaktive `ConversationSimulator`-Client-Insel erhält keine Produktionsdaten und lädt keine Projekte oder Conversations. Szenario, Knowledge State, Retry State, Customer Effort, Transcript, letzter Cycle, Cycle-Historie, Interaction, Events, State-Versionen, Debugstatus, Pendingstatus und Fehlerstatus existieren ausschließlich als flüchtiger React-State. Es gibt weder Server Action noch Netzwerk- oder Supabase-Simulatorquery, Cookie-, URL-, Browser-Storage- oder Datenbankpersistenz.

### Scenario Fixtures, Empty Start und Conversation View

Die schmale UI-Registry bietet die acht statischen synthetischen Szenarien `minimal_room`, `unknown_room_area`, `contradictory_room_area`, `assumption_required`, `human_review_required`, `retry_limit`, `level_3_reached` und `empty_synthetic_project` mit deutschen Labels. IDs und Zeitpunkte stammen aus festen synthetischen Namensräumen und einer deterministischen Timeline. Gleiche Fixture und Antwortsequenz erzeugen denselben Domainoutput. Der schema-valide leere Start verwendet den bestehenden Domainvertrag mit leerer Claimliste und einer kontrolliert gerenderten initialen Raumfrage; es wurde keine UI-Sonderfachlogik in die Engine eingebaut.

Die responsive Hauptansicht verbindet eine chatartige Conversation View mit dem Intelligence Inspector. Systemfrage, Testerantwort und kontrollierte End-/Reviewhinweise sind fachlich getrennt; es gibt keine Provider-, Telefonnummern-, Versandstatus- oder WhatsAppdarstellung. Die aktuelle Interaction zeigt Haupttext, Hilfetext, Beispiele und Answer Options. Nicht kunden-sichtbare Actions werden nicht als normale Kundenfrage dargestellt.

### Answer Controls und Domain Cycle Integration

Text-, Boolean-, Approximate-Number-, Unknown-, Skip- und Assumption-Optionen werden ausschließlich aus dem vorhandenen `AnswerContract` gerendert. Die UI erzeugt einen schmalen `RawCustomerAnswer`, ruft die bestehende autoritative `normalizeCustomerAnswer`-Funktion auf und übergibt das normalisierte Ergebnis an `runConversationCycle`. Der vollständige bestehende Cycle läuft atomar nach jeder Antwort. Es gibt keinen manuellen Step Executor, keine zweite Interpretation, keine eigene Preis-, Readiness-, Missing-Information- oder Plannerlogik und keine künstliche Verzögerung. Eine synchrone Ref-Sperre verhindert lokalen Doppelsubmit.

### Inspector, Diff, Readiness und Planner

Der fachliche Inspector enthält Übersicht, gruppierbare Knowledge Claims mit verständlichen Property- und epistemischen Statuslabels, State Diff, Readiness, offene Informationen, Planner, Retry/Aufwand, Event Timeline, read-only Pipeline und Debugansicht. Aktive Claims, Unknowns, Annahmen, Widersprüche und Site-Check-Punkte werden aus den Domainresultaten dargestellt. Der Diff nutzt die vom Cycle gelieferten Previous-/Current-State-Versionen und zeigt No-change ausdrücklich; er ist keine freie fachliche Diff-Engine.

Readiness zeigt das diskrete aktuelle Level, Ziel Level 3 sowie vorhandene Dimensionstatus und Blocker ohne Prozent-Confidence. Missing Information bleibt in der bestehenden Domainreihenfolge und zeigt Importance, blocks_level, Reason, Annahme- und Site-Check-Fähigkeit. Der Planner Inspector zeigt ausgewählte Action beziehungsweise Stop, Priority Band und Score. Der Score ist ausdrücklich als „Interner Rankingwert – keine Sicherheitsschätzung“ gekennzeichnet. Technische Information-/Template-Keys, Reason Codes, Score Breakdown und rohe begrenzte Objekte bleiben Debugdetails.

Retry Items zeigen Attempts und Last Outcome; Customer Effort zeigt technische Folgefragen, unbeantwortete und wiederholte Fragen sowie die kontrollierten Grenzen von zwei Versuchen und vier technischen Folgefragen. Events werden chronologisch mit deutschen Labels dargestellt. Event-ID, Correlation-ID, Sequence und State-Versionen sind nur im Debugmodus sichtbar. Die sieben Pipelinestufen Raw Answer, Normalized Answer, Interpretation, State Transition, Recalculation, Planner und Rendering sind read-only einklappbar und können nicht einzeln ausgeführt oder mutiert werden.

### Reset, Replay, Fehler und Human Review

„Szenario zurücksetzen“ löscht ausschließlich lokalen React-State und stellt das ursprüngliche Fixture wieder her. Der lokale Replay startet erneut am originalen Fixture, führt die gespeicherten synthetischen Raw Answers deterministisch durch Normalisierung und bestehenden Cycle und meldet „Replay stimmt überein“ oder „Replay weicht ab“. Es gibt keinen Export und keine Regression-Testpersistenz.

Ungültige Antwort, Cyclefehler und fachliche Stopzustände werden mit neutralen deutschen Texten kontrolliert angezeigt. Human Review wird prominent als „Dieser Fall benötigt eine fachliche Prüfung.“ behandelt und nicht als Kundenfrage fortgesetzt. Intermediate Result und Collection Stop werden als Zwischen- beziehungsweise Endzustand ohne Preis, Angebot oder Produktionsbehauptung präsentiert. Technische Fehlerobjekte erscheinen nur im expliziten Debugmodus.

### Accessibility und Tests

Formulare besitzen echte Labels, Controls sind tastaturbedienbar und haben sichtbare Fokuszustände. Die Simulatorregion nutzt `aria-busy`; normale Rückmeldungen verwenden `role=status`, Fehler `role=alert`, und die nativen `details`/`summary`-Accordions bleiben semantisch bedienbar. Das responsive Raster wird mobil einspaltig. Zustände werden textlich und nicht ausschließlich farblich unterschieden.

Fokussierte Vitest-Tests sichern Permission-Matrix, Adminnavigation und Route, statische synthetische Registry, leeren Start, Normalisierung, bestehenden Cycle-Aufruf, State-Version, Unknown, Widerspruch, Retry/Human-Review-Grenze sowie deterministischen Replayoutput. Architekturprüfungen bestätigen, dass Simulatorcode keine Production-Projekte, Persistenz, Server Action, externe Anfrage, KI, WhatsApp, Knowledge Base, Quality Metrics oder Paketänderung einführt.

### Explizite Grenzen und Status

- **PURE CONVERSATION CYCLE IMPLEMENTED**
- **INTERNAL CONVERSATION SIMULATOR IMPLEMENTED**
- **SYNTHETIC SCENARIO TESTING IMPLEMENTED**
- **KNOWLEDGE STATE INSPECTOR IMPLEMENTED**
- **READINESS AND PLANNER INSPECTOR IMPLEMENTED**
- **LOCAL RESET AND REPLAY IMPLEMENTED**
- **SIMULATOR PERSISTENCE NOT IMPLEMENTED**
- **QUALITY ISSUE CAPTURE NOT IMPLEMENTED**
- **KNOWLEDGE BASE NOT IMPLEMENTED**
- **OPEN QUESTIONS WORKFLOW NOT IMPLEMENTED**
- **QUALITY METRICS NOT IMPLEMENTED**
- **HISTORICAL CHAT LEARNING NOT IMPLEMENTED**
- **PHOTO REQUEST PLANNER NOT IMPLEMENTED**
- **VISION ANALYSIS NOT IMPLEMENTED**
- **AI / LLM LAYER NOT IMPLEMENTED**
- **WHATSAPP INTEGRATION NOT IMPLEMENTED**
- **OFFER GENERATION NOT IMPLEMENTED**
- **OVERALL PRODUCT NOT PRODUCTION READY**

## AP-15-04-01-01 Intermediate Result Lifecycle Production Finding

### Reproduziertes Symptom und Inspectorbefund

Nach der einmaligen Beantwortung der Leitungswegfrage blieb sie unter „Aktuelle Kundeninteraktion“ sichtbar und ihre Ja-/Nein-Controls blieben bedienbar. Ein weiterer Submit ergänzte dieselbe Systemfrage und eine weitere Testerantwort erneut im lokalen Transcript. Der Inspector belegte dagegen den korrekten Domainzustand: `line_route_known = true` lag als wirksamer, aus `customer_message` stammender Kunden-Claim vor und der Need `line_route_known` war aus `missing_information` entfernt.

Der reproduzierte erfolgreiche Cycle liefert `cycle_status = intermediate_result_ready`, ein `planner_result` der Art `stop_result` mit `stop.next_action_type = present_intermediate_result` und kein `rendered_interaction`. Dieses Ergebnis ist fachlich konsistent: Nach vier aufeinanderfolgenden technischen Fragen setzt der Planner den vorgesehenen Customer-Effort-Break. Er fragt den bereits erfüllten Leitungsweg-Need nicht erneut ab.

### Konkrete Root Cause

Die Ursache lag ausschließlich im lokalen Simulator-Lifecycle. `executeSimulatorAnswer` erzeugt absichtlich nur dann einen `next`-Context, wenn der aktuelle Planner eine `selected_action` und eine gerenderte Folgeinteraction liefert. `simulator-view.tsx` leitete die sichtbare Interaction jedoch direkt aus `context.interpretation_inputs.rendered_interaction` ab und ersetzte den Context nur bedingt mit `if (execution.next)`. Beim korrekten Planner-Stop fehlte `execution.next`; dadurch blieb der Context aus Cycle N mitsamt der bereits beantworteten Leitungswegfrage als scheinbar aktive Interaction in Cycle N+1 erhalten. Die Controls wurden allein aus dieser stale Interaction gerendert.

Zusätzlich ergänzte der Submit-Handler bei jeder Antwort die aus dem alten Context gelesene Systemfrage erneut im Transcript. Weil die stale Interaction weiter beantwortbar blieb, erzeugte jeder weitere Submit einen weiteren Eintrag derselben Frage. Es gab keinen Planner-Fallback auf diese Frage und keine Domainwiederholung; die Wiederholung entstand vollständig in UI-State und Transcriptprojektion.

### Fix und Regressionabsicherung

Der Simulator hält die aktive Kundeninteraction nun als explizit nullable lokalen Zustand. Jeder verarbeitete Cycle räumt sie zunächst ab. Nur ein aktuelles `selected_action` mit kundenfähigem `rendered_interaction` und `AnswerContract` setzt eine neue aktive Interaction und Controls. `intermediate_result_ready`, `human_review_required`, `collection_stopped`, Fehler sowie Planner-Stops behalten niemals die vorherige Frage. Ein `no_state_change` bleibt dabei kein impliziter Stop: Liefert der aktuelle Planner eine gültige neue Interaction, wird sie aktiv; stoppt er, bleibt sie gelöscht.

Das Transcript enthält jede tatsächlich ausgewählte Systeminteraction genau einmal: die initiale beziehungsweise neu gerenderte Interaction wird beim Aktivwerden eingetragen, bei der Antwort kommt nur die Testerantwort hinzu. Ohne neues Rendering wird kein alter Fragetext angehängt. Ein vorhandenes gerendertes Zwischenresultat würde als nicht beantwortbarer Statuseintrag verwendet; im reproduzierten Cycle ohne Rendering erscheint ausschließlich der neutrale Status „Zwischenstand erreicht“ zusammen mit den bereits vorhandenen Readiness- und Missing-Information-Daten. Human Review und Collection Stop erhalten eigene neutrale Statuseinträge und keine Answer Controls.

Die Regressionstests decken den vollständigen Leitungswegablauf, das Löschen der Interaction und Controls beim Zwischenstand, den Schutz vor erneutem Submit, die fehlende Transcriptduplikation, den normalen Wechsel auf eine andere Folgefrage und Human Review ab. Der Domainregressionstest validiert gesondert den wirksamen `line_route_known`-Claim, die Entfernung des Needs und den zulässigen `present_intermediate_result`-Stop. Damit bleiben Planner- und Simulator-Lifecycle-Fehler künftig eindeutig unterscheidbar.

Die bestehende Grenze von maximal vier aufeinanderfolgenden technischen Fragen bleibt unverändert. Es gibt weder Planner-, Knowledge-State-, Missing-Information-, Retry- noch Customer-Effort-Regeländerungen.

Eine Fortsetzung nach dem Zwischenstand bleibt eine offene Folgeentscheidung: Ein späteres Paket kann einen expliziten Control „Gespräch fortsetzen“ bewerten, der kontrolliert einen Customer-Effort-Break anwendet, den Planner erneut ausführt und den nächsten Themenblock startet. Dieses Paket implementiert weder diesen Control noch einen automatischen Plannerlauf oder einen versteckten Effort-Reset.

- **SIMULATOR STALE INTERACTION BUG — FIXED**
- **DOMAIN LINE-ROUTE CLAIM APPLICATION — VALIDATED**
- **MISSING-INFORMATION REMOVAL — VALIDATED**
- **PLANNER INTERMEDIATE RESULT STOP — PRESERVED**
- **POST-INTERMEDIATE CONTINUATION — NOT IMPLEMENTED**

## AP-15-04-01-02 Controlled Continuation After Intermediate Result

### Motivation und Conversation-Break-Semantik

Der Intermediate Result Break nach vier aufeinanderfolgenden technischen Fragen bleibt ein fachlicher, expliziter Gesprächsabschnitt. Er ist kein endgültiges Ende der lokalen Simulation und wird nicht automatisch übersprungen. Erst der Control „Gespräch fortsetzen“ schließt den Break ab; dabei wird keine Kundenantwort erzeugt oder interpretiert.

### Erlaubte und nicht erlaubte Continuation

Die pure Domainfunktion erlaubt die Fortsetzung ausschließlich nach einem schema-validen `stop_result` mit `next_action_type = present_intermediate_result`, `stop_reason = maximum_customer_effort_reached` und dem Reason Code `customer_effort_break`. Human Review, Site Visit, No Eligible Candidate, ein fachlich finales Target, stale State, Cycle Failure, Selected Action und jeder andere Stop führen zu einem kontrollierten Fehler. Es gibt keine stille Fortsetzung.

### Effort Reset, Knowledge- und Retry-Invarianten

Der Break setzt ausschließlich `consecutive_technical_questions` auf null und dokumentiert den injizierten Zeitpunkt in `last_break_at`. `unanswered_questions` und `repeated_questions` bleiben erhalten. Knowledge State einschließlich Claims, Evidence, Supersession und State Version sowie der vollständige Retry State einschließlich Attempts, Unknowns und Skips bleiben unverändert. Es werden keine Claims geschrieben und keine Versionen künstlich erhöht.

### Planner Recalculation und Version Invariant

Auf demselben Knowledge State werden Missing Information und Readiness mit den bestehenden Domainfunktionen abgeleitet, ein Intermediate Assessment auf derselben Version gebaut und der vorhandene Planner mit unverändertem Retry State sowie zurückgesetzter technischer Fragenfolge ausgeführt. Nur eine echte kundenfähige Selected Action wird über den bestehenden Template Renderer gerendert. Previous State Version, Continuation State Version, Assessment-Version, Planner-Version und Selected-Action-Version müssen identisch sein; Abweichungen führen kontrolliert zum Invariantenfehler. IDs und Zeitpunkte werden injiziert, ohne `Date.now` oder `Math.random`.

### Simulator UI und Transcript

Beim Status „Zwischenstand erreicht“ zeigt der Simulator den neutralen Hinweis „Der nächste Fragenblock kann jetzt gestartet werden.“ und den expliziten Button „Gespräch fortsetzen“. Eine synchrone Ref-Sperre und ein einmaliger Consumption Guard verhindern doppelte lokale Continuation-Läufe. Erfolg aktiviert genau die neu gerenderte Interaction und ergänzt einmal „Gespräch wird fortgesetzt.“ sowie einmal die neue Systeminteraction. Die alte Frage bleibt entfernt. Erneute Stops, Human Review und Fehler erhalten kontrollierte neutrale Darstellungen ohne Fake Answer, Netzwerk, Server Action oder Persistenz.

### Tests

Domain- und UI-Tests prüfen Intermediate Result → neue andere Frage, Deep Equality von Knowledge State und Claims, identische State Version, unveränderte Retry Attempts, den Erhalt unbeantworteter und wiederholter Fragen, Ablehnung von Human Review/finalem Target/anderen Resultaten und stale State, deterministischen Replay, fehlende alte Interaction, genau eine neue Transcriptinteraction sowie den Doppelklickschutz. Der bestehende Vier-Fragen-Break und die Regression gegen stale Interactions bleiben abgesichert.

### Grenzen und Status

Dieses Paket führt ausschließlich lokale, kontrollierte Fortsetzung nach einem Customer-Effort-Intermediate-Result ein. Es ändert weder Knowledge-/Missing-/Readiness-/Ranking-/Retry-/Interpretationsregeln noch die Grenze von vier technischen Folgefragen. Es ergänzt keinen persistenten Eventtyp, keine Persistenz, Datenbank, Supabase-Simulatorquery, KI, WhatsApp, Knowledge Base, Metrics oder Abhängigkeit.

- **INTERMEDIATE RESULT BREAK — IMPLEMENTED**
- **CONTROLLED POST-INTERMEDIATE CONTINUATION — IMPLEMENTED**
- **KNOWLEDGE STATE PRESERVED DURING CONTINUATION**
- **RETRY STATE PRESERVED DURING CONTINUATION**
- **CUSTOMER EFFORT BREAK RESET — IMPLEMENTED**
- **PERSISTENT CONVERSATION CONTINUATION — NOT IMPLEMENTED**
- **WHATSAPP CONTINUATION — NOT IMPLEMENTED**
