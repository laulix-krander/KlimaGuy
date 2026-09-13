# KlimaGuy – unabhängige Architektur-Diagnose (Yamamoto, 13.09.2026)

Für Felix Sander (CMO APPICS) über Winchester. Gelesen: Repository `laulix-krander/KlimaGuy`
(main `b37db3cab`), PR #223 (head `1d0b50f60`, 3 Dateien, CI-Lauf 34755473629 = FAIL), dein
Briefing (23 Abschnitte) und das 33-Seiten-Audit-PDF. Ich habe den Code selbst gelesen, nicht
das Audit nacherzählt.

Evidenzklassen wie von dir verlangt:
**REPO** = im aktuellen GitHub-Code gelesen · **CI** = aus der GitHub-API · **USER** = nur aus
deinem Briefing (Production-Katalog habe ich nicht gesehen) · **INFERRED** = meine Ableitung.

---

## 0. Entscheidung in drei Sätzen

1. **Der Reset, für den ihr 5 Migrationen, 6 Audits und einen CI-Harness gebaut habt, existiert
   im Code bereits als legale Zustandsänderung:** `transition_conversation_status(conversation,
   'closed', revision, key)` aus Migration `202608230004` (23.08.). Beide Ingestion-RPCs (Text
   `202608240001` Z.55, Bild `202608240003` Z.99) eröffnen bei geschlossener Conversation
   automatisch eine neue mit Binding-Revision+1, die First-Contact-Foundation legt dazu ein neues
   Projekt an (`202609040001` Z.72-76), und alle Recovery-Discoveries joinen nur
   `conversations.status='open'` (`202609100003` Z.109/123) – der Stale-Worker-Fence ist da. **[REPO]**
2. **Die eigentliche Produktfunktion ist zu 0 % gebaut.** OpenAI wird an genau EINER Stelle
   aufgerufen (`lib/server/ai/providers/openai/adapter.ts:105`, `responses.parse`, Modell
   `gpt-4.1-mini`), und die Instruktion verbietet ausdrücklich: Antwort formulieren, nächste Frage
   planen, Preise. Der Antworttext kommt aus `QUESTION_TEMPLATE_REGISTRY` (Vorlagen, locale `de`).
   Es gibt keinen einzigen Vision-/Bild-Aufruf im Code (grep `image_url|input_image|vision` = 0).
   Die README sagt es selbst: „Automatische Kundenkommunikation … ausdrücklich nicht enthalten.“ **[REPO]**
3. **Empfehlung: PR #223 als Diagnose mit EINEM Cast-Fix abschließen, keine Migration 0006,
   Reset = Conversation schließen (0 Migrationen), und dann den fehlenden Gesprächs-Kern als
   dünnen, feature-geflaggten Pfad NEBEN der bestehenden Runtime bauen.** Kein Rewrite.

---

## 1. Was ich vermessen habe [REPO]

| Größe | Wert |
|---|---|
| Migrationen | 68 (21.07.–11.09.), davon 9 am 09.09., 7 am 10.09., 5 am 11.09. |
| Tabellen (CREATE TABLE über alle Migrationen) | 54 |
| SQL-Funktionen | 129 |
| Trigger | 65 |
| Audit-Dokumente | 85 Dateien, **29.740 Zeilen** |
| Anwendungscode `app` + `lib` | **14.487 Zeilen** |
| Tests | 142 Dateien, 10.956 Zeilen |
| OpenAI-Aufrufe im Produktivcode | **1** (Klassifikation gegen Allowlist) |
| Vision-/Bild-Inferenz | **0** |

Die Audits sind doppelt so lang wie der gesamte Anwendungscode. Migration 0005 deaktiviert
16 Trigger (Z.100-115) und nullt Recovery-Lineage (Z.124-128), bevor sie löscht – genau der
Weg, den D-23C als deterministischen 23505-Fehler erklärt. Das habe ich am Wortlaut geprüft.

## 2. PR #223 – Stand am Code [REPO/CI]

- Head `1d0b50f60` (13.09. 11:50 UTC), 3 Dateien, keine Production-Migration. Genau ein CI-Lauf,
  Schritt 4 „Execute production-shaped reset fixture and assertions“ = failure nach 15 s. Das
  Log selbst ist für mich ohne Repo-Token nicht abrufbar (HTTP 403) – der Fehlertext
  „operator is not unique: text "char"“ ist deshalb **[USER]**.
