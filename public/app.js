// 개인 로컬용 카드팩 오픈 시뮬레이터입니다.
// 이 파일은 Netlify public 폴더에서 실행되는 클라이언트 앱입니다.
// 루트 app.js가 아니라 public/app.js로 배포되어야 합니다.

const PACK_SIZE = 5;
const STORAGE_KEY = "pkTCGLocalCollectionV2";
const API_KEY_STORAGE_KEY = "pkTCGApiKeyV1";
const ADMIN_MODE_SESSION_KEY = "pkTCGAdminModeSessionV1";
const SOUND_STORAGE_KEY = "pkTCGSoundEnabledV1";
const PREMIUM_STORAGE_KEY = "is_premium";
const PREMIUM_USER_ID_KEY = "pkTCGPremiumUserIdV1";
const PREMIUM_UNLOCK_CODE_KEY = "pkTCGPremiumUnlockCodeV1";
const PREMIUM_CODE_PREFIX = "ANSWER-";
const PREMIUM_CODE_SALT = "LOCAL-PKTCG-PREMIUM-2026";
const POKEMON_TCG_API_ORIGIN = "https://api.pokemontcg.io";
const POKEMON_TCG_PROXY_PATH = "/.netlify/functions/pokemon-tcg-proxy";
const API_CARD_PAGE_SIZE = 250;
const API_CARD_LIGHT_SELECT_FIELDS = ["id","name","number","types","hp","rarity","images","attacks","weaknesses","resistances","retreatCost","supertype","subtypes","tcgplayer","cardmarket"].join(",");
const STARTER_CATALOG = {
  sets: [
    { id: "local-base", name: "Local Base Set", series: "Local", totalCards: 18 },
    { id: "local-night", name: "Neon Night Set", series: "Local", totalCards: 18 }
  ],
  packs: [
    { id: "local-base-booster", setId: "local-base", name: "Local Base Booster", cardCount: PACK_SIZE },
    { id: "local-night-booster", setId: "local-night", name: "Neon Night Booster", cardCount: PACK_SIZE },
    { id: "all-local-booster", setId: "all", name: "All Local Sets", cardCount: PACK_SIZE }
  ],
  cards: []
};

const RARITIES = ["Common", "Uncommon", "Rare", "Rare Holo", "Double Rare", "Illustration Rare", "Ultra Rare", "Rare Secret", "Special Illustration Rare"];
const TYPES = ["Fire", "Water", "Grass", "Electric", "Psychic", "Fighting", "Dark", "Metal", "Dragon", "Colorless"];
const STARTER_NAMES = [
  "Sprig Mouse", "Cinder Pup", "Bubble Otter", "Volt Finch", "Pebble Cub", "Moss Antler", "Torch Lynx", "Aqua Crest", "Mirror Serpent", "Thunder Crown", "Blaze Monarch", "Goldleaf Guardian", "Dawn Titan", "Shell Courier", "Iron Beetle", "Night Moth", "Quartz Bloom", "Meteor Forge",
  "Neon Tadpole", "Alley Spark", "Smoke Kit", "Copper Shell", "Mind Lamp", "Signal Drake", "Chrome Stag", "Night Arcade", "Holo Lantern", "Voltage Diva", "Midnight Vortex", "Secret Neon Gate", "Mythic Eclipse", "Metro Mole", "Rain Signal", "Cobalt Fang", "Prism Wire", "Solar Overdrive"
];

for (let i = 0; i < STARTER_NAMES.length; i += 1) {
  const isNight = i >= 18;
  const localIndex = i % 18;
  const rarity = localIndex < 5 ? "Common" : localIndex < 8 ? "Rare" : localIndex < 10 ? "Rare Holo" : localIndex < 12 ? "Ultra Rare" : localIndex === 12 ? "Special Illustration Rare" : localIndex < 15 ? "Common" : localIndex < 17 ? "Rare" : "Ultra Rare";
  STARTER_CATALOG.cards.push({
    id: `${isNight ? "nn" : "lb"}-${String(localIndex + 1).padStart(3, "0")}`,
    name: STARTER_NAMES[i],
    setId: isNight ? "local-night" : "local-base",
    setName: isNight ? "Neon Night Set" : "Local Base Set",
    number: String(localIndex + 1).padStart(3, "0"),
    type: TYPES[i % TYPES.length],
    hp: 50 + (localIndex % 8) * 20,
    rarity,
    fakePrice: Math.round(((localIndex + 1) * (rarity.includes("Rare") ? 3.7 : 0.42)) * 100) / 100,
    imageUrl: ""
  });
}

