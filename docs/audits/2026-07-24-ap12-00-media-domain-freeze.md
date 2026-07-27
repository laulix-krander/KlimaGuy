# AP-12-00 – Domain-, Datenschutz- und Permission-Freeze für Projektmedien

**Decision-ID:** `KG-DECISION-2026-07-24-AP12-00-MEDIA-DOMAIN-V1`
**Entscheidungsdatum:** 24.07.2026
**Status:** **APPROVED FOR AP-12-01 PLANNING**
**Charakter:** verbindliche MVP-Entscheidung und Planungsgrundlage; keine Implementierung

## 1. Executive Summary

Dieses Dokument friert die fachlichen, rollenbezogenen, sicherheits- und datenschutzbezogenen Grenzen für das erste Projektmedien-MVP verbindlich ein. Es löst die im Architektur-Audit `KG-AUDIT-2026-07-24-PROJECT-MEDIA-AI-V1` für AP-12-00 vorgesehenen Product-Owner-Entscheidungen auf und baut auf dem AP-11-Abschluss `KG-AUDIT-2026-07-24-AP11-FINAL-V1` auf.

Das MVP unterstützt ausschließlich manuell hochgeladene JPEG-, PNG- und WebP-Bilder sowie PDFs. Der spätere Bucket ist privat. Medienzugriff ist niemals allein über einen Storagepfad zulässig, sondern setzt Authentifizierung, aktives Profil, Rolle, aktives Projekt, aktives Medium und die korrekte Projekt-Medien-Zuordnung voraus. Admins erhalten die Medienmutationen; Reviewer dürfen aktive Medien ausschließlich ansehen und herunterladen. Fachliches Soft Delete sperrt den normalen Zugriff sofort, während physischer Purge ein separater privilegierter Betriebsprozess bleibt.

Die festgelegten Mengen- und Größenwerte sind **MVP-Produktlimits, vor technischer Umsetzung extern zu verifizieren** und keine Aussagen über Anbieterlimits. Datenschutzrechtliche Fragen, die endgültige Behandlung von EXIF im gespeicherten Original und eine echte Mandantenarchitektur bleiben ausdrücklich gekennzeichnete Production Gates. AP-12 enthält weder KI-Analyse noch WhatsApp-Integration. Projektmedien müssen vollständig ohne KI funktionieren.

Mit diesem Freeze sind die fachlichen Grundsatzfragen für die Planung von AP-12-01 entschieden. Freigegeben ist ausschließlich die Planung des nächsten Audits, nicht die Umsetzung von Datenmodell, Migration, Bucket oder Policies.

## 2. Baseline und Repository-Stand

### 2.1 Gelesene Referenzen

- Hauptaudit: `docs/audits/2026-07-24-project-media-ai-architecture.md`, `KG-AUDIT-2026-07-24-PROJECT-MEDIA-AI-V1`.
- AP-11-Abschluss: `docs/audits/2026-07-24-ap11-final-validation.md`, `KG-AUDIT-2026-07-24-AP11-FINAL-V1`.

Beide Referenzen wurden vor dieser Entscheidung vollständig gelesen. Das Hauptaudit stellt fest, dass der geprüfte Stand keine Projektmedien-Tabelle, keinen Storage-Bucket, keine Storage-Policy, keine Storage-Nutzung und keinen Upload-/Medienworkflow enthält. AP-11 bestätigt das bestehende Rollenmodell mit ausschließlich `admin` und `reviewer`, die aktive Projektprüfung und feldgranulare serverseitige Berechtigungsprüfungen.

### 2.2 Git-Baseline

