# Spelarhistorik och målvaktsstatistik – A-lag, U20 och U18

Ladda upp paketets filer i SollentunaHC/matchskarm och behåll mappstrukturen.

1. Ersätt de tre laguppställningssidorna i roten.
2. Ersätt de tre update-…-player-info.py i scripts/ och lägg till scripts/player-history.py.
3. Ersätt spelarinfo.json i laguppstallning/, u20/ och u18/ med paketets färdiga data. Behåll spelarprofiler.json, spelarfoton.json och fotomapparna.
4. När GitHub Pages har publicerats, ladda om skärmen med Ctrl+F5. Ändringar i scripts startar även den befintliga gemensamma uppdateringen.

Matchens spelarpresentation fungerar liggande och stående som tidigare. U20:s layout är kvar. U18:s felaktiga serietext har rättats.

Utespelare visar GP, G, A och TP. Målvakter visar GP (spelade matcher/GPI), räddningsprocent, GAA (insläppta mål per 60 minuter) och hållna nollor/SO. Statistiken gäller årets aktuella serie hos Swehockey. Saknade uppgifter visas som —. Målvakter utan speltid får — för procent och GAA.

Föreningar 2025–2026 hämtas från offentliga Eliteprospects-profiler. Identitet verifieras mot Swehockeys födelsedatum och namn eller tröjnummer; tre särskilt verifierade identiteter ingår för spelare som saknas i aktuell trupp eller har namnvariationer. Alla registrerade föreningar för säsongen visas. Historiken kontrolleras högst en gång per vecka vid ordinarie körningar. Manuell körning tvingar en ny kontroll. Sparad historik finns kvar om källan inte kan nås; statistikhämtningen fortsätter. Stradlin Karlström Hernandez saknar registrerad förening 2025–2026 i den offentliga profilen och visar —.

Kontroller: verklig Swehockey-statistik, verkliga Eliteprospects-profiler, namnvariation med kontrollerat födelsedatum, avvisning av fel födelsedatum, korrekt formatering av decimaler, målvaktsfält respektive utespelarfält i samtliga tre sidor. JavaScript och Python har syntaxkontrollerats. Visuell kontroll på fysisk skärm återstår.
