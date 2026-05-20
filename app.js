const API_BASE = "https://codexpet.xyz";
const API_LOCALE = "zh";
const SORT_LABELS = {
  hot: "热门",
  latest: "最新",
  downloads: "下载",
};

const state = {
  page: 1,
  totalPages: 1,
  totalItems: 0,
  limit: 30,
  sort: "hot",
  query: "",
  tag: "",
  loading: false,
  theme: "classic",
};

const els = {
  grid: document.querySelector("#petGrid"),
  status: document.querySelector("#status"),
  pageInfo: document.querySelector("#pageInfo"),
  totalCount: document.querySelector("#totalCount"),
  prev: document.querySelector("#prevPage"),
  next: document.querySelector("#nextPage"),
  jumpForm: document.querySelector("#jumpForm"),
  pageInput: document.querySelector("#pageInput"),
  jumpButton: document.querySelector("#jumpButton"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  searchButton: document.querySelector("#searchButton"),
  clearSearch: document.querySelector("#clearSearchButton"),
  sortButtons: [...document.querySelectorAll("[data-sort]")],
  tagBar: document.querySelector("#tagBar"),
  refresh: document.querySelector("#refreshButton"),
  themeSelect: document.querySelector("#themeSelect"),
  filterSummary: document.querySelector("#filterSummary"),
  template: document.querySelector("#petCardTemplate"),
};

let requestId = 0;
let partyLayer = null;
let partyFrame = 0;
let lastPartyTick = 0;
let lastPlatformScan = 0;
let platformObserver = null;
let platforms = [];
let partyContextMenu = null;
let activeMenuInstance = null;

const summonedPets = [];
const spriteCache = new Map();
const PARTY_ACTIONS = {
  idle: { row: 0, frames: 6, duration: 0.9 },
  walk: { row: 1, frames: 8, duration: 0.6 },
  jump: { row: 4, frames: 5, duration: 0.5 },
  fall: { row: 4, frames: 5, duration: 0.45 },
  failed: { row: 5, frames: 8, duration: 1 },
  waiting: { row: 6, frames: 6, duration: 0.9 },
  run: { row: 7, frames: 6, duration: 0.4 },
  sprint: { row: 7, frames: 6, duration: 0.35 },
  review: { row: 8, frames: 6, duration: 1.2 },
};
const PARTY_DECISIONS = [
  { action: "idle", weight: 25 },
  { action: "walkLeft", weight: 15 },
  { action: "walkRight", weight: 15 },
  { action: "jump", weight: 10 },
  { action: "waiting", weight: 8 },
  { action: "runLeft", weight: 8 },
  { action: "runRight", weight: 8 },
  { action: "review", weight: 5 },
  { action: "failed", weight: 2 },
];
const PET_WHISPERS = [
  "今天也要摸摸头~",
  "我在偷偷陪你写代码。",
  "不要太累啦，喝口水。",
  "嘿嘿，我掉下来啦。",
  "这里是我的小地盘。",
  "你一动鼠标我就紧张。",
  "代码会变好，心情也会。",
  "可以给我一颗小星星吗？",
  "我会乖乖站好。",
  "悄悄说：你很厉害。",
  "咕噜咕噜，灵感来了。",
  "今天的 bug 也会被打败。",
];
const PET_FALLING_WHISPERS = [
  "起飞喽~",
  "好高~",
  "我飘起来啦！",
  "降落准备中~",
  "风好大呀~",
  "啊~~~~",
  "轻轻落地，拜托啦。",
  "云朵在哪里？",
];
const COLLISION_SELECTOR = [
  ".controls",
  ".card",
  ".previewButton",
  ".actions a",
  ".actions button",
  ".tag",
  ".segmented button",
  ".pager",
  ".jumpForm",
].join(",");

function absoluteUrl(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

function parseTags(raw) {
  try {
    const tags = JSON.parse(raw || "[]");
    return Array.isArray(tags) ? tags.slice(0, 4) : [];
  } catch {
    return [];
  }
}

function plainText(value) {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/[#*_`>\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
}

function setLoading(isLoading) {
  state.loading = isLoading;
  els.grid.setAttribute("aria-busy", String(isLoading));
  els.searchButton.disabled = isLoading;
  els.refresh.disabled = isLoading;
  els.prev.disabled = isLoading || state.page <= 1;
  els.next.disabled = isLoading || state.page >= state.totalPages;
  els.jumpButton.disabled = isLoading;
  els.sortButtons.forEach((button) => {
    button.disabled = isLoading;
  });
}

function updateUrl() {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.tag) params.set("tag", state.tag);
  if (state.sort !== "hot") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.theme !== "classic") params.set("style", state.theme);
  const query = params.toString();
  history.replaceState({}, "", query ? `?${query}` : location.pathname);
}

function readUrlState() {
  const params = new URLSearchParams(location.search);
  const page = Number.parseInt(params.get("page") || "1", 10);
  const sort = params.get("sort") || "hot";
  const theme = params.get("style") || localStorage.getItem("codex-pet-theme") || "classic";
  state.page = Number.isFinite(page) && page > 0 ? page : 1;
  state.sort = SORT_LABELS[sort] ? sort : "hot";
  state.theme = ["classic", "compact", "showcase", "dark", "cartoon"].includes(theme) ? theme : "classic";
  state.query = params.get("q") || "";
  state.tag = params.get("tag") || "";
  els.searchInput.value = state.query;
}

function buildListUrl() {
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(state.limit),
    sort: state.sort,
    locale: API_LOCALE,
  });
  if (state.query) params.set("q", state.query);
  if (state.tag) params.set("tag", state.tag);
  return `${API_BASE}/api/pets?${params}`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`);
  }
  return response.json();
}

function renderFilters() {
  els.sortButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.sort === state.sort);
  });
  els.themeSelect.value = state.theme;
  document.documentElement.dataset.theme = state.theme;

  const parts = [`排序：${SORT_LABELS[state.sort]}`];
  if (state.query) parts.push(`搜索：${state.query}`);
  if (state.tag) parts.push(`标签：${state.tag}`);
  els.filterSummary.textContent = parts.join(" · ");
}

function themeName(theme) {
  return {
    classic: "清爽社区",
    compact: "紧凑信息",
    showcase: "展示橱窗",
    dark: "夜间像素",
    cartoon: "卡通花园",
  }[theme] || "卡通花园";
}

function renderTags(tags) {
  els.tagBar.replaceChildren();

  const all = document.createElement("button");
  all.className = `tag${state.tag ? "" : " active"}`;
  all.type = "button";
  all.textContent = "全部";
  all.addEventListener("click", () => setTag(""));
  els.tagBar.append(all);

  for (const item of tags) {
    const button = document.createElement("button");
    button.className = `tag${state.tag === item.tag ? " active" : ""}`;
    button.type = "button";
    button.textContent = `${item.tag} ${Number(item.count || 0).toLocaleString("zh-CN")}`;
    button.addEventListener("click", () => setTag(state.tag === item.tag ? "" : item.tag));
    els.tagBar.append(button);
  }
}

function renderPager() {
  els.prev.disabled = state.loading || state.page <= 1;
  els.next.disabled = state.loading || state.page >= state.totalPages;
  els.pageInfo.textContent = `第 ${state.page} 页 / 共 ${state.totalPages} 页`;
  els.totalCount.textContent = `${state.totalItems.toLocaleString("zh-CN")} 个宠物`;
  els.pageInput.max = String(state.totalPages);
  els.pageInput.value = String(state.page);
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  return ok;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return fallbackCopy(text);
}

function isMobileViewport() {
  return window.innerWidth < 768;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function partyScale() {
  return isMobileViewport() ? 0.24 : 0.34;
}

function partyLimit() {
  return isMobileViewport() ? 8 : 20;
}

function partySize() {
  const scale = partyScale();
  return {
    scale,
    width: 192 * scale,
    height: 208 * scale,
  };
}

function weightedPartyDecision() {
  let weight = Math.random() * PARTY_DECISIONS.reduce((sum, item) => sum + item.weight, 0);
  for (const item of PARTY_DECISIONS) {
    weight -= item.weight;
    if (weight <= 0) return item.action;
  }
  return "idle";
}

function randomPetWhisper() {
  return PET_WHISPERS[Math.floor(Math.random() * PET_WHISPERS.length)];
}

function randomFallingWhisper() {
  return PET_FALLING_WHISPERS[Math.floor(Math.random() * PET_FALLING_WHISPERS.length)];
}

function installCommandFor(slug) {
  return `irm ${API_BASE}/install/${slug}?platform=ps1 | iex`;
}

function preloadSprite(url) {
  if (!url || spriteCache.has(url)) return;
  const image = new Image();
  spriteCache.set(url, image);
  image.src = url;
}

function openPetDetail(pet) {
  if (pet.raw) {
    sessionStorage.setItem(`codex-pet:${pet.slug}`, JSON.stringify(pet.raw));
  }
  location.href = pet.detailUrl;
}

function openPetDetailInNewTab(pet) {
  if (pet.raw) {
    sessionStorage.setItem(`codex-pet:${pet.slug}`, JSON.stringify(pet.raw));
  }
  window.open(pet.detailUrl, "_blank", "noopener");
}

function downloadPet(pet) {
  const link = document.createElement("a");
  link.href = pet.downloadUrl || `${API_BASE}/api/pets/${pet.slug}/download`;
  link.download = `${pet.slug}.codex-pet.zip`;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

async function copyPetInstallCommand(pet) {
  await copyText(pet.installCommand || installCommandFor(pet.slug));
}

function ensurePartyLayer() {
  if (partyLayer) return partyLayer;

  partyLayer = document.createElement("div");
  partyLayer.className = "pet-party-layer";
  partyLayer.dataset.petPartyLayer = "true";
  document.body.append(partyLayer);

  const refreshPlatforms = () => {
    lastPlatformScan = 0;
    requestAnimationFrame(() => {
      scanCollisionPlatforms();
      lastPlatformScan = performance.now();
      makeDetachedPetsFall(true);
    });
  };
  window.addEventListener("scroll", refreshPlatforms, { passive: true });
  window.addEventListener("resize", refreshPlatforms);
  window.addEventListener("pointermove", () => makeDetachedPetsFall(true), { passive: true });
  window.addEventListener("click", closePartyContextMenu);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePartyContextMenu();
  });

  const main = document.querySelector("main");
  if (main) {
    platformObserver = new MutationObserver(refreshPlatforms);
    platformObserver.observe(main, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
  }

  return partyLayer;
}

function ensurePartyContextMenu() {
  ensurePartyLayer();
  if (partyContextMenu) return partyContextMenu;

  partyContextMenu = document.createElement("div");
  partyContextMenu.className = "pet-party-menu";
  partyContextMenu.hidden = true;
  partyContextMenu.innerHTML = `
    <button type="button" data-action="view">查看</button>
    <button type="button" data-action="download">下载</button>
    <button type="button" data-action="clone">克隆</button>
    <button type="button" data-action="copy">复制安装命令</button>
    <button type="button" data-action="delete" class="danger">删除宠物</button>
  `;
  partyContextMenu.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || !activeMenuInstance) return;
    event.stopPropagation();
    const instance = activeMenuInstance;
    const action = button.dataset.action;
    closePartyContextMenu();

    if (action === "view") openPetDetailInNewTab(instance.pet);
    if (action === "download") downloadPet(instance.pet);
    if (action === "clone") summonPet(instance.pet);
    if (action === "copy") {
      try {
        await copyPetInstallCommand(instance.pet);
        setStatus("已复制安装命令");
        window.setTimeout(() => setStatus(""), 1200);
      } catch {
        setStatus("复制失败，请重试", true);
      }
    }
    if (action === "delete") removeSummonedPet(instance);
  });
  partyLayer.append(partyContextMenu);
  return partyContextMenu;
}

function openPartyContextMenu(instance, x, y) {
  const menu = ensurePartyContextMenu();
  activeMenuInstance = instance;
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(Math.max(8, x), window.innerWidth - rect.width - 8);
  const top = Math.min(Math.max(8, y), window.innerHeight - rect.height - 8);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function closePartyContextMenu() {
  if (!partyContextMenu) return;
  partyContextMenu.hidden = true;
  activeMenuInstance = null;
}

function scanCollisionPlatforms() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  platforms = [...document.querySelectorAll(COLLISION_SELECTOR)]
    .filter((element) => {
      if (element.closest("[data-pet-party-layer]")) return false;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width >= 24 && rect.height >= 8 && rect.bottom >= -120 && rect.top <= viewportHeight + 120 && rect.right >= -120 && rect.left <= viewportWidth + 120;
    })
    .map((element, index) => {
      const rect = element.getBoundingClientRect();
      return {
        id: `platform-${index}`,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
}

function setPartyAction(instance, action) {
  const next = PARTY_ACTIONS[action] ? action : "idle";
  if (instance.action === next && instance.appliedAction === next) return;

  const config = PARTY_ACTIONS[next];
  const duration = prefersReducedMotion() ? config.duration * 1.8 : config.duration;
  instance.action = next;
  instance.appliedAction = next;
  instance.element.style.setProperty("--row", String(config.row));
  instance.element.style.setProperty("--frames", String(config.frames));
  instance.element.style.setProperty("--steps", String(Math.max(1, config.frames - 1)));
  instance.element.style.animationDuration = `${duration}s`;
}

function applyPartyPosition(instance) {
  const { width, height, scale } = partySize();
  instance.width = width;
  instance.height = height;
  instance.element.style.setProperty("--party-scale", String(scale));
  instance.element.style.transform = `translate3d(${instance.x - width / 2}px, ${instance.y - height}px, 0) scaleX(${instance.facing === "left" ? -1 : 1})`;
  instance.bubble.style.left = `${instance.x}px`;
  instance.bubble.style.top = `${instance.y - height - 54}px`;
  instance.bubble.style.width = `${Math.max(96, instance.pet.name.length * 8 + 42)}px`;
}

function removeSummonedPet(instance) {
  const index = summonedPets.indexOf(instance);
  if (index >= 0) summonedPets.splice(index, 1);
  if (activeMenuInstance === instance) closePartyContextMenu();
  instance.element?.remove();
  instance.bubble?.remove();
}

function createPartyNode(instance) {
  ensurePartyLayer();

  const element = document.createElement("div");
  element.className = "pet-party-pet";
  element.dataset.partyPet = "true";
  element.style.backgroundImage = `url("${instance.pet.spritesheetUrl}")`;
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", instance.pet.name);

  const imageProbe = document.createElement("img");
  imageProbe.src = instance.pet.spritesheetUrl;
  imageProbe.alt = "";
  imageProbe.addEventListener("error", () => removeSummonedPet(instance));
  element.append(imageProbe);

  const bubble = document.createElement("div");
  bubble.className = "pet-party-bubble";
  bubble.hidden = true;
  bubble.innerHTML = `<span class="pet-bubble-name"></span>`;
  bubble.querySelector(".pet-bubble-name").textContent = randomPetWhisper();

  instance.element = element;
  instance.bubble = bubble;
  bindPartyPetDrag(instance);
  setPartyAction(instance, "fall");
  applyPartyPosition(instance);

  partyLayer.append(element, bubble);
}

function showPartyBubble(instance, show, text = randomPetWhisper()) {
  const name = instance.bubble.querySelector(".pet-bubble-name");
  name.textContent = text;
  instance.bubble.hidden = !show;
}

function showFallingBubble(instance) {
  instance.speechUntil = performance.now() + 1200;
  showPartyBubble(instance, true, randomFallingWhisper());
}

function makeInstanceFall(instance, withSpeech = true) {
  if (instance.mode === "dragging") return;
  instance.mode = "free";
  instance.grounded = false;
  instance.platformId = "";
  instance.vy = Math.max(instance.vy, 120);
  setPartyAction(instance, "fall");
  if (withSpeech) showFallingBubble(instance);
}

function makeDetachedPetsFall(withSpeech) {
  if (!summonedPets.length) return;
  const viewportHeight = window.innerHeight;
  for (const instance of summonedPets) {
    if (instance.mode === "dragging") continue;
    const platformMissing = instance.grounded && instance.platformId && instance.platformId !== "__ground__" && !platforms.some((item) => item.id === instance.platformId);
    const outOfScreen = instance.y < -12 || instance.y - instance.height > viewportHeight + 36;
    if (platformMissing || outOfScreen) {
      makeInstanceFall(instance, withSpeech);
    }
  }
  startPartyLoop();
}

function bindPartyPetDrag(instance) {
  const element = instance.element;

  element.addEventListener("mouseenter", () => {
    if (isMobileViewport() || instance.mode === "dragging") return;
    instance.mode = "hover";
    instance.vx = 0;
    setPartyAction(instance, "waiting");
    showPartyBubble(instance, true);
  });

  element.addEventListener("mouseleave", () => {
    if (isMobileViewport() || instance.mode === "dragging") return;
    instance.mode = "free";
    showPartyBubble(instance, false);
    instance.nextDecisionAt = performance.now() + 300;
  });

  element.addEventListener("click", (event) => {
    if (!isMobileViewport()) return;
    event.stopPropagation();
    showPartyBubble(instance, instance.bubble.hidden);
  });

  element.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showPartyBubble(instance, false);
    openPartyContextMenu(instance, event.clientX, event.clientY);
  });

  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    closePartyContextMenu();
    element.setPointerCapture(event.pointerId);
    instance.mode = "dragging";
    instance.grounded = false;
    instance.platformId = "";
    instance.drag = {
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      dy: 0,
    };
    setPartyAction(instance, "run");
    showPartyBubble(instance, false);
  });

  element.addEventListener("pointermove", (event) => {
    if (instance.mode !== "dragging" || !instance.drag) return;
    const dx = event.clientX - instance.drag.x;
    const dy = event.clientY - instance.drag.y;
    instance.drag = { x: event.clientX, y: event.clientY, dx, dy };
    instance.x += dx;
    instance.y += dy;
    instance.facing = dx < 0 ? "left" : dx > 0 ? "right" : instance.facing;
    setPartyAction(instance, Math.abs(dx) > 20 ? "run" : "walk");
    applyPartyPosition(instance);
  });

  const endDrag = (event) => {
    if (instance.mode !== "dragging") return;
    try {
      element.releasePointerCapture(event.pointerId);
    } catch {}
    const dx = instance.drag?.dx || 0;
    const dy = instance.drag?.dy || 0;
    instance.mode = "free";
    instance.drag = null;
    instance.vx = dx * 18;
    instance.vy = dy * 18;
    instance.grounded = false;
    instance.platformId = "";
    setPartyAction(instance, "fall");
  };

  element.addEventListener("pointerup", endDrag);
  element.addEventListener("pointercancel", endDrag);
}

function chooseNextPartyAction(instance, now) {
  if (now < instance.nextDecisionAt || instance.mode !== "free") return;
  const reduced = prefersReducedMotion() ? 2 : 1;
  let duration = 1000 + Math.random() * 1800;

  switch (weightedPartyDecision()) {
    case "walkLeft":
      instance.facing = "left";
      instance.vx = -(42 + Math.random() * 58);
      setPartyAction(instance, "walk");
      break;
    case "walkRight":
      instance.facing = "right";
      instance.vx = 42 + Math.random() * 58;
      setPartyAction(instance, "walk");
      break;
    case "runLeft":
      instance.facing = "left";
      instance.vx = -110;
      duration = 800 + Math.random() * 1000;
      setPartyAction(instance, "sprint");
      break;
    case "runRight":
      instance.facing = "right";
      instance.vx = 110;
      duration = 800 + Math.random() * 1000;
      setPartyAction(instance, "sprint");
      break;
    case "jump":
      if (instance.grounded) {
        instance.vy = -650 + Math.random() * 120;
        instance.grounded = false;
        instance.platformId = "";
        setPartyAction(instance, "jump");
      }
      duration = 700 + Math.random() * 500;
      break;
    case "waiting":
      instance.vx = 0;
      setPartyAction(instance, "waiting");
      break;
    case "review":
      instance.vx = 0;
      setPartyAction(instance, "review");
      break;
    case "failed":
      instance.vx = 0;
      setPartyAction(instance, "failed");
      break;
    default:
      instance.vx = 0;
      setPartyAction(instance, "idle");
  }

  instance.nextDecisionAt = now + duration * reduced;
}

function settleOnPlatform(instance, platform) {
  instance.y = platform.top;
  instance.vy = 0;
  instance.grounded = true;
  instance.platformId = platform.id;
  if (instance.action === "fall" || instance.action === "jump") {
    setPartyAction(instance, "idle");
  }
}

function updatePlatformAttachment(instance) {
  if (!instance.grounded || !instance.platformId || instance.platformId === "__ground__") return;
  const platform = platforms.find((item) => item.id === instance.platformId);
  if (!platform) {
    instance.grounded = false;
    instance.platformId = "";
    return;
  }
  const left = instance.x - instance.width / 2;
  const right = instance.x + instance.width / 2;
  if (right <= platform.left + 2 || left >= platform.right - 2) {
    instance.grounded = false;
    instance.platformId = "";
  } else {
    instance.y = Math.min(instance.y, platform.top);
  }
}

function updateSummonedPets(dt, now) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  for (const instance of summonedPets) {
    if (instance.speechUntil && now > instance.speechUntil) {
      instance.speechUntil = 0;
      if (instance.mode !== "hover") showPartyBubble(instance, false);
    }

    if (instance.mode === "dragging" || instance.mode === "hover") {
      applyPartyPosition(instance);
      continue;
    }

    chooseNextPartyAction(instance, now);
    let vx = instance.vx;
    let vy = instance.vy;

    if (!instance.grounded) {
      vy = Math.min(1400, vy + 1800 * dt);
    } else if (!["walk", "run", "sprint"].includes(instance.action)) {
      vx *= 0.85;
      if (Math.abs(vx) < 0.5) vx = 0;
    }

    const previousY = instance.y;
    let nextX = instance.x + vx * dt;
    let nextY = instance.y + vy * dt;

    if (nextX <= instance.width / 2) {
      nextX = instance.width / 2;
      vx = Math.abs(vx) * 0.3;
      instance.facing = "right";
    } else if (nextX >= viewportWidth - instance.width / 2) {
      nextX = viewportWidth - instance.width / 2;
      vx = -Math.abs(vx) * 0.3;
      instance.facing = "left";
    }

    instance.x = nextX;
    instance.y = nextY;
    instance.vx = vx;
    instance.vy = vy;

    updatePlatformAttachment(instance);

    if (!instance.grounded && instance.vy >= 0) {
      const left = instance.x - instance.width / 2;
      const right = instance.x + instance.width / 2;
      for (const platform of platforms) {
        if (previousY <= platform.top && instance.y >= platform.top && right > platform.left + 4 && left < platform.right - 4) {
          settleOnPlatform(instance, platform);
          break;
        }
      }
    }

    if (!instance.grounded && instance.y >= viewportHeight) {
      instance.y = viewportHeight;
      instance.vy = 0;
      instance.grounded = true;
      instance.platformId = "__ground__";
      if (instance.action === "fall" || instance.action === "jump") setPartyAction(instance, "idle");
    }

    if (instance.grounded && instance.speechUntil && instance.platformId) {
      instance.speechUntil = Math.min(instance.speechUntil, now + 300);
    }

    if (!instance.grounded && instance.vy > 0 && instance.action !== "fall") {
      setPartyAction(instance, "fall");
    }

    applyPartyPosition(instance);
  }
}

function partyTick(now) {
  if (!summonedPets.length) {
    partyFrame = 0;
    lastPartyTick = 0;
    return;
  }

  if (!lastPartyTick) lastPartyTick = now;
  const dt = Math.min(0.1, Math.max(0.001, (now - lastPartyTick) / 1000));
  lastPartyTick = now;

  if (!lastPlatformScan || now - lastPlatformScan > 250) {
    scanCollisionPlatforms();
    lastPlatformScan = now;
  }

  updateSummonedPets(dt, now);
  partyFrame = requestAnimationFrame(partyTick);
}

function startPartyLoop() {
  if (!partyFrame) {
    lastPartyTick = 0;
    partyFrame = requestAnimationFrame(partyTick);
  }
}

function summonPet(pet) {
  const size = partySize();
  const max = partyLimit();
  ensurePartyLayer();
  preloadSprite(pet.spritesheetUrl);

  while (summonedPets.length >= max) {
    removeSummonedPet(summonedPets[0]);
  }

  const instance = {
    id: `summoned-${pet.slug}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    pet,
    x: size.width / 2 + Math.random() * Math.max(1, window.innerWidth - size.width),
    y: size.height * 0.85,
    vx: 0,
    vy: 0,
    width: size.width,
    height: size.height,
    facing: "right",
    mode: "free",
    action: "fall",
    appliedAction: "",
    grounded: false,
    platformId: "",
    nextDecisionAt: performance.now() + 1000 + Math.random() * 1200,
    element: null,
    bubble: null,
    drag: null,
  };

  createPartyNode(instance);
  summonedPets.push(instance);
  showFallingBubble(instance);
  scanCollisionPlatforms();
  startPartyLoop();
  return instance;
}