- Ausgangsbranch im bereitgestellten Checkout: `work`.
- Sauberer lokaler Ausgangs-HEAD: `f746c2b80bf66398a95122c5eae12a43333f64d5`.
- Ausgangscommit: Merge des Projektmedien-/KI-Architektur-Audits.
- Arbeitsbranch dieses Pakets: `codex/ap12-00-media-domain-freeze`.
- Es ist kein Git-Remote konfiguriert. Deshalb existiert keine Referenz `origin/main`; `git fetch origin`, ein Vergleich mit `origin/main` und eine Remote-Verifikation waren nicht möglich.
- Mangels Remote und lokalem `main` wird der saubere lokale HEAD `f746c2b80bf66398a95122c5eae12a43333f64d5` als Baseline verwendet. Der Stand ist im späteren Review ausdrücklich gegen das tatsächliche Remote-`main` zu verifizieren.

## 3. Verbindliche MVP-Abgrenzung

AP-12 umfasst ausschließlich die spätere Grundlage für sichere, projektbezogene Medien. Für das erste MVP verbindlich vorgesehen sind:

- mehrere Medien je aktivem Projekt;
- ausschließlich die Quelle `manual_upload`;
- private Speicherung von Originaldateien;
- genau eine kontrollierte Primärkategorie je Medium;
- Admin-Mutationen und Reviewer-Lese-/Downloadzugriff;
- bedarfsgesteuerter, kurzlebiger Zugriff nach vollständiger Autorisierung;
- fachliches Soft Delete und ein davon getrennter späterer Purgeprozess.

Nicht Bestandteil des Medien-MVP sind insbesondere KI-Analyse, WhatsApp- oder E-Mail-Ingestion, automatische Projektzuordnung, OCR, PDF-Analyse/-Rendering/-Thumbnails, freie Tags, automatische Kategorien, Bild- oder PDF-Verarbeitung, physische Sofortlöschung, öffentliche Medienlinks und Mehrmandantenbetrieb.

Dieser Freeze implementiert weder Domainkonstanten noch Schemas oder Permissions. Er legt nur die verbindlichen Anforderungen fest, anhand derer die Folgepakete geplant werden.

## 4. Unterstützte und ausgeschlossene Dateitypen

### 4.1 Im ersten MVP zulässig

| Dateityp | MVP-Entscheidung | Grenze |
|---|---|---|
| JPEG | zulässig | Speicherung, Anzeige und Download |
| PNG | zulässig | Speicherung, Anzeige und Download |
| WebP | zulässig | Speicherung, Anzeige und Download |
| PDF | zulässig | ausschließlich Speicherung, Anzeige und Download |

Für PDFs gilt ausdrücklich: keine Analyse, kein OCR, kein Seitenrendering und keine Thumbnail-Erzeugung aus PDFs.

### 4.2 Nicht Bestandteil des ersten MVP

- HEIC;
- HEIF;
- TIFF;
- DOCX;
- XLSX;
- CAD-Dateien;
- ZIP;
- Videos;
- Audio.

Die Ausschlussliste ist keine Aussage über grundsätzliche technische Verarbeitbarkeit. Eine spätere Aufnahme benötigt ein eigenes freigegebenes Arbeitspaket mit Sicherheits-, Datenschutz-, Parser- und Plattformprüfung.

## 5. Produktlimits mit Verifikationshinweis

| Limit | Product-Owner-MVP-Zielwert |
|---|---:|
| Dateien pro Upload-Vorgang | maximal 20 |
| aktive Dateien pro Projekt | maximal 100 |
| Bilddatei | maximal 15 MB pro Datei |
| PDF-Datei | maximal 25 MB pro Datei |

**Verbindliche Einordnung:** Dies sind **MVP-Produktlimits, vor technischer Umsetzung extern zu verifizieren**. Sie sind keine Behauptung über Limits von Supabase, Vercel, Browsern oder sonstigen Anbietern.

AP-12-01 beziehungsweise AP-12-02 muss anhand der geplanten Uploadarchitektur und aktueller offizieller Anbieterinformationen prüfen, ob diese Zielwerte technisch sicher kompatibel sind. Erforderlich sind außerdem Entscheidungen zu tatsächlicher Bytezählung, MIME-/Dateisignaturprüfung, parallelen Uploads und der atomaren beziehungsweise konfliktfesten Durchsetzung des Projektlimits. Wenn eine Plattformgrenze enger ist, darf die Implementierung nicht ungeprüft am Produktlimit festhalten; die Abweichung muss erneut fachlich freigegeben werden.

