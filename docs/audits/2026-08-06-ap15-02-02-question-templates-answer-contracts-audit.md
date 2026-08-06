# AP-15-02-02-00 — Question Templates and Answer Contracts: Architecture, Domain and UX Audit

## 1. Audit-Metadaten

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-06-AP15-02-02-00-QUESTION-TEMPLATES-ANSWER-CONTRACTS-V1` |
| Datum | 2026-08-06 |
| Paket | `AP-15-02-02-00` |
| Typ | Audit, Analyse und Dokumentation; keine Implementierung |
| Branch | `codex/audit-ap15-02-02-question-templates` |
| Baseline | `d535c1c67f789a58d2bb9f3a08795bc43821087e` (`Merge pull request #90 from laulix-krander/codex/add-controlled-question-planner-domain-baseline`) |
| Remote | Kein Git-Remote konfiguriert; ein Vergleich mit einem Remote-Hauptbranch und das Pushen sind lokal nicht möglich. |
| Auditstatus | **READY FOR OWNER DECISION** |
| Freigabestatus | ausdrücklich **nicht** `APPROVED FOR IMPLEMENTATION` und **nicht** Production Ready |

## 2. Scope

Dieses Dokument plant ausschließlich die Architektur zwischen einer bereits ausgewählten Planneraktion und einer später sichtbaren, kontrollierten Kundeninteraktion. Es beschreibt Template Definition, Registry und Binding, Rendering, Parameter, Answer- und Validation-Verträge, Unknown/Skip, Näherungswerte, Einheiten, Optionen, Hilfen, Beispiele, alternative Pfade, Retryvarianten, Annahmebestätigung, Site Check, Human Review, Intermediate Result, End Collection, Lokalisierung, Ton, Accessibility, Versionierung, Testbarkeit sowie die Grenze eines späteren LLM-Rewrites.

Ausgeschlossen sind jede Implementierung, Domain-TypeScript-Dateien, Templates im Code, UI, Simulator, Routes, Actions, Services, Persistenz, Migration, SQL, RPC, RLS/Grants, Supabase, KI/LLM/Vision, WhatsApp, Bildanforderungen, produktive Prompts, Antwortinterpretation, Claim-Erzeugung, Preis-/Angebotslogik, Tests, Dependencies und `package.json`. Vertragsskizzen und Beispielformulierungen sind nicht ausführbare Planungsartefakte und keine produktiven Texte.

## 3. Ausgangslage

AP-15-01 verwaltet Knowledge Claims, ermittelt wirksame Claims und Widersprüche, leitet Missing Information und Readiness ab und erzeugt strukturierte `IntermediateAssessment`s. AP-15-02-01 erzeugt kontrollierte `QuestionCandidate`s, prüft Eligibility, rankt deterministisch, wählt genau eine `SelectedNextAction` oder ein Stop Result und plant Unknown-, Skip-, Annahme- und Site-Check-Pfade.

Nicht vorhanden sind verständliche Kundenfragen, Template Registry, Antwortoptionen, Hilfen, Einheiten, Eingabevalidierung/-normalisierung, Antwortinterpretation, Claim-Konvertierung, Fotoanweisung, Versand, LLM-Formulierung oder Kanaldarstellung. Das Ziel dieses Audits ist deshalb eine sichere Übersetzungsgrenze von `template_key = ask_room_area_approximate`, `action_type = ask_approximate_number`, `answer_type = approximate_number` zu einer kurzen Interaktion, ohne deren fachliche Bedeutung zu erweitern.

## 4. Bestehende Plannergrundlage

Die vollständige Prüfung der beiden Grundlagen, aller zehn Conversation-Intelligence-Module, beider zugehörigen Tests sowie der Bestände unter `lib/domain/**`, `components/**`, `app/**` und `docs/audits/**` ergibt folgende verbindliche Anschlusslage:

- `MissingInformation.information_key` ist ein geschlossener Property Key mit Entitätsbindung, Importance, Reason, blockiertem Level sowie Assumption-/Site-Check-Fähigkeit; es ist keine Kundenfrage.
- Planner-Action-Types sind `ask_text`, `ask_yes_no`, `ask_approximate_number`, `offer_assumption`, `mark_requires_site_check`, `request_human_review`, `present_intermediate_result` und `end_collection`. Answer Types sind `text`, `boolean`, `approximate_number`, `unknown` und `skip`.
- `QuestionCandidate` bindet Candidate, State, Need/Entität, Aktion, optionalen Answer-/Template-/Assumption-Key, Prioritätsmerkmale, `RetryState`, Dependencies, `fallback_paths`, Reasons und Status. Es enthält absichtlich keinen Kundentext.
- `SelectedNextAction` bindet genau einen Candidate und übernimmt Aktion, `information_key`, optionalen `answer_contract`, Template-/Assumption-Key, Fallbacks, Reasons und reproduzierbare Score-Komponenten. Die aktuelle Implementierung bindet noch keine `template_version`; dies ist eine spätere, ausdrücklich zu versionierende Vertragserweiterung und wird hier nicht vorgenommen.
- `RetryState` unterscheidet `answered`, `unknown`, `skipped`, `invalid`, `ignored`, `superseded`, erlaubt `retry_count`/Attempts null bis zwei und enthält keine Rohantwort. `CustomerEffortState` begrenzt technische Folgefragen ohne psychologisches Profiling.
- Der Planner erzeugt die Keys `ask_room_type`, `ask_room_area_approximate`, `ask_building_type`, `ask_indoor_position_known`, `ask_outdoor_position_known`, `ask_line_route_known`, `ask_electrical_supply_known` und `ask_accessibility_known`; ein Raumgrößenwiderspruch verwendet derzeit ebenfalls den kontrollierten Raumgrößen-Key mit Clarification-Reason.
- Nach dem ersten Unknown kann eine einfachere Alternative folgen; nach dem zweiten kein dritter semantisch gleicher Versuch. Skip sperrt die sofortige Wiederholung. `assumption_key` identifiziert nur ein Angebot; der Planner erzeugt keinen Claim.
- `mark_requires_site_check` ist eine Engineaktion, `request_human_review` nie roh kundenseitig, und `present_intermediate_result` referenziert ein versionsgleiches vorhandenes Assessment. Ein Stop ist weder automatisches Conversation Close noch Projektstatusänderung.
- Die bestehende Implementierung ist pure Domainlogik ohne Templates, UI, Persistenz, Supabase oder Provider. Dieses Audit dupliziert und verändert diese Verträge nicht; die spätere Template-Schicht konsumiert sie fail closed.

## 5. Produktprinzipien

1. Der Planner entscheidet das fachliche Ziel; ein Template formuliert nur diese Auswahl.
2. Ein Template darf weder einen weiteren Need noch mehrere unabhängige Informationen einführen.
3. Hauptfrage und optionale Hilfe sind kurz, freundlich, verständlich, nicht suggestiv und frei von Schuld/Pflichtgefühl.
4. Fachbegriffe werden vermieden oder erklärt; Unsicherheit wird ehrlich benannt.
5. Unknown ist immer ein normaler Weg. Skip ist vorhanden, wenn fachlich zulässig, und bleibt von Unknown getrennt.
6. Eine grobe Antwort ist einer erfundenen Genauigkeit vorzuziehen; Beispiele erklären, manipulieren aber nicht.
7. Es gibt keine Garantie, Preiszusage, finale technische Empfehlung oder automatische Angebotsfreigabe.
8. Safety-Fragen sind klar, nicht alarmistisch. Annahmen sind sichtbar vorläufig; Site Checks sind kein Kundenfehler.
9. Interne Human-Review-Aktionen sind keine Kundenfragen. Stop Results können eine Zusammenfassung statt einer Frage auslösen.
10. Templates sind kanalunabhängig. WhatsApp-Format und ein optionales LLM sind spätere Adapter ohne fachliche Autorität.

## 6. Begriffsdefinitionen

