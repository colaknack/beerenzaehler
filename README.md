# Beerenzähler

Web-App zum automatischen Zählen von Weinbeeren auf einem Foto. Aus der Anzahl
und einem optionalen Gewicht ergibt sich das Einzelbeerengewicht.

**➜ [App öffnen](https://colaknack.github.io/beerenzaehler/app/)**

Die Erkennung läuft vollständig im Browser des Geräts. Es wird kein Foto und
kein Messwert an einen Server übertragen; die App braucht nach der Installation
keine Verbindung mehr.

## Installation auf dem Smartphone

Die Adresse oben im Browser des Geräts öffnen, dann:

* **iOS / Safari:** Teilen → *Zum Home-Bildschirm*
* **Android / Chrome:** Menü → *App installieren*

Am PC genügt es, die Adresse aufzurufen — oder `app/index.html` lokal per
Doppelklick zu öffnen.

## Verfahren

Beeren sind nahezu gleich große Kreise. Die Erkennung nutzt deshalb die
**Fast Radial Symmetry Transform**, die auf Kreissymmetrie anspricht statt auf
Farbe. Damit ist sie unabhängig von grünen, blauen, rosé oder mischfarbigen
Beeren und weitgehend unempfindlich gegen Schlagschatten — ein Schatten besitzt
keine geschlossene Radialsymmetrie.

Die Schale wird als heller, unbunter Bereich automatisch gefunden und begrenzt
die Auswertung. Eine Plausibilitätsprüfung über die Log-Chromatizität verwirft
Treffer auf leerer Schale oder auf dem Tisch daneben.

## Genauigkeit

Gegen zwei von Hand ausgezählte Referenzbilder:

| Bild | Wahrheit | App |
|---|---|---|
| grün | 100 | 99–102 |
| blau | 105 | 95–96 |

Die Erkennung reagiert empfindlich auf den eingestellten Beerenradius — etwa ein
Pixel Abweichung entspricht drei bis fünf Prozent in der Anzahl. Der Regler
*Beerengröße* wird deshalb je Sorte gespeichert. Die letzte Genauigkeit kommt aus
dem Kontrollblick: falsch erkannte Beeren antippen entfernt sie, übersehene
ergänzt ein Tipp.

Details zur Bedienung in [app/README.md](app/README.md).
