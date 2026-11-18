const API = "/api";
const IMAGE = "/tmdb-img/t/p/w500";

const searchInput = document.getElementById("searchInput");
const filtersContainer = document.getElementById("filters");
const contentGrid = document.getElementById("contentGrid");
const emptyState = document.getElementById("emptyState");
const resultsCount = document.getElementById("resultsCount");
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const mobileOverlay = document.getElementById("mobileOverlay");

let selectedCategory = "Todos";
let allContents = [];
let movieGenres = {};
let tvGenres = {};
let searchTimer = null;
let currentPage = 1;
let totalPages = 1;
let loadingMore = false;
let requestMode = "home";
let currentSearch = "";
let contentKeys = new Set();

const loadMoreButton = document.createElement("button");
loadMoreButton.className = "load-more-button";
loadMoreButton.textContent = "Carregar mais";
loadMoreButton.type = "button";
contentGrid.insertAdjacentElement("afterend", loadMoreButton);

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function apiRequest(endpoint) {
  const response = await fetch(`${API}${endpoint}`);

  if (!response.ok) {
    throw new Error(`Erro na API: HTTP ${response.status}`);
  }

  return response.json();
}

async function loadGenres() {
  const [movies, tv] = await Promise.all([
    apiRequest("/genres/movies"),
    apiRequest("/genres/tv")
  ]);

  movieGenres = Object.fromEntries(
    (movies.genres || []).map(genre => [genre.id, genre.name])
  );

  tvGenres = Object.fromEntries(
    (tv.genres || []).map(genre => [genre.id, genre.name])
  );
}

function normalizeContent(item, forcedType = null) {
  const type = forcedType || item.media_type ||
    (item.title ? "movie" : "tv");

  const isMovie = type === "movie";
  const genres = isMovie ? movieGenres : tvGenres;

  return {
    id: item.id,
    type,
    category: isMovie ? "Filmes" : "Séries",
    title: item.title || item.name || "Sem título",
    overview: item.overview || "",
    poster: item.poster_path
      ? `${IMAGE}${item.poster_path}`
      : null,
    backdrop: item.backdrop_path
      ? `${IMAGE}${item.backdrop_path}`
      : null,
    rating: Number(item.vote_average || 0),
    date: item.release_date || item.first_air_date || "",
    genres: (item.genre_ids || [])
      .map(id => genres[id])
      .filter(Boolean)
  };
}

function getYear(date) {
  return date && date.length >= 4
    ? date.slice(0, 4)
    : "Ano indisponível";
}

function addUniqueContents(items) {
  for (const item of items) {
    const key = `${item.type}-${item.id}`;

    if (!contentKeys.has(key)) {
      contentKeys.add(key);
      allContents.push(item);
    }
  }
}

function renderCards(contents) {
  contentGrid.innerHTML = "";

  contents.forEach(item => {
    const card = document.createElement("article");
    card.className = "content-card";
    card.dataset.contentKey = `${item.type}-${item.id}`;


    const genreText = item.genres.length
      ? item.genres.slice(0, 3).join(" · ")
      : "Gênero não informado";

    const poster = item.poster
      ? `<img class="poster-image" src="${escapeHTML(item.poster)}" alt="Pôster de ${escapeHTML(item.title)}" loading="lazy">`
      : `<div class="poster-placeholder">STREAMZONE</div>`;

    card.innerHTML = `
      <div class="poster">
        ${poster}
        <span class="poster-tag">${item.category === "Filmes" ? "FILME" : "SÉRIE"}</span>
        <span class="poster-year">${escapeHTML(getYear(item.date))}</span>
      </div>
      <div class="card-info">
        <div class="card-description">
          <h3>${escapeHTML(item.title)}</h3>
          <p>${escapeHTML(genreText)}</p>
        </div>
        <span class="rating">★ ${item.rating.toFixed(1)}</span>
      </div>
    `;

    contentGrid.appendChild(card);
  });

  contentGrid.hidden = contents.length === 0;
  emptyState.hidden = contents.length !== 0;

  resultsCount.textContent =
    `${contents.length} ${contents.length === 1 ? "conteúdo" : "conteúdos"}`;

  loadMoreButton.hidden =
    contents.length === 0 ||
    requestMode === "search" ||
    currentPage >= totalPages;
}

function showMessage(title, description) {
  contentGrid.innerHTML = "";
  contentGrid.hidden = true;
  emptyState.hidden = false;
  emptyState.querySelector("h3").textContent = title;
  emptyState.querySelector("p").textContent = description;
  resultsCount.textContent = "0 conteúdos";
  loadMoreButton.hidden = true;
}

