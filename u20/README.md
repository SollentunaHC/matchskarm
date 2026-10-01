# Sollentuna HC – U20 H Nationell

Tre separata 16:9-visningar i en ljus layout med röda och blå detaljer. Femmorna visas som fyra vågräta rader. Spelarpresentationen har spelarbilden till höger och information/statistik till vänster. Inga källtexter visas på arenaskärmen.

1. Laguppställning: https://sollentunahc.github.io/matchskarm/u20_laguppstallning.html?kiosk=1
2. Matchens spelare: https://sollentunahc.github.io/matchskarm/u20_laguppstallning.html?info=1&kiosk=1
3. Hela U20-truppen: https://sollentunahc.github.io/matchskarm/u20_spelarpresentation.html?kiosk=1
4. Test av verklig match 29 september mot Djurgården: `u20_laguppstallning.html?demo=1&kiosk=1` eller `?demo=1&info=1&kiosk=1`.

## Publicera

Lägg HTML-filerna i repots huvudkatalog och mapparna `u20` och `scripts` i motsvarande kataloger. Skapa/uppdatera `.github/workflows/u20-laguppstallning.yml` genom GitHubs filredigering. A-lagets HTML och data behöver inte ersättas. Uppdatera även den medföljande `.github/workflows/laguppstallning.yml`: båda flödena använder samma körningslås och läser senaste gren så att datakommittar inte kolliderar. `scripts/match_times.py` delas av båda lagen. Kör Actions → Uppdatera U20 H Nationell → Run workflow. Inga API-nycklar behövs.

## Data och kontrolltider

Matcher väljs ur samma Spelschema_2627.csv och konfiguration i nyindex_tizen.html. Bara Sollentunas U20 Herr Nationell Norra väljs; U20 regional och Hockeyettan filtreras bort. Match-ID hämtas från samma Cloudflare-worker. Swehockey-serien är 20963, Eliteprospects-laget 1440.

Laguppställning kontrolleras 59 och 29 minuter före hemmamatchens start. Spelarstatistik uppdateras på U20-matchdagar kl. 06.00, 12.00 och 90 minuter före start, också vid bortamatcher. Allt räknas i Europe/Stockholm. GitHub Actions kan fördröja kontroller; webbsidan läser data varannan minut. Spelarna växlar var fjärde sekund.

27 sparade Eliteprospects-profiler ingår. Dessa har födelseår från Date of Birth, Youth Team och klubbar med matcher 2025–2026. Okända uppgifter visas som —. Elton Mannerhills historik saknas på EP-profilen och är därför tom. Daniel Dyment matchas med EP:s uttryckliga alias Daniel Kazimov. Milan Ruzicka matchas med Milan Jiri Ruzicka; födelsedatum kontrolleras mot Swehockey. Nya profiler och ändringar av den aktuella truppen redigeras i `u20/spelarprofiler.json`. Hela-truppen-sidan visar dessa profiler och kräver ingen matchuppställning.

GP/G/A/TP hämtas bara för U20 Nationell Norra 2026–2027, inga A-lags- eller U18-poäng blandas in. För målvakter används GPI som spelade matcher. Målvakters G/A/TP läses från spelartabellen. Saknad statistikrad blir —, inte påhittade nollor.

## Spelarfoton

Saknas foto används drake.png. Lägg JPG-bilder i `u20/spelarfoton/`, till exempel `nils-dalgard.jpg`, `martin-berglund.jpg`. Fullständigt namn används i filnamnet med små bokstäver, utan accenter, med bindestreck mellan namnord. Detta undviker fel foto när två spelare delar nummer.

Alternativa filnamn anges i `u20/spelarfoton.json`, helst med fullständigt namn (små bokstäver, utan accenter) som nyckel:

```json
{"nils dalgard":"u20/spelarfoton/nils.png"}
```

Vid säsongsbyte måste Swehockey-serie, säsongsfält och kontroll av serie uppdateras tillsammans i U20-skripten och profilerna.