| Begriff | Präzise Bedeutung |
|---|---|
| Template Key | Sprachunabhängiger, geschlossener Identifier einer semantischen Darstellungsabsicht; kein Text und keine clientbestimmte Eingabe. |
| Question Template | Versionierter, lokalisierter, strukturierter Vertrag, der genau eine kompatible Planneraktion formuliert und den erwarteten Answer Contract referenziert/einbettet. |
| Template Version | Stabiler, unveränderlicher Versionsbezeichner einer Key-/Locale-Ausprägung einschließlich semantisch relevanter Texte und Vertragbindung. |
| Render Context | Strikter, minimaler Input aus `SelectedNextAction`, Registry, Locale und validierten Parametern; keine Rohconversation oder freie Kundenakte. |
| Controlled Parameter | Benannter, typisierter und längenbegrenzter Allowlistwert, dessen Einsatzstelle vorgegeben ist und der validiert sowie escaped wird. |
| Customer Prompt | Primärer sichtbarer Satz mit genau einem fachlichen Ziel. |
| Supporting Text | Optionaler kurzer Kontext unmittelbar zur Frage; kein zweites Ziel. |
| Help Text | Optional abrufbare Erläuterung zu Begriff, Messung oder Antwortweg. |
| Example | Kontrolliertes, nicht bindendes Anschauungsbeispiel, das weder als Default noch als fachliche Wahrheit gilt. |
| Answer Contract | Strikter Vertrag der zulässigen Antwortformen und Metadaten; er entscheidet nicht über die spätere fachliche Wahrheit. |
| Answer Option | Stabile Option-ID mit lokalisierter Anzeige und eindeutiger Answer-Semantik; Darstellung als Button ist Kanal-/UI-Sache. |
| Validation Rule | Deklarative, geschlossene Zulässigkeitsbedingung mit Fehlercode; keine freie ausführbare Regel. |
| Normalized Answer | Späteres schema-validiertes, kanonisches Ergebnis der Eingabenormalisierung; noch kein Claim. |
| Unknown Answer | Explizite Aussage, die Information nicht zu kennen/einschätzen zu können; valider Zustand, kein Fehler und keine Bestätigung. |
| Skip Answer | Explizite Entscheidung, aktuell nicht zu antworten; nicht gleich Unknown und ohne erfundenen Wert. |
| Retry Variant | Vorab registrierte zweite, semantisch äquivalente, leichter beantwortbare Ausprägung desselben Needs. |
| Assumption Proposal | Kontrolliertes Angebot einer konkreten, begründeten, korrigierbaren Arbeitsannahme samt Auswirkung. |
| Assumption Confirmation | Explizite Kunden-/Mitarbeiterentscheidung zur vorläufigen Verwendung; keine Bestätigung als technische Tatsache. |
| Site-Check Message | Hinweis, dass ein Punkt remote nicht belastbar geklärt und zur Vor-Ort-Prüfung markiert wird. |
| Intermediate-Result Message | Strukturierte Darstellung ausschließlich eines vorhandenen, versionsgleichen `IntermediateAssessment`. |
| Human-Takeover Message | Optionaler neutraler Kundenhinweis auf persönliche Prüfung/Übernahme ohne interne Fehler oder Zeitversprechen. |
| Localization Key | Stabiler Schlüssel für ein lokalisiertes Textsegment/Optionslabel; keine fachliche ID aus deutschem Text. |
| Rendering Error | Geschlossen codiertes Fail-closed-Ergebnis bei Registry-, Binding-, Locale- oder Parameterfehler; kein Kundentext. |
| Stale Template | Template/Version, deren Bindung nicht zur referenzierten Plannerentscheidung/Vertragsversion passt oder nicht mehr aktiv ist. |
| Unsupported Planner Action | Gültige Planneraktion, für die die betreffende Registry/Renderer-Version keine erlaubte Darstellungsart besitzt. |

**Schichtentrennung:** (1) Die fachliche Plannerentscheidung bestimmt Need, Aktion, erwarteten Answer Type und Fallbacks. (2) Das Template erzeugt sichtbare Sprache ohne neue Fachentscheidung. (3) Der Answer Contract beschreibt die erwartete Form. (4) Ein separates Folgepaket interpretiert eine reale Antwort. (5) Erst ein weiteres, evidenzgebundenes Mapping darf später einen Claim-Kandidaten erzeugen; Freitext, Unknown und Skip werden hier niemals automatisch bestätigte Claims.

## 7. Variantenvergleich

Skala: `++` sehr gut, `+` gut, `0` gemischt, `-` schwach, `--` ungeeignet.

| Kriterium | A Texte im Planner | B Key→Text | C strukturierte Registry | D freies LLM | E Registry + später Rewrite | F CMS |
|---|---:|---:|---:|---:|---:|---:|
| fachliche Sicherheit | - | 0 | ++ | -- | + | 0 |
| Testbarkeit | 0 | + | ++ | -- | + | 0 |
| Wartbarkeit | -- | + | ++ | 0 | + | + |
| Übersetzbarkeit | -- | 0 | ++ | + | ++ | ++ |
| Versionierung | - | - | ++ | -- | ++ | ++ |
| Kundenfreundlichkeit | 0 | 0 | + | ++ sprachlich | ++ | + |
| WhatsApp-Eignung | - gekoppelt | 0 | + kanalneutral | 0 | + | 0 |
| LLM-Unabhängigkeit | ++ | ++ | ++ | -- | + | ++ |
| semantisches Abweichungsrisiko | hoch | mittel | niedrig | sehr hoch | niedrig bis mittel | mittel |
| MVP-Komplexität | + | ++ | + | 0 | - | -- |
| spätere Redaktion | -- | - | + | 0 | + | ++ |
| Auditierbarkeit | - | 0 | ++ | -- | + | + |

- **A** vermischt Auswahl und Sprache, erschwert Reviews und verletzt Separation of Concerns.
- **B** ist klein, kann aber Parameter, Answer Contract, Locale, Retry und Version nicht belastbar koppeln.
- **C** bietet den besten MVP-Kompromiss aus geschlossener Semantik, deterministischer Prüfung und überschaubarer Komplexität.
- **D** delegiert Bedeutung und Antwortvertrag an nicht deterministische Ausgabe und ist unzulässig.
- **E** ist ein mögliches Zielbild, aber erst nach C und nur mit harter Rewrite-Grenze.
- **F** bringt Runtime-Redaktion, Rollen, Freigabe, Historie, Validierung und Betriebsrisiko zu früh in den MVP.

## 8. Architekturentscheidung

**Empfehlung: Variante C für den MVP: statische, streng typisierte, versionierte Template Registry; Variante E später ausschließlich als optionaler, kontrollierter Sprachadapter.**

Der Ablauf ist `PlannerDecision → Binding-Prüfung → Registry Lookup (key/version/locale) → Parameterprüfung → pure Rendering-Ausgabe`. Jede Stufe ist fail closed. Registry und Renderer besitzen keine Berechtigung, Need, Action, Answer Contract, Unknown/Skip, Annahme-, Site-Check- oder Human-Review-Status zu ändern. Ein Kanaladapter darf die Ausgabe später darstellen, aber nicht interpretieren. Persistenz und CMS sind nicht Teil des MVP.

## 9. Template Contract

Planungsvertrag (kein TypeScript):

```text
QuestionTemplateDefinition
  template_key
  template_version
  locale
  status
  message_kind
  supported_action_type
  supported_answer_type? / answer_contract_ref?
  information_key? / assumption_key?
  prompt_segments
  supporting_text_segments?
  help_text_segments?
  examples[]
  controlled_parameter_spec[]
  answer_contract
  fallback_template_keys[]
  retry_variant_keys[]
  accessibility_label?
```

**MVP-pflichtig:** Key, Version, Locale, Status, Message Kind, unterstützte Action, bei Ask/Confirmation der Answer Type und Answer Contract, die zur Aktion passende `information_key`- oder `assumption_key`-Bindung, strukturierte Promptsegmente, Parameterspezifikation, explizite leere oder befüllte Fallback-/Retrylisten. Supporting/Help/Examples sind optional, müssen bei Vorhandensein kontrolliert sein. `accessibility_label` ist optional, wenn der sichtbare Text bereits eindeutig ist.

Keine beliebige Interpolation, HTML-Strings, Markdown-Abhängigkeit, Handlebars, JavaScript-Ausdrücke oder ausführbare Validation. Segmente referenzieren nur deklarierte Slots. Status ist geschlossen, etwa `draft`, `active`, `retired`; nur `active` darf kundenwirksam rendern. Ein Template ist unveränderlich pro Version.

## 10. Template Registry

Empfohlen wird ein eigenes Domainmodul mit TypeScript-Konstanten und abgeleiteten strikten Typen, getrennt von Plannerlogik und UI. Gegenüber losem JSON bietet dies Compile-Time-Bindung, readonly-Daten und exhaustiven Key-Abgleich; JSON wäre erst mit Build-Time-Schema-/Codegen-Prüfung gleichwertig. Persistente/CMS-Verwaltung folgt allenfalls nach Redaktions-, Rollen-, Freigabe- und Audit-Audit.

Registry-Invarianten:

- geschlossene Keys; Eindeutigkeit von `(template_key, template_version, locale)` und genau eine aktiv auflösbare Version nach expliziter Referenz;
- kompatible Action-, Answer-, Information- und Assumption-Bindung; keine heuristische Keywahl;
- kein clientbestimmter Key, keine Kunden-Runtimebearbeitung, keine automatische Maschinenübersetzung;
- fehlender Key, Version oder Locale sowie jede Inkompatibilität fail closed; niemals eine freie Ersatzfrage erfinden;
- Fallback- und Retry-Keys existieren, sind zyklenfrei und semantisch an denselben Need gebunden;
- Registryvalidierung erfolgt beim Build/Start und zusätzlich am Render-Rand; stabile alte Versionen bleiben für Reproduktion/Analytics adressierbar;
- die Registry enthält Sprache, jedoch keine Kanal-Komponenten, Secrets, PII, URLs oder Modelltext.

## 11. Erster Template-Scope

| Key/Aktion | Message Kind | Kundenseitig | Bindung |
|---|---|---|---|
| `ask_room_type` | Frage | ja | `ask_text`, `text`, `room_type` |
| `ask_room_area_approximate` | Frage/Klärungsvariante | ja | `ask_approximate_number`, `approximate_number`, `room_area_sqm` |
| `ask_building_type` | Frage, später Choice-fähig | ja | aktuell `ask_text`, `text`, `building_type` |
| `ask_indoor_position_known` | Kenntnisfrage | ja | `ask_yes_no`, `boolean`, `indoor_unit_position_known` |
| `ask_outdoor_position_known` | Kenntnisfrage | ja | `ask_yes_no`, `boolean`, `outdoor_unit_position_known`; bestätigt keine Eignung |
| `ask_line_route_known` | Kenntnisfrage mit Hilfe | ja, falls Planner sie auswählt | `ask_yes_no`, `boolean`, `line_route_known` |
| `ask_electrical_supply_known` | Kenntnisfrage | nur wenn remote beantwortbar | `ask_yes_no`, aber unsichere Sprache nicht zu Boolean erzwingen; sonst Site Check |
| `ask_accessibility_known` | Kenntnisfrage | ja, sofern sicher sinnvoll | `ask_yes_no`, `boolean`, `accessibility_known` |
| `offer_assumption` | Bestätigung | ja | konkreter `assumption_key`; vier kontrollierte Wege |
| `mark_requires_site_check` | Hinweis oder interner Status | kontextabhängig | keine klassische Antwort; optional reine Kenntnisnahme, keine Bestätigungspflicht |
| `request_human_review` | interner Status oder Takeover-Hinweis | niemals roh; optional neutral | keine Kundenfrage |
| `present_intermediate_result` | strukturierte Zusammenfassung | ja | nur vorhandenes Assessment gleicher State-Version |
| `end_collection` | Abschluss-/Pausehinweis oder intern | kontextabhängig | kein Projektabschluss, kein fertiges Angebot |

Ein separater Clarification-Key für Widersprüche wäre langfristig klarer als die Überladung von `ask_room_area_approximate`; bis zu einer Owner-/Planner-Vertragsentscheidung darf die Registry jedoch keinen nicht vom Planner gelieferten Key erfinden.

## 12. Fragegestaltung

- Genau ein fachliches Ziel und eine kurze Hauptfrage; Richtwert höchstens 120 Zeichen, harte Grenze als Ownerentscheidung.
- Höchstens ein kurzer Supporting-Satz; Hilfe ist getrennt und optional statt langer Absätze.
- Keine Abkürzung, unerklärter Fachbegriff, verschachtelte Bedingung, Suggestion, falsche Präzision, Garantie, Preiszusage, finale Empfehlung oder verstecktes Pflichtfeld.
- Die Frage benennt nicht mehr Gewissheit als der Need: „Ist dir ein möglicher Platz bekannt?“ ist keine Eignungsbestätigung.
- Beispiele dürfen Maß/Größenordnung erklären und später eine Fotoalternative erwähnen, aber nichts erzwingen, keine technische Wahrheit simulieren und den Lösungsraum nicht künstlich verengen.
- Unknown und zulässiger Skip bleiben sichtbar/auffindbar; Fehlermeldungen nennen Korrekturmöglichkeit statt Schuld.

Exemplarisch, nicht produktiv: „Wie groß ist der Raum ungefähr?“ plus „Eine grobe Schätzung reicht.“; nicht: „Bestätige die exakten 25 m², damit wir dein Angebot berechnen können.“

## 13. Ton und Sprache

Empfohlen für den deutschen MVP: freundlich, direkt, respektvoll, duzend, sachlich, nicht werblich, nicht kindlich, nicht belehrend und technisch sparsam. „Du“ passt zur vorgegebenen Beispielrichtung, bleibt aber Ownerentscheidung; ein späteres „Sie“ benötigt eigenständige redaktionelle Varianten, keine mechanische Pronomenersetzung.

- Emojis im MVP weglassen: Sie tragen keine Bedeutung, sparen Übersetzungs-/Accessibility-Risiko und können später kanalbezogen ergänzt werden.
- Aufzählungen nur für Optionen/Zwischenstände; eine Standardfrage bleibt ein kurzer Satz.
- Begründungen nur bei erkennbarer Hilfe, Annahme, Safety, Site Check oder Übergabe; nicht mechanisch nach jeder Frage.
- „Kein Problem“ kann Unknown wertschätzend begleiten, darf aber nicht repetitiv oder bagatellisierend wirken.
- „ungefähr“, „grob“ und „soweit du weißt“ markieren erlaubte Unsicherheit. Ungewissheit wird nicht als Ja/Nein umgedeutet.
- Beispiel: „Weißt du, ob bereits ein möglicher Platz für das Außengerät vorgesehen ist? Es geht noch nicht darum, ob der Platz technisch geeignet ist.“

## 14. Answer Contract

Planungsvertrag:

```text
AnswerContract
  contract_key
  contract_version
  answer_type: text | boolean | approximate_number
  required
  allows_unknown
  allows_skip
  choices[]?
  min_value? / max_value? / unit? / precision?
  examples[]
  normalization_strategy
  validation_error_codes[]
  fallback_action_types[]
  maximum_attempts
```

`unknown` und `skip` sind besser als disjunkte Antwortzustände eines Basisvertrags modelliert statt als Ersatz für dessen erwarteten fachlichen Typ; die geschlossene AP-15-02-01-Answer-Type-Liste bleibt dennoch kompatibel. `required` bedeutet nur, ob ein fachlicher Wert für diesen Interaktionsweg verlangt wird, und darf `allows_unknown` nicht widersprechen. `choices` enthalten stabile IDs; Labels liegen lokalisiert im Template. Numerische Felder sind nur bei `approximate_number`, Choices nur bei passenden Verträgen erlaubt. `maximum_attempts` darf den Plannerwert zwei nicht überschreiten.

Validation Codes schließen mindestens `answer_type_mismatch`, `value_out_of_range`, `unit_not_allowed`, `choice_not_allowed`, `empty_answer`, `unknown_not_allowed`, `skip_not_allowed`, `stale_question_reference` ein. `fallback_action_types` begrenzen nur erlaubte Plannerpfade; der Validator wählt sie nicht. Claim Conversion gehört ausdrücklich nicht in diesen Vertrag dieses Pakets.

## 15. Textantworten

- Trimming an den Rändern; eine danach leere Antwort ist `empty_answer`, nicht Unknown oder Skip.
- Empfohlene technische Obergrenze zunächst 500 Unicode-Zeichen, fachliche Untergrenze ein sichtbares Zeichen; konkrete Grenzen bleiben Ownerentscheidung je Need.
- Unknown/Skip werden über stabile Option-IDs oder später eindeutig interpretierte Eingaben behandelt, nicht durch leere Strings.
- Freie Kundensprache wird als Daten behandelt: kein HTML-Rendering, Script, Templatecode, Markdownvertrag oder Toolbefehl.
- Ausgabe wird escaped; Speicherung/Retention und Interpretation sind Folgepakete.
- Freitext ist weder bestätigte Tatsache noch direktes Property-Patch. Knowledge Extraction/Claim Mapping muss Evidenz, Entität, Property, Unsicherheit und Review separat prüfen.
- Prompt-Injection-Text verändert weder Plannerentscheidung noch Systeminstruktion, Registry oder Answer Contract.

## 16. Boolean-Antworten

