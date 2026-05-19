const API_BASE = "https://codexpet.xyz";
const API_LOCALE = "zh";

const els = {
  status: document.querySelector("#detailStatus"),
  view: document.querySelector("#detailView"),
  kicker: document.querySelector("#detailKicker"),
  title: document.querySelector("#detailTitle"),
  description: document.querySelector("#detailDescription"),
  tags: document.querySelector("#detailTags"),
  stats: document.querySelector("#detailStats"),
  download: document.querySelector("#detailDownload"),
  copyInstall: document.querySelector("#detailCopyInstall"),
  sprite: document.querySelector("#detailSprite"),
  installPath: document.querySelector("#installPath"),
  installCommand: document.querySelector("#installCommand"),
  copyInline: document.querySelector("#copyCommandInline"),
  stateGrid: document.querySelector("#stateGrid"),
  spritesheetLink: document.querySelector("#spritesheetLink"),
  spritesheetImage: document.querySelector("#spritesheetImage"),
  themeSelect: document.querySelector("#themeSelect"),
};

const ANIMATION_STATES = [
  { id: "idle", label: "Idle", zh: "待机", row: 0, frames: 6 },
  { id: "running-right", label: "Running Right", zh: "向右移动", row: 1, frames: 8 },
  { id: "running-left", label: "Running Left", zh: "向左移动", row: 2, frames: 8 },
  { id: "waving", label: "Waving", zh: "挥手", row: 3, frames: 4 },
  { id: "jumping", label: "Jumping", zh: "跳跃", row: 4, frames: 5 },
  { id: "failed", label: "Failed", zh: "失败", row: 5, frames: 8 },
  { id: "waiting", label: "Waiting", zh: "等待", row: 6, frames: 6 },
  { id: "running", label: "Running", zh: "处理中", row: 7, frames: 6 },
  { id: "review", label: "Review", zh: "检查", row: 8, frames: 6 },
];

function absoluteUrl(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

function getSlug() {
  return new URLSearchParams(location.search).get("slug") || "";
}

function parseTags(raw, fallback = []) {
  if (Array.isArray(fallback) && fallback.length) return fallback;
  try {
    const tags = JSON.parse(raw || "[]");
    return Array.isArray(tags) ? tags : [];
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

function activeTheme() {
  const style = new URLSearchParams(location.search).get("style") || localStorage.getItem("codex-pet-theme") || "classic";
  return ["classic", "compact", "showcase", "dark", "cartoon"].includes(style) ? style : "classic";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("codex-pet-theme", theme);
  els.themeSelect.value = theme;
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

function cachedPet(slug) {
  try {
    return JSON.parse(sessionStorage.getItem(`codex-pet:${slug}`) || "null");
  } catch {
    return null;
  }
}

async function fetchPet(slug) {
  const params = new URLSearchParams({ locale: API_LOCALE });
  const response = await fetch(`${API_BASE}/api/pets/${encodeURIComponent(slug)}?${params}`);
  if (!response.ok) throw new Error(`请求失败：${response.status}`);
  const data = await response.json();
  return data.pet;
}

function renderPet(pet) {
  if (!pet) return;
  const title = pet.display_name || pet.slug;
  const tags = parseTags(pet.tags_json, pet.tags);
  const installCommand = `irm ${API_BASE}/install/${pet.slug}?platform=ps1 | iex`;
  const petPath = `~/.codex/pets/${pet.slug}/`;
  const spritesheetUrl = absoluteUrl(pet.spritesheetUrl || `/api/pets/${pet.slug}/spritesheet`);

  document.title = `${title} | Codex Pet Gallery`;
  els.kicker.textContent = `社区宠物包 · 作者：${pet.author_name || "未知"}`;
  els.title.textContent = title;
  els.description.textContent = plainText(pet.description) || "暂无描述";
  els.sprite.style.backgroundImage = `url("${spritesheetUrl}")`;
  els.download.href = absoluteUrl(pet.downloadUrl || `/api/pets/${pet.slug}/download`);
  els.download.download = `${pet.slug}.codex-pet.zip`;
  els.download.textContent = `下载 ${title}`;
  els.installPath.textContent = petPath;
  els.installCommand.textContent = installCommand;
  els.stats.textContent =
    `喜欢 ${Number(pet.like_count || 0).toLocaleString("zh-CN")} · 浏览 ${Number(pet.view_count || 0).toLocaleString("zh-CN")} · 下载 ${Number(pet.download_count || 0).toLocaleString("zh-CN")} · v${pet.version || "1.0.0"}`;
  els.spritesheetLink.href = spritesheetUrl;
  els.spritesheetImage.src = spritesheetUrl;

  els.tags.replaceChildren();
  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.className = "chip muted";
    chip.textContent = tag;
    els.tags.append(chip);
  }

  renderAnimationStates(spritesheetUrl);

  const bindCopy = async (button) => {
    const original = button.textContent;
    try {
      await copyText(installCommand);
      button.textContent = "已复制";
    } catch {
      button.textContent = "复制失败";
    }
    setTimeout(() => {
      button.textContent = original;
    }, 1400);
  };

  els.copyInstall.onclick = () => bindCopy(els.copyInstall);
  els.copyInline.onclick = () => bindCopy(els.copyInline);

  els.view.hidden = false;
  setStatus("");
}

function renderAnimationStates(spritesheetUrl) {
  els.stateGrid.replaceChildren();
  const fragment = document.createDocumentFragment();

  for (const state of ANIMATION_STATES) {
    const card = document.createElement("article");
    card.className = "stateCard";

    const preview = document.createElement("div");
    preview.className = "statePreview";

    const sprite = document.createElement("span");
    sprite.className = "stateSprite";
    sprite.style.backgroundImage = `url("${spritesheetUrl}")`;
    sprite.style.setProperty("--row", state.row);
    sprite.style.setProperty("--frames", state.frames);
    sprite.style.setProperty("--distance", `${state.frames * 96}px`);
    sprite.style.animationTimingFunction = `steps(${state.frames})`;
    sprite.style.animationDuration = state.frames === 8 ? "720ms" : "900ms";
    preview.append(sprite);

    const title = document.createElement("div");
    title.className = "stateTitle";
    title.textContent = state.label;

    const meta = document.createElement("div");
    meta.className = "stateMeta";
    meta.textContent = `${state.zh} · ${state.frames} 帧`;

    card.append(preview, title, meta);
    fragment.append(card);
  }

  els.stateGrid.append(fragment);
}

async function init() {
  applyTheme(activeTheme());
  els.themeSelect.addEventListener("change", () => applyTheme(els.themeSelect.value));

  const slug = getSlug();
  if (!slug) {
    setStatus("缺少宠物 slug。", true);
    return;
  }

  const cached = cachedPet(slug);
  if (cached) {
    renderPet(cached);
  }

  try {
    const fresh = await fetchPet(slug);
    sessionStorage.setItem(`codex-pet:${slug}`, JSON.stringify(fresh));
    renderPet(fresh);
  } catch (error) {
    if (!cached) {
      setStatus(error.message || "加载失败", true);
    }
  }
}

init();