## 6. Berechtigungsmatrix

Es werden keine neuen Rollen eingeführt.

| Medienaktion | Admin | Reviewer | Verbindliche Bedingung |
|---|---:|---:|---|
| aktive Projektmedien hochladen | ja | nein | aktives Projekt und vollständige Autorisierung |
| aktive Projektmedien ansehen | ja | ja | aktives Projekt, aktives Medium und passende Zuordnung |
| aktive Projektmedien herunterladen | ja | ja | erneute Einzelprüfung vor Zugriffserteilung |
| Medienkategorie ändern | ja | nein | nur kontrollierte Kategorie |
| Anzeigenamen/Caption ändern | ja | nein | Storagepfad bleibt unverändert |
| Sortierung ändern | ja, falls im MVP umgesetzt | nein | kein Anspruch, dass Sortierung Teil des MVP wird |
| Medium soft-löschen | ja | nein | keine physische Sofortlöschung |
| Medium physisch löschen/purgen | nein, nicht über normale Admin-UI | nein | separater privilegierter Betriebsprozess |

Reviewer dürfen somit im ersten MVP weder hochladen, umbenennen, kategorisieren, sortieren, soft-löschen noch physisch löschen. Projekt- oder Notizrechte erweitern die Medienrechte nicht implizit. UI-Gating darf später nur Komfort sein; Server-, Tabellen- und Storage-Grenzen müssen dieselbe Matrix erzwingen.

## 7. Projektzugriffsregeln

Jeder Medienzugriff setzt kumulativ voraus:

1. einen authentifizierten Benutzer;
2. ein vorhandenes und aktives Benutzerprofil;
3. eine für die konkrete Aktion zulässige Rolle;
4. ein vorhandenes Projekt;
5. ein nicht soft-gelöschtes Projekt;
6. einen vorhandenen Medien-Datensatz;
7. ein nicht soft-gelöschtes Medium;
8. die Übereinstimmung zwischen angefragtem Medium und Projekt.

Der Medien-Datensatz ist die fachliche Quelle der Wahrheit. Ein Storageobjekt oder ein syntaktisch gültiger Storagepfad allein begründet niemals Zugriff. Projekt und Medium müssen für jede Zugriffsentscheidung fachlich geladen und geprüft werden. Gelöschte oder nicht passende Entitäten dürfen keine neue Zugriffsmöglichkeit erhalten.

## 8. Storage-Sicherheitsgrenzen

Der in einem Folgepaket geplante Supabase-Storage-Bucket muss privat sein. Unzulässig sind:

- öffentliche Bucket-URLs;
- dauerhaft gespeicherte Signed URLs;
- ungeprüfter direkter Clientzugriff;
- Dateipfade mit Kundennamen, Adressen oder Originaldateinamen;
- eine Autorisierung allein anhand des Storagepfads.

Dateizugriffe dürfen später ausschließlich nach Authentifizierung, Rollenprüfung, Projektprüfung und Medienprüfung erlaubt werden. Signed URLs sind Bearer-Zugänge und müssen kurzlebig sowie bedarfsgesteuert erzeugt werden. Ihre konkrete TTL wird erst in AP-12-02 technisch festgelegt und extern gegen aktuelle Supabase-Empfehlungen geprüft. Signed URLs dürfen nicht in Datenbank, Audit-Log, Analytics, Fehlermeldungen oder anderen dauerhaften Speichern abgelegt werden.

Storagepfade müssen aus nicht personenbezogenen, serverseitig kontrollierten Identifikatoren aufgebaut werden. Originaldateinamen können später ausschließlich als bereinigte, fachlich erforderliche Anzeige-Metadaten vorgesehen werden, nie als Autorisierungsmerkmal oder Pfadbestandteil. Tabellen-RLS, Storage-Policies und Domainprüfung müssen in Folgepaketen dieselbe Zugriffsaussage abbilden; keine einzelne Schicht ersetzt die anderen.

