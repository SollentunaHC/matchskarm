# SHC – Cloudflare-styrning av laguppställningar

GitHub-jobbet är förberett. Cloudflare-delen måste aktiveras på klubbens konto innan styrningen börjar fungera.

## Aktivera via webbläsaren

Koden ligger i SollentunaHC/matchskarm, mappen cloudflare-scheduler.

1. Öppna Cloudflare → Workers & Pages → Create application → importera/anslut GitHub-repository.
2. Välj SollentunaHC/matchskarm och branch main. Namnge den nya Workern shc-match-scheduler.
3. Ange Root directory: cloudflare-scheduler. Build command kan lämnas tom. Deploy command: npx wrangler deploy. Publicera. wrangler.toml skapar den beständiga samordnaren och Cron Trigger automatiskt.
4. Under Settings → Build → Build watch paths: bevaka endast cloudflare-scheduler/** (sökväg från repots rot). Då bygger ändrade matchdata inte om Workern. Om gränssnittet erbjuder automatisk deploy av/på kan den också stängas av efter första publiceringen.
5. Skapa en fine-grained GitHub-token på https://github.com/settings/personal-access-tokens/new med Resource owner SollentunaHC, Only select repositories → matchskarm och Repository permissions → Actions: Read and write. Metadata read följer med. Organisationens godkännande kan behövas. Välj lämplig giltighetstid; när token löper ut behöver den bytas i Cloudflare.
6. Öppna den nya Workern → Settings → Variables & Secrets → Add → typ Secret. Namn: GITHUB_TOKEN. Klistra in token där och välj Deploy/Save and deploy. Detta är en runtime-secret, inte en build-variable. Nyckeln ska inte läggas i koden eller chatten.
7. Öppna Workerns adress och sedan /status. Efter en Cron-körning ska state vara ok och configured vara true. lastTickAt ska ändras ungefär varje minut. lastDispatchAt ändras när GitHub accepterat ett uppdateringsjobb. Kontrollera sedan att GitHub Actions-körningen och Pages-publiceringen lyckas.

Cron Trigger kan ta upp till 15 minuter att börja gälla efter installation. En första installation hämtar spelschemat direkt och kan göra en daglig kontroll som redan har passerat. Därefter följs tiderna nedan.

Befintlig live-resultatworker påverkas inte. Detta är en separat Worker.

## Tider – svensk tid med automatisk sommar-/vintertid

| Innehåll | Kontroll |
| --- | --- |
| A-lag, U20 och U18: laguppställning för hemmamatch | 55, 50, 45, 40, 35, 30, 25, 20, 15, 10 och 5 minuter före start |
| Spelaruppgifter/statistik, hemma och borta | Matchdag 06.00, 12.00 samt 90, 45 och 30 minuter före start |
| Spelschema | En gång per dygn från 02.00 |

Cloudflare gör en lätt tidskontroll varje minut men startar GitHub enbart när en kontroll behövs. Matchdata hämtas och publiceras fortfarande av GitHub. Uppdateringen är därför inte omedelbar: GitHubs kö, själva hämtningen och Pages-publiceringen kan ta tid.

En beständig Durable Object samordnar körningarna och sparar vilka kontrolltillfällen som redan skickats. Överlappande Cron-körningar skickar normalt ett jobb. Ett misslyckat API-anrop kvitteras inte och kan återförsökas vid nästa minut. Flera kontroller som sammanfaller skickas i samma jobb. En nätverksstörning efter att GitHub accepterat anropet kan i sällsynta fall ge ett extra jobb; uppdateringsskriptens egna kontrollnycklar fungerar som ytterligare skydd.

Kortare fördröjningar återhämtas inom fem minuter. Dagens schemakontroll återhämtas även senare samma dag. Ingen automatisk lineup-hämtning startas efter matchstart. Vid större avbrott används Run workflow manuellt.

GitHubs befintliga cron ligger kvar som reserv. Den måste inte stängas av för att Cloudflare ska kunna användas. När Cloudflare är verifierat kan schedule-blocket i .github/workflows/laguppstallning.yml tas bort. Manuell Run workflow har kvar valet force (förvalt på). Cloudflare skickar force=false och följer kontrolltiderna.

## Alternativ installation från dator

Packa upp paketet och öppna en terminal i mappen med wrangler.toml. Node.js behövs.

```sh
npm install
npx wrangler login
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN
```

Det sista kommandot frågar efter GitHub-nyckeln. Ingen Cloudflare-nyckel behöver läggas in i koden. Om flera konton finns anger Wrangler vilket konto som ska användas.

## Tester

```sh
npm test
```

Åtta tester omfattar CSV för alla tre lag, namn med semikolon, elva lineup-tider, fem statistik-tider, hemma/borta, sommar-/vintertid, nattkontroll, beständig deduplicering, samtidiga anrop, återstart, återförsök och att offentliga URL:er inte kan starta jobb. Aktuellt CSV-underlag testades separat. Wrangler 4.151.0 har packat Workern med deploy --dry-run; faktisk publicering och tokenbehörighet måste verifieras på klubbens konto.

## Felsökning

- Missing GITHUB_TOKEN: lägg till runtime-secret och publicera.
- GitHub dispatch HTTP 401/403: token är ogiltig, utgången, saknar Actions write eller väntar på organisationsgodkännande.
- HTTP 404: kontrollera att token får komma åt SollentunaHC/matchskarm.
- HTTP 422: kontrollera att laguppstallning.yml i main har inputs force och trigger_reason. Den uppdaterade filen finns också i paketets github/-mapp.
- state ok men inga nya data: se lastDispatchAt, kontrollera GitHub-jobbets logg och Pages-publiceringen. Ett accepterat API-anrop betyder att jobbet har beställts, inte att data redan publicerats.

Officiell dokumentation:
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
