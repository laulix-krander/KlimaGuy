# AP-16-06-06D-23A – Safe Test Reset Operator

## Ziel

Minimaler, zweistufiger Admin-Operator für die bereits produktiv vorhandene Function `public.reset_test_transport_customer`. Die D-23-Migration bleibt die einzige Quelle der Reset-Logik und wurde nicht verändert.

## Baseline

Baseline SHA: `5a618c965d816adebee11c7ee4d46d9c6c06561c` (aktueller Branch-Stand bei Arbeitsbeginn).

## Geänderte Dateien

- `app/(app)/admin/test-customer-reset/page.tsx`
- `app/(app)/admin/test-customer-reset/test-customer-reset-operator.tsx`
- `components/ui.tsx`
- `lib/actions/test-customer-reset.ts`
- `lib/actions/test-customer-reset-service.ts`
- `lib/server/test-customer-reset-adapter.ts`
- `test/admin-navigation.test.tsx`
- `test/test-customer-reset-operator.test.ts`
- `docs/audits/AP-16-06-06D-23A-safe-test-reset-operator.md`

Keine Migration und kein Recovery-Code wurden geändert.

## Sicherheitsmodell

Die bestehende Supabase-Session authentifiziert den Benutzer; das zugehörige Profil muss serverseitig als `admin` validiert werden. Erst danach erreicht der Ablauf den schmalen Adapter. Dieser kann ausschließlich `reset_test_transport_customer` aufrufen. Provider (`whatsapp`), Bestätigung (`RESET TEST CUSTOMER`) und `dry_run` werden serverseitig gesetzt; ein RPC-Name wird nie entgegengenommen. Eingaben und Function-Ergebnis werden mit Zod validiert. Providerfehler werden auf feste deutschsprachige Fehler abgebildet und weder Rohdaten noch Identitätswerte geloggt.

Der Commit erfordert einen höchstens zehn Minuten alten, serverseitig HMAC-signierten Preview-Beleg für exakt dieselben Werte von `sender_scope` und `external_identity`. Eine Änderung der Eingabe verwirft außerdem den Beleg im UI. Ein Commit ohne passenden erfolgreichen Preview läuft fail-closed.

## Serverseitige Verwendung von `service_role`

Nur `lib/server/test-customer-reset-adapter.ts` (mit `server-only`-Marker) liest `NEXT_PUBLIC_SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY`. Der separate Supabase-Client deaktiviert Session-Persistenz und wird nur für den fest verdrahteten RPC verwendet. Der normale Session-Client bleibt unverändert. Fehlt URL oder Service-Role-Key, wird vor dem Client-/RPC-Aufruf geschlossen abgebrochen.

Der Client importiert weder den Adapter noch Supabase-JS oder den Namen der Service-Role-Variable. Server Actions bilden die Transportgrenze; der Schlüssel wird nicht als Prop, Action-Ergebnis oder gerenderter Wert übertragen. Der Preview-Beleg enthält nur Zeitstempel und keyed Digest, keine Rohidentität.

## Preview-/Commit-Ablauf

1. Admin trägt Sender Scope und externe Testidentität ein und führt **Vorschau ausführen** aus.
2. Der Server ruft D-23 mit `dry_run = true` auf, validiert die Counts und stellt einen kurzlebigen Beleg aus.
3. Die UI zeigt ausschließlich die validierten D-23-Counts.
4. Der Admin bestätigt bewusst über **Testkunden jetzt endgültig zurücksetzen**.
5. Nach Belegprüfung ruft der Server denselben festen RPC mit `dry_run = false` auf.
6. Nach Erfolg weist die UI darauf hin, keine alte Nachricht erneut zu senden, sondern eine komplett neue WhatsApp-Nachricht derselben Testnummer zu senden.

## Tests

Vitest deckt anonyme und Nicht-Admin-Aufrufe, fehlende Konfiguration, feste RPC-Parameter, Preview und Commit, fehlenden/falschen Preview-Beleg, Ergebnisvalidierung, sichere Fehlerabbildung, die nicht-generische RPC-Grenze, Client-Secret-Abwesenheit und Admin-Navigation ab. Zusätzlich werden der vollständige Testlauf, Typecheck und Lint ausgeführt.

## Production-Konfiguration

`SUPABASE_SERVICE_ROLE_KEY` ist in `.env.example` bereits ausschließlich als leerer Variablenname vorgesehen. Der echte Wert gehört **niemals** in das Repository. In Vercel Production werden benötigt:

- `NEXT_PUBLIC_SUPABASE_URL` (bereits allgemeine Supabase-Konfiguration)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (für die bestehende Admin-Session)
- `SUPABASE_SERVICE_ROLE_KEY` als ausschließlich serverseitige Environment Variable (ohne `NEXT_PUBLIC_`-Präfix)

**Production-Migration erforderlich: NEIN.** Die bereits angewendete D-23-Migration wird unverändert genutzt.

## Manueller Operator-Schritt nach Deployment

Als Administrator `/admin/test-customer-reset` öffnen, Sender Scope `1196551136885100` und externe Testidentität `4917632091248` eingeben, zuerst die Vorschau prüfen und danach bewusst den endgültigen Reset bestätigen. Anschließend keine alte WhatsApp-Nachricht erneut senden, sondern eine komplett neue WhatsApp-Nachricht von derselben Testnummer senden.