## 9. Originaldateien

Originaldateien werden im MVP grundsätzlich gespeichert. Es gibt keine verlustbehaftete automatische Ersetzung des Originals. Spätere Vorschauen, Seitenbilder oder andere Derivate sind getrennte Storageobjekte mit nachvollziehbarer Zuordnung und dürfen nicht als Original ausgegeben werden.

Originale bleiben erhalten, bis ein ausdrücklich definierter Lösch- oder Aufbewahrungsprozess greift. „Grundsätzlich gespeichert“ bedeutet nicht unbegrenzte oder rechtlich bereits freigegebene Aufbewahrung. Die konkrete rechtliche Aufbewahrungsfrist ist nicht Teil von AP-12-00 und muss extern datenschutzrechtlich geprüft werden.

## 10. Kategorien und deutsche Labels

Das MVP verwendet genau eine kontrollierte Primärkategorie pro Medium:

| Stabiler Kategoriecode | Deutsche UI-Bezeichnung |
|---|---|
| `indoor_area` | Innenbereich |
| `outdoor_area` | Außenbereich |
| `indoor_unit_location` | Standort Innengerät |
| `outdoor_unit_location` | Standort Außengerät |
| `pipe_route` | Leitungsweg |
| `electrical_connection` | Elektroanschluss |
| `condensate_route` | Kondensatführung |
| `facade` | Fassade |
| `roof` | Dach |
| `balcony` | Balkon |
| `floor_plan` | Grundriss |
| `technical_document` | Technisches Dokument |
| `customer_document` | Kundendokument |
| `other` | Sonstiges |

Freie sicherheitsrelevante Kategorien sind unzulässig. Freie Tags sind nicht Bestandteil des ersten MVP. Caption beziehungsweise interne Beschreibung darf in einem Folgepaket als optionaler, begrenzter Freitext geplant werden. Kategorien beschreiben den manuellen fachlichen Zweck und bestätigen weder technische Eignung noch einen Montageort oder ein KI-Ergebnis. Dieses Paket implementiert keine Kategorien.

## 11. Quellenmodell

| Quellencode | Status |
|---|---|
| `manual_upload` | einzige aktive MVP-Quelle |
| `whatsapp` | mögliche spätere Quelle; nicht implementieren |
| `email` | mögliche spätere Quelle; nicht implementieren |
| `api` | mögliche spätere Quelle; nicht implementieren |
| `ai_generated` | mögliche spätere Quelle; nicht implementieren |
| `import` | mögliche spätere Quelle; nicht implementieren |

Die späteren Werte dokumentieren ausschließlich eine mögliche Erweiterungsrichtung. Sie begründen keine Schnittstelle, keine automatische Verarbeitung und keine Berechtigung in AP-12.

## 12. Soft-Delete- und Purge-Grundsätze

Das MVP verwendet fachliches Soft Delete. Bei einer zulässigen Soft-Delete-Aktion:

- wird `deleted_at` gesetzt;
- verschwindet das Medium aus normalen Listen;
- darf keine neue Signed URL für das Medium erzeugt werden;
- bleibt das Storageobjekt zunächst erhalten.

Eine normale Benutzeraktion löscht das Storageobjekt nicht sofort physisch. Bereits zuvor ausgegebene kurzlebige Signed URLs können technisch bis zu ihrem Ablauf gültig bleiben; auch deshalb sind kurze TTL und fehlende Persistenz verbindliche Sicherheitsgrenzen.

Physischer Purge erfolgt später getrennt und darf nicht über die normale Admin-UI angeboten werden. Der spätere Prozess muss:

- privilegiert sein;
- protokollierbar sein, ohne personenbezogene Inhalte oder Zugriffstokens zu loggen;
- Datenbank- und Storagezustand abgleichen;
- Fehler, Teilfehler und Wiederholungen behandeln;
- bereits gelöschte oder fehlende Objekte idempotent behandeln;
- Originale und gegebenenfalls vorhandene Derivate konsistent berücksichtigen.

