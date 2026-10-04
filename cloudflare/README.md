# Live för skärmar

Befintliga /live och /check finns kvar. Nya /matches?league=hockeyettan och /matches?league=u20h visar dagens hela serie.

Publicera src/index.js i den befintliga Cloudflare Workern sollentuna-hockey-live. Alternativt kör npm install och npx wrangler deploy i denna katalog med rätt Cloudflare-konto.

Sidor: delad_matchskarm.html och delad_u20h_matchskarm.html (liggande 16:9). Matchpanelerna kan öppnas separat. Data uppdateras var 30:e sekund, hela sidan var 10:e minut.

U18H: /matches?league=u18h för U18H Allettan Östra (21274). Skärm: delad_u18h_matchskarm.html.
