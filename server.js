require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

const TMDB_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
// Permite comunicação com o frontend local.
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (
    origin === "http://localhost:3000" ||
    origin === "http://127.0.0.1:3000"
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

app.post("/api/token", async (req, res) => {
  const code = req.body?.code;

  if (!code) {
    return res.status(400).json({ error: "Código OAuth ausente." });
  }

  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    return res.status(500).json({ error: "OAuth não configurado." });
  }

  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Falha na autenticação OAuth:", data.error);
      return res.status(502).json({
        error: "Não foi possível autenticar com o Discord."
      });
    }

    res.json({ access_token: data.access_token });
  } catch (error) {
    console.error("Erro OAuth:", error.message);
    res.status(500).json({ error: "Erro interno de autenticação." });
  }
});

async function tmdbRequest(endpoint, params = {}) {
  if (!TMDB_TOKEN) {
    throw new Error("Token do TMDB não configurado no arquivo .env");
  }

  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);

  url.searchParams.set("language", "pt-BR");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      accept: "application/json"
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TMDB respondeu ${response.status}: ${error}`);
  }

  return response.json();
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    application: "StreamZone",
    version: "1.0.0",
    tmdbConfigured: Boolean(TMDB_TOKEN)
  });
});

// Filmes populares
app.get("/api/movies/popular", async (req, res) => {
  try {
    const data = await tmdbRequest("/movie/popular", {
      page: req.query.page || 1,
      region: "BR"
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Filmes em lançamento
app.get("/api/movies/now-playing", async (req, res) => {
  try {
    const data = await tmdbRequest("/movie/now_playing", {
      page: req.query.page || 1,
      region: "BR"
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Séries populares
app.get("/api/tv/popular", async (req, res) => {
  try {
    const data = await tmdbRequest("/tv/popular", {
      page: req.query.page || 1
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Em alta: filmes e séries
app.get("/api/trending", async (req, res) => {
  try {
    const data = await tmdbRequest("/trending/all/week", {
      page: req.query.page || 1
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pesquisa de filmes, séries e pessoas
app.get("/api/search", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();

    if (!query) {
      return res.status(400).json({
        error: "Informe o termo da pesquisa."
      });
    }

    const data = await tmdbRequest("/search/multi", {
      query,
      page: req.query.page || 1,
      include_adult: false,
      region: "BR"
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Gêneros de filmes
app.get("/api/genres/movies", async (req, res) => {
  try {
    const data = await tmdbRequest("/genre/movie/list");
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Gêneros de séries
app.get("/api/genres/tv", async (req, res) => {
  try {
    const data = await tmdbRequest("/genre/tv/list");
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Detalhes completos de filmes e séries
app.get("/api/details/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;

    if (!["movie", "tv"].includes(type) || !/^\d+$/.test(id)) {
      return res.status(400).json({ error: "Conteúdo inválido." });
    }

    const data = await tmdbRequest(`/${type}/${id}`, {
      append_to_response: "videos,credits"
    });

    res.json(data);
  } catch (error) {
    console.error("Erro nos detalhes:", error.message);
    res.status(500).json({ error: "Não foi possível buscar os detalhes." });
  }
});



// Temporadas e episódios de séries
app.get("/api/series/:id/seasons/:seasonNumber", async (req, res) => {
  try {
    const { id, seasonNumber } = req.params;

    if (!/^\d+$/.test(id) || !/^\d+$/.test(seasonNumber)) {
      return res.status(400).json({ error: "Série ou temporada inválida." });
    }

    const data = await tmdbRequest(
      `/tv/${id}/season/${seasonNumber}`
    );

    res.json(data);
  } catch (error) {
    console.error("Erro ao buscar temporada:", error.message);
    res.status(500).json({ error: "Não foi possível buscar os episódios." });
  }
});

// Onde assistir: disponibilidade por país via TMDB / JustWatch
app.get("/api/providers/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;

    if (!["movie", "tv"].includes(type) || !/^\d+$/.test(id)) {
      return res.status(400).json({
        error: "Conteúdo inválido."
      });
    }

    const data = await tmdbRequest(
      `/${type}/${id}/watch/providers`
    );

    const brazil = data.results?.BR || null;

    res.json({
      id: Number(id),
      type,
      region: "BR",
      available: Boolean(brazil),
      link: brazil?.link || null,
      streaming: brazil?.flatrate || [],
      free: brazil?.free || [],
      ads: brazil?.ads || [],
      rent: brazil?.rent || [],
      buy: brazil?.buy || [],
      attribution: "Disponibilidade fornecida por JustWatch via TMDB."
    });
  } catch (error) {
    console.error("Erro ao buscar provedores:", error.message);
    res.status(500).json({
      error: "Não foi possível consultar onde assistir."
    });
  }
});


// Descoberta automática de vídeos no Internet Archive
app.get("/api/sources/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;

    if (!["movie", "tv"].includes(type) || !/^\d+$/.test(id)) {
      return res.status(400).json({ error: "Conteúdo inválido." });
    }

    const details = await tmdbRequest(`/${type}/${id}`);
    const title = details.title || details.name;
    const originalTitle = details.original_title || details.original_name;
    const releaseDate = details.release_date || details.first_air_date;
    const year = releaseDate ? releaseDate.slice(0, 4) : null;

    if (!title) {
      return res.status(404).json({ error: "Título não encontrado." });
    }

    const normalize = value =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");

    const acceptedTitles = [...new Set(
      [title, originalTitle].filter(Boolean).map(normalize)
    )];

    const searchTerms = [...new Set(
      [originalTitle, title].filter(Boolean)
    )];

    const docsByIdentifier = new Map();

    for (const term of searchTerms) {
      const searchUrl = new URL("https://archive.org/advancedsearch.php");

      searchUrl.searchParams.set(
        "q",
        `mediatype:movies AND title:"${term.replace(/["\\]/g, " ")}"`
      );
      searchUrl.searchParams.set("output", "json");
      searchUrl.searchParams.set("rows", "50");
      searchUrl.searchParams.append("fl[]", "identifier");
      searchUrl.searchParams.append("fl[]", "title");

      const response = await fetch(searchUrl);
      if (!response.ok) continue;

      const data = await response.json();

      for (const doc of data.response?.docs || []) {
        if (doc.identifier) {
          docsByIdentifier.set(doc.identifier, doc);
        }
      }
    }

    const docs = [...docsByIdentifier.values()];

    const results = await Promise.all(docs.map(async item => {
      try {
        const response = await fetch(
          `https://archive.org/metadata/${encodeURIComponent(item.identifier)}`
        );

        if (!response.ok) return null;

        const metadata = await response.json();
        const info = metadata.metadata || {};
        const archiveTitle = info.title || item.title || "";
        const normalizedArchiveTitle = normalize(archiveTitle);

        const titleMatches = acceptedTitles.includes(normalizedArchiveTitle);

        if (!titleMatches) return null;

        const archiveYear = String(
          info.year || info.date || info.publicdate || ""
        ).match(/\b(18|19|20)\d{2}\b/)?.[0] || null;

        if (year && archiveYear && year !== archiveYear) return null;

        const licenseUrl = String(info.licenseurl || "");
        const rights = String(info.rights || "");
        const rightsText = `${licenseUrl} ${rights}`.toLowerCase();

        const approvedLicense =
          /creativecommons\.org\/licenses\/by\/[0-9.]+\/?$/i.test(licenseUrl) ||
          /creativecommons\.org\/licenses\/by-sa\/[0-9.]+\/?$/i.test(licenseUrl) ||
          /creativecommons\.org\/publicdomain\/zero\/1\.0\/?$/i.test(licenseUrl) ||
          /creativecommons\.org\/publicdomain\/mark\/1\.0\/?$/i.test(licenseUrl) ||
          /public domain/.test(rightsText);

        const files = (metadata.files || []).filter(file => {
          const name = String(file.name || "").toLowerCase();
          return /\.(mp4|m4v|webm|ogv)$/.test(name) &&
            file.source !== "metadata" &&
            file.private !== "true";
        });

        const file = files.sort((a, b) =>
          Number(b.size || 0) - Number(a.size || 0)
        )[0];

        // Metadados de licença podem estar incorretos ou contraditórios.
        // Não liberamos automaticamente quando há atribuição conflitante.
        const attribution = String(
          info.creator || info.contributor || ""
        );
        const suspiciousRights =
          /copyright|all rights reserved|20th century fox|warner bros|disney/i
            .test(`${rights} ${attribution}`);

        const playable = Boolean(
          file &&
          approvedLicense &&
          !suspiciousRights
        );

        return {
          title: archiveTitle,
          year: archiveYear,
          identifier: item.identifier,
          pageUrl: `https://archive.org/details/${encodeURIComponent(item.identifier)}`,
          licenseUrl: licenseUrl || null,
          rights: rights || null,
          licenseNeedsReview: !approvedLicense || suspiciousRights,
          playable,
          playbackUrl: playable
            ? `https://archive.org/download/${encodeURIComponent(item.identifier)}/${file.name.split("/").map(encodeURIComponent).join("/")}`
            : null,
          format: file?.format || null,
          size: file?.size || null,
          attribution: attribution || "Internet Archive"
        };
      } catch {
        return null;
      }
    }));

    res.json({
      tmdbId: Number(id),
      type,
      title,
      originalTitle,
      year,
      source: "Internet Archive",
      results: results.filter(Boolean)
    });
  } catch (error) {
    console.error("Erro na descoberta de fontes:", error.message);
    res.status(500).json({
      error: "Não foi possível pesquisar fontes de vídeo."
    });
  }
});