const state = {
  sets: [], packs: [], cards: [], collection: {}, activeSetId: "all", activePackId: "all-local-booster", seriesFilter: "all", packSearch: "", currentPack: [], oddsMode: "realistic", isAdminMode: false
};

const $ = (id) => document.querySelector(id);
const dom = {
  dataSourceLabel: $("#dataSourceLabel"), openPackBtn: $("#openPackBtn"), open5PacksBtn: $("#open5PacksBtn"), open10PacksBtn: $("#open10PacksBtn"), openBoxBtn: $("#openBoxBtn"), collectionBtn: $("#collectionBtn"), soundToggleBtn: $("#soundToggleBtn"), resetSaveBtn: $("#resetSaveBtn"), packSearchInput: $("#packSearchInput"), seriesSelect: $("#seriesSelect"), setSelect: $("#setSelect"), packSelect: $("#packSelect"), packShelf: $("#packShelf"), packShelfStatus: $("#packShelfStatus"), totalCardsStat: $("#totalCardsStat"), ownedCardsStat: $("#ownedCardsStat"), collectionRateStat: $("#collectionRateStat"), stageTitle: $("#stageTitle"), stageStatus: $("#stageStatus"), packGrid: $("#packGrid"), resultPanel: $("#packResultPanel"), resultHeading: $("#resultHeading"), bestCardSummary: $("#bestCardSummary"), resultList: $("#resultList"), collectionPanel: $("#collectionPanel"), closeCollectionBtn: $("#closeCollectionBtn"), collectionGrid: $("#collectionGrid"), collectionDashboard: $("#collectionDashboard"), collectionSearchInput: $("#collectionSearchInput"), collectionFilterSelect: $("#collectionFilterSelect"), collectionSortSelect: $("#collectionSortSelect"), adminPanel: $("#adminPanel"), apiKeyInput: $("#apiKeyInput"), saveApiKeyBtn: $("#saveApiKeyBtn"), loadApiBtn: $("#loadApiBtn"), clearApiKeyBtn: $("#clearApiKeyBtn"), ownerAdminPanel: $("#ownerAdminPanel"), forceActiveSetSyncBtn: $("#forceActiveSetSyncBtn"), forceApiSyncBtn: $("#forceApiSyncBtn"), refreshAdminStatusBtn: $("#refreshAdminStatusBtn"), ownerAdminStats: $("#ownerAdminStats"), forceApiSyncStatus: $("#forceApiSyncStatus"), rarityOverlay: $("#rarityOverlay"), effectText: $("#effectText")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  state.isAdminMode = location.search.includes("admin=true") || location.hash.includes("admin");
  state.collection = loadCollection();
  bindEvents();
  applyCatalog(STARTER_CATALOG, "내장 샘플 DB");
  setStageStatus("내장 샘플 카드로 바로 실행할 수 있습니다.");
  try {
    const local = await fetchJson("data/cards.json", { timeoutMs: 3000 });
    applyCatalog(local, "data/cards.json");
    setStageStatus("data/cards.json을 불러왔습니다.");
  } catch (_) {}
  if (state.isAdminMode) showAdmin();
}

function bindEvents() {
  dom.openPackBtn?.addEventListener("click", () => openPacks(1));
  dom.open5PacksBtn?.addEventListener("click", () => openPacks(5));
  dom.open10PacksBtn?.addEventListener("click", () => openPacks(10));
  dom.openBoxBtn?.addEventListener("click", () => openPacks(30));
  dom.collectionBtn?.addEventListener("click", showCollection);
  dom.closeCollectionBtn?.addEventListener("click", () => dom.collectionPanel.hidden = true);
  dom.resetSaveBtn?.addEventListener("click", resetSave);
  dom.packSearchInput?.addEventListener("input", () => { state.packSearch = dom.packSearchInput.value.trim().toLowerCase(); renderPackShelf(); });
  dom.seriesSelect?.addEventListener("change", () => { state.seriesFilter = dom.seriesSelect.value; renderSetSelect(); renderPackShelf(); });
  dom.setSelect?.addEventListener("change", () => { state.activeSetId = dom.setSelect.value; renderPackSelect(); renderPackShelf(); });
  dom.packSelect?.addEventListener("change", () => { state.activePackId = dom.packSelect.value; renderPackShelf(); });
  dom.saveApiKeyBtn?.addEventListener("click", () => { localStorage.setItem(API_KEY_STORAGE_KEY, dom.apiKeyInput.value.trim()); setStageStatus("API 키를 브라우저에 저장했습니다. Netlify 프록시는 환경 변수 POKEMON_TCG_API_KEY를 우선 사용합니다."); });
  dom.clearApiKeyBtn?.addEventListener("click", () => { localStorage.removeItem(API_KEY_STORAGE_KEY); if (dom.apiKeyInput) dom.apiKeyInput.value = ""; });
  dom.loadApiBtn?.addEventListener("click", loadApiCatalogFromButton);
  dom.forceActiveSetSyncBtn?.addEventListener("click", loadApiCatalogFromButton);
  dom.forceApiSyncBtn?.addEventListener("click", loadApiCatalogFromButton);
  dom.refreshAdminStatusBtn?.addEventListener("click", renderAdminStats);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && dom.rarityOverlay) dom.rarityOverlay.classList.remove("is-visible"); });
}