function renderCards(pets) {
  els.grid.replaceChildren();
  const fragment = document.createDocumentFragment();

  for (const pet of pets) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const title = pet.display_name || pet.slug;
    const tags = parseTags(pet.tags_json);
    const spriteUrl = absoluteUrl(pet.spritesheetUrl);
    const downloadUrl = absoluteUrl(pet.downloadUrl);
    const detailUrl = `./detail.html?slug=${encodeURIComponent(pet.slug)}`;
    const installCommand = installCommandFor(pet.slug);
    const petAction = {
      slug: pet.slug,
      name: title,
      spritesheetUrl: spriteUrl,
      detailUrl,
      downloadUrl,
      installCommand,
      raw: pet,
    };
    preloadSprite(spriteUrl);

    const sprite = node.querySelector(".sprite");
    sprite.style.backgroundImage = `url("${spriteUrl}")`;

    node.querySelector(".previewButton").title = title;
    node.querySelector("h2").textContent = title;
    node.querySelector(".version").textContent = pet.version ? `v${pet.version}` : "";
    node.querySelector(".desc").textContent = plainText(pet.description) || "暂无描述";
    node.querySelector(".meta").textContent =
      `作者：${pet.author_name || "未知"} · 下载 ${Number(pet.download_count || 0).toLocaleString("zh-CN")} · 喜欢 ${Number(pet.like_count || 0).toLocaleString("zh-CN")}`;

    const tagWrap = node.querySelector(".cardTags");
    if (tags.length === 0) {
      const chip = document.createElement("span");
      chip.className = "chip muted";
      chip.textContent = "untagged";
      tagWrap.append(chip);
    } else {
      for (const tag of tags) {
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.type = "button";
        chip.textContent = tag;
        chip.addEventListener("click", () => setTag(tag));
        tagWrap.append(chip);
      }
    }

    const detail = node.querySelector(".detail");
    detail.href = detailUrl;
    detail.title = `查看 ${title}`;
    detail.addEventListener("click", (event) => {
      event.preventDefault();
      openPetDetail(petAction);
    });

    const download = node.querySelector(".download");
    download.href = downloadUrl;
    download.download = `${pet.slug}.codex-pet.zip`;
    download.title = `下载 ${title}`;
    download.addEventListener("click", (event) => {
      event.preventDefault();
      downloadPet(petAction);
    });

    const copy = node.querySelector(".copyInstall");
    copy.addEventListener("click", async () => {
      const original = copy.textContent;
      try {
        await copyPetInstallCommand(petAction);
        copy.textContent = "已复制安装命令";
      } catch {
        copy.textContent = "复制失败，请重试";
      }
      setTimeout(() => {
        copy.textContent = original;
      }, 1400);
    });

    const summon = node.querySelector(".summonPet");
    summon.title = `召唤 ${title}`;
    summon.addEventListener("click", () => {
      const original = summon.textContent;
      summon.textContent = "召唤中...";
      summon.disabled = true;
      summonPet(petAction);
      requestAnimationFrame(() => {
        summon.textContent = "已召唤";
        window.setTimeout(() => {
          summon.textContent = original;
          summon.disabled = false;
        }, 900);
      });
    });

    fragment.append(node);
  }

  els.grid.append(fragment);
}

