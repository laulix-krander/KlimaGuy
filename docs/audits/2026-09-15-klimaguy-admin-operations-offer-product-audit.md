# KlimaGuy Admin Workspace V2, Operations, Qualification V2 und Offer Studio – Product-/Current-Code-Audit

**Stand:** 15. September 2026  
**Gegenstand:** verifizierter Repository-Stand des aktuellen Branches auf Basis von `main` (`26f1af3`)  
**Scope:** Audit und bindende Implementierungsroadmap; keine Runtime-, UI-, Konfigurations-, Datenbank- oder Production-Änderung in diesem PR.

## Evidenzsprache und feste Leitplanken

Dieses Dokument verwendet durchgehend:

- **PROVEN** – direkt durch aktuellen Repository-Code belegt.
- **STRONG INFERENCE** – durch Code und den mitgelieferten Live-Befund stark gestützt.
- **PLAUSIBLE** – möglich, aber nicht bewiesen.
- **UNKNOWN / REQUIRES PRODUCTION EVIDENCE** – aus dem Repository nicht feststellbar.
- **RULED OUT** – aktuelle Evidenz widerspricht der Behauptung.

Autorität: **verifizierter aktueller Code > aktuelle Repository-Migrationsverträge > gemergte Architekturentscheidungen > alte Dokumente/Historie > Annahmen**. Die Entscheidungen „Thin MVP Path Beside Legacy“, kein Hard Delete, Reset durch Schließen der aktuellen Conversation, keine `qualification_runs`, Conversation als AI-Memory-Grenze, Project als Fakten-/Mediengrenze, PostgreSQL als Kanon, keine Provider-Memory und ausschließlich menschliche Preis-, Freigabe- und Sendeautorität bleiben unverändert.

---

## 1. Executive Summary

Der aktuelle MVP besitzt bereits den schwierigen technischen Kern: stabile WhatsApp-Identität, historisierte Conversations, append-only Nachrichten, ein je Conversation kanonisches Project, produktive Text- und Bild-Ingestion, aktuelle Project-Fakten, stateless Vision sowie einen deterministischen Übergang in die technische Prüfung. **PROVEN**. Der erfolgreiche reale Mehrfachturn bestätigt zusätzlich, dass dieser Pfad praktisch eine natürliche Qualifikation durchführen kann. Das nächste Problem ist nicht ein neuer Runtime-Unterbau, sondern ein fehlendes Operations-Produkt über dem vorhandenen Unterbau.

Die wichtigsten Befunde:

1. **Kundenname:** `customers.first_name` und `last_name` sind bereits die richtige persistente Autorität und wurden für WhatsApp-angelegte, zunächst unbekannte Kunden nullable gemacht. First Contact verwendet eine stabile Customer-ID wieder. Es fehlt ausschließlich ein sicherer AI-Input/-Output- und Mutationspfad für den Namen sowie eine robuste Unknown-Darstellung. Ein zweites Identity-System ist **RULED OUT**.
2. **Conversation-Anzeige:** Der vollständige Verlauf ist bereits kanonisch in `conversation_messages` plus Text/References gespeichert und lesbar. Die Project-Seite fragt ihn schlicht nicht ab. Das ist primär eine Read-Model-/UI-Lücke, keine Chat-Persistenzlücke. Die Beziehung ist `projects.id -> conversations.current_project_id -> conversation_messages.conversation_id`; Zuordnungshistorie kann ergänzend über `conversation_project_assignments` gelesen werden.
3. **„Fehlendes“ 00:40-Projekt:** Die Project-Liste rendert Datum/Uhrzeit ohne explizite Zeitzone auf dem Server. Die Mediengalerie setzt dagegen bereits `Europe/Berlin`. **STRONG INFERENCE:** `14. Sep., 22:40` UTC ist derselbe Zeitpunkt wie `15. Sep., 00:40` CEST. Ob der Screenshot genau denselben Production-Datensatz zeigt, bleibt **UNKNOWN / REQUIRES PRODUCTION EVIDENCE**; Datenverlust ist nicht belegt.
4. **Fotos:** Ingestion und Vision funktionieren, aber Readiness prüft nur sechs Textfakten. Weder vorhandene Medien noch `required_photo_categories` sind serverseitige Handoff-Voraussetzung. Das Modell darf deshalb `ready_for_offer` erreichen, ohne ein Foto anzufordern. Zudem werden WhatsApp-Bilder zunächst als `project_media.category='other'` angelegt und für Vision in der Acquire-Funktion pauschal als `room_overview` projiziert; eine verlässliche Kategorienabdeckung ist damit aktuell nicht gegeben.
5. **Qualification V2:** Die Fact Registry ist verwendbar und darf nicht dupliziert werden, aber die Handoff-Policy ist zu dünn. `room_area_sqm`, Fotoabdeckung, mehrere technische Situationen und explizite Unklarheit beeinflussen die Bereitschaft nicht ausreichend. Das freie Modell erzeugt außerdem `missing_facts`, während der Server nur seine eigene Sechserliste autoritativ prüft. „Alle wichtigen Informationen“ ist deshalb eine überzogene Produktbotschaft, keine belastbare technische Freigabe.
6. **KlimaGuy Operations:** Persistierte Agent-Einstellungen existieren aktuell nicht. Es gibt einen Simulator und fest einkompilierte OpenAI-Instruktionen, aber keinen Settings-Read-/Write-Pfad. Empfohlen wird genau eine strukturierte, globale MVP-Konfiguration mit kontrollierten Enums/Booleans und serverseitigen Defaults – kein Prompt-CMS, keine Conversation-Snapshots im MVP. Sicherheits- und Angebotsgrenzen bleiben Code/DB-Regeln und werden nicht konfigurierbar.
7. **Admin UI:** Project-Liste und Detail sind servergerenderte CRUD-Seiten mit brauchbaren Einzelteilen (Cards, Badges, Formulare, Mediengalerie, Notizen), aber ohne Inbox-Read-Model, Conversation, Fact-Darstellung oder zusammenhängende Workspace-Navigation. Sie sollen visuell neu komponiert, nicht technisch neu gebaut werden.
8. **Offers:** `project_offers` liefert bereits admin-geschützte, revisions- und idempotenzgesicherte Lifecycle-/Versionsautorität und synchronisiert Project-Status. Es speichert absichtlich keine Positionen, Produkte, Preise, Steuern, Rabatte, Dokumente oder Zustellung. Offer Studio braucht daher eine **additive** Fachstruktur für Katalog, immutable/offergebundene Positionen und menschlich gepflegte Geldwerte; die bestehende Offer-Tabelle bleibt Header/Lifecycle-Autorität.

### Entscheidung

Die kleinste sinnvolle Folge sind **sieben echte Produkt-PRs**. **PR 1** baut zuerst Project Inbox + Workspace inklusive vorhandener Conversation, Fakten, Fotos und Unknown-Zuständen – ohne Migration. Das maximiert unmittelbar den operativen Nutzen und macht die heute bereits gespeicherten Daten sichtbar. Danach folgen Name/Qualification/Foto-Verhalten, strukturierte Operations-Einstellungen und Offer Studio. Es ist kein weiteres Audit vor PR 1 nötig.

---

## 2. Current Product Architecture Inventory

### 2.1 Customer

| Bestand | Evidenz / Bewertung |
|---|---|
| `customers` | UUID, `first_name`, `last_name`, E-Mail, Telefon, `created_by`, Zeitstempel und `deleted_at`; RLS und `updated_at`-Trigger bestehen. **PROVEN**. |
| unbekannte Namen | First-Contact-Migration hebt `NOT NULL` für Vor-/Nachname auf und erzeugt beide als `NULL`. **PROVEN**. |
| stabile WhatsApp-Zuordnung | `conversation_transport_identities.customer_id` verweist dauerhaft auf Customer; Foundation übernimmt diesen Customer in neue Conversations. **PROVEN**. |
| Admin-Mutationen | Create-/Update-Actions und Zod-Schemas existieren, verlangen heute jedoch beide Namensfelder und einen eingeloggten Admin. **PROVEN**. |
| Kundenansichten | Liste, Detail, Edit, Soft Delete sowie die letzten fünf Projects existieren. Null-Namen werden nicht bewusst als „Name unbekannt“ behandelt. **PROVEN**. |

**Reuse:** Customer bleibt Master-Data-Grenze. WhatsApp-ID ist Transportidentität, kein Name. `phone` darf nicht blind mit der externen WhatsApp-ID gefüllt werden; eine normalisierte geschäftliche Kontaktprojektion muss bewusst autorisiert werden.

### 2.2 Conversation