function applyCatalog(catalog, source) {
  state.sets = Array.isArray(catalog.sets) ? catalog.sets : [];
  state.packs = Array.isArray(catalog.packs) ? catalog.packs : [];
  state.cards = (Array.isArray(catalog.cards) ? catalog.cards : []).map(normalizeCard);
  if (!state.packs.some(p => p.id === state.activePackId)) state.activePackId = state.packs[0]?.id || "";
  if (!state.sets.some(s => s.id === state.activeSetId)) state.activeSetId = "all";
  if (dom.dataSourceLabel) dom.dataSourceLabel.textContent = source;
  renderAll();
}

function normalizeCard(card) {
  return { ...card, id: String(card.id || crypto.randomUUID()), name: String(card.name || "Unknown Card"), rarity: String(card.rarity || "Common"), fakePrice: Number(card.fakePrice || getPriceByRarity(card.rarity)), imageUrl: sanitizeAssetUrl(card.imageUrl || card.images?.large || card.images?.small || "") };
}

function sanitizeAssetUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(String(url), location.origin);
    if (["http:", "https:", "blob:"].includes(parsed.protocol)) return parsed.toString();
    if (parsed.protocol === "data:" && /^data:image\/(png|jpeg|jpg|webp|gif);/i.test(String(url))) return String(url);
  } catch (_) {}
  return "";
}

