const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* Livesidor som inte visas i Swehockeys vanliga Games By Date-listor. */
const EXTRA_LIVE_GROUP_IDS = [
  "21756", /* Hässelby Kälvesta Hockey Cup U13P */
  "20997", /* U16P Preseason, Stockholms Ishockeyförbund */
  "21138", /* Preseason Games Herr */
  "20963", /* U20 H - Nationell Norra */
  "21447", /* Vallentuna Hockey Cup */
  "21719", /* U13P Blå grupp 1, Stockholms Ishockeyförbund */
  "21723", /* U13P Röd grupp 1, Stockholms Ishockeyförbund */
  "21481", /* U14P Blå grupp 3, Stockholms Ishockeyförbund */
  "21485", /* U14P Röd grupp 4, Stockholms Ishockeyförbund */
  "21456", /* U15P Blå grupp 2, Stockholms Ishockeyförbund */
  "21458", /* U15P Röd grupp 1, Stockholms Ishockeyförbund */
  "21451", /* U16P Blå grupp 2, Stockholms Ishockeyförbund */
  "21274", /* U18H Allettan Östra */
  "21043", /* Hockeyettan Norra */
  "21697", /* DamTvåan Östra */
];

/* Serie -> Swehockey-grupp. Används för att bara fråga den relevanta
   livesidan i stället för samtliga grupper vid varje uppdatering. */
const SERIES_LIVE_GROUP_IDS = {
  "hässelby kälvesta hockey cup u13p": "21756",
  "u16p preseason": "20997",
  "preseason games herr": "21138",
  "u20 h nationell norra": "20963",
  "vallentuna hockey cup": "21447",
  "u13p blå grupp 1": "21719",
  "u13p röd grupp 1": "21723",
  "u14p blå grupp 3": "21481",
  "u14p röd grupp 4": "21485",
  "u15p blå grupp 2": "21456",
  "u15p röd grupp 1": "21458",
  "u16p blå grupp 2": "21451",
  "u18h allettan östra": "21274",
  "hockeyettan norra": "21043",
  "damtvåan östra": "21697",
};

/* Distriktskällor i Games By Date för serier som inte finns i de nationella
   eller Stockholms listor som normalt används. */