- Die Ursache steht aber im Harness: `test/integration/reset-postgres/reset-postgres-integration.sql`
  **Zeile 216**: `tgname||':'||tgenabled` – `pg_trigger.tgenabled` ist `"char"`. Fix: `tgenabled::text`.
  Zeilen 366 und 397 vergleichen `tgenabled` korrekt gegen `'O'`, nur die Verkettung ist betroffen.
- Der Harness testet **seine eigene Kopie** des Algorithmus (`reset_closed`, test-only), nicht die
  in Production installierte Funktion `reset_test_transport_customer`. Ein grüner Lauf beweist den
  Algorithmus, nicht die Production-Funktion und nicht die Fixture-Treue. Assertion 20 („gleiche
  Identität startet frisch“) ist der einzige produktnahe Test darin.

## 3. Deine 12 Fragen

**1. Über das Ziel hinausgeschossen?** Ja, deutlich. 54 Tabellen, 129 Funktionen, 65 Trigger,
Snapshot-/Recovery-/Command-/Effort-/Retry-/Evidence-Request-Maschinerie mit Append-only-Guards –
für einen Agenten, dessen KI heute nur „passt Antwort A zu Allowlist-Wert B?“ beantwortet und
dessen Fragen aus Vorlagen kommen. Das ist eine Fragebogen-Zustandsmaschine mit LLM-Klassifikator,
kein Gesprächsagent. Die Sicherheitsarchitektur (RLS, Service-Role-Isolation, Append-only, Audit-Log)
ist handwerklich gut. Sie ist nur der falsche Ort für 90 % der Energie.

**2. Lokales Testproblem oder Symptom?** Symptom – aber präziser als im PDF: Ihr habt ein
Datenmodell gebaut, das Historie bewusst unveränderlich macht (richtig für Nachvollziehbarkeit),
und dann von ihm eine destruktive Operation verlangt. Das ist ein semantischer Konflikt, kein
Bug. Die Kopplung Identität↔Conversation ist dagegen **nicht** zu eng: Der Code trennt beides
schon (`conversation_transport_identities` → `conversation_transport_bindings` mit Revision →
`conversations`). Ihr habt die Grenze, die das PDF als `qualification_runs` neu bauen will,
bereits – sie heißt `conversations.status`.

**3. PR #223 fertig validieren und 0006 bauen?** #223 ja, zeitlich begrenzt: den einen Cast
fixen, CI laufen lassen, Ergebnis je Assertion dokumentieren, mergen. Ergibt sich beim
nächsten Lauf ein weiterer Closure-Fehler: PR mit Status „dokumentiert, nicht weiterverfolgt“
schließen. **0006: nein.** Der physische Delete ist ab jetzt Wartungs-/DSGVO-Thema, nicht MVP.

**4. Reset-Ansatz verwerfen?** Den physischen ja. Den Admin-Knopf behalten, Semantik ändern:
„Testkunde zurücksetzen“ = `transition_conversation_status(<aktive Conversation der
Test-Identität>, 'closed', <revision>, <key>)`. Das ist ein bestehender, admin-geschützter,
idempotenter RPC. Die nächste neue `wamid` eröffnet Conversation + Projekt neu.

**5. Bessere Testgrenze?** Reihenfolge nach Nutzen pro Aufwand:
- (a) **Conversation schließen** – 0 Migrationen, heute möglich (siehe 4).
- (b) **Zweite/dritte WhatsApp-Testnummer** (Meta-Sandbox erlaubt laut Doku mehrere Empfängernummern je
  Testnummer – Zahl heute nicht nachgeprüft) – 0 Code, sofort. Jede Nummer = eigener Lebenszyklus.
- (c) **Supabase-Branch als Staging** – sinnvoll, aber löst das Lifecycle-Thema nicht allein.
- Nicht: Test-Tenant, Partition-Key, CASCADE-Root. Das wären neue Konzepte für ein Problem, das
  (a) schon löst.

**6. Physisch löschen nötig?** Nein. Logisch versionieren (Conversation N geschlossen, N+1 offen)
ist im Code bereits das Standardverhalten. Alte Zeilen bleiben, werden von Routing und Recovery
ignoriert. Was **nicht** automatisch neu ist: der `customers`-Datensatz (Identität → customer_id
bleibt). Das ist gewollt, solange auf Kunde nur Stammdaten liegen. Projektfakten hängen am
Projekt und das ist neu.