function renderAll() { renderSeriesSelect(); renderSetSelect(); renderPackSelect(); renderPackShelf(); renderStats(); renderCollection(); renderAdminStats(); }
function renderSeriesSelect() { if (!dom.seriesSelect) return; const series = ["all", ...new Set(state.sets.map(s => s.series || "Unknown"))]; dom.seriesSelect.innerHTML = series.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s === "all" ? "All Series" : s)}</option>`).join(""); dom.seriesSelect.value = state.seriesFilter; }
function renderSetSelect() { if (!dom.setSelect) return; const sets = filteredSets(); dom.setSelect.innerHTML = [`<option value="all">All Sets</option>`, ...sets.map(s => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)}</option>`)].join(""); dom.setSelect.value = state.activeSetId; }
function renderPackSelect() { if (!dom.packSelect) return; const packs = filteredPacks(); dom.packSelect.innerHTML = packs.map(p => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`).join(""); if (packs.length && !packs.some(p => p.id === state.activePackId)) state.activePackId = packs[0].id; dom.packSelect.value = state.activePackId; }
function filteredSets() { return state.sets.filter(s => state.seriesFilter === "all" || (s.series || "Unknown") === state.seriesFilter); }
function filteredPacks() { return state.packs.filter(p => state.activeSetId === "all" || p.setId === state.activeSetId || p.setId === "all"); }
function renderPackShelf() { if (!dom.packShelf) return; const packs = filteredPacks().filter(p => !state.packSearch || `${p.name} ${p.setId}`.toLowerCase().includes(state.packSearch)).slice(0, 80); dom.packShelf.innerHTML = packs.map(p => `<button class="pack-shelf-card ${p.id === state.activePackId ? "is-selected" : ""}" type="button" data-pack-id="${escapeAttr(p.id)}"><span class="shelf-pack-crimp"></span><span class="shelf-pack-art"><span class="shelf-pack-name">${escapeHtml(p.name)}</span><span class="shelf-pack-set">${escapeHtml(p.setId)}</span><span class="shelf-pack-count">${Number(p.cardCount || PACK_SIZE)} cards</span></span><span class="shelf-pack-crimp bottom"></span></button>`).join(""); dom.packShelf.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => { state.activePackId = btn.dataset.packId; renderPackShelf(); renderPackSelect(); })); if (dom.packShelfStatus) dom.packShelfStatus.textContent = `${packs.length}개 팩 표시 중`; }
function renderStats() { const owned = Object.keys(state.collection).length; const total = state.cards.length; if (dom.totalCardsStat) dom.totalCardsStat.textContent = String(total); if (dom.ownedCardsStat) dom.ownedCardsStat.textContent = String(owned); if (dom.collectionRateStat) dom.collectionRateStat.textContent = total ? `${Math.round(owned / total * 100)}%` : "0%"; }

function openPacks(count) {
  const cards = [];
  for (let i = 0; i < count * PACK_SIZE; i += 1) cards.push(drawCard());
  cards.forEach(c => state.collection[c.id] = (state.collection[c.id] || 0) + 1);
  saveCollection();
  state.currentPack = cards;
  renderPackResults(cards, count);
  renderStats();
  renderCollection();
  const best = cards.slice().sort((a,b) => b.fakePrice - a.fakePrice)[0];
  if (best && isHighRarity(best.rarity)) showRarityOverlay(best);
}

function drawCard() {
  const pool = state.cards.filter(c => state.activeSetId === "all" || c.setId === state.activeSetId);
  const selectedPool = pool.length ? pool : state.cards;
  const rarityRoll = Math.random();
  let candidates = selectedPool;
  if (rarityRoll < .55) candidates = selectedPool.filter(c => c.rarity === "Common");
  else if (rarityRoll < .8) candidates = selectedPool.filter(c => c.rarity === "Uncommon" || c.rarity === "Rare");
  else if (rarityRoll < .95) candidates = selectedPool.filter(c => isHighRarity(c.rarity));
  if (!candidates.length) candidates = selectedPool;
  return candidates[Math.floor(Math.random() * candidates.length)] || state.cards[0];
}

function renderPackResults(cards, count) {
  if (!dom.packGrid) return;
  dom.packGrid.classList.remove("is-empty");
  dom.stageTitle.textContent = `${count}팩 개봉 결과`;
  setStageStatus(`${cards.length}장을 획득했습니다.`);
  dom.packGrid.innerHTML = cards.map(cardHtml).join("");
  if (dom.resultPanel) dom.resultPanel.hidden = false;
  const best = cards.slice().sort((a,b) => b.fakePrice - a.fakePrice)[0];
  if (dom.bestCardSummary) dom.bestCardSummary.innerHTML = best ? `<strong>${escapeHtml(best.name)}</strong><span>${escapeHtml(best.rarity)} · $${best.fakePrice.toFixed(2)}</span>` : "";
  if (dom.resultList) dom.resultList.innerHTML = cards.slice(0, 20).map(c => `<div>${escapeHtml(c.name)} · ${escapeHtml(c.rarity)} · $${c.fakePrice.toFixed(2)}</div>`).join("");
}

function cardHtml(c) { return `<article class="tcg-card rarity-${escapeAttr(rarityClass(c.rarity))}">${c.imageUrl ? `<img class="card-image" src="${escapeAttr(c.imageUrl)}" alt="${escapeAttr(c.name)}" loading="lazy">` : `<div class="card-art"><div class="sealed-pack-title">${escapeHtml((c.type || "TCG").slice(0,3))}</div></div>`}<div class="card-body"><div class="card-name">${escapeHtml(c.name)}</div><div>${escapeHtml(c.rarity)} · ${escapeHtml(c.setName || c.setId || "")}</div><strong>$${Number(c.fakePrice || 0).toFixed(2)}</strong></div></article>`; }
function rarityClass(r) { const v = String(r || "").toLowerCase(); if (v.includes("secret") || v.includes("special")) return "special"; if (v.includes("ultra") || v.includes("illustration")) return "ultra"; if (v.includes("holo")) return "holo"; if (v.includes("rare")) return "rare"; if (v.includes("uncommon")) return "uncommon"; return "common"; }
function isHighRarity(r) { return /holo|rare|ultra|secret|illustration|hyper|special/i.test(String(r || "")); }
function getPriceByRarity(r) { return isHighRarity(r) ? 10 + Math.random() * 160 : .2 + Math.random() * 3; }

function showCollection() { if (dom.collectionPanel) dom.collectionPanel.hidden = false; renderCollection(); }
function renderCollection() { if (!dom.collectionGrid) return; const search = (dom.collectionSearchInput?.value || "").toLowerCase(); const filter = dom.collectionFilterSelect?.value || "all"; let cards = state.cards.filter(c => !search || c.name.toLowerCase().includes(search)); if (filter === "owned") cards = cards.filter(c => state.collection[c.id]); if (filter === "missing") cards = cards.filter(c => !state.collection[c.id]); dom.collectionDashboard.innerHTML = `<div>보유 ${Object.keys(state.collection).length} / 전체 ${state.cards.length}</div>`; dom.collectionGrid.innerHTML = cards.slice(0,240).map(c => `<article class="collection-card ${state.collection[c.id] ? "" : "missing"}">${cardHtml(c)}<div class="collection-card-info">보유: ${state.collection[c.id] || 0}</div></article>`).join(""); }
function resetSave() { if (!confirm("컬렉션 저장 데이터를 초기화할까요?")) return; state.collection = {}; saveCollection(); renderAll(); }
function loadCollection() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } }
function saveCollection() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.collection)); }

async function loadApiCatalogFromButton() {
  const btn = dom.loadApiBtn || dom.forceApiSyncBtn;
  const old = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "데이터 동기화 중..."; }
  setStageStatus("Pokemon TCG API 데이터를 불러오는 중입니다...");
  try {
    const data = await fetchJson(`${POKEMON_TCG_PROXY_PATH}?path=/v2/cards&query=pageSize=${API_CARD_PAGE_SIZE}%26select=${encodeURIComponent(API_CARD_LIGHT_SELECT_FIELDS)}`, { timeoutMs: 45000 });
    const cards = Array.isArray(data.data) ? data.data.map(apiCardToLocal) : [];
    if (!cards.length) throw new Error("API 카드 데이터가 비어 있습니다.");
    const apiSet = { id: "api-live", name: "Pokemon TCG API Live", series: "API", totalCards: cards.length };
    applyCatalog({ sets: [apiSet], packs: [{ id: "api-live-booster", setId: "api-live", name: "API Live Booster", cardCount: PACK_SIZE }], cards }, "Pokemon TCG API / Netlify Proxy");
    setStageStatus(`${cards.length}장의 API 카드를 불러왔습니다.`);
  } catch (error) {
    setStageStatus(`동기화 실패: ${error.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = old || "Load API"; }
    renderAdminStats();
  }
}
function apiCardToLocal(c) { return normalizeCard({ id: c.id, name: c.name, number: c.number, setId: "api-live", setName: "Pokemon TCG API", rarity: c.rarity || "Common", imageUrl: c.images?.large || c.images?.small || "", fakePrice: c.tcgplayer?.prices ? extractPrice(c.tcgplayer.prices) : getPriceByRarity(c.rarity), type: Array.isArray(c.types) ? c.types[0] : "Colorless", hp: c.hp }); }
function extractPrice(prices) { const nums = []; Object.values(prices || {}).forEach(v => Object.values(v || {}).forEach(n => { if (typeof n === "number") nums.push(n); })); return nums.length ? Math.max(...nums) : 1; }

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 8000);
  try {
    const headers = {};
    const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (apiKey && /^https:\/\/api\.pokemontcg\.io/.test(url)) headers["X-Api-Key"] = apiKey;
    const res = await fetch(url, { cache: "no-store", headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return JSON.parse(await res.text());
  } finally { clearTimeout(timeout); }
}

function showAdmin() { if (dom.adminPanel) dom.adminPanel.hidden = false; if (dom.ownerAdminPanel) dom.ownerAdminPanel.hidden = false; renderAdminStats(); }
function renderAdminStats() { if (dom.ownerAdminStats) dom.ownerAdminStats.innerHTML = `<span>Cards<strong>${state.cards.length}</strong></span><span>Sets<strong>${state.sets.length}</strong></span><span>Packs<strong>${state.packs.length}</strong></span><span>Proxy<strong>${POKEMON_TCG_PROXY_PATH}</strong></span>`; if (dom.forceApiSyncStatus) dom.forceApiSyncStatus.textContent = "Netlify proxy 구조 준비 완료"; }
function setStageStatus(text) { if (dom.stageStatus) dom.stageStatus.textContent = text; }
function showRarityOverlay(card) { if (!dom.rarityOverlay) return; dom.effectText.textContent = `${card.rarity}! ${card.name}`; dom.rarityOverlay.classList.add("is-visible"); setTimeout(() => dom.rarityOverlay.classList.remove("is-visible"), 1600); }
function escapeHtml(v) { return String(v ?? "").replace(/[&<>"]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s])); }
function escapeAttr(v) { return escapeHtml(v).replace(/'/g, "&#39;"); }