const SERIES_DATE_SOURCE_IDS = {
  "preseason dam värmland": "18",
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function decodeHtml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function plainText(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function normalize(value) {
  return plainText(value).toLocaleLowerCase("sv-SE").replace(/[^a-z0-9åäö]+/g, " ").trim();
}

/* Säkerställ både rätt lag och rätt hemma-/bortaordning. */
function hasTeamsInOrder(text, homeTeam, awayTeam) {
  const homePosition = text.indexOf(homeTeam);
  const awayPosition = text.indexOf(awayTeam);
  return homePosition >= 0 && awayPosition >= 0 && homePosition < awayPosition;
}

function groupIdsForSeries(series) {
  const key = normalize(series || "");
  return SERIES_LIVE_GROUP_IDS[key]
    ? [SERIES_LIVE_GROUP_IDS[key]]
    : EXTRA_LIVE_GROUP_IDS;
}

function lookupUrls(date, series) {
  const groupIds = groupIdsForSeries(series);
  const seriesKey = normalize(series || "");
  const districtSourceId = SERIES_DATE_SOURCE_IDS[seriesKey];
  return [
    `https://stats.swehockey.se/GamesByDate/${date}/ByTime/90`,
    `https://stats.swehockey.se/GamesByDate/${date}/ByTime/15`,
    ...(districtSourceId
      ? [`https://stats.swehockey.se/GamesByDate/${date}/ByTime/${districtSourceId}`]
      : []),
    ...groupIds.map(
      (groupId) => `https://stats.swehockey.se/ScheduleAndResults/Live/${groupId}`,
    ),
    ...groupIds.map(
      (groupId) => `https://stats.swehockey.se/ScheduleAndResults/Schedule/${groupId}`,
    ),
  ];
}

async function loadLookupPages(date, series) {
  return Promise.all(lookupUrls(date, series).map(async (sourceUrl) => {
    const response = await fetch(sourceUrl, {
      headers: { "User-Agent": "SollentunaHC-Arenaskarm/1.3" },
      cf: { cacheTtl: 30, cacheEverything: true },
    });
    return {
      sourceUrl,
      html: response.ok ? await response.text() : "",
    };
  }));
}

async function resolveGameId(date, homeTeam, awayTeam, series) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Ogiltigt matchdatum.");
  if (!homeTeam || !awayTeam) throw new Error("Hemma- och bortalag krävs för uppslagning.");

  /*
    Swehockey delar upp Games By Date per förbund. 90 är nationella serier
    och 15 är Stockholms Ishockeyförbund. Båda måste sökas för Sollentunas
    senior-, junior- och ungdomsmatcher.
  */
  const pages = await loadLookupPages(date, series);

  const wantedHome = normalize(homeTeam);
  const wantedAway = normalize(awayTeam);
  function matchingIdsForPages(selectedPages) {
    const matchingIds = new Set();
    for (const page of selectedPages) {
    const html = page.html;
    const isSeriesLivePage = html.includes("TodaysGamesGame");
    const eventPattern = /\/Game\/Events\/(\d+)/gi;
    for (const match of html.matchAll(eventPattern)) {
      const start = html.lastIndexOf("<tr", match.index);
      const end = html.indexOf("</tr>", match.index);
      const rowText = !isSeriesLivePage && start >= 0 && end >= 0
        ? normalize(html.slice(start, end + 5))
        : "";
      if (hasTeamsInOrder(rowText, wantedHome, wantedAway)) matchingIds.add(match[1]);

      /*
        Livesidor använder nästlade div-element. Avgränsa till ett mobilt
        matchblock så lag från föregående eller nästa match inte blandas in.
      */
      const liveBlockMarker = '<div class="row d-flex d-sm-none">';
      const liveBlockStart = html.lastIndexOf(liveBlockMarker, match.index);
      const nextLiveBlock = html.indexOf(liveBlockMarker, match.index + 1);
      const contextStart = liveBlockStart >= 0 ? liveBlockStart : Math.max(0, match.index - 700);
      const contextEnd = nextLiveBlock >= 0 ? nextLiveBlock : Math.min(html.length, match.index + 700);
      const contextText = normalize(html.slice(contextStart, contextEnd));
      if (isSeriesLivePage && hasTeamsInOrder(contextText, wantedHome, wantedAway)) matchingIds.add(match[1]);
    }
    }
    return matchingIds;
  }

  /*
    Prioritera dagens seriesida. Hela säsongens schemasida kan innehålla samma
    hemma-/bortalag flera gånger och får därför aldrig skapa en falsk konflikt
    med en entydig träff på Live eller Games By Date.
  */
  const pageTiers = [
    pages.filter((page) => page.sourceUrl.includes("/ScheduleAndResults/Live/")),
    pages.filter((page) => page.sourceUrl.includes("/GamesByDate/")),
    pages.filter((page) => page.sourceUrl.includes("/ScheduleAndResults/Schedule/")),
  ];
  for (const tier of pageTiers) {
    const matchingIds = matchingIdsForPages(tier);
    if (matchingIds.size === 1) return [...matchingIds][0];
    if (matchingIds.size > 1) {
      throw new Error("Flera möjliga match-ID hittades i samma källa. Inget resultat visas utan en entydig koppling.");
    }
  }
  throw new Error(`Hittade inte ${homeTeam} - ${awayTeam} på Swehockey ${date}.`);
}

/* Kontrollerar på morgonen att en match finns med rätt lag och starttid. */
async function validateScheduledMatch(date, time, homeTeam, awayTeam, series) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Ogiltigt matchdatum.");
  if (!homeTeam || !awayTeam) throw new Error("Hemma- och bortalag krävs för kontroll.");

  const wantedHome = normalize(homeTeam);
  const wantedAway = normalize(awayTeam);
  const wantedTime = normalize(time || "");
  const pages = await loadLookupPages(date, series);

  for (const page of pages) {
    const html = page.html;
    if (!html) continue;

    if (html.includes("TodaysGamesGame")) {
      const marker = '<div class="row d-flex d-sm-none">';
      const blocks = html.split(marker);
      for (const block of blocks) {
        const text = normalize(block.slice(0, 2400));
        if (hasTeamsInOrder(text, wantedHome, wantedAway) &&
            (!wantedTime || text.includes(wantedTime))) {
          return { ok: true, source: page.sourceUrl, checkedAt: new Date().toISOString() };
        }
      }
    } else {
      /* Läs varje innersta tabellrad även när Swehockey har nästlade tabeller. */
      const rowEndPattern = /<\/tr>/gi;
      for (const rowEnd of html.matchAll(rowEndPattern)) {
        const rowStart = html.lastIndexOf("<tr", rowEnd.index);
        if (rowStart < 0) continue;
        const text = normalize(html.slice(rowStart, rowEnd.index + 5));
        if (hasTeamsInOrder(text, wantedHome, wantedAway) &&
            (!wantedTime || text.includes(wantedTime))) {
          return { ok: true, source: page.sourceUrl, checkedAt: new Date().toISOString() };
        }
      }
    }
  }

  return {
    ok: false,
    error: `Matchen ${homeTeam} - ${awayTeam} ${time} hittades inte.`,
    checkedAt: new Date().toISOString(),
  };
}

