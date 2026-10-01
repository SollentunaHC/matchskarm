# A-lagets laguppställning

En egen sida i det befintliga repot. Den använder hela laguppställningen för **Sollentuna HC i Hockeyettan Norra**, med fyra femmor, målvakter och tränare. Den visar nästa hemmamatch automatiskt och behåller dagens match hela matchdagen, även efter slutsignalen. Inga ändringar behövs inför varje match.

## Öppna sidan

- Vanlig sida: `https://sollentunahc.github.io/matchskarm/laguppstallning.html`
- Arenaskärm utan knappar: `https://sollentunahc.github.io/matchskarm/laguppstallning.html?kiosk=1`
- Välj ett bestämt matchdatum: `laguppstallning.html?date=2026-10-03&kiosk=1`
- Testa den verkliga Sollentuna-uppställningen mot Strömsbro den 25 september: `laguppstallning.html?demo=1&kiosk=1`. Testläget märks tydligt och används aldrig automatiskt för en annan match.

Sidan är byggd i 1920 × 1080 (16:9) och skalas till skärmens tillgängliga yta. Klicka Helskärm eller använd webbläsarens helskärmsläge för att få hela skärmen.

## Automatisk hämtning

GitHub Actions-flödet **Uppdatera A-lagets laguppställning** läser först inställningarna i den befintliga **nyindex_tizen.html**: `CSV_URL`, `LIVE_RESULT_PROXY`, `MATCH_CHECK_URL` och `SWEHOCKEY_ID_MAP`. Därmed används samma CSV, Cloudflare-worker och ID-kopplingar som den befintliga skärmen. Den accepterar samma CSV-format, både med rubriker och utan rubrikrad.

Ur CSV-filen väljs `Serie` som innehåller Hockeyettan och `Hemma` som är exakt Sollentuna HC. Datum, tid, motståndare och arena kommer från CSV-filen. Därmed blandas inte U20, damlaget eller ungdomsmatcher in. Serienamnet rensas på samma sätt som i Tizen-sidan innan det skickas till workern.

Framtida matcher kontrolleras med samma `/check?date=…&time=…&home=…&away=…&series=…` som i originalskärmen. `/check` lämnar inte ett game-ID, så en framtida match utan känt ID väntar till matchdagen. Från matchdagen hämtas match-ID med samma `/live?match=…&date=…&home=…&away=…&series=…` som funktionen `loadLiveResult` i nyindex_tizen.html. Ett känt ID i `SWEHOCKEY_ID_MAP` används direkt på samma sätt som där. Workerns svar kontrolleras mot matchdatum, hemma- och bortalag innan `/Game/LineUps/{gameId}` läses. Enbart Sollentunas tabell används. En extra CSV-kolumn `GameID` kan också användas. Matchnr och GameID är olika identifierare.

Ingen ny worker eller ändring av den befintliga workern behövs. Workern används för att identifiera matchen; GitHub-flödet hämtar därefter Line Up från Swehockey, så webbläsaren inte behöver göra ett direkt anrop som kan blockeras av CORS. Matcher långt fram i tiden väntar tills de närmar sig; match-ID kontrolleras inom samma fyradagarsfönster som den befintliga skärmen. Om workern ännu inte hittar en framtida match visas en väntetext, utan en påhittad uppställning.

Flödet kontrollerar ungefär var 15:e minut på hemmamatchdagar och en gång per dag övriga dagar. Det körs också när Spelschema_2627.csv eller nyindex_tizen.html uppdateras på GitHub. GitHub kan fördröja schemalagda körningar. Webbsidan kontrollerar den genererade datafilen varannan minut. Detta är en laguppställningssida, inte en tjänst för liveresultat. Uppgifter som ännu inte publicerats visas som väntande. Hämtfel och gamla uppgifter markeras.

Data hämtas från råfilen på GitHub så automatiska datakommittar inte behöver starta om GitHub Pages. Den ursprungliga publiceringen av HTML-sidan måste däremot ingå i en normal Pages-publicering. Om repot har annan Pages-domän, använd den befintliga domänen med `/laguppstallning.html`.

