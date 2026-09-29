// commons.wikimedia.org GET/direct POST resets on this machine (see
// fetch-topic-photos.mjs). Every Wikimedia wiki is served by the same edge,
// so route every Commons API call over a connection to en.wikipedia.org with
// the real Host header set to commons.wikimedia.org.
import https from "node:https";

const UA = "poultry-db/0.2 (https://github.com/Mrshahidali420/poultry-db)";

export function commonsApiPost(params) {
  const payload = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        host: "en.wikipedia.org",
        servername: "en.wikipedia.org",
        path: "/w/api.php",
        headers: {
          host: "commons.wikimedia.org",
          "user-agent": UA,
          "content-type": "application/x-www-form-urlencoded",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

export async function commonsSearch(query, limit = 12) {
  const res = await commonsApiPost({
    action: "query",
    list: "search",
    srsearch: query,
    srnamespace: "6",
    srlimit: String(limit),
    format: "json",
  });
  return (res.query?.search || []).map((r) => r.title);
}

const BAD_NAME = /\.svg$|\.pdf$|\.ogv$|\.webm$|icon|logo|diagram|map\b|flag\b|graph\b|chart\b|drawing|illustration|clipart|coat of arms|stamp\b/i;

export async function commonsImageInfo(titles) {
  const map = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const res = await commonsApiPost({
      action: "query",
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata",
      titles: batch.join("|"),
      format: "json",
      formatversion: "2",
    });
    for (const p of res.query?.pages || []) {
      if (p.missing || !p.imageinfo?.[0]) continue;
      const ii = p.imageinfo[0];
      const em = ii.extmetadata || {};
      map.set(p.title, {
        url: ii.url,
        width: ii.width,
        height: ii.height,
        size: ii.size,
        mime: ii.mime,
        artist: (em.Artist?.value || "").replace(/<[^>]+>/g, "").trim() || null,
        licence: em.LicenseShortName?.value || null,
        licenceUrl: em.LicenseUrl?.value || null,
        description: (em.ImageDescription?.value || "").replace(/<[^>]+>/g, "").trim() || null,
      });
    }
  }
  return map;
}

// Search Commons for `query`, fetch imageinfo for the top hits, and return
// the largest real photo (jpeg/png, not an svg/diagram/icon/flag), sorted
// widest-first so the caller can eyeball the top few as a contact sheet.
export async function pickBestPhoto(query, { minWidth = 700, limit = 12 } = {}) {
  const titles = await commonsSearch(query, limit);
  const candidates = titles.filter((t) => !BAD_NAME.test(t));
  if (candidates.length === 0) return { picks: [], titles };
  const info = await commonsImageInfo(candidates);
  const picks = [...info.entries()]
    .map(([title, meta]) => ({ title, ...meta }))
    .filter((m) => (m.mime === "image/jpeg" || m.mime === "image/png") && m.width >= minWidth)
    .sort((a, b) => b.width - a.width);
  return { picks, titles };
}