Der kontrollierte Vertrag bietet stabile Semantiken `yes`, `no`, `unknown` und, falls erlaubt, `skip`, lokalisiert als „Ja“, „Nein“, „Weiß ich nicht“ und „Möchte ich überspringen“. `true`/`false` sind nur Ergebnisse expliziter eindeutiger Optionen, keine Behauptung technischer Eignung.

Natürliche Varianten `ja`/`nein` könnten später eindeutig normalisiert werden. „vielleicht“, „vermutlich“, „denke schon“ und „eher nicht“ sind epistemisch unsicher und dürfen nicht still zu Boolean werden; sie benötigen später Clarification, Unknown oder einen probabilitätsfreien Unsicherheitszustand. Diese Interpretation ist nicht Teil dieses Audits.

## 17. Ungefähre Zahlen

Zulässige spätere Eingaberichtungen: `25`, `ungefähr 25`, `ca. 20–25`, `zwischen 20 und 30`, Unknown. Mögliche disjunkte Normalform:

```text
exact_value? | approximate_value? | (range_min + range_max)
unit
approximation_status: exact | approximate | range
```

Genau eine Wertform ist gesetzt; Range benötigt beide Enden und `min ≤ max`. Deutsche Dezimalkommas und Punkte müssen später bewusst normalisiert werden, niemals geraten, wenn mehrdeutig. Einheit ist für Raumfläche `m²` fachlich gebunden und in Accessibility als „Quadratmeter“ aussprechbar; Meter und Quadratmeter sind nicht austauschbar.

Null, negative, nicht endliche und extrem große Werte sind ungültig oder klärungsbedürftig. Fachlich unrealistische positive Werte dürfen keine stille Kappung erzeugen. Min/Max, Präzision, maximale Spannbreite und Schwellen für „unrealistisch“ benötigen Klima-Fachowner-Freigabe; dieses Audit erfindet keine Zahlen. Ein Range darf nicht zu seinem Mittelpunkt als exakte Wahrheit kollabieren. Keine Parserimplementierung erfolgt hier.

## 18. Unknown

Unknown („Weiß ich nicht“, alternativ „Kann ich nicht einschätzen“) ist eine valide fachliche Antwort, kein Validierungsfehler. Es erzeugt keinen bestätigten Claim und weder `false` noch `0`. Später wird das kontrollierte Outcome im bestehenden `RetryState` als `unknown` gezählt; ausschließlich der Planner entscheidet über vereinfachte Alternative, Annahme, Site Check, Deferral oder Mensch. Dieselbe Formulierung wird nicht automatisch wiederholt. Die sichtbare Reaktion bleibt neutral, etwa exemplarisch „Kein Problem – wir können den Punkt anders eingrenzen.“

## 19. Skip

Skip („Möchte ich überspringen“) bedeutet, aktuell bewusst nicht zu antworten. Es ist nicht Unknown, darf nicht zusammengeführt werden und erzeugt keinen fachlichen Wert. `RetryState` hält `skipped` getrennt; dieselbe Frage wird bis zu einem definierten Reopen-Trigger nicht sofort erneut gestellt. Readiness kann sinken/blockiert bleiben; Planner darf Zwischenstand, Alternative, Site Check oder Human Review wählen. Sensible Fragen sollen überspringbar sein, soweit kein zwingender Safety-/Übergabepfad dagegensteht; nicht überspringbar bedeutet niemals erzwungene Antwort, sondern gegebenenfalls kontrolliertes Ende/Handover.

## 20. Retryvarianten

Maximal zwei fachliche Kundenversuche pro Need:

1. Standardtemplate: kurze Frage, einfachste geeignete Antwortform.
2. Registrierte Retryvariante: identischer Need und kompatibler Vertrag, aber einfachere Sprache, höchstens ein Beispiel, alternative Antwortform oder klarer Hilfetext. Alternativ entscheidet der Planner direkt auf Annahme, spätere Fotoalternative, Site Check oder Mensch.

Der Retryvertrag bindet `base_template_key`, `retry_variant_key`, gleiche `information_key`, erlaubten `retry_count = 1`, kompatible Action/Answer-Semantik und nachfolgende kontrollierte Fallbacks. Er darf keine neue Information abfragen, keine Parameter hinzufügen, die den Need ändern, und keine Zyklen bilden. Nach Attempt zwei gibt es keinen dritten nahezu identischen Text.

## 21. Annahmen

Bei `offer_assumption` muss die Interaktion konkret nennen: Annahme, Begründung, vorläufige/korrigierbare Natur, relevante Auswirkung und fehlenden Tatsachenstatus. Exemplarisch: „Falls du die genaue Raumgröße nicht kennst, können wir vorläufig mit etwa 25 m² weiterarbeiten. Passt das ungefähr?“

Kontrollierte Optionen: `accept_provisional` („Ja, so weiterarbeiten“), `reject` („Nein“), `unknown`, `defer_check` („Später prüfen“). Zustimmung bedeutet nur Verwendung der expliziten Arbeitsannahme. Ohne explizite Kunden- oder Mitarbeiterbestätigung wird keine Annahme aktiviert; eine Ausnahme wäre eine neue, separat ownerfreigegebene Domainregel. Ablehnung/Unknown erzeugen keinen Claim. `assumption_key` und validiertes `assumption_label` müssen zur Planner-Allowlist passen.

## 22. Site Check

`mark_requires_site_check` bleibt primär fachliche Engineaktion. Kundensichtbarkeit ist sinnvoll, wenn der Punkt den sichtbaren Zwischenstand/nächsten Schritt beeinflusst oder weitere Remote-Fragen ersetzt; rein interne Checklistenpflege kann still bleiben. Exemplarisch: „Das lässt sich aus der Ferne nicht sicher beurteilen. Wir markieren den Punkt für eine spätere Prüfung vor Ort.“

Keine Kundenbestätigung ist nötig, um den internen Prüfpunkt zu markieren. Eine optionale Kenntnisnahme darf nicht als technische Zustimmung gelten. Der Planner setzt das Gespräch mit einem anderen zulässigen Need, Zwischenstand oder Übergabepfad fort. Das Assessment referenziert den bestehenden `site_check_item`, behauptet keine Freigabe und stellt ihn nicht als Kundenfehler dar.

## 23. Human Review

Vier Fälle bleiben getrennt: stille interne Eskalation, sichtbarer Hinweis, sofortige menschliche Übernahme und spätere Prüfung. `request_human_review` wird niemals roh gerendert. Intern bleibt sie insbesondere bei technischer Inkonsistenz ohne notwendige Kundenhandlung, solange Schweigen nicht irreführt. Sichtbar wird sie, wenn die nächste Kundenerwartung, Unterbrechung oder Übergabe erklärt werden muss.

Exemplarisch: „Diesen Punkt möchten wir kurz persönlich prüfen. Wir melden uns dazu.“ Der Text enthält keine Stack-/Registry-/Modellfehler, keine internen Reasons, keine KI als Reviewer und keine Reaktionszeit- oder Verfügbarkeitszusage. „Sofort“ darf nur ein separat realisierter Übergabeworkflow behaupten; er existiert hier nicht.

## 24. Intermediate Result

`present_intermediate_result` referenziert ausschließlich das vorhandene `IntermediateAssessment` mit passender `based_on_state_version`. Strukturierte Slots statt Gesamtfreitext:

- `known_scope_items` aus bekannten/bestätigten bzw. klar gekennzeichnet berichteten Informationen;
- `assumption_items` ausdrücklich als Annahmen;
- `unknown_items` und `site_check_items` getrennt;
- `risk_or_limitation_items` ohne Alarmismus;
- `next_step_items` aus erlaubten Outputs.

Die Render-Schicht erfindet/aggregiert keine neuen Fakten und übernimmt die epistemische Kennzeichnung. Sie erzeugt keinen Festpreis, kein finales Angebot, keine technische Freigabe und stellt nicht bestätigte Positionen nicht sicher dar. Ein veraltetes Assessment führt fail closed.

## 25. End Collection

`end_collection` kann sichtbar werden, wenn der Kunde beendet/pausiert, ein ausreichender Zwischenstand vorliegt, keine sinnvolle Kundenfrage bleibt, ein Mitarbeiter übernimmt oder Vor-Ort-Prüfung nötig ist. Der Message Kind unterscheidet `pause_notice`, `handover_notice`, `site_visit_next_step` und `collection_summary`; das sind geplante Kategorien, keine neuen Planner-Actions.

Die Nachricht erklärt den tatsächlichen nächsten Zustand, ohne Projekt zu löschen/schließen oder ein fertiges Angebot zu behaupten. Ein interner Stop ohne Kundenkommunikationsbedarf bleibt intern. Wiederaufnahmebedingungen und Conversation-Lifecycle sind eigene Folgeentscheidungen.