/* Matchklockan räknar upp. Periodpaus placeras efter periodens matchtid.
   Okänd period ger inget jämförelsetal: gissa inte utifrån en annan sida. */
function matchProgress(result) {
  if (result.status === "SLUT") return 10000000;
  const p = Number(result.period);
  if (p && result.periodEnded) return p * 100000 + 9999;
  if (!p || !result.gameTime || result.periodCertain === false) return null;
  const time = result.gameTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!time || Number(time[2]) > 59) return null;
  return p * 100000 + Number(time[1]) * 60 + Number(time[2]);
}

function parseGame(html, gameId, sourceUrl) {
  const titleMatch = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const teams = titleMatch ? plainText(titleMatch[1]).split(/\s+-\s+/) : [];

  const infoMatch = html.match(/<td[^>]*class=["'][^"']*tdInfoArea[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
  if (!infoMatch) throw new Error("Matchinformationen kunde inte hittas på Swehockey.");

  const infoText = plainText(infoMatch[1]);
  const scoreMatch = infoText.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/);
  if (!scoreMatch) throw new Error("Resultatet kunde inte hittas på Swehockey.");

  const periodMatch = infoText.match(/\b(1st|2nd|3rd|4th|5th)\s+period\b/i)
    || infoText.match(/\bperiod\s*(\d+)\b/i);
  const period = periodMatch
    ? (Number(periodMatch[1]) || ({ "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5 }[periodMatch[1].toLowerCase()] ?? null))
    : null;

  const timeMatches = [...infoText.matchAll(/\b(\d{1,2}:\d{2})\b/g)];
  const gameTime = timeMatches.length ? timeMatches[timeMatches.length - 1][1] : "";
  const allText = plainText(html);
  const ended = /game\s*(?:ended|finished)|final (?:result|score)|slutresultat|matchen avslutad/i.test(allText);
  const live = !ended && Boolean(period || gameTime);
  const updateMatch = allText.match(/last update:\s*(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2})/i);
  const scheduled = allText.match(/\b(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\b/);

  return {
    gameId,
    scheduledDate: scheduled ? scheduled[1] : "",
    scheduledTime: scheduled ? scheduled[2] : "",
    homeTeam: teams[0] || "",
    awayTeam: teams[1] || "",
    homeScore: Number(scoreMatch[1]),
    awayScore: Number(scoreMatch[2]),
    period,
    gameTime,
    status: ended ? "SLUT" : (live ? "LIVE" : "RESULTAT"),
    sourceUpdatedAt: updateMatch ? updateMatch[1] : "",
    source: sourceUrl,
    fetchedAt: new Date().toISOString(),
  };
}

/* Endast ett avgränsat matchblock med exakt internt Game-ID får användas.
   Lagnamn räcker aldrig: samma lag kan mötas i olika serier eller samma dag. */
function parseSeriesLive(html, base, sourceUrl) {
  const marker = '<div class="row d-flex d-sm-none">';
  const candidates = [];
  for (const section of html.split(marker).slice(1)) {
    const desktopStart = section.search(/<div class="[^\"]*d-none d-sm-flex/);
    if (desktopStart < 0) continue; // Okänd layout: använd reserv, gissa inte.
    const block = section.slice(0, desktopStart);
    const ids = [...new Set([...block.matchAll(/\/Game\/Events\/(\d+)/g)].map(m => m[1]))];
    if (ids.length !== 1 || ids[0] !== String(base.gameId)) continue;
    const teams = [...block.matchAll(/<div class="h2 font-weight-bold">([\s\S]*?)<\/div>/g)].map(m => normalize(m[1]));
    if (teams.length !== 2 || teams[0] !== normalize(base.homeTeam) ||
        teams[1] !== normalize(base.awayTeam)) continue;
    const anchor = block.match(/<a\b[^>]*>[\s\S]*?<\/a>/i);
    const score = anchor && plainText(anchor[0]).match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
    const statusBlock = block.match(/<div class="[^\"]*pt-0 mt-0 TodaysGamesGame">([\s\S]*?)<\/div>\s*<\/div>/);
    if (!score || !statusBlock) continue;
    const text = plainText(statusBlock[1]);
    const ended = /game\s*(ended|finished)|final (?:result|score)|slutresultat/i.test(text);
    const periodMatch = text.match(/\b([1-5])(?:st|nd|rd|th) period\b/i);
    const time = text.match(/\((\d{1,2}:\d{2})\)/);
    const waiting = text.match(/waiting for ([1-5])(?:st|nd|rd|th) period/i);
    const pause = /period ended/i.test(text) || Boolean(waiting);
    const livePeriod = waiting ? Number(waiting[1]) - 1 : (periodMatch ? Number(periodMatch[1]) : null);
    if (!ended && !periodMatch && !time && !/powerplay|four on four|overtime|shootout/i.test(text)) continue;
    candidates.push({ ...base,
      homeScore: Number(score[1]), awayScore: Number(score[2]),
      period: livePeriod,
      periodCertain: Boolean(livePeriod),
      gameTime: time ? time[1] : "",
      periodEnded: pause,
      displayGameTime: pause ? "" : (time ? time[1] : ""),
      status: ended ? "SLUT" : "LIVE",
      source: sourceUrl, detailSource: base.source,
      // Matchstatus från just detta block, inte tabellens globala tidsstämpel.
      liveStatusText: text, sourceUpdatedAt: "", fetchedAt: new Date().toISOString(),
    });
  }
  return candidates.length === 1 ? candidates[0] : null;
}

async function preferSeriesLive(base, series) {
  // Livesidorna saknar ibland datum. Bekräfta dagens datum via matchsidan först.
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
  if (base.status === "SLUT" || base.scheduledDate !== today) return base;
  const results = await Promise.all(groupIdsForSeries(series).map(async groupId => {
    const url = `https://stats.swehockey.se/ScheduleAndResults/Live/${groupId}`;
    try {
      const response = await fetch(url, { cf: { cacheTtl: 10, cacheEverything: true } });
      return response.ok ? parseSeriesLive(await response.text(), base, url) : null;
    } catch (_) { return null; }
  }));
  const matches = results.filter(Boolean);
  if (matches.length !== 1) return base;
  const live = matches[0];
  const baseAge = matchProgress(base);
  const liveAge = matchProgress(live);
  // Välj inte en livesida vars period/matchtid är äldre än matchsidan.
  if (baseAge !== null && liveAge !== null && liveAge < baseAge) return base;
  return live;
}

/*
  Reports bekräftar matchidentiteten och används som reservresultat.
  Seriens livesida prioriteras bara om exakt Game-ID och lagordning stämmer.
  Om Reports saknas används LineUps och Events för samma interna match-ID.
*/
async function loadGameResult(gameId, expected = {}) {
  const reportsUrl = `https://stats.swehockey.se/Game/Reports/${gameId}`;
  const lineupsUrl = `https://stats.swehockey.se/Game/LineUps/${gameId}`;
  const eventsUrl = `https://stats.swehockey.se/Game/Events/${gameId}`;
  const requestOptions = {
    headers: { "User-Agent": "SollentunaHC-Arenaskarm/1.14" },
    cf: { cacheTtl: 10, cacheEverything: true },
  };

  try {
    const response = await fetch(reportsUrl, requestOptions);
    if (response.ok) {
      const result = parseGame(await response.text(), gameId, reportsUrl);
      return checkedResult(result, expected);
    }
  } catch (_) {
    // Nätverksfel eller ändrad HTML: fortsätt med befintliga reservkällor.
  }

  const [lineupsResponse, eventsResponse] = await Promise.all([
    fetch(lineupsUrl, requestOptions).catch(() => null),
    fetch(eventsUrl, requestOptions).catch(() => null),
  ]);

  let lineupsResult = null;
  let eventsResult = null;
  if (lineupsResponse && lineupsResponse.ok) {
    try {
      lineupsResult = parseGame(await lineupsResponse.text(), gameId, lineupsUrl);
    } catch (_) {
      lineupsResult = null;
    }
  }
  if (eventsResponse && eventsResponse.ok) {
    try {
      eventsResult = parseGame(await eventsResponse.text(), gameId, eventsUrl);
    } catch (_) {
      eventsResult = null;
    }
  }

  if (!lineupsResult && !eventsResult) {
    throw new Error("Resultatet kunde inte hämtas från Reports, LineUps eller Events.");
  }

  /* Events är reserv om LineUps tillfälligt saknas eller inte kan tolkas. */
  if (!lineupsResult) return checkedResult(eventsResult, expected);

  const result = { ...lineupsResult };
  if (result.status !== "SLUT" && eventsResult) {
    /* Använd period/tid från den sida som har den senaste Swehockey-tidsstämpeln. */
    const eventsIsNewer = Boolean(eventsResult.sourceUpdatedAt) &&
      (!result.sourceUpdatedAt || eventsResult.sourceUpdatedAt > result.sourceUpdatedAt);
    const detailResult = eventsIsNewer ? eventsResult : result;
    result.period = detailResult.period || result.period;
    result.gameTime = detailResult.gameTime || result.gameTime;
    if (detailResult.status === "SLUT") result.status = "SLUT";
    else if (detailResult.status === "LIVE" || result.status === "LIVE") result.status = "LIVE";
  }
  result.source = lineupsUrl;
  result.detailSource = eventsResult ? eventsUrl : "";
  result.fetchedAt = new Date().toISOString();
  return checkedResult(result, expected);
}

async function checkedResult(result, expected) {
  if ((expected.date && result.scheduledDate !== expected.date) ||
      (expected.home && normalize(result.homeTeam) !== normalize(expected.home)) ||
      (expected.away && normalize(result.awayTeam) !== normalize(expected.away))) {
    throw new Error("Matchens datum eller hemma-/bortalag stämmer inte. Inget resultat visas.");
  }
  return preferSeriesLive(result, expected.series);
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "Sollentuna Hockey live-resultat", version: "1.16" });
    }

    if (url.pathname === "/check") {
      try {
        const date = (url.searchParams.get("date") || "").trim();
        const time = (url.searchParams.get("time") || "").trim();
        const home = (url.searchParams.get("home") || "").trim();
        const away = (url.searchParams.get("away") || "").trim();
        const series = (url.searchParams.get("series") || "").trim();
        return json(await validateScheduledMatch(date, time, home, away, series), 200, {
          "Cache-Control": "no-store",
        });
      } catch (error) {
        return json({ ok: false, error: error instanceof Error ? error.message : "Okänt fel" }, 502, {
          "Cache-Control": "no-store",
        });
      }
    }

    if(url.pathname === '/matches'){const league=url.searchParams.get('league')||'hockeyettan';if(!['hockeyettan','u20h','u18h'].includes(league))return json({error:'Okänd serie'},400);try{return json(await leagueMatches(league),200,{'Cache-Control':'public,max-age=20'})}catch(e){return json({error:e.message},502,{'Cache-Control':'no-store'})}}
    if (url.pathname !== "/live") return json({ error: "Not found" }, 404);

    try {
      const suppliedId = (url.searchParams.get("match") || "").trim();
      const date = (url.searchParams.get("date") || "").trim();
      const home = (url.searchParams.get("home") || "").trim();
      const away = (url.searchParams.get("away") || "").trim();
      const series = (url.searchParams.get("series") || "").trim();
      const gameId = date && home && away
        ? await resolveGameId(date, home, away, series)
        : suppliedId;
      if (!/^\d{5,12}$/.test(gameId)) {
        return json({ error: "Ange match-ID eller datum, hemma- och bortalag." }, 400);
      }

      const result = await loadGameResult(gameId, { date, home, away, series });
      return json(result, 200, { "Cache-Control": "public, max-age=10" });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Okänt fel" }, 502, {
        "Cache-Control": "no-store",
      });
    }
  },
};