function updateFilterButtons() {
  document.querySelectorAll(".filter").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.category === selectedCategory
    );
  });
}

function getFilteredContents() {
  const search = searchInput.value.trim().toLocaleLowerCase("pt-BR");

  return allContents.filter(item => {
    const matchesSearch =
      item.title.toLocaleLowerCase("pt-BR").includes(search);

    const matchesCategory =
      selectedCategory === "Todos" ||
      selectedCategory === "Lançamentos" ||
      item.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });
}

function filterContents() {
  renderCards(getFilteredContents());
}

function resetCatalog() {
  allContents = [];
  contentKeys = new Set();
  currentPage = 1;
  totalPages = 1;
  loadingMore = false;
  loadMoreButton.disabled = false;
  loadMoreButton.textContent = "Carregar mais";
}

async function loadHome() {
  requestMode = "home";
  resetCatalog();
  showMessage("Carregando catálogo...", "Buscando filmes e séries para você.");

  try {
    await loadGenres();

    const [movies, series] = await Promise.all([
      apiRequest("/movies/popular?page=1"),
      apiRequest("/tv/popular?page=1")
    ]);

    addUniqueContents([
      ...(movies.results || []).map(item => normalizeContent(item, "movie")),
      ...(series.results || []).map(item => normalizeContent(item, "tv"))
    ]);

    totalPages = Math.max(
      Number(movies.total_pages || 1),
      Number(series.total_pages || 1)
    );

    currentPage = 1;
    renderCards(allContents);
  } catch (error) {
    console.error(error);
    showMessage(
      "Não foi possível carregar o catálogo",
      "Confira se o servidor do StreamZone está ligado no Termux."
    );
  }
}

async function loadCategory(category) {
  requestMode = category === "Filmes" ? "movies" : "series";
  resetCatalog();
  showMessage("Carregando catálogo...", "Buscando conteúdos para você.");

  try {
    const endpoint = category === "Filmes"
      ? "/movies/popular?page=1"
      : "/tv/popular?page=1";

    const data = await apiRequest(endpoint);
    const type = category === "Filmes" ? "movie" : "tv";

    addUniqueContents(
      (data.results || []).map(item => normalizeContent(item, type))
    );

    totalPages = Number(data.total_pages || 1);
    currentPage = 1;
    renderCards(allContents);
  } catch (error) {
    console.error(error);
    showMessage("Erro ao carregar catálogo", "Tente novamente.");
  }
}

async function loadReleases() {
  requestMode = "releases";
  resetCatalog();
  showMessage("Carregando lançamentos...", "Buscando filmes em cartaz.");

  try {
    const data = await apiRequest("/movies/now-playing?page=1");

    addUniqueContents(
      (data.results || []).map(item => normalizeContent(item, "movie"))
    );

    totalPages = Number(data.total_pages || 1);
    currentPage = 1;
    renderCards(allContents);
  } catch (error) {
    console.error(error);
    showMessage("Erro ao carregar lançamentos", "Tente novamente.");
  }
}

async function loadMore() {
  if (loadingMore || currentPage >= totalPages) return;

  loadingMore = true;
  loadMoreButton.disabled = true;
  loadMoreButton.textContent = "Carregando...";

  const nextPage = currentPage + 1;

  try {
    if (requestMode === "home") {
      const [movies, series] = await Promise.all([
        apiRequest(`/movies/popular?page=${nextPage}`),
        apiRequest(`/tv/popular?page=${nextPage}`)
      ]);

      addUniqueContents([
        ...(movies.results || []).map(item => normalizeContent(item, "movie")),
        ...(series.results || []).map(item => normalizeContent(item, "tv"))
      ]);

      totalPages = Math.min(
        500,
        Math.max(
          Number(movies.total_pages || 1),
          Number(series.total_pages || 1)
        )
      );
    } else if (requestMode === "movies") {
      const data = await apiRequest(`/movies/popular?page=${nextPage}`);

      addUniqueContents(
        (data.results || []).map(item => normalizeContent(item, "movie"))
      );

      totalPages = Math.min(500, Number(data.total_pages || 1));
    } else if (requestMode === "series") {
      const data = await apiRequest(`/tv/popular?page=${nextPage}`);

      addUniqueContents(
        (data.results || []).map(item => normalizeContent(item, "tv"))
      );

      totalPages = Math.min(500, Number(data.total_pages || 1));
    } else if (requestMode === "releases") {
      const data = await apiRequest(`/movies/now-playing?page=${nextPage}`);

      addUniqueContents(
        (data.results || []).map(item => normalizeContent(item, "movie"))
      );

      totalPages = Math.min(500, Number(data.total_pages || 1));
    }

    currentPage = nextPage;
    filterContents();
  } catch (error) {
    console.error(error);
    loadMoreButton.textContent = "Erro. Tentar novamente";
  } finally {
    loadingMore = false;
    loadMoreButton.disabled = false;

    if (currentPage < totalPages) {
      loadMoreButton.textContent = "Carregar mais";
      loadMoreButton.hidden = false;
    } else {
      loadMoreButton.hidden = true;
    }
  }
}