Första gången: öppna **Actions → Uppdatera A-lagets laguppställning → Run workflow**. Flödet kräver skrivbehörighet till repository-innehåll; om Actions är avstängt eller en organisationspolicy blockerar detta behöver det aktiveras. GitHubs schemalagda flöden körs bara på default-branchen och kan inaktiveras efter 60 dagars inaktivitet i publika repos.

## Spelarfoton

Lägg JPG-foton i `laguppstallning/spelarfoton/`, döpta med tröjnummer, till exempel `20.jpg`, `45.jpg`, `60.jpg`. Saknas en bild används repo-filen `drake.png` automatiskt. När ett tröjnummer byter spelare ska motsvarande foto bytas.

För andra filnamn eller PNG-foton, redigera `laguppstallning/spelarfoton.json`:

```json
{
  "20": "laguppstallning/spelarfoton/lukas-paulsson.png",
  "60": "laguppstallning/spelarfoton/alec-rajalin-scharp.jpg"
}
```

## Spelarinformation från Eliteprospects

Klicka på en spelare för en större 16:9-presentation. Knappen **Spelarpresentation** växlar från laguppställningen till en spelare i taget, med byte var tolfte sekund. Pilarna går till föregående/nästa spelare.

- Automatisk presentation för arenaskärmen: `laguppstallning.html?info=1&kiosk=1`
- Test med laget den 25 september: `laguppstallning.html?demo=1&info=1&kiosk=1`

Lösningen kräver ingen API-nyckel. Födelseår från Date of Birth, moderförening från Youth Team och föreningar med spelade matcher 2025–2026 är kontrollerade mot Eliteprospects och sparade i `laguppstallning/spelarprofiler.json`. Paketet innehåller 24 sådana profiler. Juniorlag och eventuella andra föreningar som spelaren faktiskt spelade i förra säsongen visas också. Profilfält uppdateras manuellt vid behov; de hämtas inte automatiskt från Eliteprospects.

Årets GP, G, A och TP hämtas automatiskt från Swehockeys **Players by team** för Sollentuna HC i Hockeyettan Norra 2026–2027. Slutspel, andra lag och juniorserier blandas inte in. Hämtningen körs i det befintliga Actions-flödet ungefär var 15:e minut, även på bortamatchdagar. Swehockeys publicering kan dröja. Källorna och datum visas separat för profil och statistik.

För målvakter används GPI (matcher där målvakten spelat) som GP. Swehockeys GP i spelartabellen räknar annars matcher i uppställningen. Mål, assist och poäng läses från spelartabellen även för målvakter; GAA och räddningsprocent används aldrig som mål eller assist.

Spelare matchas på fullständigt namn, aldrig enbart tröjnummer. En spelare i Swehockeys roster som saknar sparad EP-profil får födelseår och moderförening från Swehockey och okänd tidigare förening. Saknade uppgifter visas som ”—”, riktiga nollor som 0. Saknas en statistikrad gissas inte noll matcher.

### Uppdatera profiler

Redigera `laguppstallning/spelarprofiler.json` på GitHub. Varje spelare har `name`, `dateOfBirth`, `birthYear`, `youthTeam`, `previousTeams` (lista med föreningsnamn), `source` (EP-profillänk) och `profileCheckedAt` (kontrolldatum). Spara så körs flödet automatiskt. Bevara hela namnet som det står i laguppställningen; kontrollera identiteten innan en ny profil läggs till.

Skript: `scripts/update-player-info.py`. Den genererade visningsfilen är `laguppstallning/spelarinfo.json`; redigera profilen i `spelarprofiler.json` eftersom genererad data skrivs över. Inget GitHub-secret behövs. Det gamla `EP_API_KEY` används inte längre.

Vid byte av säsong måste säsongsnummer och Swehockey-seriens ID i spelarhämtningen uppdateras tillsammans med profilernas `season` och `previousSeason`.

## Felsökning

Kör `python scripts/update-lineup.py --force` för en manuell hämtning. Kräver Python 3.9 eller senare. Inga externa Python-paket behövs. Om Swehockey ändrar HTML-strukturen misslyckas kontrollen synligt, utan att ersätta tidigare uppgifter med tomma matcher.

Spelschema, tränare och spelare kommer från Swehockey. Antalet spelare i en femma följer källan; saknade spelare fylls aldrig i.
