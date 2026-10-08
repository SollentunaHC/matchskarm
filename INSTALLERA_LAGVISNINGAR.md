# Laguppställning och matchens spelarpresentation

## Installera i SollentunaHC/matchskarm

Paketet kompletterar ditt befintliga repo. Det ändrar inte nyindex_tizen.html, Spelschema_2627.csv, drake.png, sponsorvisning eller befintliga spelarfoton.

1. Packa upp ZIP-filen.
2. Ladda upp de fyra HTML-filerna i repots rot: lagvisningar.html, laguppstallning.html, u20_laguppstallning.html och u18_laguppstallning.html.
3. Lägg paketets Python-filer i scripts/, och lägg den nya u18-mappen i roten.
4. Ersätt båda workflow-filerna i .github/workflows/. Om mappen inte går att dra in: öppna befintlig fil i GitHub, välj pennan och ersätt hela innehållet. Den gemensamma laguppstallning.yml uppdaterar nu alla tre lag. u20-laguppstallning.yml finns kvar för manuell U20-körning men har ingen separat automatisk körning.
5. Kör Actions → Uppdatera laguppställning – A-lag, U20 och U18 → Run workflow (main).
6. När körningen och Pages-publiceringen är färdiga: öppna lagvisningar.html.

Behåll befintliga laguppstallning/ och u20/ i GitHub. De innehåller aktuella A-lags- och U20-profiler. Paketet skriver inte över dem. Sidorna spelarpresentation.html och u20_spelarpresentation.html för HELA trupperna påverkas inte.

## Visningslänkar

Bas: https://sollentunahc.github.io/matchskarm/

| Lag | Fil |
| --- | --- |
| A-laget | laguppstallning.html |
| U20 | u20_laguppstallning.html |
| U18 | u18_laguppstallning.html |

Använd dessa parametrar på respektive fil:

| Visning | Parametrar |
| --- | --- |
| Liggande laguppställning | ?kiosk=1 |
| Stående laguppställning | ?portrait=1&kiosk=1 |
| Liggande matchens spelare | ?info=1&kiosk=1 |
| Stående matchens spelare | ?portrait=1&info=1&kiosk=1 |

Lägg &demo=1 på valfri länk för verklig tidigare testmatch. Startsidan har testlänkar. U18 testar IFK Tumba IK–Sollentuna HC den 4 oktober 2026. Laguppställningen gäller alltid Sollentuna, även när testmatchen är borta.

## Uppdateringar

Spelschema_2627.csv och konfigurationen i nyindex_tizen.html används som tidigare. U18 filtreras på U18H Allettan Östra, Swehockey serie-ID 21274. A-laget använder 21043, U20 använder 20963.

Laguppställningen kontrolleras var femte minut från 59 minuter före match fram till matchstart (sista måltid fyra minuter före). Spelaruppgifter/statistik kontrolleras matchdag 06.00, 12.00 och 90 minuter före match. Allt följer svensk tid och sommar-/vintertid. GitHub kan fördröja körningar. Vid fördröjning görs senaste uppnådda kontroll, utan en serie gamla nätverksanrop. Run workflow tvingar omhämtning för dagens och tidigare matcher.

Matchens spelarpresentation kräver publicerad laguppställning. Spelarna byts var fjärde sekund. Webbsidorna läser om matchdata och spelaruppgifter varannan minut; Ctrl+F5 kan användas efter uppladdning.

Workern används för match-ID och Swehockeys spelschema/Live är reservväg. En korrekt laguppställning visar femmor 1:a–4:e, målvakter och tränare. Saknad laguppställning visas med väntetext; saknad statistik visas som —.

## Spelarfoton

| Lag | Bildmapp och exempel |
| --- | --- |
| A-laget | laguppstallning/spelarfoton/20.jpg |
| U20 | u20/spelarfoton/20.jpg |
| U18 | u18/spelarfoton/20.jpg |

Nummer kan förekomma i alla tre lag utan krock. Om en spelare byter nummer behöver fotot byta filnamn. Saknad bild visar befintlig drake.png.

För PNG eller annat filnamn: ange tröjnummer och sökväg i lagets egen spelarfoton.json, t.ex. {"20":"u18/spelarfoton/20.png"}. Befintliga fotomappningar bevaras.

## Spelaruppgifter

A-laget och U20 använder sina befintliga sparade profiler och Swehockey-statistik. U18 använder Swehockeys spelartrupp för födelseår och moderförening samt seriens GP/G/A/TP. U18:s föregående säsongs föreningar är inte verifierade och visas som —. Fyll vid behov i u18/spelarprofiler.json med kontrollerade uppgifter; inga API-nycklar behövs. För målvakter används GPI, alltså matcher där de spelat.

## Kontrollerat

De tolv visningslägena har funktionstestats i JavaScript mot verkliga matchdata. Matchval, fyra femmor, målvakter, spelarpresentation, fyrasekundersbyte och skalning för 1920×1080/1080×1920 är kontrollerade. Python-filer och JSON är validerade. U18:s parser har testats mot den verkliga uppställningen från Tumba-matchen. Visuell kontroll på fysisk skärm återstår.

## Rättning av A-lagets och U18:s layout

Om paketet redan är installerat: ersätt endast laguppstallning.html, u18_laguppstallning.html, scripts/update-lineup.py och scripts/update-u18-lineup.py. Kör sedan den gemensamma uppdateringen i Actions och ladda om skärmen med Ctrl+F5. U20 är oförändrat. Rättningen skiljer på hemma- och bortalagens radordning och anpassar spelarkorten. Äldre sparade bortauppställningar korrigeras även direkt i webbsidan.
