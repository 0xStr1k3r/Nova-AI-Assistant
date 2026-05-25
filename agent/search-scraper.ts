// Scrapes DuckDuckGo HTML results for search queries
async function performDuckDuckGoHtmlSearch(query: string): Promise<any[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`DDG HTML HTTP error: ${res.status}`);
    }
    const html = await res.text();
    const results: any[] = [];
    
    // Find result anchors: class="result__a"
    const matches = html.matchAll(/<a\s+class="[a-zA-Z0-9_-]*result__a[a-zA-Z0-9_-]*"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
    
    let count = 0;
    for (const match of matches) {
      if (count >= 5) break;
      let rawUrl = match[1];
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      
      if (rawUrl.includes("uddg=")) {
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          rawUrl = decodeURIComponent(uddgMatch[1]);
        }
      }
      if (rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;

      const startIndex = html.indexOf(match[0]);
      if (startIndex !== -1) {
        const htmlSlice = html.substring(startIndex, startIndex + 1500);
        const snippetMatch = htmlSlice.match(/<a\s+class="[a-zA-Z0-9_-]*result__snippet[a-zA-Z0-9_-]*"[^>]*>([\s\S]*?)<\/a>/i);
        const content = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";
        
        results.push({
          title,
          url: rawUrl,
          content,
        });
        count++;
      }
    }
    return results;
  } catch (err: any) {
    console.warn(`[DDG HTML SEARCH WARNING] ${err.message}`);
    return [];
  }
}

// Queries SearXNG instances with fallbacks (DuckDuckGo HTML scraper)
export async function performWebSearch(query: string): Promise<any[]> {
  const searxInstances = [
    "https://search.mdosch.de/",
    "https://searx.oloke.xyz/",
    "https://etsi.me/",
    "https://searx.be/",
    "https://priv.au/",
    "https://searx.work/"
  ];
  
  const shuffledInstances = [...searxInstances].sort(() => Math.random() - 0.5);
  
  for (const inst of shuffledInstances) {
    try {
      const url = `${inst}search?q=${encodeURIComponent(query)}&format=json`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data: any = await res.json();
        if (data.results && data.results.length > 0) {
          return data.results.slice(0, 5).map((r: any) => ({
            title: r.title,
            url: r.url,
            content: r.content || r.snippet || ""
          }));
        }
      }
    } catch (e: any) {
      console.warn(`[SEARCH WARNING] Failed querying instance ${inst}: ${e.message}`);
    }
  }

  // Fallback to DuckDuckGo HTML
  return await performDuckDuckGoHtmlSearch(query);
}

// Fetches target webpage and returns sanitized text
export async function fetchWebpageContent(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }
  const html = await res.text();
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.substring(0, 5000); // Limit to 5000 characters
}