## 26. Kontrollierte Parameter

MVP-Allowlist:

| Parameter | Zweck | Grenze |
|---|---|---|
| `room_label` | nicht identifizierende Raumbezeichnung | geschlossener/validierter kurzer Text, keine Adresse/Person |
| `information_label` | verständliche Bezeichnung eines gebundenen Keys | Registry-Mapping, nicht clientfrei |
| `unit_label` | lokalisierte zugelassene Einheit | Enum, z. B. Quadratmeter |
| `approximate_example` | fachlich freigegebenes Beispiel | typisiert, innerhalb freigegebener Grenzen, nie Default |
| `assumption_label` | exakte angebotene Annahme | an `assumption_key` gebunden |
| `assessment_summary_reference` | opaque Referenz auf versionsgleiches Assessment | ID/Version, kein Gesamttext |
| `site_check_label` | verständlicher erlaubter Prüfpunkt | Mapping vom `information_key` |

Jeder Slot besitzt Typ, Länge, erlaubte Zeichen/Werte und zulässige Position. Werte werden vor Rendering streng validiert und bei Ausgabe escaped. Nicht erlaubt: HTML/Markdownfragmente, freie URLs, Auth-/Rollenwerte, unnötige Kundennamen, vollständige Adressen, Tokens/Secrets, interne Fehler, Prompts oder unvalidierte Modelltexte. Es gibt keine Template Engine und keinen allgemeinen `Record<string, string>`-Escape-Hatch.

## 27. Localization

MVP-Locale ist ausschließlich `de`. Template Keys, Option-IDs, Error Codes und fachliche Identifier bleiben sprachunabhängig. Texte und Labels werden je `(key, version, locale)` versioniert; eine fehlende Übersetzung ist `locale_not_supported`/`template_not_found` und führt fail closed. Es gibt keine automatische Fallback-Sprache oder Maschinenübersetzung. Spätere Locales benötigen redaktionelle und fachliche Freigabe sowie dieselben semantischen Tests; sie sind keine Implementierung dieses Pakets.

## 28. Versionierung

- Jede auflösbare Plannerentscheidung muss später explizit `template_key` **und** `template_version` binden; „latest“ beim Versand ist unzulässig.
- Fachliche Bedeutungsänderung, geänderte Unknown-/Skip-Verfügbarkeit, Answer Contract, Parametersemantik, Safety-/Assumption-/Site-Check-Aussage oder Optionsemantik erfordert neue Version und gegebenenfalls Planner-/Contract-Version-Kompatibilitätsprüfung.
- Auch kundenwirksame semantische Textänderungen erhöhen die Templateversion. Eine rein orthografische Korrektur ohne Bedeutungs-/Layoutwirkung kann als Patchrevision behandelt werden; für reproduzierbare Analytics wird dennoch eine neue immutable Revision empfohlen.
- Alte Plannerentscheidungen rendern nur mit ihrer gebundenen, noch vorgehaltenen Version. Retired verhindert neue Auswahl, nicht historische Auflösung für Audit.
- Änderung fachlicher Bedeutung darf nicht nur ein Templateupdate sein; sie erfordert Planner-/Domainreview und möglicherweise neuen Key.
- Analytics protokolliert später nur Key, Version, Locale, kontrolliertes Outcome und technische Codes, keine PII/Rohantworten.

## 29. Rendering

Geplante pure Signatur:

```text
renderQuestionTemplate({
  selected_action,
  template_registry,
  locale,
  render_parameters
}) -> RenderResult | RenderingError
```

Erfolgsresultat: `template_key`, `template_version`, `locale`, `message_kind`, `primary_text`, optional `supporting_text`/`help_text`, strukturierte `examples`, unveränderter `answer_contract`, `options`, optional `accessibility_text`. Der Renderer prüft zuerst State-/Versionreferenzen, dann Key/Version/Locale, Action/Answer/Information/Assumption, Parameterexaktheit und Contractgleichheit. Output ist deterministisch: keine globale Uhr, Randomness, Netzwerk-, Datenbank-, Provider- oder Kanalabfrage. Textsegmente sind Plain Text, nicht HTML/Markdown. Der Renderer sendet nichts.

## 30. Renderingfehler

Geschlossene Codes:

| Code | Bedeutung |
|---|---|
| `template_not_found` | Key fehlt. |
| `template_version_not_found` | explizit gebundene Version fehlt. |
| `unsupported_action_type` | Action ist für Template/Renderer nicht zulässig. |
| `unsupported_answer_type` | Answer Type ist nicht unterstützt. |
| `information_key_mismatch` | Need und Templatebindung weichen ab. |
| `missing_render_parameter` | erforderlicher Allowlistslot fehlt. |
| `invalid_render_parameter` | unbekannter, falscher oder unsicherer Slotwert. |
| `locale_not_supported` | Locale fehlt/nicht freigegeben. |
| `answer_contract_mismatch` | Planner- und Templatevertrag sind nicht identisch kompatibel. |
| `template_registry_invalid` | Invariante/Duplikat/Referenz/Zyklus verletzt. |
| `render_failed` | geschlossener unerwarteter Renderfehler ohne Detailleck. |

Bei jedem Fehler wird nichts automatisch an Kunden gesendet und keine freie Fallbackfrage erzeugt. Ein technischer Retry darf nur denselben unveränderten Vertrag erneut auswerten; andernfalls folgt kontrollierter Human-Review-Pfad. Kundenseitig erscheinen keine internen Codes/Details. Stale Action/Assessment sollte vor Rendering abgefangen werden und niemals durch ein „aktuelles“ Template kaschiert werden.

## 31. LLM-Rewrite-Grenze

Ein später optionaler Adapter darf nur freigegebenen gerenderten Inhalt, kontrollierte Parameter, Ton, Maximallänge und explizite erlaubte Bedeutung erhalten. Er darf Need, Answer Contract, Optionen, Unknown/Skip, fachliche Bedeutung, Sicherheitshinweise, Annahmestatus, Site-Check-Status, Human-Takeover oder Assessmentaussagen weder hinzufügen, entfernen noch abschwächen.

Ausgabe muss später schema-, längen- und semantikvalidiert werden. Bei Timeout, Unsicherheit oder Abweichung wird ausschließlich das originale Registry-Template verwendet; keine freie zweite Generierung. Rewrite ist kein Planner, Interpreter, Reviewer oder Fallbackgenerator. Zulassung setzt eigene Ownerentscheidung, Evaluationskorpus, Monitoring ohne PII und AP-15-07 voraus. Im MVP: kein LLM.

## 32. Prompt Injection und Freitext

- Kundeneingaben sind untrusted Data und werden nie ungeprüft System-/Developertext, Templatecode oder kontrollierter Parameter.
- Freitext kann Plannervertrag, Template Key/Version, Optionen, Unknown/Skip oder Tools nicht ändern; Anweisungen darin werden nicht ausgeführt.
- Rendering escaped Parameter/Beispiele und kennt keine freien Expressions, URLs, HTML oder Toolaufrufe.
- Eine spätere LLM-Schicht trennt Systemregeln, unveränderlichen Templatevertrag und klar markierten Kundentext; sie erhält nur den minimal nötigen Ausschnitt.
- Prompt Injection wird nicht durch „freundliche“ Formulierung gelöst. Fail closed, Allowlisting, strukturierte Outputs und semantische Prüfung bleiben Pflicht.
- Keine Rohantwort, Adresse, Kontaktangabe, Token, interne Fehlermeldung oder Chain-of-Thought gehört in Analytics/Templateparameter.

## 33. Accessibility

Der Vertrag ermöglicht verständliche Haupttexte, sichtbare eindeutige Labels, klar zugeordnete Hilfe/Fehler und optionale Accessibility-Texte. Spätere UI muss Tastaturbedienung, Screenreader-Zuordnung, Fokus, nicht-farbabhängige Zustände und hinreichend große Ziele sicherstellen. Einheiten werden sprechbar („Quadratmeter“), Bereiche verständlich („zwischen 20 und 30 Quadratmetern“) und Optionen nicht nur über Position/Farbe/Emoji unterschieden. Emoji-only-Bedeutung ist verboten. Plain-Text-Domainoutput nimmt keine ARIA-/HTML-Struktur vorweg; der Kanaladapter bewahrt Semantik und Reihenfolge.

## 34. WhatsApp-Grenze

