# Beerenzähler — Web-App

Zählt Weinbeeren auf einem Foto. Läuft **vollständig auf dem Gerät**: kein
Server, keine Datenübertragung, kein Konto. Nach der Installation auch offline.

## Starten

**Am PC:** `index.html` doppelklicken. Fertig — es wird nichts installiert.

**Am Smartphone (Android und iOS):** Der Ordner `app/` muss einmalig über eine
`https://`-Adresse erreichbar sein (Intranet-Freigabe oder GitHub Pages; reine
Dateiablage, keine Serverlogik). Diese Adresse im Browser öffnen, dann:

* iOS/Safari: Teilen → *Zum Home-Bildschirm*
* Android/Chrome: Menü → *App installieren*

Danach läuft alles offline vom Gerät.

## Bedienung

1. Sorte und Standort eintragen (werden gemerkt und beim nächsten Mal
   vorgeschlagen).
2. **Foto aufnehmen** oder eine Datei wählen.
3. Ergebnis prüfen. Eine falsch erkannte Beere **antippen** entfernt sie, ein
   Tipp auf eine übersehene Beere ergänzt sie. Der Zähler läuft mit.
4. Gewicht eintippen, falls gewünscht — das Einzelbeerengewicht rechnet sich
   selbst aus. Das Feld ist optional.
5. **Probe speichern.** Am Ende des Messtags **CSV** exportieren.

## Kalibrierung

Der Regler *Beerengröße* stellt den erwarteten Beerenradius in Pixeln ein. Er
wird **je Sorte** gespeichert, weil Riesling und Dornfelder deutlich
auseinanderliegen.

Einmal pro Sorte einstellen: Regler schieben, bis die Kreise die Beeren gut
treffen und die Zahl stimmt. Danach passiert das automatisch.

Der Wert reagiert empfindlich — etwa ein Pixel Abweichung entspricht drei bis
fünf Prozent in der Anzahl. Die letzte Genauigkeit kommt deshalb aus dem
Kontrollblick und dem Antippen, nicht aus dem Regler allein.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche und Ablaufsteuerung |
| `vision.js` | Bildverarbeitung (Radialsymmetrie-Detektor) |
| `sw.js` | Offline-Betrieb |
| `manifest.webmanifest` | Installierbarkeit als App |

## Stand der Erkennung

Gegen zwei von Hand ausgezählte Referenzbilder:

| Bild | Wahrheit | App |
|---|---|---|
| grün | 100 | 99–102 |
| blau | 105 | 95–96 |

Die Daten liegen in der Datenbank des Browsers (IndexedDB). Ein
zurückgesetzter Browser oder ein gelöschter Website-Speicher löscht sie mit —
deshalb den CSV-Export nach jedem Messtag ausführen.