Retention, Projekt-/Kunden-Soft-Delete-Kaskaden, Backups, Replikate, Purgefristen und manuelle Reconciliation sind vor Production gesondert zu klären.

## 13. Datenminimierung

Später dürfen nur fachlich erforderliche, validierte Metadaten gespeichert werden. Insbesondere werden nicht in der Datenbank gespeichert:

- Signed URLs;
- Zugriffstokens;
- Auth-Tokens;
- Dateiinhalt als Base64;
- vollständige KI-Rohantworten;
- unkontrollierte freie Sicherheitsstatus;
- Kundennamen oder Adressen im Storagepfad;
- redundantes `customer_id`, solange die Kundenzuordnung verbindlich über `projects.customer_id` ableitbar bleibt.

Ebenso dürfen Dateiinhalte, Signed URLs, Originaldateinamen, Adressen oder andere personenbezogene Inhalte nicht unnötig in Logs gelangen. Autorisierung, Rollen, Projektzuordnung, Quelle, Kategorie und technische Zustände dürfen später nicht aus unkontrolliertem Client-JSON oder freien Texten abgeleitet werden.

## 14. EXIF- und Datenschutzentscheidung

### 14.1 EXIF und Standortdaten

EXIF- und GPS-Metadaten dürfen nicht ungeprüft weiterverwendet, separat persistiert oder an spätere KI-Systeme übertragen werden. Das Original darf technisch zunächst unverändert gespeichert werden, sofern dies für einen sicheren und nachvollziehbaren Upload erforderlich ist. Vorschauen, Derivate und spätere KI-Eingaben sollen sensible EXIF-Daten grundsätzlich nicht enthalten.

Die endgültige Entscheidung über eine automatische EXIF-Bereinigung des gespeicherten Originals ist vor AP-12-04 beziehungsweise zwingend vor der ersten Bildverarbeitung datenschutzrechtlich und technisch zu validieren. Dies ist ein **P1 Production Gate**. Bis zu dieser Entscheidung legitimiert die Originalspeicherung weder eine Nutzung der EXIF-Daten noch deren Übertragung an Dritte.

### 14.2 Datenschutz- und Rechtsgrenze

Projektmedien können personenbezogene Daten und sensible Gebäudedaten enthalten, insbesondere:

- Gesichter;
- Kennzeichen;
- Adressen;
- Grundrisse;
- GPS-Daten;
- technische Gebäudedetails;
- Kundendokumente.

Dieses Dokument ist keine Rechtsberatung und behauptet keine datenschutzrechtliche Zulässigkeit. Vor Production müssen mindestens extern geprüft und verbindlich entschieden werden:

- Rechtsgrundlage und gegebenenfalls Einwilligung;
- Informationspflichten;
- Aufbewahrungsfristen;
- Löschfristen;
- Anbieterübermittlung;
- Auftragsverarbeitung;
- KI-Nutzung;
- Backup-Löschung;
- Betroffenenrechte;
- Export und Auskunft.

Diese Punkte bilden gemeinsam ein **externes Datenschutz- und Rechts-Gate vor Production**. Das Gate umfasst auch Zweckbindung, Datenminimierung, Zugriffsprotokollierung, Drittanbieter/Regionen und den Umgang mit Widerruf oder Löschbegehren.

## 15. KI-Grenzen

AP-12 enthält keine KI-Analyse. Projektmedien müssen zunächst vollständig ohne KI funktionieren. Es gibt in AP-12 keine automatische Analyse, Kategorisierung, Angebotsableitung oder Anbieterübermittlung.

Für AP-13 gelten bereits jetzt verbindlich folgende Architekturgrenzen:

- Analyse wird ausschließlich manuell gestartet;
- jeder Lauf benötigt eine explizite Analyseversion;
- Modell-, Prompt- und Schemaversion müssen nachvollziehbar sein;
- KI darf keine finalen Angebote freigeben;
- KI darf `requires_human_review` nicht automatisch abschalten;
- jedes Ergebnis benötigt zwingend menschliche Prüfung;
- Preisberechnung erfolgt niemals durch ein Sprachmodell;
- vollständige KI-Rohantworten werden nicht ungeprüft dauerhaft gespeichert.