function signageText(s) { return s.replace(/<[^>]*>/g, ' ').replace(/&#x([\da-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16))).replace(/&#(\d+);/g, (_, x) => String.fromCodePoint(+x)).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function today() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function schedule(html, date) { if (!html.includes('Schedule and Results'))
    throw Error('Spelschemat kunde inte läsas'); html = html.replace(/<td\b([^>]*?)\s*\/>/gi, '<td$1></td>'); let current = ''; const games = []; for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (cells.length < 7)
        continue;
    const d = signageText(cells[0]).match(/\d{4}-\d{2}-\d{2}/);
    if (d)
        current = d[0];
    if (current !== date)
        continue;
    const gameCell = cells.findIndex(c => /\s-\s/.test(signageText(c)) && !/Game\/Events/.test(c));
    if (gameCell < 0)
        continue;
    const teams = signageText(cells[gameCell]).split(/\s+-\s+/);
    if (teams.length !== 2)
        continue;
    const time = signageText(cells[gameCell - 1]).match(/\d{2}:\d{2}/)?.[0] || '';
    const score = signageText(cells[gameCell + 1]).match(/^\d+\s*-\s*\d+$/)?.[0] || null;
    games.push({ home: teams[0], away: teams[1], time, venue: signageText(cells.at(-1)), score, status: score ? 'Resultat' : 'Matchstart', detail: '' });
} return games; }
function blockAt(s, start) { let depth = 0; for (const m of s.slice(start).matchAll(/<\/?div\b[^>]*>/g)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0)
        return s.slice(start, start + m.index + m[0].length);
} return ''; }
function live(html) { const result = []; for (const m of html.matchAll(/<div class="[^"]*\bp-1 row d-none d-sm-flex[^"]*"/g)) {
    const b = blockAt(html, m.index);
    const teams = [...b.matchAll(/<div class="h2 font-weight-bold">([\s\S]*?)<\/div>/g)].map(m => signageText(m[1]));
    if (teams.length !== 2)
        continue;
    const raw = signageText(b);
    const score = raw.match(/(?:^|\s)(\d{1,2}\s*-\s*\d{1,2})(?:\s|$)/)?.[1];
    const status = /Final Score|Game Ended|Finished/i.test(raw) ? 'Slutresultat' : /Intermission/i.test(raw) ? 'Periodpaus' : score ? 'Pågår' : 'Matchstart';
    const detail = raw.match(/(?:Period\s*\d+|Overtime|GWS|\d{2}:\d{2}\s*\(\d\))/i)?.[0] || '';
    result.push({ home: teams[0], away: teams[1], score, status, detail });
} return result; }

async function leagueMatches(league){const id=league==='u20h'?'20963':league==='u18h'?'21274':'21043';const date=today();const opts={signal:AbortSignal.timeout(18000),cf:{cacheTtl:20,cacheEverything:true}};async function get(kind){const r=await fetch('https://stats.swehockey.se/ScheduleAndResults/'+kind+'/'+id,opts);if(!r.ok)throw Error('Matchkällan svarar inte');return r.text()}const [s,l]=await Promise.all([get('Schedule'),get('Live').catch(()=>null)]);const games=schedule(s,date);const sourceDate=l?.match(/Last update:[\s\S]{0,30}?(\d{4}-\d{2}-\d{2})/)?.[1];if(l&&sourceDate===date){for(const g of games){const v=live(l).find(v=>v.home===g.home&&v.away===g.away);if(v){if(v.score)g.score=v.score;g.status=v.status;g.detail=v.detail}}}return {date,games,updatedAt:new Date().toISOString(),liveAvailable:!!l&&sourceDate===date}}
