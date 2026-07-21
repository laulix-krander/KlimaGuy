# KlimaGuy Agent Instructions

Projektziel: internes Fundament für einen WhatsApp- und Angebotsassistenten eines Klimaanlagen-Fachbetriebs. Stack: Next.js App Router, React, TypeScript strict, Tailwind CSS, Supabase Auth/PostgreSQL/Storage-Vorbereitung, Zod und Vitest.

Architekturregeln: modularer Monolith, keine Microservices, keine Secrets im Client, externe Daten mit Zod validieren, keine unkontrollierten `any`, gute Erweiterbarkeit für spätere KI-Module.

Sicherheitsregeln: Service-Role-Key ausschließlich serverseitig und möglichst nicht verwenden. Personenbezogene Daten niemals loggen. Keine KI-Ausgaben ungeprüft speichern. Preisberechnung niemals durch ein Sprachmodell. Keine automatische Angebotsfreigabe.

Coding-Konventionen: deutschsprachige UI, barrierearme Formulare, serverseitige Supabase-Operationen bevorzugen, klare Mapper und Domain-Konstanten verwenden.

Datenbankregeln: jede Änderung als Migration, UUIDs, `updated_at` Trigger, Soft Delete für fachliche Haupttabellen, RLS für alle fachlichen Tabellen, nachvollziehbare Policies. Audit-Log darf nicht direkt vom Client bearbeitet werden.

Testregeln: Domain-Regeln, Zod-Schemas, Berechtigungsmapper und Defaults mit Vitest absichern. Typecheck und Lint vor Abschluss ausführen.

Definition of Done: Projekt startet lokal, TypeScript kompiliert fehlerfrei, Tests erfolgreich, Migrationen vorhanden, RLS aktiviert, Login/Kunden/Projekte/Soft Delete dokumentiert, keine Secrets eingecheckt.