- `conversations` enthält Customer, `current_project_id`, Status, Revision und Zeitstempel. **PROVEN**.
- `conversation_messages` enthält Sequenz, Richtung, Actor-Klasse, Kind, Zeitpunkt und Reply-Bezug. Text liegt in `conversation_message_text`; Referenzen liegen in `conversation_message_references`. Tabellen sind append-only. **PROVEN**.
- `get_conversation` und `list_conversation_messages` bestehen bereits als staff-lesbare Functions; zusätzlich erlauben RLS-Policies Staff das Lesen der Conversation-/Message-Tabellen. **PROVEN**.
- `conversation_transport_bindings` historisiert die aktive/supersedete Bindung; `conversation_transport_identities` hält PII und ist für Browserrollen absichtlich vollständig gesperrt. **PROVEN**.
- `transport_message_bindings` hält eingehende Provider-message-IDs getrennt von internen Nachrichten. Ausgehende Zustellung besitzt `transport_delivery_commands`, Versuche und Events. **PROVEN**.
- Keine Project-Seite rendert diese Daten. **PROVEN**.

### 2.3 Project

`projects` ist die fachliche Fallgrenze mit Customer, Titel, Lifecycle-Status, Klasse, Adresse, Ort, Summary, `requires_human_review`, Zeitstempeln und Soft Delete. First Contact legt für jede neue Conversation ohne aktuelles Project „Neue Klimaanfrage“ an. Diese Wiederholung ist daher erwartetes aktuelles Verhalten, kein Identitätsverlust. **PROVEN**.

### 2.4 Facts

`mvp_project_facts` hält je `(project_id, fact_key)` exakt den aktuellen JSONB-Wert. Die TypeScript-Registry validiert eine endliche Menge aus Standort, Gebäude, Raum, Gerätezahl/-position, Leitungsweg/-länge, Kernbohrungen, Kondensat, Elektro, Zugang, Bestand, Präferenzen, Fotoanforderungen und Notizen. Service-only Functions lesen und patchen diese Werte. **PROVEN**.

Die Tabelle erzwingt auf SQL-Ebene keinen Fact-Key-/Value-Vertrag; der Runtime-Pfad validiert den Provider-Output mit Zod vor dem Patch. Staff besitzt Select-RLS, aber die aktuelle UI liest Facts nicht. **PROVEN**.

### 2.5 Media / Vision

- `project_media` und private Supabase Storage bilden das einzige Project-Medienmodell, inklusive sicherer Upload-Reservierung/-Finalisierung, signierter URLs, Gallery, Kategorien, Soft Delete und Evidence-Bindung. **PROVEN**.
- Produktive WhatsApp-Bild-Ingestion erzeugt eine `image_reference`-Message, transportiert das Asset, erstellt `project_media` mit `source_conversation_id` und `source_message_id` und finalisiert es als `ready`. **PROVEN**.
- `mvp_ai_turn_media` bindet ein aktuelles, fertiges Project-Bild genau an den Turn seiner Quellnachricht; `acquire_mvp_ai_turn` lädt nur Medien des aktuellen Project, der aktuellen Conversation und der aktuellen Message. **PROVEN**.
- Der OpenAI-Adapter sendet diese Bilder stateless zusammen mit aktuellem Transcript und Project-Fakten. **PROVEN**.
- Die bestehende Gallery zeigt sichere Bilder/PDFs, Captions, Kategorien und Evidence Controls, aber keine „angefordert/erhalten/unklar“-Abdeckung und keine separaten, klar als AI-Beobachtung markierten Vision-Ergebnisse. **PROVEN**.

### 2.6 Qualification

- Provider-Output: Antwort, Fact Patch, `missing_facts`, Qualification Status, Human Flag/Reason. Zod erzwingt strukturelle Konsistenz. **PROVEN**.
- Server-Handoff: sechs Pflichtfelder (`installation_address`, `requested_room_count`, `indoor_unit_count`, `indoor_unit_position`, `outdoor_unit_position`, `line_route`) und kein `requires_site_check` bei Kondensat/Elektro. Nur dann wird `collecting_information -> technical_review` erlaubt. **PROVEN**.
- Human-Gründe umfassen Kundenwunsch, Widerspruch, Sicherheit, Unsupported und Site Check. **PROVEN**.
- `requires_human_review` ist bereits eine Project-Eigenschaft; kein Qualification-Run ist nötig. **PROVEN**.

### 2.7 Offers

Vorhanden sind:

- `project_offers` als versionierter Header mit Revision, Status `draft|created|sent|accepted|rejected|superseded`, Lifecycle-Zeitstempeln und genau einem nicht-supersedeten Offer je Project;
- append-only/idempotente `project_offer_commands`;
- admin-only Functions für Draft, created, sent, accepted, rejected, supersede;
- CAS/Revision, Audit-Log und gekoppelte Project-Status-Übergänge;
- Zod DTOs, Permission `canManageProjectOffers`, Service-Funktionen und eine Server Action zum Draft-Anlegen;
- `readProjectOffers`, das Current und History abbilden kann.

Alles ist **PROVEN**. In der sichtbaren Project UI wird ausschließlich das Draft-Anlegen angeboten. Der Read-Service und die übrigen Transition-Services sind dort nicht verdrahtet. Positionen und kommerzielle Inhalte existieren nirgends im aktuellen Offer-Modell. **PROVEN**.

### 2.8 Admin UI

- App Router, serverseitiger Supabase-Client, Rollenprüfung, Tailwind, `Card`, `Badge`, `Button` und einfache Top-Navigation bestehen. **PROVEN**.
- Dashboard zeigt lediglich acht zuletzt aktualisierte Projects und daraus berechnete Zähler; es ist kein vollständiger Inbox-Read-Model. **PROVEN**.
- Project-Liste lädt Titel, Customer-Namen, Status, Klasse, Human Review und `created_at`; keine Suche, Filter, Pagination, Facts, fehlenden Angaben oder letzte Conversation-Aktivität. **PROVEN**.
- Project-Detail zeigt Metadata, Status-/Klassen-/Review-Formulare, Summary, Upload, Gallery/Evidence, Notes und bedingt Offer-Handoff. Conversation und MVP-Facts fehlen. **PROVEN**.
- Admin/Intelligence enthält den synthetischen Simulator; eine Operations-/Settings-Seite existiert nicht. **PROVEN**.

---

## 3. Live-Test Findings

### Was jetzt funktioniert

Der mitgelieferte Production-Test belegt praktisch einen realen mehrstufigen WhatsApp-Dialog von Begrüßung über Gebäude/Ort bis zu Positionen, Leitungslänge, Kondensat, Elektro, Leitungsweg und Zugang. Zusammen mit dem Code ist **STRONG INFERENCE**, dass der gemergte MVP-Engine-, Fact- und Delivery-Pfad den Test getragen hat. Welche exakten Datenzeilen/Facts in Production entstanden, ist ohne Production-Lesezugriff **UNKNOWN / REQUIRES PRODUCTION EVIDENCE**.

### Was der Test exponiert

| Beobachtung | Grad | Produktursache |
|---|---|---|
| Name wurde nicht gefragt; „Kunde:“ bleibt leer. | **STRONG INFERENCE** aus Live-Verhalten; leere UI-Darstellung **PROVEN** | Customer wird dem Provider weder als bekannt/unbekannt übergeben noch kann der strukturierte Output Customer mutieren. |
| Fotos wurden nicht aktiv erbeten. | **STRONG INFERENCE**; fehlende serverseitige Foto-Readiness **PROVEN** | Fotos sind Registry-Fact, aber keine Handoff-Bedingung; Instruktion sagt nur bei unzureichenden Bildern nachzufragen. |
| Agent erklärte die Erhebung zu früh für vollständig. | **STRONG INFERENCE** | Sechser-Readiness ignoriert u. a. Raumgröße und Medienabdeckung. |
| Viele gleichnamige „Neue Klimaanfrage“-Cards. | **PROVEN** | First Contact setzt konstanten Titel; Liste besitzt keinen nützlichen Summary-/Identity-Fallback. |
| Conversation nicht sichtbar. | **PROVEN** | Detailseite liest keine Conversation-/Message-Daten. |
| scheinbar fehlendes 00:40/00:50-Project. | **STRONG INFERENCE** für Zeitzonenfehldarstellung, nicht für fehlenden Datensatz | Serverformatter ohne `timeZone`; UTC/CEST-Differenz beträgt am Datum zwei Stunden. |

**RULED OUT:** Aus diesen Beobachtungen folgt weder eine neue Lifecycle-Entität noch verlorene Conversation-/Project-Daten noch die Notwendigkeit, WhatsApp-Persistenz neu zu bauen.

---