// Pesquisa de vídeos incorporáveis no YouTube
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const youtubeSearchCache = new Map();
const YOUTUBE_CACHE_TTL = 6 * 60 * 60 * 1000;

function youtubeDurationSeconds(iso) {
  const match = String(iso || "").match(
    /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
  );

  if (!match) return 0;

  return Number(match[1] || 0) * 3600 +
    Number(match[2] || 0) * 60 +
    Number(match[3] || 0);
}

app.get("/api/youtube/search/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;

    if (!["movie", "tv"].includes(type) || !/^\d+$/.test(id)) {
      return res.status(400).json({ error: "Conteúdo inválido." });
    }

    if (!YOUTUBE_API_KEY) {
      return res.status(503).json({
        error: "YOUTUBE_API_KEY não configurada no servidor."
      });
    }

    const cacheKey = `${type}:${id}`;
    const cached = youtubeSearchCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < YOUTUBE_CACHE_TTL) {
      return res.json({ ...cached.data, cached: true });
    }

    const details = await tmdbRequest(`/${type}/${id}`);
    const title = details.title || details.name;
    const originalTitle = details.original_title || details.original_name;
    const releaseDate = details.release_date || details.first_air_date;
    const year = releaseDate ? releaseDate.slice(0, 4) : "";

    if (!title) {
      return res.status(404).json({ error: "Título não encontrado." });
    }

    const searchPhrase = type === "movie"
      ? `${title} ${year} full movie public domain`
      : `${title} full episode official`;

    const searchUrl = new URL(
      "https://www.googleapis.com/youtube/v3/search"
    );

    const searchParams = {
      part: "snippet",
      type: "video",
      q: searchPhrase,
      maxResults: "10",
      order: "relevance",
      videoEmbeddable: "true",
      videoSyndicated: "true",
      videoDuration: "long",
      key: YOUTUBE_API_KEY
    };

    for (const [key, value] of Object.entries(searchParams)) {
      searchUrl.searchParams.set(key, value);
    }

    const searchResponse = await fetch(searchUrl);

    if (!searchResponse.ok) {
      const errorData = await searchResponse.json().catch(() => ({}));
      const reason = errorData.error?.errors?.[0]?.reason;

      console.error("YouTube Search API:", searchResponse.status, reason || "erro");

      return res.status(502).json({
        error: "A pesquisa do YouTube falhou.",
        reason: reason || "youtube_api_error"
      });
    }

    const searchData = await searchResponse.json();
    const videoIds = (searchData.items || [])
      .map(item => item.id?.videoId)
      .filter(Boolean);

    if (!videoIds.length) {
      const emptyResult = {
        tmdbId: Number(id),
        type,
        title,
        originalTitle,
        year,
        source: "YouTube",
        results: []
      };

      youtubeSearchCache.set(cacheKey, {
        timestamp: Date.now(),
        data: emptyResult
      });

      return res.json(emptyResult);
    }

    const videosUrl = new URL(
      "https://www.googleapis.com/youtube/v3/videos"
    );

    videosUrl.searchParams.set("part", "snippet,contentDetails,status");
    videosUrl.searchParams.set("id", videoIds.join(","));
    videosUrl.searchParams.set("key", YOUTUBE_API_KEY);

    const videosResponse = await fetch(videosUrl);

    if (!videosResponse.ok) {
      return res.status(502).json({
        error: "Não foi possível consultar os detalhes dos vídeos."
      });
    }

    const videosData = await videosResponse.json();

    const minimumDuration = type === "movie"
      ? 60 * 60
      : 15 * 60;

    const results = (videosData.items || [])
      .map(video => {
        const durationSeconds = youtubeDurationSeconds(
          video.contentDetails?.duration
        );

        return {
          videoId: video.id,
          title: video.snippet?.title || "",
          channelTitle: video.snippet?.channelTitle || "",
          channelId: video.snippet?.channelId || "",
          publishedAt: video.snippet?.publishedAt || null,
          durationSeconds,
          embeddable: video.status?.embeddable === true,
          embedUrl: `https://www.youtube-nocookie.com/embed/${video.id}`,
          reviewRequired: true
        };
      })
      .filter(video =>
        video.embeddable &&
        video.durationSeconds >= minimumDuration
      );

    const result = {
      tmdbId: Number(id),
      type,
      title,
      originalTitle,
      year,
      source: "YouTube",
      results
    };

    youtubeSearchCache.set(cacheKey, {
      timestamp: Date.now(),
      data: result
    });

    res.json(result);
  } catch (error) {
    console.error("Erro na pesquisa do YouTube:", error.message);
    res.status(500).json({
      error: "Não foi possível pesquisar vídeos no YouTube."
    });
  }
});

// Frontend do StreamZone
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});


app.get(/^\/embedmovies\/(.*)$/, (req, res) => {
  const targetPath = req.params[0];
  res.redirect(302, `https://myembed.biz/${targetPath}`);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("--------------------------------");
  console.log("       STREAMZONE V1.0");
  console.log("--------------------------------");
  console.log(`Servidor: http://localhost:${PORT}`);
  console.log(`TMDB: ${TMDB_TOKEN ? "Configurado" : "Token ausente"}`);
  console.log(`YouTube API: ${YOUTUBE_API_KEY ? "Configurada" : "Chave ausente"}`);
  console.log("--------------------------------");
});