Diese Grenzen sind keine Freigabe zur KI-Implementierung. AP-13 benötigt vor jedem Providercall ein eigenes Domain-, Datenschutz-, Kosten- und Human-Review-Gate.

## 16. WhatsApp-Grenzen

AP-12 enthält keine WhatsApp-Integration. Für eine spätere Integration gilt verbindlich:

- WhatsApp-Medien müssen zunächst in eigenes privates Storage übernommen werden;
- externe WhatsApp-Media-URLs oder -IDs sind keine dauerhafte Dateiablage;
- die externe Quelle darf die Projekt-/Medienautorisierung nicht ersetzen;
- eine automatische Projektzuordnung ist im ersten WhatsApp-MVP ohne menschliche Bestätigung unzulässig.

Provider-Authentifizierung, Einwilligung, Informationspflicht, Telefonnummernverarbeitung, Retention, Retry und Deduplizierung benötigen ein separates späteres Audit.

## 17. Multi-Tenant-Grenze

Der aktuelle Repository-Stand besitzt laut Hauptaudit keine vollständige Mehrmandantenarchitektur. Das erste Medien-MVP darf ausschließlich innerhalb des aktuell bestehenden Zugriffsmodells umgesetzt werden. Projekt-IDs und Projektzuordnungen allein stellen keine Isolation zwischen unabhängigen Unternehmen her.

Mehrmandantenfähigkeit ist nicht Bestandteil von AP-12. Vor der Nutzung durch mehrere unabhängige HVAC-Unternehmen muss eine separate Mandantenarchitektur mit `tenant_id` oder gleichwertiger, durchgängiger Isolation auditiert und implementiert werden. Die Isolation muss Tabellen, Storagepfade, RLS, Storage-Policies, Jobs, Exporte, Logs und Betriebsprozesse umfassen.

Dies ist ein **P0-Gate vor echtem Multi-Tenant-SaaS-Betrieb**.

## 18. Offene rechtliche und technische Production Gates

| Priorität | Gate | Erforderliche Auflösung |
|---|---|---|
| P0 | Private Zugriffskette | Datenmodell, Domainprüfung, RLS und Storage-Policies konsistent planen und negativ testen |
| P0 | Uploadintegrität | MIME/Dateisignatur, Größenprüfung, Idempotenz, Quoten, Parallelität und DB-/Storage-Teilfehler planen |
| P0 | Löschung und Aufbewahrung | fachliche Fristen, Purge, Reconciliation, Backups und Aggregate-Löschung extern/fachlich entscheiden |
| P0 | Datenschutz und Recht | sämtliche in Abschnitt 14 genannten externen Prüfungen abschließen |
| P0 | Multi-Tenant-SaaS | vor mehreren unabhängigen Betrieben eigene Tenantarchitektur auditieren und implementieren |
| P1 | Produktlimits | 20/100/15 MB/25 MB gegen aktuelle Supabase-, Vercel-, Browser- und Architekturgrenzen verifizieren |
| P1 | Signed-URL-Sicherheit | konkrete TTL, Cache-/Header-/Referrer-Verhalten, Rate Limits und Downloadverhalten in AP-12-02 prüfen |
| P1 | Sichere Dateidarstellung | Bild- und PDF-Anzeige, Content-Disposition, Browser-Sandboxing und aktive PDF-Inhalte prüfen |
| P1 | EXIF-Originalentscheidung | vor AP-12-04 beziehungsweise erster Bildverarbeitung rechtlich und technisch validieren |
| P1 | Ressourcenlimits | Bilddimensionen/Pixel, animierte Bilder, PDF-Struktur und Dekompressions-/Parserrisiken entscheiden |
| P1 | Betriebsprozesse | Auditierbarkeit, sanitisiertes Logging, Monitoring, Retry, Dead Letter und Reconciliation planen |
| P1 | Retention der Originale | konkrete rechtliche Aufbewahrungs- und Löschfristen verbindlich festlegen |