## 4. Customer Identity / Name Audit

### Verifizierter Ist-Zustand

First Contact erzeugt bei einer noch unbekannten Transportidentität einen Customer mit `first_name=NULL`, `last_name=NULL`, bindet ihn an die Transportidentität und Conversation und verwendet ihn bei späteren Conversations wieder. Die aktuelle AI-Turn-Eingabe enthält lediglich Project-Titel, Project-Fakten, Transcript und Medien – keine Customer-ID, keinen Namen und kein `name_known`. Der Output erlaubt nur Project-Facts. **PROVEN**.

Die normale `updateCustomer`-Authority ist browser-/adminorientiert und verlangt Vor- und Nachname. Sie eignet sich nicht unverändert für eine service-seitige AI-Mutation während eines WhatsApp-Turns. **PROVEN**.

### Kleinste korrekte Lösung

1. Customer-Namen bleiben ausschließlich `customers.first_name/last_name`; kein Project-Fact `customer_name`.
2. Turn Acquire liefert eine datensparsame Customer-Projektion: `name_known`, optional Vor-/Nachname; keine Transportidentität im Modellinput.
3. Das Modell fragt den Namen früh, aber nicht zwingend als erste isolierte Frage: nach Begrüßung zusammen mit einer kompatiblen Einstiegsfrage („Wie dürfen wir Sie ansprechen, und wo soll die Anlage installiert werden?“), sofern die konfigurierte Gruppenstrategie dies erlaubt.
4. Der strukturierte Output erhält einen eng validierten optionalen `customer_name_patch`. Die Commit-Authority darf atomar nur fehlende/noch unbekannte Namen des an Conversation und Project gebundenen Customers setzen. Eine Korrektur eines bereits bekannten Namens gehört in einen expliziten Admin-/Customer-Correction-Pfad, nicht in stille AI-Überschreibung.
5. Returning Customer: ist mindestens ein sinnvoller Anzeigename vorhanden, wird nicht erneut gefragt. Teilnamen werden als vorhandener Name behandelt; das System darf höflich nach Ergänzung fragen, aber Offer Readiness nicht daran blockieren.
6. UI-Fallback: vollständiger Name; sonst vorhandener Teilname; sonst „Name noch unbekannt“. Die Card bleibt über Ort + Building Type + kurze Summary unterscheidbar.

### Migration?

Die Spalten brauchen **keine** Migration. Für die eng begrenzte, atomare Runtime-Mutationsautorität und das erweiterte Acquire-/Commit-Contract ist eine **Migration erforderlich**. Das schützt gegen falsche Customer-Zuordnung und vermeidet einen allgemeinen Service-Role-Updatepfad. UI-only Null-Fallback und manuelles Admin-Edit benötigen keine Migration; das bestehende Edit-Schema sollte für automatisch angelegte Kunden partiell/null-tolerant gemacht werden, ohne leere Strings zu persistieren.

---

## 5. Project + Conversation Read-Model Audit

### Exakte vorhandene Beziehung

Für den aktuellen Normalfall:

```text
projects.id
  = conversations.current_project_id
conversations.id
  = conversation_messages.conversation_id
conversation_messages.id
  -> conversation_message_text.message_id        (Text)
  -> project_media.source_message_id              (WhatsApp-Bild)
conversation.id
  -> conversation_transport_bindings.conversation_id
     -> conversation_transport_identities.id      (PII, nicht browserlesbar)
outbound conversation_messages.id
  -> transport_delivery_commands.internal_message_id
     -> transport_send_attempts / transport_delivery_events
```

`conversation_project_assignments` ist die append-only Zuordnungshistorie und soll beim seltenen Reassignment die Herkunft erklären. Für die Workspace-Anzeige sollen alle Conversations mit aktuellem `current_project_id=project.id` **und**, zur historischen Vollständigkeit, alle über Assignments dem Project zugeordneten Conversations vereinigt und nach `created_at` sortiert werden. Deduplizieren nach Conversation-ID. Das ändert nicht den AI-Kontext: `acquire_mvp_ai_turn` lädt weiterhin ausschließlich den Verlauf der aktuellen Conversation.

### Read-Model-Entscheidung

- Server-Komposition in einem typisierten `project-workspace-read-service`, der vorhandene staff-authentifizierte Supabase Queries/Functions verwendet.
- Nachrichten chronologisch nach `sequence`, pagination/cursor über das existierende `list_conversation_messages` (maximal 100 pro Page).
- Darstellung: Customer links, KlimaGuy (`actor_class=ai|system`) rechts/markiert, Admin/Reviewer separat; Zeitstempel; Conversation-Status und Beginn/Ende als dezente Abschnittsheader.
- Bildnachrichten werden über `project_media.source_message_id` mit der vorhandenen Signed-URL-Funktion/Gallery gekoppelt. Die Reference-Tabelle allein ist für den produktiven WhatsApp-Bildpfad nicht die beste Join-Autorität.
- Delivery State nur für ausgehende Nachrichten und nur als `gesendet/zugestellt/fehlgeschlagen/ausstehend`, soweit aktuelle Delivery-Events diese Aussage tragen. Provider-wamid nicht im normalen UI anzeigen.
- Transportidentität ist PII und browserseitig gesperrt. In PR 1 genügt Customer-Telefon, sofern vorhanden, oder „WhatsApp-Kontakt“. Eine maskierte/normalisierte Kontaktprojektion benötigt später eine schmale staff-only SQL Function und damit Migration; niemals die Basistabelle freigeben.

### Einordnung der Lücken

| Lücke | Typ | Migration |
|---|---|---|
| Conversation im Workspace | Presentation/Read Model | **Nein** |
| Textchronologie | Presentation/Read Model | **Nein** |
| Inline Project-Bilder | Presentation/Read Model; Signed-URL-Reuse | **Nein** |
| grober Delivery State | Read Model | **Nein**, sofern aktuelle Tabellen/Policies über serverseitigen User-Client ausreichen; andernfalls schmale Function in einem späteren PR |
| sichere WhatsApp-Kontaktanzeige aus Transport-PII | fehlende sichere Projektion | **Ja** |
| neue Chat-Persistenz | nicht erforderlich | **RULED OUT** |

---

## 6. Timestamp / Timezone Audit

`projects/page.tsx`, Project Detail und Customer Detail verwenden `Intl.DateTimeFormat("de-DE", { dateStyle, timeStyle })` ohne `timeZone`. Diese Server Components formatieren im Runtime-Default des Servers; Vercel verwendet typischerweise UTC, aber die konkrete Production-Runtime-Konfiguration ist aus dem Repo nicht beweisbar. Die Project Media Gallery setzt bereits ausdrücklich `timeZone: "Europe/Berlin"`. **PROVEN**.

Am 15. September gilt in Berlin CEST (UTC+2). `2026-09-14T22:40:00Z` entspricht `2026-09-15 00:40` in Berlin. Daher ist **STRONG INFERENCE**, dass die vermeintlich fehlende 00:40-Anfrage als 22:40 angezeigt wurde. Ob genau diese Row der Live-Konversation entspricht, ist **UNKNOWN / REQUIRES PRODUCTION EVIDENCE**. Eine Aussage „Project fehlt“ oder „Datenverlust“ ist **RULED OUT als bewiesener Befund**.

### Zielregel

- Eine Domain-Konstante `KLIMAGUY_BUSINESS_TIME_ZONE = "Europe/Berlin"` und zentrale Formatter für Datum, Datum/Uhrzeit und relative Aktivität.
- Persistenz bleibt `timestamptz`/UTC; nur Anzeige wird in Business-Zeitzone projiziert.
- UI nennt an Stellen mit operativer Relevanz „Europe/Berlin“ bzw. „Ortszeit“ im Tooltip/Accessible Label.
- Serverseitig explizit formatieren; nicht vom Browser oder Deployment-Default abhängig machen.
- DST-Tests für Winter/Sommer und Tagesgrenzen.

Diese Korrektur benötigt **keine Migration**.

---

## 7. Photo + Vision Qualification Audit

### Warum heute keine Fotos natürlich angefordert werden

1. Die OpenAI-Instruktion sagt, bei **unzureichenden vorhandenen Bildern** ein hilfreiches Foto/Maß zu nennen; sie definiert keinen proaktiven Foto-Meilenstein. **PROVEN**.
2. `MVP_REQUIRED_PHOTO_CATEGORIES` ist ein Vokabular, keine Policy. `required_photo_categories` ist ein AI-setzbarer Project-Fact, aber `commit_mvp_ai_turn` wertet ihn nicht aus. **PROVEN**.
3. Server-Readiness prüft ausschließlich sechs Textfacts und Site Check bei zwei Technikfacts; es zählt keine `project_media` Rows. **PROVEN**.
4. Provider-`missing_facts` wird validiert, aber nicht als serverseitige kanonische Readiness-Liste gespeichert oder vollständig durchgesetzt. **PROVEN**.
5. WhatsApp-Bilder werden ohne Kategorie angelegt und erben `other`; die Vision-Projektion mappt jede unbekannte Kategorie auf `room_overview`. Damit kann die Runtime derzeit keine zuverlässige Kategorienabdeckung behaupten. **PROVEN**.