async function searchCatalog(query) {
  if (query.length < 2) return;

  requestMode = "search";
  showMessage("Pesquisando...", "Procurando filmes e séries.");

  try {
    const data = await apiRequest(
      `/search?query=${encodeURIComponent(query)}&page=1`
    );

    resetCatalog();
    requestMode = "search";

    const results = (data.results || [])
      .filter(item =>
        item.media_type === "movie" || item.media_type === "tv"
      )
      .map(item => normalizeContent(item));

    addUniqueContents(results);
    totalPages = 1;
    renderCards(getFilteredContents());
  } catch (error) {
    console.error(error);
    showMessage("Erro na pesquisa", "Não foi possível pesquisar agora.");
  }
}

function addReleaseFilter() {
  if (filtersContainer.querySelector('[data-category="Lançamentos"]')) {
    return;
  }

  const button = document.createElement("button");
  button.className = "filter";
  button.dataset.category = "Lançamentos";
  button.textContent = " ✨ Lançamentos";
  filtersContainer.appendChild(button);
}

filtersContainer.addEventListener("click", async event => {
  const button = event.target.closest(".filter");
  if (!button) return;

  selectedCategory = button.dataset.category;
  updateFilterButtons();
  searchInput.value = "";

  if (selectedCategory === "Lançamentos") {
    await loadReleases();
  } else if (selectedCategory === "Animes") {
    requestMode = "anime";
    resetCatalog();
    showMessage(
      "Animes em preparação",
      "A integração do catálogo de animes será feita com uma fonte própria."
    );
  } else if (selectedCategory === "Todos") {
    await loadHome();
  } else {
    await loadCategory(selectedCategory);
  }
});

loadMoreButton.addEventListener("click", loadMore);

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);

  const query = searchInput.value.trim();

  if (!query) {
    if (selectedCategory === "Todos") {
      loadHome();
    } else if (selectedCategory === "Filmes" ||
               selectedCategory === "Séries") {
      loadCategory(selectedCategory);
    } else if (selectedCategory === "Lançamentos") {
      loadReleases();
    }
    return;
  }

  searchTimer = setTimeout(() => searchCatalog(query), 450);
});

function closeMenu() {
  sidebar.classList.remove("open");
  mobileOverlay.classList.remove("show");
}

menuToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
  mobileOverlay.classList.toggle("show");
});

mobileOverlay.addEventListener("click", closeMenu);

document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach(item =>
      item.classList.remove("active")
    );

    link.classList.add("active");
    closeMenu();
  });
});

addReleaseFilter();
loadHome();

console.log("StreamZone V1.0 — catálogo com paginação carregado!");
// ======================================
// STREAMZONE V1.0 - DETALHES E MINHA LISTA
// ======================================

const WATCHLIST_KEY = "streamzone_my_list_v1";