async function loadPets({ keepScroll = false } = {}) {
  const currentRequest = ++requestId;
  setStatus("正在加载社区宠物...");
  setLoading(true);
  renderFilters();
  updateUrl();

  try {
    const data = await fetchJson(buildListUrl());
    if (currentRequest !== requestId) return;

    const pets = data.pets || [];
    const pagination = data.pagination || {};
    state.totalPages = Math.max(1, Number(pagination.totalPages || 1));
    state.totalItems = Number(pagination.totalItems || pets.length);
    state.page = Math.min(Math.max(1, Number(pagination.currentPage || state.page)), state.totalPages);

    renderCards(pets);
    renderPager();
    renderFilters();
    setStatus(pets.length ? "" : "没有找到匹配的宠物。");
    if (!keepScroll) window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    if (currentRequest === requestId) {
      setStatus(error.message || "加载失败", true);
    }
  } finally {
    if (currentRequest === requestId) {
      setLoading(false);
      renderPager();
    }
  }
}

async function loadTags() {
  try {
    const params = new URLSearchParams({
      limit: "14",
      locale: API_LOCALE,
    });
    const data = await fetchJson(`${API_BASE}/api/pets/tags?${params}`);
    renderTags(data.tags || []);
  } catch {
    renderTags([]);
  }
}