Registry und Renderer sind kanalunabhängig. Ein späterer AP-16-Adapter entscheidet anhand realer Plattformgrenzen über Textnachricht, Buttons, Listen, Freitext und Zeichenlimits. Option-IDs bleiben fachlich stabil, auch wenn ein Kanal keine Buttons bietet. Medienanforderungen gehören AP-15-03 und nicht in diesen Scope. Kein Template referenziert WhatsApp-Komponenten, Providerpayloads oder deren Limits; Transportfehler verändern weder Plannerentscheidung noch Answer Contract.

## 35. Referenzfälle

| Fall | Templateart | Answer Contract | kontrollierter Fallback |
|---|---|---|---|
| A Raumgröße fehlt | Standardfrage `ask_room_area_approximate` | approximate number in `m²`, Unknown, ggf. Skip | Retryvariante |
| B erster Unknown | einfachere Retryvariante, gleicher Need | Range/Näherung, Unknown, ggf. Skip | nach zweitem erfolglosen Attempt Annahme, wenn Planner erlaubt |
| C zweiter Unknown | Assumption Proposal | accept/reject/unknown/defer | Zwischenstand oder anderer Plannerpfad; kein dritter Ask |
| D Gebäudeart fehlt | kurze Textfrage; Choice erst nach Plannervertrag | text + Unknown + zulässiger Skip | anderer Need/Zwischenstand |
| E Innenposition unbekannt | Kenntnisfrage | yes/no/unknown, ggf. Skip | Annahme nur Planner-Allowlist, sonst Site Check |
| F Außenposition unbekannt | Kenntnisfrage ohne Eignungsbehauptung | yes/no/unknown, ggf. Skip | Site Check |
| G Leitungsweg Unknown | Retry mit kurzer Erklärung | yes/no/unknown, ggf. Skip | Site Check nach Plannerentscheidung |
| H Elektro remote unbekannt | Site-Check-Hinweis statt erzwungenem Boolean | kein fachlicher Kundenwert/optional Kenntnisnahme | Intermediate Result/Human Review |
| I Raumgrößenwiderspruch | kontrollierte Klärungsfrage mit beiden vorhandenen, epistemisch beschrifteten Angaben; neuer Key erst nach Plannerfreigabe | approximate number/Range + Unknown, ggf. Skip | Human Review bei ungelöstem relevantem Konflikt |
| J Target erreicht | Intermediate-Result-Message | keine neue Fachantwort | nächster Schritt aus Assessment |
| K Human Review | stiller interner Status oder neutraler Takeover-Hinweis | keine Kundenfrage | realer menschlicher Workflow, noch nicht implementiert |
| L Kunde skippt | keine sofortige Antwortnachforderung | `skip` als eigenes Outcome | anderer Need, Zwischenstand, Site Check oder Handover |

Die Beispiele A–L bestätigen die Schichtgrenze: Renderer wählt keinen Fallback selbst; er stellt nur die vom Planner ausgewählte Aktion dar.

## 36. Ownerentscheidungen

Soweit nicht durch die Produktprinzipien festgelegt, bleiben alle Punkte **offen**. Empfehlungen sind keine Freigabe.

| # | Ownerentscheidung | Empfehlung | Status |
|---:|---|---|---|
| 1 | Du oder Sie? | zunächst „du“, konsistent und respektvoll | offen |
| 2 | Emojis? | keine im MVP | offen |
| 3 | maximale Standardfragenlänge? | Richtwert/hart 120 Zeichen, Hilfe separat | offen |
| 4 | immer Begründung? | nein; nur wenn hilfreich/sicherheits-/prozessrelevant | offen |
| 5 | Optionen Buttons? | Domain modelliert Optionen; UI/Kanal entscheidet Darstellung | durch Kanaltrennung verbindlich |
| 6 | Unknown immer? | ja für Kundenfragen | durch Produktprinzip verbindlich |
| 7 | Skip immer? | nein, nur fachlich zulässig; nie Antwort erzwingen | teilweise verbindlich, Katalog offen |
| 8 | nicht überspringbare Fragen? | keine erzwungene Antwort; Safety-relevante Lücke führt Stop/Site/Mensch | Katalog offen |
| 9 | sensible Fragen markieren? | Zweck/Optionalität verständlich erklären, keine alarmistische Badge | offen |
| 10 | maximale Beispiele? | eins standardmäßig, höchstens zwei in Hilfe | offen |
| 11 | ungefähre Raumgröße? | Zahl oder Range in Quadratmetern; grobe Schätzung ausdrücklich erlauben | offen |
| 12 | Größenbereiche anbieten? | ja im Retry, nach fachlich freigegebenen Grenzen | offen |
| 13 | Min/Max? | Klima-Fachowner definiert je Einheit; keine Werte in diesem Audit | offen |
| 14 | Widerspruch erklären? | beide Angaben neutral/quellenarm nennen, um aktuelle Einordnung bitten | offen; Planner-Key-Frage ebenfalls offen |
| 15 | Annahme explizit bestätigen? | ja, ohne Bestätigung nicht aktivieren | durch Prinzip weitgehend verbindlich |
| 16 | Site Check sichtbar? | wenn nächster Schritt/Assessment betroffen; interne Pflege sonst still | offen |
| 17 | wann Human Review intern? | wenn keine Kundenhandlung nötig und Schweigen nicht irreführt | offen |
| 18 | Zwischenstand Stichpunkte? | ja, getrennt nach bekannt/Annahmen/offen/nächster Schritt | offen |
| 19 | nur Deutsch? | ja, `de` im MVP; Schlüssel sprachneutral | offen |
| 20 | später LLM-Rewrite? | nur optional nach C und AP-15-07; Default Originaltemplate | offen |
| 21 | Versionierung? | immutable Version je Key/Locale; jede Semantik-/Contractänderung erhöht | offen |
| 22 | Message Kinds in 02-02-01? | question, confirmation, notice, intermediate_result, takeover_notice, collection_end; interne Status getrennt | offen |

## 37. MVP-Empfehlung

Der kombinierte Vorschlag „Registry, Renderer, Answer Contracts **und** Validation/Normalization“ ist für ein kleinstes Paket zu breit: Rendering kann ohne reale Eingabeaufnahme vollständig deterministisch abgeschlossen werden, während Normalisierung Dezimal-/Range-/Freitext- und Securityentscheidungen benötigt. Empfohlene Trennung:

- **AP-15-02-02-01 Question Template Registry and Rendering:** statische deutsche Registry, Version/Locale, Binding, kontrollierte Parameter, Frage-/Retry-/Assumption-/Site-Check-/Human-/Intermediate-/End-Message-Verträge, pure Renderer, fail-closed Errors und synthetische Tests. Answer Contracts werden hierbei als deklarative, unveränderliche Ausgabeverträge beschrieben, aber nicht zur Kundeneingabevalidierung verwendet.
- **AP-15-02-02-02 Answer Contract Validation and Normalization:** strikte Inputschemas, text/boolean/approximate number, Unknown/Skip, Einheiten, Ranges, Choice- und Fehlernormalisierung; weiterhin keine semantische Interpretation oder Claim-Erzeugung.

So bleibt jedes Paket reviewbar und die Rendererimplementierung kann nicht versehentlich zum Parser werden.

## 38. Teststrategie

Spätere, in diesem Audit weder implementierte noch ausgeführte Vitest-Strategie:

- **Registry:** eindeutige Keys/Version/Locale; Action-, Answer-, Information- und Assumption-Kompatibilität; fehlendes/stales Template; ungültige Fallback-/Retryrefs, Zyklen und Parameter.
- **Rendering:** Standardfrage, Supporting/Help/Examples, Escape, Plain Text/kein HTML, deterministischer Output, keine globale Uhr/Randomness/Netzwerk, unveränderter Answer Contract.
- **Answer Contracts (02-02-02):** text, boolean, approximate number, Unknown, Skip, Min/Max, Unit, Range, Choices, Mismatch, disjunkte Normalform und ungültige Zusatzfelder.
- **Retry:** Attempt eins/zwei, gleiche Needbindung, keine dritte gleiche Frage, Annahme- und Site-Check-Übergang.
- **Special Actions:** explizite Annahmebestätigung; interne/sichtbare Site Checks und Human Review; versionsgleiches Intermediate Result; End Collection ohne Projektschluss.
- **Localization:** Deutsch vollständig, fehlende Locale fail closed, stabile sprachneutrale Keys, immutable Versionen.
- **Security:** keine freie Interpolation/URL/Token/PII; HTML/Script/Prompt Injection bleibt Data; kein LLM, Tool oder WhatsApp.
- **Architecture:** pure Funktionen, keine UI/Persistenz/Supabase/externe Dependency und keine `package.json`-Änderung; exhaustive Verbindung zu Planner-Keys.