function getWatchlist() {
  try {
    const data = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveWatchlist(list) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
}

function isInWatchlist(item) {
  return getWatchlist().some(
    saved => saved.id === item.id && saved.type === item.type
  );
}

function toggleWatchlist(item) {
  let list = getWatchlist();

  if (isInWatchlist(item)) {
    list = list.filter(
      saved => !(saved.id === item.id && saved.type === item.type)
    );
  } else {
    list.push(item);
  }

  saveWatchlist(list);
  return isInWatchlist(item);
}

// Criar entrada Minha Lista no menu
const sideNav = document.querySelector(".side-nav");

if (!document.getElementById("myListLink")) {
  const link = document.createElement("a");
  link.id = "myListLink";
  link.href = "#minha-lista";
  link.className = "nav-link";
  link.innerHTML = "<span>♡</span> Minha lista";
  sideNav.appendChild(link);

  link.addEventListener("click", event => {
    event.preventDefault();
    closeMenu();

    document.querySelectorAll(".nav-link").forEach(item =>
      item.classList.remove("active")
    );

    link.classList.add("active");
    showMyList();
  });
}

// Modal de detalhes
const detailsModal = document.createElement("div");
detailsModal.id = "detailsModal";
detailsModal.className = "details-modal";
detailsModal.hidden = true;
detailsModal.innerHTML = `
  <div class="details-panel">
    <button class="details-close" type="button" aria-label="Fechar">✕</button>
    <div class="details-backdrop-wrap">
      <div class="details-backdrop" id="detailsBackdrop"></div>
      <button class="backdrop-play" id="backdropPlay"
        type="button" aria-label="Reproduzir conteúdo" hidden disabled>
        ▶
      </button>

      <section class="stream-player" id="streamPlayer" hidden>
        <iframe
          id="embeddedVideo"
          title="Reprodutor de vídeo"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
          hidden
        ></iframe>
        <video id="streamVideo" controls playsinline></video>
        <div class="stream-controls">
          <label>Áudio
            <select id="audioTrack">
              <option value="">Automático</option>
            </select>
          </label>
          <label>Legendas
            <select id="subtitleTrack">
              <option value="">Desativadas</option>
            </select>
          </label>
        </div>
        <p id="playerStatus" role="status">Preparando reprodução...</p>
      </section>
    </div>
    <div class="details-content">
      <span class="details-type" id="detailsType"></span>
      <h2 id="detailsTitle">Carregando...</h2>
      <div class="details-meta" id="detailsMeta"></div>
      <p class="details-overview" id="detailsOverview">
        Buscando informações...
      </p>
      <div class="details-genres" id="detailsGenres"></div>

      <section class="series-episodes" id="seriesEpisodes" hidden>
        <h3>Episódios</h3>
        <label for="seasonSelect">Temporada</label>
        <select id="seasonSelect"></select>
        <div id="episodesList" aria-live="polite"></div>
      </section>

      <section class="providers-section" id="providersSection">
        <h3>Onde assistir</h3>
        <div class="providers-list" id="providersList">
          <span>Consultando disponibilidade...</span>
        </div>
        <a class="providers-link" id="providersLink"
           href="#" target="_blank" rel="noopener noreferrer" hidden>
          Ver todas as opções
        </a>
      </section>

      <button class="watch-button" id="watchButton" hidden>
        ▶ Assistir conteúdo
      </button>


      <button class="trailer-button" id="trailerButton" hidden>
        ▶ Assistir ao trailer
      </button>
      <div class="trailer-player" id="trailerPlayer" hidden></div>
      <button class="watchlist-button" id="watchlistButton">
        ♡ Adicionar à Minha Lista
      </button>
    </div>
  </div>
`;

document.body.appendChild(detailsModal);

const trailerButton = document.getElementById("trailerButton");
const trailerPlayer = document.getElementById("trailerPlayer");

const watchButton = document.getElementById("watchButton");
const backdropPlayButton = document.getElementById("backdropPlay");

backdropPlayButton.addEventListener("click", () => {
  playEmbeddedContent();
});
const streamPlayerElement = document.getElementById("streamPlayer");
const embeddedVideo = document.getElementById("embeddedVideo");
const streamVideo = document.getElementById("streamVideo");
const audioTrackSelect = document.getElementById("audioTrack");
const subtitleTrackSelect = document.getElementById("subtitleTrack");
const playerStatus = document.getElementById("playerStatus");

let streamPlayerInstance = null;

let activeEmbedUrl = null;
let embedRecoveryUsed = false;
let embedWasHidden = false;
let embedRecoveryTimer = null;

async function stopStreamPlayer() {
  clearTimeout(embedRecoveryTimer);
  embedRecoveryTimer = null;
  activeEmbedUrl = null;
  embedRecoveryUsed = false;
  embedWasHidden = false;

  if (streamPlayerInstance) {
    await streamPlayerInstance.destroy();
    streamPlayerInstance = null;
  }

  streamVideo.pause();
  streamVideo.removeAttribute("src");
  streamVideo.load();

  embeddedVideo.src = "about:blank";
  embeddedVideo.hidden = true;
  streamVideo.hidden = false;

  audioTrackSelect.hidden = false;
  subtitleTrackSelect.hidden = false;
  streamPlayerElement.hidden = true;
}

function fillTrackOptions() {
  audioTrackSelect.replaceChildren(
    new Option("Automático", "")
  );

  subtitleTrackSelect.replaceChildren(
    new Option("Desativadas", "")
  );

  if (!streamPlayerInstance) return;

  const tracks = streamPlayerInstance.getVariantTracks();
  const languages = [...new Map(
    tracks.map(track => [
      track.language,
      track.language
    ])
  ).values()];

  languages.forEach(language => {
    if (!language) return;
    audioTrackSelect.add(
      new Option(language, language)
    );
  });

  streamPlayerInstance.getTextTracks().forEach(track => {
    subtitleTrackSelect.add(
      new Option(
        track.language || "Legenda",
        track.language
      )
    );
  });
}

function buildEmbedUrl(item, episode = null) {
  const id = Number(item?.id);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("ID TMDB inválido.");
  }

  // Discord Activity: route the embed through the app's configured URL Mapping.
  // Developer Portal mapping required: /embedmovies -> myembed.biz
  if (item.type === "movie") {
    return `/embedmovies/filme/${id}`;
  }

  if (item.type === "tv") {
    if (episode) {
      return `/embedmovies/serie/${id}/${episode.season}/${episode.number}`;
    }

    return `/embedmovies/serie/${id}/1/1`;
  }

  throw new Error("Tipo de conteúdo não suportado.");
}