### MVP-Fotopolicy

**Pflicht vor Offer Readiness (mindestens ein verwertbares Bild je Ziel):**

- `room_overview` – Raum und Nutzungskontext;
- `indoor_unit_location` – geplante Innenposition;
- `outdoor_unit_location` – geplante Außenposition.

**Situativ verpflichtend, wenn der entsprechende Umfang behauptet, unklar oder preisrelevant ist:**

- `pipe_route` bei nicht vollständig sichtbarem/beschriebenem Leitungsweg oder besonderer Führung;
- `electrical_connection` bei vorhandener/behaupteter Versorgung, Unklarheit oder geplantem Elektroanteil;
- `condensate_route` bei unklarer Ableitung/Pumpe/Gefälle;
- ergänzend Zugang/Fassade über vorhandene `facade`, `balcony`, `roof`-Kategorien, wenn Sonderzugang oder Außenmontage dies verlangt.

„Pflicht“ bedeutet **für eine belastbare Offer-Vorbereitung**, nicht dass das Gespräch endlos blockiert: Kann/will der Kunde kein Bild liefern, wird der Zustand „fehlend/nicht verfügbar“ sichtbar, das Project geht mit `requires_human_review` bzw. `requires_site_check` in menschliche Prüfung statt fälschlich „vollständig“ zu melden.

### Anfrage-Strategie

- Erst Standort, Raum/Gerätezahl und grobe Positionen erheben; dann einen **gebündelten Foto-Request** mit drei klar nummerierten Motiven senden. Das ist weniger fragmentiert als sechs Einzelfragen und passt zu WhatsApp.
- Situative Bilder danach in höchstens einer zweiten Gruppe erbitten.
- Nach jedem Eingang kurz bestätigen, erkanntes Motiv vorsichtig benennen und noch fehlende Motive zusammenfassen; nicht jedes Bild mit einer neuen langen Frage beantworten.
- Bei nicht erkennbarem Motiv gezielt um Wiederholung/anderen Winkel bitten. Keine Maße, Materialeigenschaften, Tragfähigkeit oder Elektro-Kapazität aus Bild ableiten.

### Kategorie und Beobachtung

Der vorhandene `project_media`-Pfad genügt, aber benötigt eine kontrollierte Klassifizierung. MVP-Option: AI liefert je eingehendem Bild eine vorgeschlagene Kategorie plus kurze, nicht-freigebende Beobachtung; Commit aktualisiert die erlaubte Kategorie über eine enge Authority und speichert Beobachtungen als gekennzeichnete, überprüfbare Evidence/Fact-Projektion. Ein AI-Vorschlag ist nie technische Freigabe. Der Workspace zeigt pro Motiv:

```text
[✓ erhalten] Innenposition
Foto · vom Kunden · 00:52
KI-Beobachtung: „Freie Wandfläche sichtbar“ [ungeprüft]
Technische Prüfung: [offen]
```

Keine zweite Medientabelle. Wenn vorhandene Evidence-Strukturen die Beobachtung semantisch tragen, werden sie wiederverwendet; andernfalls reicht für MVP eine additive `project_media_ai_observations`-Tabelle mit Status `unreviewed|confirmed|rejected`, niemals ein freier technischer Approval-Text. Diese Detailentscheidung wird im Photo-PR anhand der bereits existierenden Evidence-DTOs umgesetzt, nicht in einem weiteren Audit.

### Readiness-Entscheidung

Serverseitige, deterministische Policy kombiniert Facts **und** aktive `ready` Project-Medien. `required_photo_categories` bezeichnet den berechneten Bedarf, nicht den Beweis des Eingangs. Readiness liefert getrennt:

- `missingFacts`;
- `missingPhotos`;
- `unclearOrUnreviewedPhotos`;
- `requiresSiteCheck`;
- `readyForTechnicalReview`.

„Unreviewed“ darf Technical Review starten, aber niemals technische Freigabe ersetzen. Vollständige Bilder reduzieren Missing Count; sie autorisieren weder Preis noch Offer-Send.

---

## 8. KlimaGuy Operations / Settings Audit

### Ist-Zustand

Eine Repository-Suche zeigt keine fachliche Settings-/Agent-Configuration-Tabelle oder Action. OpenAI-Instruktionen sind eine exportierte Konstante; Modell/Timeout stammen aus Environment; der Admin-Bereich bietet Simulator, Benutzer, Medien-Inventur und Testreset. **PROVEN**.

### Kleinste sinnvolle Persistenz

Eine globale, singletonartige Tabelle `klimaguy_agent_settings` genügt für MVP:

```text
id uuid PK
communication_formality enum/check: formal | informal
tone enum/check: professional | friendly | relaxed
response_length enum/check: short | balanced
emoji_usage enum/check: none | sparse
acknowledge_answers boolean
question_strategy enum/check: one_at_a_time | group_compatible
greeting_style enum/check: concise | warm
closing_style enum/check: concise | warm
ask_customer_name boolean
customer_name_timing enum/check: early | after_context
use_customer_name boolean
photo_request_strategy enum/check: grouped | sequential
unknown_answer_behavior enum/check: mark_unknown_and_continue | escalate_when_critical
site_visit_policy enum/check: recommend_on_required_site_check | human_decides
revision integer
updated_by uuid
created_at / updated_at timestamptz
```

Ein festes Singleton-ID-/Unique-Contract, RLS read for staff, admin-only update Function mit expected revision und Audit-Log. TypeScript liefert geprüfte Defaults, falls noch keine Row existiert. Keine Secrets und keine personenbezogenen Daten.

### Sicher konfigurierbar

- Sie/Du, Ton, Länge, sparsame Emojis;
- kurze Bestätigung;
- einzelne vs kompatibel gruppierte Fragen;
- Begrüßungs-/Abschlussstil als vordefinierte Varianten;
- Name fragen, Zeitpunkt, Name verwenden;
- gruppierte vs sequenzielle Fotoanforderung;
- Verhalten bei „weiß ich nicht“ innerhalb fester semantischer Grenzen;
- Empfehlung einer Vor-Ort-Prüfung nach festem Trigger.

Required Facts und harte Readiness-Regeln sollten im MVP **nicht beliebig im UI** editierbar sein. Sie sind versionierte Domain-Konstanten und Tests. Operations darf die Policy erklären und wenige sichere Strategien wählen, nicht die kanonische Fact Registry beliebig umbauen.

### Nicht konfigurierbare Guardrails

- keine erfundenen Preise oder Preisberechnung durch AI;
- keine automatische Approval oder Offer-Zustellung;
- keine Behauptung einer Vor-Ort-Besichtigung;
- keine unbelegte technische Gewissheit;
- keine Speicherung ungeprüfter AI-Aussagen als bestätigte Fakten;
- Project-/Conversation-/Human-Authority und current-Project isolation.

Diese Regeln bleiben in Instruktion, Zod, Domain-Policy und DB-Authority fest. Sie erscheinen im UI als gesperrte „Sicherheitsgrenzen“, nicht als Checkbox.

### Keine Versionierung pro Conversation im MVP

Snapshots pro Conversation sind **nicht notwendig**: Konfiguration beeinflusst Stil und Strategie, nicht die kanonische Bedeutung bereits gespeicherter Fakten oder die harten Guardrails. Bestehende Messages dokumentieren die tatsächlich gesendeten Texte. `revision` plus Audit-Log reicht für Nachvollziehbarkeit. Falls später regulierte A/B-Auswertung oder reproduzierbare Prompt-Rekonstruktion verlangt wird, kann eine Settings-Revision am Turn gespeichert werden. Jetzt wäre das Eleganz ohne Produktnutzen.

---

## 9. Qualification V2 Audit

### Registry gegen Live-Verlauf

