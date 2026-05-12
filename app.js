const API_BASE = "https://codexpet.xyz";
const SORT_LABELS = {
  hot: "热门",
  latest: "最新",
  downloads: "下载",
};

const state = {
  page: 1,
  totalPages: 1,
  totalItems: 0,
  limit: 24,
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
  state.theme = ["classic", "compact", "showcase", "dark"].includes(theme) ? theme : "classic";
  state.query = params.get("q") || "";
  state.tag = params.get("tag") || "";
  els.searchInput.value = state.query;
}

function buildListUrl() {
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(state.limit),
    sort: state.sort,
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
  }[theme] || "清爽社区";
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
    const installCommand = `irm ${API_BASE}/install/${pet.slug}?platform=ps1 | iex`;

    const sprite = node.querySelector(".sprite");
    sprite.style.backgroundImage = `url("${spriteUrl}")`;

    node.querySelector(".previewButton").title = "悬停加速预览 idle 动画";
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
    detail.addEventListener("click", () => {
      sessionStorage.setItem(`codex-pet:${pet.slug}`, JSON.stringify(pet));
    });

    const download = node.querySelector(".download");
    download.href = downloadUrl;
    download.download = `${pet.slug}.codex-pet.zip`;
    download.title = `下载 ${title}`;

    const copy = node.querySelector(".copyInstall");
    copy.addEventListener("click", async () => {
      const original = copy.textContent;
      try {
        await copyText(installCommand);
        copy.textContent = "已复制安装命令";
      } catch {
        copy.textContent = "复制失败，请重试";
      }
      setTimeout(() => {
        copy.textContent = original;
      }, 1400);
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
    const data = await fetchJson(`${API_BASE}/api/pets/tags?limit=14`);
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