## 39. Production Gates

Vor jeder produktiven Kundenkommunikation müssen mindestens erfüllt sein:

1. Ownerentscheidungen 1–22 und fachliche Min/Max-/Choice-/Assumption-/Safety-Kataloge freigegeben.
2. Planner bindet unveränderlich Key und Version; Registry-, Binding- und stale Prüfungen sind vollständig getestet.
3. Deutsche Texte und Accessibility sind redaktionell, fachlich und UX-seitig geprüft; keine zweite Information pro Frage.
4. Answer Validation/Normalization und anschließend Interpretation/Claim Mapping sind separat implementiert, evidenzgebunden und getestet.
5. Unknown/Skip/Retry/Assumption/Site Check/Human Review besitzen End-to-End-Sackgassenpfade ohne Schleifen.
6. Intermediate Result übernimmt ausschließlich versionsgleiche Assessments und bewahrt Unsicherheitsstatus.
7. Persistenz, RLS, Retention, Audit, Idempotenz und stale Answers sind in eigenen Paketen freigegeben.
8. Human-Takeover-Prozess existiert tatsächlich; keine falschen Zeit-/Verfügbarkeitszusagen.
9. Security-/Prompt-Injection-/PII-Grenzen sind implementiert und überprüft.
10. Kanaladapter und WhatsApp erst nach AP-16-00; Plattformlimits verändern keinen Fachvertrag.
11. LLM-Rewrite erst nach AP-15-07 und gesonderter Freigabe; Originaltemplate bleibt sicherer Fallback.
12. Keine Preis-, Angebots- oder technische Freigabe aus Templates/Antworten; menschliche Gates bleiben wirksam.

## 40. Folgepakete

| Paket | Inhalt | Ausdrücklich ausgeschlossen |
|---|---|---|
| AP-15-02-02-01 | Question Template Registry and Rendering | Antwortinterpretation, Persistenz, UI, KI, Kanal |
| AP-15-02-02-02 | Answer Contract Validation and Normalization | Claim-Erzeugung, semantische Freitextdeutung |
| AP-15-02-03 | Answer Interpretation and Knowledge Claim Mapping Audit | Implementierung/automatische Bestätigung |
| AP-15-03 | Photo Request Planner | Visionanalyse, automatische technische Aussage |
| AP-15-04 | Internal Conversation Simulator Audit | Simulatorimplementierung |
| AP-15-05 | Internal Conversation Simulator Implementation | WhatsApp/Produktivkommunikation |
| AP-15-06 | Knowledge Extraction Audit | produktive Extraktion |
| AP-15-07 | LLM Language Adapter | fachliche Entscheidung, Vertragsänderung, Freigabe |
| AP-15-08 | Vision Analysis Contract | autonome technische Bestätigung |
| AP-16-00 | WhatsApp Transport Audit | Transportimplementierung |

Persistenz/RLS/Retention und Human-Review-Betrieb benötigen zusätzlich eigene Audits; sie dürfen nicht beiläufig in diese Pakete gelangen.

## 41. Kleinstes nächstes Paket

**AP-15-02-02-01 — Question Template Registry and Rendering**, erst nach Ownerentscheidung. Minimaler Scope: geschlossene Registrytypen/-konstanten, ausschließlich `de`, explizite Versionierung, Bindung aller heute erzeugten Planner-Keys und Special Actions, kleine Parameterallowlist, deklarative Answer-Contract-Ausgabe, pure deterministische Renderer, geschlossene Errors und synthetische Tests.

Ausgeschlossen bleiben Eingabevalidierung/-normalisierung, Antwortinterpretation, Claim Mapping, Foto, UI, Persistenz, Supabase, KI/LLM/Vision, WhatsApp, Preise und Angebote. Die Widerspruchsdarstellung benötigt vor Implementierung eine Ownerentscheidung, ob der Planner einen eigenen Clarification-Template-Key liefern soll.

## 42. Status

- **AP-15-01 CONVERSATION DOMAIN BASELINE — IMPLEMENTED**
- **AP-15-02-01 CONTROLLED QUESTION PLANNER — IMPLEMENTED**
- **QUESTION TEMPLATE REGISTRY — NOT IMPLEMENTED**
- **ANSWER CONTRACT NORMALIZATION — NOT IMPLEMENTED**
- **ANSWER INTERPRETATION — NOT IMPLEMENTED**
- **PHOTO REQUEST PLANNER — NOT IMPLEMENTED**
- **INTERNAL CONVERSATION SIMULATOR — NOT IMPLEMENTED**
- **AI ANALYSIS — NOT IMPLEMENTED**
- **WHATSAPP INTEGRATION — NOT IMPLEMENTED**
- **OFFER GENERATION — NOT IMPLEMENTED**
- **OVERALL PRODUCT — NOT PRODUCTION READY**

**Auditstatus: READY FOR OWNER DECISION.** Ausdrücklich nicht `APPROVED FOR IMPLEMENTATION` und nicht Production Ready.

## 43. Scope-Bestätigung

Dieses Paket enthält ausschließlich dieses Auditdokument und damit ausschließlich Audit, Analyse und Dokumentation. Es enthält ausdrücklich:

- keine Implementierung, Domainmodule oder Domain-TypeScript-Dateien und keine Templates im Code;
- keine UI, Route, Server Action, Services oder Simulator;
- keine Persistenz, Migration, SQL, RPC, RLS-/Grant-Änderung oder Supabase-Nutzung;
- keine KI-, LLM-, Vision- oder WhatsApp-Integration und keine produktiven Prompts;
- keine Bild-/Dokumentanforderung;
- keine Antwortinterpretation, Knowledge Extraction oder Claim-Erzeugung;
- keine Preis-/Angebotslogik, Angebotsgenerierung oder automatische Freigabe;
- keine Tests, Teständerungen oder Ausführung von Anwendungstests;
- keine externe Abhängigkeit und keine `package.json`-Änderung;
- keine echten Kunden- oder personenbezogenen Daten.

Alle Contracts, Signaturen, Tabellen und Texte sind ausschließlich nicht ausführbare Auditvorschläge. Der nächste Schritt ist eine dokumentierte Ownerentscheidung, nicht Implementierungs- oder Produktionsfreigabe.

## AP-15-02-02-01 Question Template Registry and Rendering Result

### Umsetzung und Ownerentscheidungen

AP-15-02-02-01 setzt ausschließlich die statische Registry und das deterministische Rendering um. Die deutsche Ansprache verwendet durchgehend „du“ und bleibt freundlich, direkt, ruhig, verständlich sowie frei von Werbung, Belehrung und Emojis. Fragen verfolgen je ein fachliches Ziel; Annahmen verlangen eine ausdrückliche Bestätigung. Site-Check-Texte sind neutral kundensichtbar. Human Review ist durch getrennte interne und kundensichtbare Templates ausdrücklich unterschieden.

### Domainstruktur, Locale, Arten, Keys und Versionierung

Die Domain wurde modular um `question-template-types.ts`, `question-template-schemas.ts`, `question-template-registry.ts`, `question-template-renderer.ts` und synthetische Fixtures ergänzt. `de` ist der einzige geschlossene Locale-Wert. Die Message Kinds sind `question`, `confirmation`, `notice`, `internal_notice`, `intermediate_result` und `collection_end`. Die Registry enthält die acht bestehenden Planner-Keys, eine Raumgrößen-Retryvariante sowie kontrollierte Keys für Annahmebestätigung, vier Site Checks, internes und sichtbares Human Review, Zwischenstand, Pause und Vor-Ort-Prüfung. Alle MVP-Templates besitzen die unveränderliche Version 1; Auflösung erfolgt nur explizit über Key, Locale und Version.

### Verträge und Registry

Das strikte Template-Schema bindet Key, positive Version, Locale, Message Kind, Action, optionalen Answer Type und Information Key, kontrollierte Texte und Parameter, Answer Contract, Retrybezug, Sichtbarkeit und Status. Zusatzfelder, leere oder unsichere Texte, unbekannte Werte und inkonsistente interne Sichtbarkeit werden abgelehnt. Die tief eingefrorene TypeScript-Registry wird auf Schemafehler und doppelte Identitäten geprüft und bietet ausschließlich pure Lookup- und Listingfunktionen.