async function playEmbeddedContent(episode = null) {
  if (!selectedDetail) return;

  try {
    const url = buildEmbedUrl(selectedDetail, episode);

    await stopStreamPlayer();

    activeEmbedUrl = url;
    embedRecoveryUsed = false;
    embedWasHidden = false;

    streamPlayerElement.hidden = false;
    streamVideo.hidden = true;
    audioTrackSelect.hidden = true;
    subtitleTrackSelect.hidden = true;

    embeddedVideo.hidden = false;
    embeddedVideo.src = url;

    playerStatus.textContent = episode
      ? `Abrindo episódio ${episode.number} da temporada ${episode.season}...`
      : "Carregando player EmbedMovies...";

  } catch (error) {
    console.error("Erro ao abrir EmbedMovies:", error);
    playerStatus.textContent = error.message;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    if (activeEmbedUrl && !streamPlayerElement.hidden) {
      embedWasHidden = true;
    }
    return;
  }

  if (
    document.visibilityState !== "visible" ||
    !embedWasHidden ||
    !activeEmbedUrl ||
    streamPlayerElement.hidden ||
    embedRecoveryUsed
  ) {
    return;
  }

  embedWasHidden = false;
  embedRecoveryUsed = true;

  clearTimeout(embedRecoveryTimer);

  embedRecoveryTimer = setTimeout(() => {
    if (!activeEmbedUrl || streamPlayerElement.hidden) return;

    const urlToRestore = activeEmbedUrl;

    embeddedVideo.src = "about:blank";

    setTimeout(() => {
      if (
        activeEmbedUrl === urlToRestore &&
        !streamPlayerElement.hidden
      ) {
        embeddedVideo.src = urlToRestore;
        playerStatus.textContent =
          "Reconectando player após retorno do anúncio...";
      }
    }, 200);
  }, 2000);
});

watchButton.addEventListener("click", () => {
  playEmbeddedContent();
});

audioTrackSelect.addEventListener("change", () => {
  if (!streamPlayerInstance) return;

  if (audioTrackSelect.value) {
    streamPlayerInstance.selectAudioLanguage(
      audioTrackSelect.value
    );
  }
});

subtitleTrackSelect.addEventListener("change", () => {
  if (!streamPlayerInstance) return;

  if (!subtitleTrackSelect.value) {
    streamPlayerInstance.setTextTrackVisibility(false);
    return;
  }

  streamPlayerInstance.selectTextLanguage(
    subtitleTrackSelect.value
  );
  streamPlayerInstance.setTextTrackVisibility(true);
});


let selectedTrailer = null;
let selectedBackdrop = null;
let trailerPlayerInstance = null;
let youtubeApiLoading = false;
let pendingTrailerSetup = null;

function stopBackdropTrailer(restore = true) {
  if (trailerPlayerInstance) {
    try {
      trailerPlayerInstance.destroy();
    } catch (error) {
      console.warn("Não foi possível encerrar o player:", error);
    }
    trailerPlayerInstance = null;
  }

  const backdropElement = document.getElementById("detailsBackdrop");
  backdropElement.replaceChildren();
  backdropElement.style.backgroundImage =
    restore && selectedBackdrop
      ? `url("${selectedBackdrop}")`
      : "none";
}