function setTag(tag) {
  state.tag = tag;
  state.page = 1;
  loadPets();
  loadTags();
}

function bindEvents() {
  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = els.searchInput.value.trim();
    state.page = 1;
    loadPets();
  });

  els.clearSearch.addEventListener("click", () => {
    els.searchInput.value = "";
    state.query = "";
    state.page = 1;
    loadPets();
  });

  for (const button of els.sortButtons) {
    button.addEventListener("click", () => {
      if (state.sort === button.dataset.sort) return;
      state.sort = button.dataset.sort;
      state.page = 1;
      loadPets();
    });
  }

  els.themeSelect.addEventListener("change", () => {
    state.theme = els.themeSelect.value;
    localStorage.setItem("codex-pet-theme", state.theme);
    renderFilters();
    updateUrl();
  });

  els.prev.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      loadPets();
    }
  });

  els.next.addEventListener("click", () => {
    if (state.page < state.totalPages) {
      state.page += 1;
      loadPets();
    }
  });

  els.jumpForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const requested = Number.parseInt(els.pageInput.value, 10);
    if (!Number.isFinite(requested)) return;
    const target = Math.min(Math.max(1, requested), state.totalPages);
    if (target !== state.page) {
      state.page = target;
      loadPets();
    } else {
      els.pageInput.value = String(state.page);
    }
  });

  els.refresh.addEventListener("click", () => {
    loadPets({ keepScroll: true });
    loadTags();
  });
}

readUrlState();
bindEvents();
renderFilters();
loadTags();
loadPets({ keepScroll: true });
