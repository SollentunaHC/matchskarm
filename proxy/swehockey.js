export async function onRequest(context) {
  const url = "https://adm.swehockey.se/Feeds/Club.ashx?id=518";

  const response = await fetch(url);
  const xml = await response.text();

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