**7. Anzahl Tabellen/States gerechtfertigt?** Nein, nicht für das MVP. Ich zähle grob:
Transport (8 Tabellen) + Conversation-Kern (4) + Kunden/Projekte (3) = gerechtfertigt;
Planner/Snapshot/Pending/Command/Effort/Retry/Evidence-Request (10+) = für ein Vorlagen-Interview
gebaut, das ihr nicht mehr wollt; Knowledge-Claims/Transitions/Corrections/Retractions/
Evidence-Reviews (10+) = Zielbild eines Fachwissens-Graphen, ohne dass heute ein Modell hineinschreibt.

**8. Behalten:**
- Webhook-Route inkl. Signaturprüfung, Größenlimit, Dedupe über `transport_webhook_receipts`
  (`lib/server/whatsapp/webhook.ts`, `ingest_whatsapp_inbound_text`) – sauber.
- `conversation_transport_identities` / `_bindings` / `conversations` / `conversation_messages` /
  `conversation_message_text`.
- `customers`, `projects`, `project_media` + `ingest_transport_inbound_image` (Media-Staging
  existiert schon).
- Outbound-Delivery mit Recovery (`recoverable-delivery-runner.ts`).
- Admin-UI, Auth, RLS, Audit-Log.
- Den OpenAI-Adapter als Muster (Zod-validierte Structured Outputs) – aber mit neuer Aufgabe.

**9. Vereinfachen/entfernen** (einfrieren, nicht löschen – Append-only-Guards würden sich wehren):
- Die gesamte Planner-/Snapshot-/Pending-Interaction-/Cycle-Command-Runtime für den neuen Pfad
  **nicht mehr voraussetzen**. Sie bleibt für bestehende offene Conversations lauffähig.
- Knowledge-Claim-Graph: einfrieren; im MVP ersetzt durch eine `project_facts`-JSONB-Tabelle
  (Fakt, Wert, Quelle = message_id/media_id, Vertrauen), append-only ist hier ok.
- Reset-Operator: UI behalten, HMAC-Preview-Receipt ist Ballast, aber harmlos. RPC
  `reset_test_transport_customer` nicht mehr aufrufen; die Migrationen 0001-0005 bleiben als
  Historie liegen.
- Kein weiteres Nulling von `recovery_of_snapshot_id`, keine Trigger-Deaktivierung in RPCs.

**10. Wie ich es heute bauen würde** (dünner Vertikalschnitt, feature-geflaggt nur für eure
Test-Identität `whatsapp / 1196551136885100 / 4917632091248`):

```
Meta-Webhook (bestehend)
 → ingest_whatsapp_inbound_text / ingest_transport_inbound_image (bestehend, Dedupe + Conversation)
 → NEU: flag prüfen; wenn an: statt triggerPersistentMessageCycle →
   runConversationTurn(conversation_id):
     1. Kontext: letzte N Messages dieser Conversation + project_facts (nur diese Conversation/Projekt)
        + Bilder mit ingestion_status=ready (Supabase Storage, nicht Meta-URL)
     2. EIN OpenAI-Aufruf responses.create mit Structured Output:
        { reply_text, facts_patch[], missing_facts[], qualification_status, needs_human }
        Modell: ein aktuelles Vision-fähiges Modell (gpt-4.1-mini ist ein Klassifikator-Kompromiss;
        Kandidaten im Test gegeneinander messen, nicht raten)
     3. facts_patch → project_facts (append), reply_text → record_conversation_message (bestehend)
        → runRecoverableWhatsAppDelivery (bestehend)
     4. Fence vor jedem Send/Write: conversations.status='open' UND revision unverändert
 → Angebot: erst wenn qualification_status='ready' → offer_draft (bestehende project_offers) → Lauri
```
Neue Tabellen: **eine** (`project_facts`). Neue Migration: **eine**, additiv. OpenAI-Provider-State
(`previous_response_id`) gar nicht nutzen; der Kontext wird je Turn aus Postgres gebaut, dann
gibt es kein Split-Brain und die Conversation-Grenze ist automatisch die Memory-Grenze.
Preisberechnung bleibt laut eurer AGENTS.md außerhalb des Modells – richtig so.

**11. a/b/c/d?** **c)** – neuer schlanker Pfad daneben, mit den bestehenden Transport-,
Conversation- und Delivery-Bausteinen als Fundament. Nicht a) (die bestehende Runtime führt zu
einem Vorlagen-Interview, das ihr nicht wollt), nicht b) (Rückbau kostet Zeit und liefert keinen
Kundennutzen), nicht d) (Transport/Dedupe/Delivery/Auth sind gut und gehen sofort weiter).