| Bereich | Registry | Istproblem / Entscheidung |
|---|---|---|
| Customer Name | nicht enthalten – korrekt | Muss Customer-Masterdata bleiben; eigener enger Patch. |
| Adresse/PLZ/Ort | vorhanden | Nur Adresse ist Readiness-Pflicht; PLZ/Ort sollen bei offerfähigem Vor-Ort-Leistungsumfang vollständig sein oder bewusst unknown. |
| Gebäude/Raum/Etage | vorhanden | Building/Room/Floor fehlen in der Sechser-Readiness. Für Summary und technische Einschätzung relevant. |
| Raumgröße | vorhanden | Wurde im Live-Befund nicht genannt und ist nicht Pflicht. Für Anlagen-/Leistungsauswahl sollte grobe Größe Pflicht oder durch expliziten Site Check ersetzt werden. |
| Anzahl/Positionen | vorhanden und teilweise Pflicht | Wiederverwenden; bei mehreren Räumen reicht ein einzelner globaler `room_type`/`room_area_sqm` langfristig nicht, aber keine parallele Entität im MVP. Zusätzliche Räume zunächst als Notes + Human Review. |
| Leitung/Kernbohrung | vorhanden | `line_route` Pflicht, Länge/Kernbohrung nicht. Preisrelevante Unklarheit muss Site Check/Human Review auslösen. |
| Kondensat/Elektro/Zugang | endliche Semantiken vorhanden | Nur exakt `requires_site_check` bei Kondensat/Elektro blockiert; `unknown` und besonderer Zugang tun es nicht. Policy nachschärfen. |
| Fotos | Kategorien-Fact vorhanden | Eingang wird nicht geprüft; siehe Fotopolicy. |

### „Nein“ und epistemische Semantik

Ein nacktes „Nein“ ist nur im Kontext der zuletzt gestellten Frage interpretierbar. Es darf bei „Ist eine Steckdose vorhanden?“ nicht ohne Weiteres `electrical_supply=not_available` bedeuten, wenn unklar ist, ob der Kunde Verfügbarkeit, Eignung oder Wissen verneint. Qualification V2 muss:

- `available`: Kunde bestätigt klar das Vorhandensein des konkret Gefragten; keine Aussage zur technischen Eignung;
- `not_available`: Kunde bestätigt klar, dass es nicht vorhanden/lieferbar ist;
- `unknown`: Kunde weiß es nicht oder Aussage ist mehrdeutig;
- `requires_site_check`: Feststellung kann/soll vor Ort erfolgen oder besitzt technische Relevanz, die per Chat/Foto nicht ausreichend geklärt wird.

Bei mehrdeutigem „Nein“ speichert die AI keinen technischen Zustand, sondern stellt eine kurze Klärungsfrage oder `unknown`. Customer-Aussage und technische Freigabe bleiben getrennt.

### Zielverhalten

1. Begrüßen, bekannten Namen respektieren; unbekannten Namen früh erfragen.
2. Aus aktuellem Transcript, Facts, Fotoabdeckung und Settings die **höchste Informationsausbeute** wählen.
3. Kompatible einfache Angaben bündeln, technische/mehrdeutige Fragen einzeln stellen.
4. Bekannte Fakten nicht erneut fragen; Korrekturen explizit bestätigen.
5. „Weiß ich nicht“ akzeptieren, als `unknown` markieren und fortfahren; nur preis-/sicherheitskritische Unknowns führen zu `requires_site_check`/Human Review.
6. Nach Kernfakten gruppiert Fotos anfordern.
7. Stoppen, wenn alle Pflichtfacts und Fotomotive vorhanden sind **oder** verbleibende Lücken nur menschlich/vor Ort klärbar sind.
8. Abschlussbotschaft präzise: „Die Angaben reichen für unsere technische Prüfung“ statt „alle wichtigen Informationen liegen vor“.
9. Technical Review beginnt immer als menschliche Prüfung. `needs_human` wechselt/flaggt bei Widerspruch, Sicherheitsfrage, Kundenwunsch, Unsupported oder Site Check; AI erstellt kein Offer.

Sie/Du wird pro Settings fest gewählt und über den gesamten Turn konsistent gehalten; „in Sprache des Kunden“ darf diese betriebliche Anredeentscheidung nicht überschreiben.

---

## 10. Admin UX / Information Architecture

### Visuelle Richtung

Kein Frameworkwechsel. Tailwind und Server Components bleiben. Die existierenden Primitives werden zu einem kleinen konsistenten System erweitert: Page Header, Metric/Status Card, segmented Tabs, Data Table/Card Hybrid, Empty State, Timeline, Skeleton, Icon Button, Field Group, sticky Action Rail. Teal bleibt Markenfarbe, Slate bildet Informationshierarchie, Amber markiert Review/Unklarheit, Red ausschließlich Blocker, Emerald bestätigte Zustände. Mehr Weißraum, klare Typografie, sichtbare Focus States und responsive Tabellen/Card-Fallback.

### A. Project List / Inbox

```text
┌ Projekte / Anfragen ───────────────────── [+ Manuelles Projekt] ┐
│ [Suche Name, Ort, Projekt …] [Status ▾] [Review ▾] [Fehlt ▾]   │
│ Neue  8   In Qualifikation 5   Prüfung 3   Angebot 2           │
├─────────────────────────────────────────────────────────────────┤
│ ⚠ Anna Beispiel · WhatsApp                      vor 12 Min      │
│ Hamburg · Einfamilienhaus · Wohnzimmer                        │
│ 1 Innengerät, ca. 5 m Leitung                                  │
│ [Qualifikation 78%]  3 Angaben/Fotos fehlen  [Human Review]    │
├─────────────────────────────────────────────────────────────────┤
│ Name noch unbekannt · WhatsApp                   gestern        │
│ 220xx Hamburg · Neue Anfrage                                   │
│ [Sammelt Angaben]  7 fehlen                                   │
└─────────────────────────────────────────────────────────────────┘
```

Defaultsortierung: Human-/Site-Check-Blocker zuerst, dann jüngste Customer-Aktivität, dann `updated_at`. Search über Name, Project-Titel, Ort/PLZ; Statusfilter entsprechen bestehendem Lifecycle. Kein generisches CRM-Tagging in PR 1.

### B. Project Workspace

```text
┌ Anna Beispiel / Hamburg                    [Technische Prüfung] ┐
│ WhatsApp · zuletzt 00:52 · Name/Adresse/Status auf einen Blick │
│ [Übersicht] [Conversation] [Fakten] [Fotos] [Angebot] [Aktivität]│
├──────────────────────────────────────────────┬──────────────────┤
│ Projektzusammenfassung                       │ Was fehlt?        │
│ Gebäude, Raum, Geräte, Strecke, Risiken      │ □ Raumgröße       │
│                                              │ □ Elektro-Foto    │
│ Aktuelle Fakten / wichtigste Fotos           │ ⚠ Leitungsweg     │
│                                              │ [Review starten]  │
└──────────────────────────────────────────────┴──────────────────┘
```

Ein Server-Workspace mit URL-Tab (`?tab=conversation`) genügt; keine Client-SPA-Neuarchitektur. Mobile: rechte Rail unter Inhalt.

### C. Conversation Tab

```text
Conversation #2 · offen · seit 14.09. 22:40 (Europe/Berlin)
──────────────────────────────────────────────────────────────
Kunde  00:40   Hallo
                              KlimaGuy  00:40   Guten Abend … ✓
Kunde  00:43   In einem Einfamilienhaus
Kunde  00:52   [Bild: Außenposition]  [im Fotobereich öffnen]
                              KlimaGuy  00:53   Danke, …
──────────────────────────────────────────────────────────────
[Historische Conversation #1 · geschlossen · anzeigen]
```

### D. KlimaGuy Operations

```text
KlimaGuy Operations                         [Änderungen speichern]
┌ Kommunikation ───────────┐ ┌ Kundenhandling ────────────────┐
│ Anrede [Sie ▾]           │ │ Name erfragen [an]             │
│ Ton [freundlich ▾]       │ │ Zeitpunkt [früh ▾]             │
│ Länge [kurz ▾]           │ │ bekannten Namen nutzen [an]    │
│ Fragen [kompatibel grp.] │ └────────────────────────────────┘
└──────────────────────────┘ ┌ Qualifikation ──────────────────┐
┌ Feste Schutzregeln ──────┐ │ Fotos [gruppiert ▾]            │
│ 🔒 Keine Preise durch KI │ │ Unknown [markieren/weiter]     │
│ 🔒 Keine Auto-Freigabe   │ │ Readiness Policy v2 (read-only)│
│ 🔒 Kein Auto-Versand     │ └────────────────────────────────┘
└──────────────────────────┘
```

### E. Offer Studio