function loadYouTubeApi(callback) {
  pendingTrailerSetup = callback;

  if (window.YT && window.YT.Player) {
    const setup = pendingTrailerSetup;
    pendingTrailerSetup = null;
    setup();
    return;
  }

  if (youtubeApiLoading) return;

  youtubeApiLoading = true;

  const previousCallback = window.onYouTubeIframeAPIReady;

  window.onYouTubeIframeAPIReady = () => {
    if (typeof previousCallback === "function") {
      previousCallback();
    }

    youtubeApiLoading = false;

    const setup = pendingTrailerSetup;
    pendingTrailerSetup = null;

    if (setup) setup();
  };

  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(script);
}

function playBackdropTrailer(videoKey, title, requestId) {
  const backdropElement = document.getElementById("detailsBackdrop");
  const playerElement = document.createElement("div");

  playerElement.id = "youtubeTrailerPlayer";
  backdropElement.replaceChildren(playerElement);
  backdropElement.style.backgroundImage = "none";

  loadYouTubeApi(() => {
    if (requestId !== detailRequestId || detailsModal.hidden) return;

    trailerPlayerInstance = new YT.Player("youtubeTrailerPlayer", {
      videoId: videoKey,
      playerVars: {
        autoplay: 1,
        mute: 1,
        playsinline: 1,
        controls: 1,
        rel: 0,
        origin: window.location.origin
      },
      events: {
        onStateChange: event => {
          if (
            event.data === YT.PlayerState.ENDED &&
            requestId === detailRequestId
          ) {
            trailerPlayerInstance = null;
            backdropElement.replaceChildren();
            backdropElement.style.backgroundImage =
              selectedBackdrop
                ? `url("${selectedBackdrop}")`
                : "none";
          }
        }
      }
    });
  });
}