Die kontrollierte Parametergrenze allowlistet `room_label`, `information_label`, `unit_label`, `approximate_example`, `assumption_label`, `site_check_label`, `assessment_level_label`, `known_items`, `assumption_items`, `open_items` und `next_step_label`. Werte werden getrimmt, längenbegrenzt und als Strings oder kontrollierte Stringlisten angenommen; HTML-artige Inhalte, URLs, Tokenhinweise und unbekannte Felder werden abgelehnt. Fehlende Pflichtparameter schließen das Rendering kontrolliert.

Deklarative Answer Contracts verwenden nur `text`, `boolean` und `approximate_number` als Hauptvertrag; `unknown` und `skip` bleiben ausschließlich Outcomes. Optionen und deutsche Labels sind geschlossen. Textfragen für Raum- und Gebäudeart, Booleanfragen für Innen-/Außenposition, Leitungsweg, Elektro und Zugänglichkeit sowie die Raumgröße in Quadratmetern sind enthalten. „Weiß ich nicht“ wird angeboten; „Möchte ich überspringen“ erscheint nur bei erlaubtem Skip. Der zweite Raumgrößenversuch bleibt `approximate_number`, zielt auf dieselbe Information und bietet vereinfachte Größenbeispiele. Es gibt keinen dritten Retry.

Die Raumgrößenannahme bietet `confirm_assumption`, `reject_assumption`, `unknown` und `defer`, bleibt sichtbar als vorläufige Annahme gekennzeichnet und bewirkt keine automatische Zustimmung. Site-Check-Hinweise für Leitungsweg, Elektro, Außenposition und Zugänglichkeit enthalten weder Schuldzuweisung noch technische Freigabe oder Terminversprechen. Human Review hat ein nicht kundenfähiges internes Template und einen neutralen sichtbaren Hinweis ohne interne Details.

Der Zwischenstand rendert ausschließlich kontrollierte Werte in den Abschnitten Einordnung, bereits bekannt, vorläufige Annahmen, noch offen und nächster Schritt. Er übernimmt keine Rohdatenzusammenfassung. Die Collection-End-Templates pausieren kontrolliert oder empfehlen eine Vor-Ort-Prüfung, ohne Abschluss, Statusmutation oder Terminbuchung zu behaupten.

### Renderer, Fehler und Accessibility

`renderQuestionTemplate` ist pure, kanalunabhängig und deterministisch. Es validiert Registry, Locale, explizite Version, SelectedNextAction-Bindung, Action Type, Information Key, Answer Type, Answer Contract und sämtliche Parameter. Es wählt keine Aktion, berechnet keinen Score neu und mutiert weder Input noch Registry. Das Ergebnis ist eine strikte discriminated union aus gerenderter Interaction oder einem geschlossenen Fehlercode. Unterstützt werden `template_not_found`, `template_version_not_found`, `unsupported_action_type`, `unsupported_answer_type`, `information_key_mismatch`, `missing_render_parameter`, `invalid_render_parameter`, `locale_not_supported`, `answer_contract_mismatch`, `template_registry_invalid`, `render_failed` und `stale_template_binding`. Es gibt keine Fallbackfrage und keine rohe Zod-Ausgabe. Optionaler Accessibility-Text gibt Frage, ausgeschriebene Einheit und Optionen ohne zusätzliche Fachbedeutung wieder.

### Fixtures, Tests und Grenzen

Synthetische Fixtures decken Standard- und Retry-Raumgröße, Raumtyp, Gebäudeart, fünf Booleanfragen, Annahmebestätigung, Site Check, internes und sichtbares Human Review, Zwischenstand, Pause und Vor-Ort-Prüfung ab. Unit- und Architekturtests prüfen Schemas, Zusatzfeldablehnung, Registryidentitäten und Immutabilität, Bindungen, Parameter, deterministischen Output, unveränderte Eingaben, Unknown/Skip, Texte und sämtliche Spezialfälle sowie verbotene Laufzeitkopplungen.

Es gibt keine Antwortinterpretation oder Antwortnormalisierung, keine Knowledge-Claim-Erzeugung oder Knowledge-State-Mutation, keine Fotoanweisung, keine UI, keine Persistenz, keine Datenbankänderung, keine KI und keine WhatsApp-Integration. AP-15-02-02-02 bleibt das Folgepaket für Antwortinterpretation und Normalisierung.

### Status

- **QUESTION TEMPLATE REGISTRY IMPLEMENTED**
- **DETERMINISTIC TEMPLATE RENDERING IMPLEMENTED**
- **DECLARATIVE ANSWER CONTRACTS IMPLEMENTED**
- **ANSWER NORMALIZATION NOT IMPLEMENTED**
- **ANSWER INTERPRETATION NOT IMPLEMENTED**
- **KNOWLEDGE CLAIM MAPPING NOT IMPLEMENTED**
- **PHOTO REQUEST PLANNER NOT IMPLEMENTED**
- **INTERNAL CONVERSATION SIMULATOR NOT IMPLEMENTED**
- **AI ANALYSIS NOT IMPLEMENTED**
- **WHATSAPP INTEGRATION NOT IMPLEMENTED**
- **OFFER GENERATION NOT IMPLEMENTED**
- **OVERALL PRODUCT NOT PRODUCTION READY**

## AP-15-02-02-02 Answer Contract Validation and Normalization Result

Die Domainstruktur wurde um getrennte Typ-, Schema-, Normalisierungs- und synthetische Fixture-Module ergänzt. `RawCustomerAnswer` akzeptiert ausschließlich strikt gebundene Text- oder Optionswerte; `NormalizedCustomerAnswer` ist eine geschlossene, typisierte Outcome-Union ohne Claims, Evidence oder epistemischen Status.

Die Validierung bindet Projekt, Conversation, Decision, Template-Key, Templateversion und Locale exakt an die gerenderte Interaktion. Ein fehlender, inkonsistenter oder veralteter Vertrag wird fail-closed behandelt. Positive ganzzahlige Attempts werden gegen `maximum_attempts` geprüft, ohne Retry-State zu verändern. Geschlossene Fehlercodes und eine deterministische Retryable-Zuordnung verhindern freie Fehlermeldungen und Zod-Rohfehler.

Text wird ausschließlich getrimmt und bei Zeilenenden technisch vereinheitlicht; Inhalt einschließlich Prompt-Injection-artiger Formulierungen bleibt uninterpretiert. Boolean-Werte verwenden geschlossene deutsche Allowlists, während unsichere Formulierungen abgelehnt werden. Ungefähre Zahlen unterstützen Einzelwerte, kontrollierte Präfixe und Zweipunktbereiche mit deutschem oder englischem Dezimaltrenner. `m²`, `m2` und `qm` werden ausschließlich bei einem eindeutigen `sqm`-Vertrag normalisiert; Grenzen und Precision werden geprüft, andere Einheiten weder akzeptiert noch umgerechnet.

Unknown und Skip bleiben getrennte erlaubnisgebundene Outcomes. Annahmen werden nur über die Vertragsoptionen beziehungsweise – sofern der Boolean-Vertrag Freitext zulässt – eine eindeutige Bestätigung bestätigt, abgelehnt oder zurückgestellt. Alle Funktionen sind pure und deterministisch, erzeugen neue Resultatobjekte und mutieren weder Input, Registry, Vertrag, Knowledge State noch Planner- oder Retry-State.

Die synthetischen Fixtures decken Text, Whitespace, Unknown, Skip, Boolean, Unsicherheit, exakte/ungefähre Zahlen, Bereiche, Dezimalwerte, ungültige Werte und Einheiten, Annahme-Outcomes sowie fehlerhafte Bindungen ab. Fokussierte Schema-, Domain-, Immutabilitäts- und Architekturprüfungen sichern die Grenzen. Es gibt keine UI, Persistenz, KI, WhatsApp-Integration oder Claim-Erzeugung.

- ANSWER CONTRACT VALIDATION IMPLEMENTED
- DETERMINISTIC ANSWER NORMALIZATION IMPLEMENTED
- TEXT BOOLEAN AND APPROXIMATE NUMBER NORMALIZATION IMPLEMENTED
- UNKNOWN AND SKIP OUTCOMES IMPLEMENTED
- KNOWLEDGE CLAIM MAPPING NOT IMPLEMENTED
- KNOWLEDGE STATE MUTATION NOT IMPLEMENTED
- PHOTO REQUEST PLANNER NOT IMPLEMENTED
- INTERNAL CONVERSATION SIMULATOR NOT IMPLEMENTED
- AI ANALYSIS NOT IMPLEMENTED
- WHATSAPP INTEGRATION NOT IMPLEMENTED
- OFFER GENERATION NOT IMPLEMENTED
- OVERALL PRODUCT NOT PRODUCTION READY