```text
Angebot #1 · Entwurf                  [Vorschau] [Zur Freigabe]
┌ Projektwissen / Risiken ───────┐ ┌ Angebotspositionen ─────────┐
│ 1 Gerät · 5 m Leitung         │ │ Gerät [Produkt wählen]      │
│ 1 Kernbohrung? ⚠ ungeklärt    │ │ Montage innen     1 × €…    │
│ Elektro: Site Check           │ │ Kältemittelleitung 5 m × €… │
│ Fotos 3/4                     │ │ + individuelle Position     │
└───────────────────────────────┘ ├──────────────────────────────┤
                                 │ Netto / Rabatt / Steuer / Brutto│
KI-Vorschläge: Positionstyp +     │ [Speichern] [Freigeben]       │
Menge + Begründung, niemals Preis └──────────────────────────────┘
```

### „In Sekunden verstehen“-Reihenfolge

Identität/Ort → Lifecycle/letzte Aktivität → kompakte Summary → Completeness/Blocker → Kernfacts → Fotos → Conversation → Offer. Edit-Formulare werden in kontextuelle Aktionen/Drawer oder klar abgegrenzte Sektionen verschoben, nicht als primäre Informationsoberfläche gezeigt.

---

## 11. Offer Studio Audit

### Was das bestehende Modell kann

Es kann einen menschlich ausgelösten Draft erzeugen, dessen Lebenszyklus versionieren, Transitionen gegen Revision schützen, eine alte created/sent Version superseden, Project-Status synchronisieren und alles auditieren. Das ist eine gute Header-/Lifecycle-Autorität und wird **erweitert, nicht ersetzt**.

### Was ihm für ein echtes Angebot fehlt

- Kunden-/Rechnungs-/Leistungsadress-Snapshot oder bewusst aktuelle Customer-Projektion;
- Positionen, Reihenfolge, Typ, Beschreibung, Einheit, Menge;
- Produkt-/Service-Katalog und wiederverwendbare Preisitems;
- Einkaufspreis, Verkaufspreis, Marge, Rabatt, Steuer;
- manuelle freie Position;
- Summenberechnung in deterministischem Domain-Code/SQL;
- AI-Vorschläge mit Begründung und Herkunft aus Facts, getrennt von akzeptierten Positionen;
- Preview/PDF-Artefakt;
- Freigabeakteur/-zeitpunkt (aktuelles `created` bedeutet ausdrücklich nur materialisierte Revision, nicht PDF oder Freigabe);
- Zustellkanal/-empfänger/-ergebnis für WhatsApp/E-Mail.

### Minimales additives Modell

1. `offer_catalog_items`: UUID, kind `product|service`, SKU optional, Name/Beschreibung, Einheit, default tax rate, menschlich gepflegte Einkaufs-/Verkaufspreise als Integer-Cents, aktiv/soft-deleted, Zeitstempel. Admin RLS.
2. `project_offer_line_items`: UUID, `offer_id`, position, kind, optional `catalog_item_id`, description snapshot, unit, quantity decimal, purchase/sales unit price cents, discount basis points or amount, tax basis points, `source=human|ai_suggested`, suggestion reason, accepted_by/at optional, Zeitstempel. Keine Kaskadenlöschung; Draft editierbar über schmale Functions mit Offer-Revision/CAS.
3. Optional in demselben PR: `project_offer_artifacts` für generierte PDF-Metadaten/Storage-Locator und `project_offer_deliveries` für explizit menschlich ausgelöste Zustellung. Falls PDF/Zustellung erst PR 7 folgt, diese Tabellen dort anlegen, nicht vorsorglich.
4. Bestehendes `project_offers` minimal um `approved_at`, `approved_by`, Währung und ggf. Customer/Address Snapshot ergänzen. Alternativ einen klaren Status `approved` zwischen Draft/created und sent hinzufügen. Da `created` aktuell ausdrücklich **keine** Freigabe bedeutet, soll UI es nicht umdeuten. Die genaue additive Enum-Migration muss bestehende Transitionen kompatibel weiterführen.

Geld ausschließlich integer minor units/validierte Decimal-Mengen; Summen deterministisch. AI darf niemals Preisfelder liefern. AI-Suggestion-Contract umfasst nur `position_type`, `quantity`, `unit`, `reason`, Fact-Quellen. Erst menschliche Annahme erzeugt/aktiviert eine Position; Auswahl, Produkt und alle Geldwerte bleiben Human Authority.

### MVP NOW

- vorhandenen Offer Header/Lifecycle weiterverwenden;
- kleiner aktiver Produkt-/Leistungskatalog;
- katalogbasierte und freie Positionen;
- Mengen, Ein-/Verkauf, Marge, Rabatt, Steuer und Summen;
- Project-Knowledge-/Risiko-Sidebar;
- AI schlägt nur Positionstyp/Menge/Begründung vor;
- menschliches Speichern, Freigeben und Senden;
- HTML Preview, anschließend serverseitig generiertes PDF;
- explizite WhatsApp- oder E-Mail-Zustellung mit Ergebnis;
- eine neue Version durch vorhandenes Supersede, wenn ein bereits materialisiertes/versandtes Offer geändert wird.

### LATER / NICE TO HAVE

- großer Lieferantenkatalog/ERP-Sync;
- komplexe Bundles, Staffelpreise, Lagerbestand;
- digitale Signatur/Online-Acceptance;
- tiefes Versionsdiff;
- automatische Follow-up-Kampagnen;
- won/lost Analytics jenseits vorhandener accepted/rejected Zustände.

Mehrere parallele Drafts, generische CPQ-Engine und AI-Preisoptimierung sind für MVP **REJECTED**.

---

## 12. MVP vs Later Feature Matrix

| Feature | Rang | Begründung |
|---|---|---|
| Project Inbox | **NOW** | Macht reale Anfragen operativ auffindbar. |
| Conversation im Workspace | **NOW** | Daten bestehen bereits; höchste Transparenz bei kleinem Risiko. |
| Qualification Completeness / „Was fehlt?“ | **NOW** | Verhindert verfrühte Vollständigkeitsannahme. |
| Customer Name | **NOW** | Identifizierbarkeit ist unmittelbarer Betriebsbedarf. |
| Fotoanforderung/-abdeckung | **NOW** | Voraussetzung für belastbare technische Prüfung. |
| Human Takeover / AI Resume | **NEXT** | Conversation-Statusautorität existiert; wichtig bei `needs_human`, nach Workspace/Readiness. |
| interne Project Summary | **NOW** als deterministische/AI-vorgeschlagene, klar ungeprüfte Summary | Workspace muss schnell erfassbar sein; keine neue kanonische Faktenquelle. |
| Customer History mit mehreren Projects | **NOW** in bestehender Customer-Seite/Workspace-Link | Beziehungen existieren bereits. |
| Site-Visit-Handoff | **NEXT** | Direkte Folge von `requires_site_check`; zunächst Status/Reminder, kein Kalenderprodukt. |
| Follow-up Reminder | **NEXT** | Hoher Operations-Wert nach Inbox; einfache Project Reminder genügen. |
| Offer Follow-up | **NEXT** | Erst nach tatsächlicher Zustellung sinnvoll. |
| Won/Lost Outcome | **LATER** | accepted/rejected bestehen; feinere Gründe später. |
| einfache Conversion Metrics | **LATER** | Erst bei verlässlichem Workflow/Volumen. |
| Tags | **LATER** | Nutzen geringer als strukturierte Facts/Status; kein generisches CRM. |
| Termin-/Kalenderintegration | **LATER** | Site-Visit-Handoff zuerst manuell. |
| generische CRM-Pipeline | **REJECT FOR MVP** | Dupliziert Project Lifecycle und erweitert Scope unnötig. |
| autonomer AI Offer Send | **REJECT FOR MVP / GUARDRAIL** | Verletzt feste Human Authority. |

---

## 13. Required Data-Model Changes