trailerButton.addEventListener("click", () => {
  if (!selectedTrailer) return;

  if (!trailerPlayer.hidden) {
    trailerPlayer.replaceChildren();
    trailerPlayer.hidden = true;
    trailerButton.textContent = "▶ Assistir ao trailer";
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(selectedTrailer.key)}`;
  iframe.title = "Trailer do conteúdo";
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";

  trailerPlayer.replaceChildren(iframe);
  trailerPlayer.hidden = false;
  trailerButton.textContent = "✕ Fechar trailer";
});

let selectedDetail = null;
let detailRequestId = 0;

function closeDetails() {
  detailsModal.hidden = true;
  document.body.classList.remove("modal-open");
  stopBackdropTrailer(false);
  stopStreamPlayer();
  selectedBackdrop = null;
  document.getElementById("detailsBackdrop").replaceChildren();
  selectedDetail = null;
  selectedTrailer = null;
}

detailsModal.querySelector(".details-close").addEventListener(
  "click", closeDetails
);

detailsModal.addEventListener("click", event => {
  if (event.target === detailsModal) closeDetails();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !detailsModal.hidden) {
    closeDetails();
  }
});

function updateWatchlistButton() {
  if (!selectedDetail) return;

  const saved = isInWatchlist(selectedDetail);
  const button = document.getElementById("watchlistButton");

  button.textContent = saved
    ? "♥ Remover da Minha Lista"
    : "♡ Adicionar à Minha Lista";

  button.classList.toggle("saved", saved);
}

document.getElementById("watchlistButton").addEventListener(
  "click", () => {
    if (!selectedDetail) return;

    toggleWatchlist(selectedDetail);
    updateWatchlistButton();

    if (requestMode === "watchlist") {
      showMyList();
    }
  }
);


async function loadSeriesEpisodes(item, data, requestId) {
  const section = document.getElementById("seriesEpisodes");
  const seasonSelect = document.getElementById("seasonSelect");
  const episodesList = document.getElementById("episodesList");

  section.hidden = item.type !== "tv";

  if (item.type !== "tv") return;

  seasonSelect.replaceChildren();
  episodesList.textContent = "Carregando temporadas...";

  const seasons = data.seasons || [];

  for (const season of seasons) {
    if (season.season_number === 0) continue;

    const option = document.createElement("option");
    option.value = season.season_number;
    option.textContent = season.name ||
      `Temporada ${season.season_number}`;
    seasonSelect.appendChild(option);
  }

  if (!seasonSelect.options.length) {
    episodesList.textContent = "Nenhuma temporada disponível.";
    return;
  }

  seasonSelect.onchange = async () => {
    const seasonNumber = seasonSelect.value;
    episodesList.textContent = "Carregando episódios...";

    try {
      const seasonData = await apiRequest(
        `/series/${item.id}/seasons/${seasonNumber}`
      );

      if (
        requestId !== detailRequestId ||
        !selectedDetail ||
        selectedDetail.id !== item.id
      ) return;

      episodesList.replaceChildren();

      const episodes = seasonData.episodes || [];

      if (!episodes.length) {
        episodesList.textContent = "Nenhum episódio encontrado.";
        return;
      }

      for (const episode of episodes) {
        const card = document.createElement("article");
        card.className = "episode-item";
        card.setAttribute("role", "button");
        card.tabIndex = 0;

        const playEpisode = () => {
          playEmbeddedContent({
            season: seasonNumber,
            number: episode.episode_number
          });
        };

        card.addEventListener("click", playEpisode);
        card.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            playEpisode();
          }
        });

        const imageWrap = document.createElement("div");
        imageWrap.className = "episode-item-image";

        if (episode.still_path) {
          const image = document.createElement("img");
          image.src =
            `/tmdb-img/t/p/w500${episode.still_path}`;
          image.alt = episode.name || "Imagem do episódio";
          image.loading = "lazy";
          imageWrap.appendChild(image);
        }

        const info = document.createElement("div");
        info.className = "episode-item-info";

        const number = document.createElement("span");
        number.className = "episode-number";
        number.textContent =
          `EPISÓDIO ${episode.episode_number}`;

        const title = document.createElement("h4");
        title.textContent = episode.name || "Episódio sem título";

        const overview = document.createElement("p");
        overview.textContent =
          episode.overview || "Descrição não disponível.";

        const runtime = document.createElement("span");
        runtime.className = "episode-runtime";
        runtime.textContent = episode.runtime
          ? `${episode.runtime} min`
          : "Duração indisponível";

        info.append(number, title, overview, runtime);
        card.append(imageWrap, info);
        episodesList.appendChild(card);
      }
    } catch (error) {
      if (requestId !== detailRequestId) return;

      episodesList.textContent =
        "Não foi possível carregar os episódios.";
      console.error("Erro nos episódios:", error);
    }
  };

  await seasonSelect.onchange();
}

async function openDetails(item) {
  selectedDetail = item;
  watchButton.hidden = true;
  watchButton.textContent = "▶ Assistir conteúdo";
  backdropPlayButton.hidden = true;
  backdropPlayButton.disabled = true;
  streamPlayerElement.hidden = true;
  stopStreamPlayer();
  selectedTrailer = null;
  trailerButton.hidden = true;
  trailerPlayer.replaceChildren();
  trailerPlayer.hidden = true;
  trailerButton.textContent = "▶ Assistir ao trailer";
  document.getElementById("seriesEpisodes").hidden = true;
  document.getElementById("episodesList").replaceChildren();

  const requestId = ++detailRequestId;

  watchButton.hidden = false;
  watchButton.disabled = false;
  watchButton.textContent = item.type === "movie"
    ? "▶ Assistir filme"
    : "▶ Assistir série";

  backdropPlayButton.hidden = false;
  backdropPlayButton.disabled = false;

  detailsModal.hidden = false;
  document.body.classList.add("modal-open");

  document.getElementById("detailsType").textContent =
    item.type === "movie" ? "FILME" : "SÉRIE";

  document.getElementById("detailsTitle").textContent = item.title;
  document.getElementById("detailsOverview").textContent =
    item.overview || "Sinopse não disponível.";

  document.getElementById("detailsMeta").textContent =
    `${getYear(item.date)}  ·  ★ ${item.rating.toFixed(1)}`;

  document.getElementById("detailsGenres").textContent =
    (item.genres || []).join(" · ");

  const backdropElement = document.getElementById("detailsBackdrop");
  backdropElement.replaceChildren();
  backdropElement.style.backgroundImage =
    item.backdrop ? `url("${item.backdrop}")` : "none";

  updateWatchlistButton();

  try {
    const data = await apiRequest(
      `/details/${item.type}/${item.id}`
    );

    if (requestId !== detailRequestId || !selectedDetail) return;

    const genres = (data.genres || []).map(genre => genre.name);

    document.getElementById("detailsOverview").textContent =
      data.overview || "Sinopse não disponível.";

    document.getElementById("detailsMeta").textContent = [
      getYear(data.release_date || data.first_air_date || item.date),
      data.runtime ? `${data.runtime} min` : null,
      data.number_of_seasons
        ? `${data.number_of_seasons} temporadas`
        : null,
      `★ ${Number(data.vote_average || item.rating).toFixed(1)}`
    ].filter(Boolean).join("  ·  ");

    document.getElementById("detailsGenres").textContent =
      genres.join(" · ") || "Gêneros não disponíveis";

    await loadSeriesEpisodes(item, data, requestId);

    const providersList = document.getElementById("providersList");
    const providersLink = document.getElementById("providersLink");
    providersList.replaceChildren();
    providersLink.hidden = true;
    providersList.textContent = "Consultando disponibilidade...";

    try {
      const providerData = await apiRequest(
        `/providers/${item.type}/${item.id}`
      );

      if (requestId !== detailRequestId || !selectedDetail) return;

      const groups = [
        ["Assinatura", providerData.streaming],
        ["Grátis", providerData.free],
        ["Com anúncios", providerData.ads],
        ["Aluguel", providerData.rent],
        ["Compra", providerData.buy]
      ];

      const seen = new Set();
      let total = 0;

      for (const [category, providers] of groups) {
        if (!providers?.length) continue;

        const heading = document.createElement("h4");
        heading.className = "providers-category";
        heading.textContent = category;
        providersList.appendChild(heading);

        const row = document.createElement("div");
        row.className = "providers-row";

        for (const provider of providers) {
          if (seen.has(provider.provider_id)) continue;
          seen.add(provider.provider_id);
          total++;

          const itemElement = document.createElement("div");
          itemElement.className = "provider-item";

          if (provider.logo_path) {
            const logo = document.createElement("img");
            logo.src = `/tmdb-img/t/p/w92${provider.logo_path}`;
            logo.alt = provider.provider_name;
            logo.loading = "lazy";
            itemElement.appendChild(logo);
          }

          const name = document.createElement("span");
          name.textContent = provider.provider_name;
          itemElement.appendChild(name);
          row.appendChild(itemElement);
        }

        if (row.childElementCount) {
          providersList.appendChild(row);
        }
      }

      if (!total) {
        providersList.textContent =
          "Nenhum serviço encontrado no Brasil para este título.";
      }

      if (providerData.link) {
        providersLink.href = providerData.link;
        providersLink.hidden = false;
      }
    } catch (providerError) {
      if (requestId !== detailRequestId) return;
      providersList.textContent =
        "Não foi possível consultar os serviços agora.";
      console.error("Erro nos provedores:", providerError);
    }

    const backdrop = data.backdrop_path
      ? `/tmdb-img/t/p/original${data.backdrop_path}`
      : item.backdrop;

    selectedBackdrop = backdrop || null;

    document.getElementById("detailsBackdrop").style.backgroundImage =
      selectedBackdrop ? `url("${selectedBackdrop}")` : "none";

    const videos = data.videos?.results || [];
    const validVideo = video =>
      video.site === "YouTube" &&
      /^[\w-]+$/.test(video.key || "");

    selectedTrailer =
      videos.find(video =>
        validVideo(video) &&
        video.type === "Trailer" &&
        video.official === true
      ) ||
      videos.find(video =>
        validVideo(video) && video.type === "Trailer"
      ) ||
      videos.find(validVideo) ||
      null;

    // Trailer temporariamente desativado na interface.
    trailerButton.hidden = true;
    trailerPlayer.hidden = true;

  } catch (error) {
    console.error("Erro nos detalhes:", error);
  }
}

// Abrir detalhes ao clicar em um card
contentGrid.addEventListener("click", event => {
  const card = event.target.closest(".content-card");
  if (!card) return;

  const key = card.dataset.contentKey;
  if (!key) return;

  const item = allContents.find(
    content => `${content.type}-${content.id}` === key
  ) || getWatchlist().find(
    content => `${content.type}-${content.id}` === key
  );

  if (item) openDetails(item);
});

// Mostrar Minha Lista
function showMyList() {
  requestMode = "watchlist";
  currentPage = 1;
  totalPages = 1;

  const list = getWatchlist();

  if (!list.length) {
    showMessage(
      "Sua lista está vazia",
      "Abra os detalhes de um filme ou série e adicione seus favoritos."
    );
    return;
  }

  renderCards(list);
  loadMoreButton.hidden = true;

  resultsCount.textContent =
    `${list.length} ${list.length === 1 ? "salvo" : "salvos"}`;
}

console.log("StreamZone: detalhes e Minha Lista preparados!");