**12. JETZT / DANACH / NICHT MEHR**

JETZT (diese Woche, in dieser Reihenfolge):
1. PR #223: nur `tgenabled::text` in Z.216, CI laufen lassen, Ergebnis je Assertion in D-23E
   eintragen, mergen. Zeitbudget: ein Lauf. Danach ist #223 Wissen, kein Pfad.
2. Reset-Knopf auf `transition_conversation_status(...,'closed',...)` umstellen. Vorher einmal
   von Hand als Admin ausführen und die nächste neue WhatsApp-Nachricht beobachten: neue
   Conversation, neues Projekt, First-Contact-Prompt kommt. Das ist der Beweis, dass ihr keine
   Löschung braucht. (Erwartung aus dem Code; im Probelauf zu bestätigen.)
3. Zweite Testnummer bei Meta eintragen. Kostet nichts, verdoppelt Testtempo.

DANACH:
4. Ein PR: `project_facts` + `runConversationTurn` + Feature-Flag + der eine OpenAI-Aufruf mit
   Structured Output + Vision-Input für `ready`-Medien. Acceptance = eure eigene Formulierung:
   „Ich schicke eine neue WhatsApp-Nachricht und KlimaGuy führt zuverlässig ein echtes
   Kundengespräch“, dreimal hintereinander mit Text + Foto + Reset ohne manuelles SQL.
5. Erst dann Angebotsentwurf und Lauri-Freigabe an `project_offers` anbinden.
6. Supabase-Branch als Staging, Production-Catalog-Snapshot als CI-Artefakt (die Read-only-Queries
   aus dem PDF sind dafür richtig).

NICHT MEHR:
- Keine Migration 0006, kein Hard-Delete im MVP-Pfad.
- Keine Migration, die Trigger deaktiviert oder Lineage nullt.
- Keine neue Tabelle für Runs/Tenants/Partitionen – `conversations.status` ist die Grenze.
- Kein Audit-Dokument mehr, das länger ist als der Code, den es beschreibt. Ein Audit je PR,
  eine Seite, mit PASS/FAIL je Behauptung.
- Kein Agent darf „grün“ melden ohne Lauf gegen echtes PostgreSQL in CI. Konkret fehlt euch
  ein billiger Gate-Job: alle 68 Migrationen von Null in einen `postgres:16.4`-Container
  einspielen, Katalog-Digest ziehen, gegen einen Production-Snapshot diffen. Das hätte die vier
  Phantom-Tabellen am ersten Tag gezeigt und ist kleiner als der Reset-Harness.
- Keine SQL-Anfragen mehr an dich. Diagnose gehört in CI und Logs.

## 4. Was ich NICHT weiß (ehrlich)
- Den Production-Katalog habe ich nicht gesehen; deine Relation-/Trigger-Liste ist **[USER]**.
- Das CI-Fehlerlog von #223 ist ohne Token nicht lesbar; die Zeile-216-Ursache ist Code-Lesung.
- Ob `transition_conversation_status` bei euch in Production exakt in der Fassung von
  `202608230004` installiert ist – gleiche Authority-Regel wie bei euch: Production-Katalog
  prüfen (`pg_get_functiondef`), nicht die Migration.
- Ob offene Pending-Interactions der alten Conversation irgendwo außerhalb der drei
  Discovery-Funktionen noch abgearbeitet werden (Vercel-Cron-Einstiege unter `app/api/internal/*`
  rufen genau diese). Im Probelauf beobachten.

## 5. Zu eurer Arbeitsweise mit den Agenten
Die Evidence-Regeln aus dem PDF (VERIFIED_PRODUCTION > Code > Migrationshistorie; nie „fixed“
nach Lint/Typecheck) decken sich mit dem, was wir in unserer Fleet als Proof-Standard fahren.
Zwei Ergänzungen aus unserer Erfahrung: (1) jede Behauptung eines Agenten braucht einen
externen Zeugen (CI-Run-ID, Query-Ergebnis, Datei-Hash), nicht seine Zusage; (2) ein Agent, der
den nächsten PR beginnt, bevor der aktuelle gemerged ist, ist kein Prozessfehler, sondern ein
fehlendes Gate – das Gate ist ein Merge-Status-Check, kein Prompt-Satz.

— Yamamoto, London, 13.09.2026 17:3x