| Vorschlag | Warum erforderlich | Reuse statt neuem Schema | Migration? |
|---|---|---|---|
| Customer-Name Turn Authority | AI muss Namen atomar am gebundenen Customer speichern dürfen. | Bestehende nullable Name-Spalten und stabile Customer-Bindung; keine neue Identity. | **Ja**, Functions/Acquire-/Commit-Contract; keine neuen Name-Spalten. |
| Project Workspace/Conversation Read Model | Vorhandene Daten sichtbar machen. | Conversations, Messages, Text, Project Media, Facts und Functions direkt nutzen. | **Nein** für Kernansicht. |
| maskierte WhatsApp-Kontaktprojektion | Transport-PII darf nicht direkt für Browser freigegeben werden. | Existing transport identity + binding, nur schmale DTO Function. | **Ja**, falls/ sobald echte WhatsApp-ID gezeigt wird. |
| Business-Timezone | konsistente Anzeige. | zentrale TS-Konstante/Formatter. | **Nein**. |
| Photo Readiness / Category Authority | tatsächliche Medienabdeckung und saubere WhatsApp-Kategorie. | `project_media`, Quellen-IDs, bestehende Kategorien, `required_photo_categories`. | **Ja** für kontrollierte Klassifikation und serverseitigen Handoff-Contract; keine zweite Media Authority. |
| Vision Observation Review (nur falls Evidence nicht ausreicht) | AI-Beobachtung sichtbar, aber nicht als Approval. | Bevorzugt bestehende Project Evidence/Claim-Review-Strukturen. | **Nein**, wenn bestehende Evidence passt; sonst **Ja**, genau eine additive Observation-Tabelle. |
| Operations Settings | heute keine Persistenz; Admin muss sichere Optionen steuern. | feste Domain-Defaults/Enums; kein Prompttext. | **Ja**, eine globale Settings-Tabelle + Update Function/RLS/Audit. |
| Offer Catalog | wiederverwendbare menschliche Produkte/Leistungen und Preise. | Existing Offer bleibt Lifecycle Header. | **Ja**. |
| Offer Line Items | konkretes, berechenbares Angebot. | Existing `project_offers` als FK/Header/Version. | **Ja**. |
| Approval metadata/status | Human Approval explizit von „created“ trennen. | Existing Lifecycle erweitern, nicht ersetzen. | **Ja**. |
| PDF/Delivery records | nachvollziehbares Artefakt und Human-triggered Versand. | Existing private Storage/WhatsApp Delivery Patterns, aber Offer-spezifischer Auftrag. | **Ja** im Delivery-PR, nicht vorzeitig. |
| neue Qualification-Entität/`qualification_runs` | nicht erforderlich. | Project Facts + Conversation + Turn/Handoff. | **Nein / RULED OUT**. |
| neues Chat-/Medienmodell | nicht erforderlich. | Existing Messages/Project Media. | **Nein / RULED OUT**. |

---

## 14. Reuse Matrix

| Existierender Baustein | Entscheidung | Konkrete Nutzung |
|---|---|---|
| `customers.first_name/last_name` | **keep + extend authority/UI** | einziger Customer-Name-Kanon |
| Customer CRUD Actions | **keep** | manuelle Pflege; Null-/Teilnamen UX erweitern |
| Transport Identity/Bindings | **keep** | stabile Rückkehrerkennung; PII nur über schmale Projektion |
| `conversations` + Assignments | **keep** | Lifecycle, Project-Verknüpfung, historische Abschnitte |
| Message-/Text-/Reference-Tabellen | **keep** | vollständiger Conversation-Feed |
| `list_conversation_messages` | **keep + wrap** | paginierter typisierter Read Service |
| Delivery Commands/Events | **keep + project useful state** | dezente Outbound-Zustellung |
| `projects` Lifecycle | **keep** | keine neue Pipeline |
| `mvp_project_facts` + Registry | **keep + extend policy** | kanonisches Current-Project-Wissen |
| `evaluateMvpQualificationReadiness` / Commit SQL | **extend** | Facts + Photos + Unknown/Site Check deterministisch |
| `project_media` + Storage + Gallery | **keep + replace UI composition** | einziges Medienmodell; Fotoabdeckung ergänzen |
| `mvp_ai_turn_media` | **keep** | stateless Current-Conversation Vision |
| bestehende Evidence-Modelle | **extend where semantically valid** | AI Observation vs Human Review sichtbar trennen |
| festes OpenAI Instruction-Modul | **keep + compose settings** | harte Guardrails fest, sichere Settings injizieren |
| Simulator | **keep/bypass in Operations primary UX** | Debug-Werkzeug, nicht Operations-Startseite |
| `Card`, `Badge`, `Button`, Tailwind | **extend** | kohärentes UI-System ohne Rewrite |
| aktuelle Project List | **replace UI only** | Inbox Read Model auf denselben Daten |
| aktuelle Project Detail Forms | **keep, recompose** | in Tabs/Actions statt Form-Sammlung |
| `project_offers` + Commands/RPCs | **keep + extend** | Offer Header, Version, Lifecycle |
| `ProjectOfferHandoff` | **replace UI only** | Einstieg ins Offer Studio statt einzelner Button |
| Offer read/service code | **keep + expose** | Current/History und Transitionen im Studio |
| Legacy Conversation Intelligence | **bypass for MVP product path** | keine Neuentwicklung/kein Rewrite; Thin Path bleibt |

---

## 15. Implementation Roadmap

### PR 1 — Project Inbox + Project Workspace V2

- **Product Outcome:** Reale Anfragen sind nach Name/Fallback, Ort, Status, Aktivität, Completeness und Review auffindbar; Detail zeigt Übersicht, Conversation, Facts, Photos, Offer-Einstieg und Activity/Notes. Business-Zeitzone ist überall konsistent.
- **Codebereiche:** `app/(app)/projects/page.tsx`, `app/(app)/projects/[id]/page.tsx`, neue Komponenten unter `app/(app)/projects/`, `components/ui.tsx`, `app/(app)/layout.tsx`, `lib/actions/` Read Services, `lib/domain/mvp-qualification-readiness.ts`, Media Gallery Read Service; zentrale Date Formatter.
- **Migration:** **Nein.** Bestehende staff RLS/Conversation Functions, Facts, Project Media und Notes werden gelesen.
- **Reuse:** Project/Customer, Conversations/Messages, `list_conversation_messages`, `mvp_project_facts`, Gallery/Signed URLs, Statusmapper, Permissions.
- **Tests:** Read-Model-Mapping (Null-Name, mehrere/historische Conversations, sequence order, image join), Inbox-Sort/Filter/Search, Timezone DST/day-boundary, a11y labels, permission-safe states, component tests.
- **Non-Scope:** keine Runtime-Promptänderung, keine Customer-Name-Mutation, keine Foto-Handoffänderung, keine Offer-Positionen, keine Transport-PII-Freigabe.
- **Dependency:** keine; **dies ist der nächste PR**.

### PR 2 — Customer Identity in Qualification + Qualification V2 Policy

- **Product Outcome:** KlimaGuy fragt unbekannte Namen früh, speichert sie am bestehenden Customer, fragt Rückkehrer nicht erneut; Unknown/Site-Check und eine vollständige Fact-Readiness verhindern falsche Vollständigkeit. Abschluss heißt korrekt „bereit für technische Prüfung“.
- **Codebereiche:** `lib/domain/mvp-project-facts.ts`, `lib/domain/mvp-qualification-readiness.ts`, `lib/domain/mvp-ai-turn.ts`, OpenAI Output/Instructions/Adapter, `lib/server/conversation/mvp-conversation-turn.ts`, Customer Schemas/Actions/UI, Acquire-/Commit-Migrationen.
- **Migration:** **Ja**, additive/replaced Functions für Customer Projection/Patch und deterministischen Handoff; vorhandene Customer-Spalten bleiben.
- **Reuse:** stabile Transport-Customer-Bindung, current Project, existing Facts, atomic Turn Commit, Human Review.
- **Tests:** Name known/unknown/partial/returning/correction, no cross-Customer write, „Nein“ ambiguity, unknown vs not_available vs site check, required fact groups, no pricing/approval/send, stale lifecycle fences.
- **Non-Scope:** Operations UI, Foto-Kategorisierung, Offer Studio, neue Qualification Entity.
- **Dependency:** PR 1 stellt Zustand/Fehler sichtbar dar, fachlich aber keine DB-Abhängigkeit.

### PR 3 — Photo Request + Vision Readiness V2

- **Product Outcome:** KlimaGuy fordert drei Kernbilder gebündelt und situative Bilder gezielt an; eingehende Bilder werden am bestehenden Project Media sauber kategorisiert, Abdeckung/Unklarheit ist sichtbar, Handoff bleibt ehrlich.
- **Codebereiche:** Media ingestion/finalization SQL und Adapter, `MVP_REQUIRED_PHOTO_CATEGORIES`, Turn Output/Instructions, `commit_mvp_ai_turn`, Qualification Readiness, Workspace Photos/Conversation, bestehende Evidence Services.
- **Migration:** **Ja**, enge Category-/Observation-/Readiness-Authority; Observation-Tabelle nur falls bestehende Evidence-Semantik nicht passt.
- **Reuse:** `project_media`, Storage, source Conversation/Message, `mvp_ai_turn_media`, Vision, Gallery, Evidence Review.
- **Tests:** grouped request, core/situational category matrix, actual ready/nondeleted media counting, unclear/no-photo fallbacks, current-Project/Conversation isolation, image inline mapping, AI observation remains unapproved.
- **Non-Scope:** technische Freigabe durch Vision, zweites Media-Modell, Preisableitung aus Bildern.
- **Dependency:** PR 2 Readiness-Semantik; PR 1 Workspace-Ziele.