Die Kennzeichnung als Production Gate bedeutet: AP-12-01 darf die erforderliche Architektur planen, aber offene Gates dürfen vor Production nicht stillschweigend als erledigt gelten. Externe Anbieterangaben sind zum Umsetzungszeitpunkt anhand aktueller offizieller Quellen zu verifizieren.

## 19. Kriterien für die Freigabe von AP-12-01

AP-12-01 darf als reines Planungs- und Auditpaket beginnen, weil dieses Dokument folgende Grundsatzfragen verbindlich beantwortet:

- Format-Set und PDF-Grenze sind festgelegt;
- Produktzielwerte für Batch, Projektanzahl und Dateigrößen sind benannt und korrekt als extern zu verifizieren markiert;
- Admin-/Reviewer-Rechte sind je Aktion entschieden;
- aktive Projekt-/Medienprüfung und Zuordnungsprüfung sind zwingend;
- privater Storage und kurzlebiger autorisierter Zugriff sind zwingend;
- eine kontrollierte Primärkategorie samt stabilen Codes und deutschen Labels ist festgelegt;
- `manual_upload` ist die einzige MVP-Quelle;
- Originalerhalt, Soft Delete und separater Purge sind festgelegt;
- Datenminimierung und das Verbot redundanter Kundenzuordnung sind festgelegt;
- EXIF-, Datenschutz-, KI-, WhatsApp- und Multi-Tenant-Grenzen sind dokumentiert.

AP-12-01 muss diese Entscheidungen vollständig als Anforderungen übernehmen, Widersprüche zum aktuellen Repositorystand benennen und die offenen technischen Entscheidungen sichtbar lassen. Es darf keine Anbietergrenze erfinden und keine ungeklärte Rechtsfrage technisch vorwegnehmen.

Die Freigabe lautet ausschließlich **APPROVED FOR AP-12-01 PLANNING**. Sie ist keine Production-Freigabe und keine Freigabe für Migration, Bucket-Erstellung, Policies oder Anwendungscode.

## 20. Empfehlung für das nächste Paket

Als nächstes wird ausschließlich empfohlen:

**AP-12-01 – Datenmodell- und Storage-Baseline-Audit**

AP-12-01 ist erneut zunächst ein Audit. Es soll anhand dieses freigegebenen Decision-Dokuments die konkrete Migration, Tabellenstruktur, Constraints, Indizes, Bucket-Erstellung und Storage-Policies planen. Dabei sind insbesondere aktive Projekt-/Medienbeziehungen, unveränderliche Zuordnung, Pfadform, Status-/Teilfehlermodell, RLS-/Storage-Policy-Konsistenz, Quoten, private Bucketkonfiguration und Rollback-/Reconciliation-Anforderungen zu untersuchen.

AP-12-01 darf die spätere Implementierung präzise beschreiben, aber noch keine Migration, kein SQL, keinen Bucket und keine Storage-Policy implementieren. Upload-Orchestrierung, UI, Verarbeitung, KI und WhatsApp bleiben außerhalb dieses nächsten Audits.

## 21. Scope- und Negativbestätigung

Dieses Paket erstellt ausschließlich dieses Decision- und Domain-Freeze-Dokument. Es enthält:

- keine Implementierung;
- keine Anwendungscodeänderung;
- keine UI und keine Komponenten;
- keine Server Actions;
- keine Services;
- keine Anwendungsschemas;
- keine Tests und keine Teständerungen;
- keine Migration;
- kein SQL;
- keine RLS-Änderung;
- keine Trigger;
- keine Storage-Buckets;
- keine Storage-Policies;
- keine Bild- oder PDF-Verarbeitung;
- keine OpenAI-Integration;
- keine WhatsApp-Integration;
- keine `package.json`-Änderung;
- keine Änderung bestehender Audit-Dateien.

**Abschlussstatus: APPROVED FOR AP-12-01 PLANNING**
