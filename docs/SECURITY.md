# Sicherheit

Secrets werden ausschließlich über Environment-Variablen verwaltet. Public Supabase URL und Anon Key dürfen im Client liegen; Service Role Keys bleiben serverseitig und werden nicht für normale Benutzeraktionen genutzt.

Personenbezogene Daten dürfen nicht in Logs oder Audit-Metadaten geschrieben werden. Audit-Metadaten enthalten nur minimale Änderungsinformationen wie Feldnamen oder Statuswerte, aber keine Namen, E-Mail-Adressen, Telefonnummern oder Adressen.

Fachliche Zugriffe laufen über RLS. Rollen sind `admin` und `reviewer`: Admins verwalten Kunden, Projekte und alle Notizen; Reviewer lesen Kunden und Projekte, ändern Review-Felder und verwalten eigene Notizen.

Dateien und Bilder werden später in Supabase Storage mit privaten Buckets und projektbezogenen Policies abgelegt. Löschkonzepte trennen Soft Delete, Aufbewahrungsfristen und spätere Hard-Delete-Jobs.

Auditierbarkeit erfolgt über `audit_log`; direkte Client-Mutationen sind gesperrt. Server Actions schreiben Audit-Ereignisse über eine Security-Definer-Funktion. Angebotsfreigaben und Preisentscheidungen müssen nachvollziehbar und menschlich geprüft bleiben.