### PR 4 — KlimaGuy Operations Settings

- **Product Outcome:** Admin kann sichere Kommunikations-, Customer- und Qualification-Strategien in einer polierten Operations-Seite einstellen; feste Guardrails sind sichtbar und gesperrt.
- **Codebereiche:** neue `app/(app)/admin/klimaguy/` oder `/klimaguy/operations`, Navigation/Permissions, Settings Domain/Zod/Actions/Read Service, OpenAI Instruction Composer, Migration.
- **Migration:** **Ja**, eine globale strukturierte Settings-Tabelle, RLS, CAS Update Function, Audit.
- **Reuse:** Admin Permission Pattern, Server Actions, Zod, fixed Instruction module, simulator als separater Debug-Link.
- **Tests:** Defaults, every enum/boolean, admin-only update, stale revision, prompt composition, Sie/Du consistency, guardrails impossible to disable, no PII/secrets.
- **Non-Scope:** freies Prompt-CMS, per-Customer settings, per-Conversation snapshots/version tables, A/B testing.
- **Dependency:** PRs 2–3 definieren die tatsächlich konfigurierbaren Strategien.

### PR 5 — Offer Studio Foundation: Catalog + Line Items + Human Pricing

- **Product Outcome:** Admin erstellt aus Project-Wissen ein echtes Draft-Angebot, wählt Produkte/Services, fügt freie Positionen hinzu und kontrolliert Menge, Einkauf, Verkauf, Marge, Rabatt und Steuer; Summen sind deterministisch.
- **Codebereiche:** additive Offer-Migration, `lib/domain/project-offer.ts`, Offer Services/Actions/Permissions, neue `app/(app)/projects/[id]/offer/` UI, Project Offer Tab, Katalogverwaltung.
- **Migration:** **Ja**, Catalog, line items, CAS Functions/RLS/Audit und minimale Header-/Approval-Erweiterung.
- **Reuse:** `project_offers` Header/version/revision, existing Offer commands/status projection, Project Facts/Media Summary, admin-only authority.
- **Tests:** integer-money/rounding/tax/discount/margin, line ordering, catalog snapshot, manual item, revision/idempotency, RLS, status restrictions, AI cannot write price or approve.
- **Non-Scope:** PDF, Versand, ERP, Online-Acceptance, automatische Preise.
- **Dependency:** PR 1 Offer-Tab und PRs 2–3 verlässliches Project Knowledge.

### PR 6 — AI Position Suggestions + Technical Review Handoff

- **Product Outcome:** Offer Studio schlägt ausschließlich relevante Positionstypen, Mengen und nachvollziehbare Fact-Quellen vor; Mensch nimmt an, verwirft oder überschreibt. Site-Check-/Risiko-Panel blockiert unzulässige Freigabe.
- **Codebereiche:** neuer streng strukturierter server-only Suggestion Adapter, Project Fact/Media Read Model, Offer Suggestion Domain/Actions/UI, Review Controls.
- **Migration:** **Möglich/klein:** nur wenn Suggestions vor menschlicher Annahme persistent sein sollen; bevorzugt Draft-line `source/suggestion_reason` aus PR 5 und keine weitere Tabelle.
- **Reuse:** existing stateless OpenAI pattern, Zod, Facts, line items, Human Review/Offer permissions.
- **Tests:** allowlisted position types, quantities from facts only, source references, no price fields in schema, unknown/site-check handling, human acceptance required, prompt injection/invalid output rejected.
- **Non-Scope:** AI pricing, product selection without human, Approval, Send.
- **Dependency:** PR 5 und Qualification/Photo V2.

### PR 7 — Offer Preview, Human Approval und Delivery

- **Product Outcome:** Mensch prüft eine stabile Vorschau, genehmigt explizit, erzeugt PDF und sendet bewusst via WhatsApp oder E-Mail; Status und Ergebnis sind nachvollziehbar, neue Fassung nutzt vorhandenes Supersede.
- **Codebereiche:** Offer Lifecycle/Artifact/Delivery Migration, PDF service/template, private Storage access, Offer Studio approval/send Actions, WhatsApp outbound reuse where contractually suitable, E-Mail Adapter, Activity timeline.
- **Migration:** **Ja**, explizite Approval-Metadaten/-Transition sowie Artifact-/Delivery-Records/RLS/Audit.
- **Reuse:** Offer revisions/commands, private Storage patterns, outbound delivery safety patterns, Project/Customer contact data, Audit Log.
- **Tests:** approval only by authorized human, immutable approved payload/artifact, send requires approved current revision and explicit recipient confirmation, idempotency/retry, no autonomous trigger, signed PDF access, supersede history.
- **Non-Scope:** e-signature, payment, automated follow-ups, CRM analytics.
- **Dependency:** PRs 5–6.

---

## 16. Recommended First Implementation PR

**PR 1: Project Inbox + Project Workspace V2** ist verbindlich der erste Produkt-PR nach diesem Audit.

Warum:

- Er erschließt sofort vorhandene Production-Daten statt neue Architektur zu bauen.
- Er löst den bewiesenen Conversation-Sichtbarkeitsfehler und den Zeitzonenfehler ohne Migration oder Runtime-Risiko.
- Er zeigt unbekannte Namen, fehlende Facts/Fotos und historische Conversations ehrlich, wodurch die nächsten Runtime-Änderungen operativ beobachtbar werden.
- Er nutzt vorhandene RLS, Messages, Facts, Media, Notes und Offer Header.
- Er lässt alle festen Authority-Grenzen unverändert.

**Akzeptanzkern:** Ein Admin öffnet `/projects`, findet die jüngste Anfrage anhand von Activity/Ort/Name-Fallback, öffnet sie und sieht binnen Sekunden Customer, Status, Summary, Missing Panel, chronologische aktuelle Conversation, Facts, Bilder und Offer-Status. Alle Uhrzeiten erscheinen explizit in `Europe/Berlin`. Keine Production-/Credential-Untersuchung ist Voraussetzung.

---

## 17. Final Target State

1. Eine WhatsApp-Anfrage trifft über die bestehende deduplizierte Transport-Ingestion ein.
2. Die stabile Transportidentität wird an den bestehenden oder neuen Customer gebunden; KlimaGuy fragt einen unbekannten Namen früh und speichert ihn ausschließlich am Customer.
3. Die aktuelle Conversation bleibt alleinige AI-Memory-Grenze; eine neue Conversation nach Close erhält ein neues Project, während Historie erhalten bleibt.
4. KlimaGuy qualifiziert natürlich, nutzt die kanonische Project-Fact Registry, akzeptiert Unknowns und fragt jeweils die wertvollste Information.
5. Nach den Kernfacts bittet er gebündelt um Raum-, Innen- und Außenfoto sowie situativ Route/Elektro/Kondensat. Bilder landen ausschließlich in `project_media`; Vision liefert ungeprüfte Beobachtungen, keine Freigabe.
6. Die Project Inbox priorisiert neue/aktive/blockierte Anfragen. Im schönen Workspace versteht ein Admin Identität, Ort, Umfang, Completeness, Conversation, Facts, Fotos und Risiken in Sekunden.
7. Verbleibende Unklarheiten führen transparent zu Human Review bzw. Site Visit; „bereit“ bedeutet bereit für **menschliche technische Prüfung**, nie fertig angeboten.
8. Offer Studio übernimmt Project Knowledge, lässt die AI nur Positionstyp/Menge/Begründung vorschlagen und lässt den Menschen Produkt, Menge, Einkauf, Verkauf, Marge, Rabatt und Steuer festlegen.
9. Ein berechtigter Mensch prüft und genehmigt die konkrete Offer-Version, erzeugt die Vorschau/PDF und stößt den Versand via WhatsApp oder E-Mail explizit an.
10. Lifecycle, Version, Zustellung und Ausgang bleiben nachvollziehbar; PostgreSQL bleibt kanonisch, historische Conversations/Receipts/wamids bleiben erhalten, und kein Modell inventiert Preise, genehmigt oder versendet autonom.

Damit lautet der Zielpfad:

**WhatsApp inquiry → identifiable Customer → natural Qualification → Photos → structured Project → polished Admin Workspace → human Technical Review → prepared Offer Studio → human Pricing/Approval → final Offer Delivery.**

**Stop-Bedingung dieses Audits:** Dieses Dokument ist die Implementierungsautorität nach Merge. Es gibt keinen weiteren Audit-Schritt vor Roadmap-PR 1 und in diesem PR keinerlei Laufzeit-, UI-, Migrations-, Konfigurations- oder Production-Änderung.
