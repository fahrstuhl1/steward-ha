# samedi.de Terminverfügbarkeits-Checker

Kleines, eigenständiges Node-Skript, das die öffentliche samedi.de
Buchungs-API abfragt und meldet, sobald für einen oder mehrere Ärzte/Leistungen
ein freier Termin verfügbar wird (z.B. ADHS-Diagnostik für gesetzlich
Versicherte).

## Funktionsweise

samedi-Buchungswidgets (`https://termin.samedi.de/b/...`) laden ihre Daten
über `https://patient.samedi.de/api/booking/v3`. Das Skript:

1. löst die Slugs aus der Widget-URL (Praxis, Arzt/Kategorie, Leistung) über
   `practices/slug_to_id` in IDs auf,
2. fragt über `times` freie Slots für die nächsten `DAYS_AHEAD` Tage ab,
3. gibt eine Meldung aus (und optional eine Push-/Webhook-Benachrichtigung),
   sobald `data` nicht leer ist.

## Einrichtung

```bash
cd samedi-availability-checker
cp targets.example.json targets.json
```

In `targets.json` für jeden zu überwachenden Termin-Typ einen Eintrag mit
`label` und der vollständigen Buchungswidget-URL (inkl. `insuranceId`)
hinzufügen - die URL bekommst du, wenn du im Buchungsdialog bis zur
Terminauswahl klickst und die Adresse aus der Browserleiste kopierst.

## Ausführen

```bash
node check.js
```

- Exit-Code `0`: mindestens ein freier Termin wurde gefunden
- Exit-Code `1`: keine freien Termine

## Benachrichtigungen (optional)

- `NTFY_TOPIC=mein-topic` - sendet eine Push-Benachrichtigung über
  [ntfy.sh](https://ntfy.sh) an das angegebene Topic
- `WEBHOOK_URL=https://...` - sendet ein JSON-POST `{"text": "..."}` an die
  angegebene URL (z.B. Home Assistant Webhook, Slack, ntfy-Server)

## Per Cron regelmäßig prüfen

```cron
*/15 * * * * cd /pfad/zu/samedi-availability-checker && NTFY_TOPIC=mein-topic node check.js >> check.log 2>&1
```

## Hinweis

Bitte das Abfrageintervall moderat halten (z.B. alle 10-15 Minuten), um die
samedi-Server nicht unnötig zu belasten.
