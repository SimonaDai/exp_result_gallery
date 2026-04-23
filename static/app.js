const rootText = document.getElementById("rootText");
const changeRootBtn = document.getElementById("changeRootBtn");
const refreshFoldersBtn = document.getElementById("refreshFoldersBtn");
const addViewBtn = document.getElementById("addViewBtn");
const recursiveToggle = document.getElementById("recursiveToggle");
const expandAllBtn = document.getElementById("expandAllBtn");
const collapseAllBtn = document.getElementById("collapseAllBtn");
const folderTree = document.getElementById("folderTree");
const folderCountTag = document.getElementById("folderCountTag");
const statusText = document.getElementById("statusText");
const viewsWrap = document.getElementById("viewsWrap");

const imageModal = document.getElementById("imageModal");
const imageModalTitle = document.getElementById("imageModalTitle");
const fullImage = document.getElementById("fullImage");
const closeImageModalBtn = document.getElementById("closeImageModalBtn");
const previewPrevBtn = document.getElementById("previewPrevBtn");
const previewNextBtn = document.getElementById("previewNextBtn");

const MAX_VIEWS = 4;

const state = {
  root: "",
  folders: [],
  views: [],
  activeViewId: "",
  recursive: true,
  expandedPaths: new Set(),
  viewItems: new Map(),
  preview: {
    viewId: "",
    folder: "",
    page: 1,
    limit: 1,
    totalPages: 1,
    total: 0,
    items: [],
    index: 0,
  },
};

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function clampCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(200, Math.trunc(n)));
}

function openImageModal() {
  imageModal.classList.remove("hidden");
}

function closeImageModal() {
  imageModal.classList.add("hidden");
  fullImage.src = "";
}

async function apiGetConfig() {
  const res = await fetch("/api/config");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "读取配置失败");
  return data;
}

async function apiGetFolders(recursive) {
  const url = `/api/folders?recursive=${recursive ? 1 : 0}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "读取子文件夹失败");
  return data;
}

async function apiGetImages(folder, limit, page) {
  const url = `/api/images?folder=${encodeURIComponent(folder)}&limit=${limit}&page=${page}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "读取图片失败");
  return data;
}

function getViewById(viewId) {
  return state.views.find((v) => v.id === viewId);
}

function getAncestors(path) {
  const parts = path.split("/").filter(Boolean);
  const paths = [];
  for (let i = 1; i <= parts.length; i += 1) {
    paths.push(parts.slice(0, i).join("/"));
  }
  return paths;
}

function ensureExpandedForPath(path) {
  getAncestors(path).forEach((p) => state.expandedPaths.add(p));
}

function buildTree(paths) {
  const root = { name: "", path: "", children: [] };
  const map = new Map([["", root]]);

  paths.forEach((p) => {
    const parts = p.split("/").filter(Boolean);
    let parent = root;
    let full = "";
    parts.forEach((part) => {
      full = full ? `${full}/${part}` : part;
      let node = map.get(full);
      if (!node) {
        node = { name: part, path: full, children: [] };
        map.set(full, node);
        parent.children.push(node);
      }
      parent = node;
    });
  });

  function sortNode(node) {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sortNode);
  }
  sortNode(root);
  return root;
}

function createView(initialFolder = "") {
  if (!state.folders.length) return;
  if (state.views.length >= MAX_VIEWS) {
    setStatus(`最多支持 ${MAX_VIEWS} 个对比视图。`, true);
    return;
  }

  const folder = initialFolder || state.folders[0];
  const view = {
    id: `view_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
    folder,
    limit: 2,
    page: 1,
    totalPages: 1,
    total: 0,
  };
  state.views.push(view);
  state.activeViewId = view.id;
  ensureExpandedForPath(folder);

  renderFolderTree();
  renderViews();
}

function removeView(viewId) {
  if (state.views.length <= 1) {
    setStatus("至少保留一个对比视图。", true);
    return;
  }
  state.views = state.views.filter((v) => v.id !== viewId);
  state.viewItems.delete(viewId);

  if (!state.views.some((v) => v.id === state.activeViewId)) {
    state.activeViewId = state.views[0]?.id || "";
  }
  renderFolderTree();
  renderViews();
}

function setActiveView(viewId) {
  state.activeViewId = viewId;
  refreshActiveViewUI();
  renderFolderTree();
}

function refreshActiveViewUI() {
  viewsWrap.querySelectorAll(".view-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.viewId === state.activeViewId);
  });
  viewsWrap.querySelectorAll(".activate-btn").forEach((btn) => {
    const isActive = btn.dataset.viewId === state.activeViewId;
    btn.textContent = isActive ? "当前激活" : "设为激活";
    btn.disabled = isActive;
  });
}

function updateViewFolder(viewId, folderName) {
  const view = getViewById(viewId);
  if (!view) return;
  view.folder = folderName;
  view.page = 1;
  ensureExpandedForPath(folderName);
  renderFolderTree();
  syncViewControl(viewId);
  loadViewImages(viewId);
}

function updateActiveViewFolder(folderName) {
  const view = getViewById(state.activeViewId);
  if (!view) return;
  updateViewFolder(view.id, folderName);
}

function syncViewControl(viewId) {
  const view = getViewById(viewId);
  if (!view) return;

  const folderSelect = document.getElementById(`folderSelect_${viewId}`);
  const countInput = document.getElementById(`countInput_${viewId}`);
  const pageInfo = document.getElementById(`pageInfo_${viewId}`);
  const prevBtn = document.getElementById(`prevPage_${viewId}`);
  const nextBtn = document.getElementById(`nextPage_${viewId}`);

  if (folderSelect) folderSelect.value = view.folder;
  if (countInput) countInput.value = String(view.limit);
  if (pageInfo) pageInfo.textContent = `第 ${view.page}/${view.totalPages} 页`;
  if (prevBtn) prevBtn.disabled = view.page <= 1;
  if (nextBtn) nextBtn.disabled = view.page >= view.totalPages;
}

function renderFolderTree() {
  folderTree.innerHTML = "";
  folderCountTag.textContent = String(state.folders.length);

  if (!state.folders.length) {
    folderTree.innerHTML = `<div class="muted">当前根目录下没有子文件夹</div>`;
    return;
  }

  const activeFolder = getViewById(state.activeViewId)?.folder || "";
  if (activeFolder) ensureExpandedForPath(activeFolder);

  const treeRoot = buildTree(state.folders);
  const rootList = document.createElement("ul");
  rootList.className = "tree-list";

  function renderNodes(nodes, depth) {
    const fragment = document.createDocumentFragment();

    nodes.forEach((node) => {
      const li = document.createElement("li");
      li.className = "tree-node";

      const hasChildren = node.children.length > 0;
      const expanded = state.expandedPaths.has(node.path);

      const row = document.createElement("div");
      row.className = "tree-row";
      row.style.paddingLeft = `${depth * 14 + 6}px`;
      if (node.path === activeFolder) row.classList.add("active");
      row.onclick = () => updateActiveViewFolder(node.path);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "tree-toggle";
      if (hasChildren) {
        toggle.textContent = expanded ? "▾" : "▸";
        toggle.onclick = (e) => {
          e.stopPropagation();
          if (state.expandedPaths.has(node.path)) {
            state.expandedPaths.delete(node.path);
          } else {
            state.expandedPaths.add(node.path);
          }
          renderFolderTree();
        };
      } else {
        toggle.textContent = "·";
        toggle.disabled = true;
      }

      const label = document.createElement("div");
      label.className = "tree-label";
      label.textContent = node.name;
      label.title = node.path;

      row.append(toggle, label);
      li.appendChild(row);

      if (hasChildren && expanded) {
        const childList = document.createElement("ul");
        childList.className = "tree-list";
        childList.appendChild(renderNodes(node.children, depth + 1));
        li.appendChild(childList);
      }

      fragment.appendChild(li);
    });

    return fragment;
  }

  rootList.appendChild(renderNodes(treeRoot.children, 0));
  folderTree.appendChild(rootList);
}

function getGridCols(count) {
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 3) return 3;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  if (count <= 9) return 3;
  return 4;
}

function openPreview(viewId, index) {
  const view = getViewById(viewId);
  if (!view) return;
  const currentItems = state.viewItems.get(viewId) || [];
  state.preview.viewId = viewId;
  state.preview.folder = view.folder;
  state.preview.page = view.page;
  state.preview.limit = view.limit;
  state.preview.totalPages = view.totalPages;
  state.preview.total = view.total;
  state.preview.items = currentItems;
  state.preview.index = index;
  openImageModal();
  refreshPreview();
}

async function loadPreviewPage(page, keepIndex = 0) {
  const { folder, limit } = state.preview;
  if (!folder) return;
  const data = await apiGetImages(folder, limit, page);
  state.preview.page = data.page || page;
  state.preview.totalPages = data.total_pages || 1;
  state.preview.total = data.total || 0;
  state.preview.items = data.items || [];
  state.preview.index = Math.max(
    0,
    Math.min(keepIndex, Math.max(0, state.preview.items.length - 1))
  );
  refreshPreview();
}

async function movePreview(step) {
  const items = state.preview.items || [];
  if (!items.length) return;

  if (step > 0) {
    if (state.preview.index < items.length - 1) {
      state.preview.index += 1;
      refreshPreview();
      return;
    }
    if (state.preview.page < state.preview.totalPages) {
      await loadPreviewPage(state.preview.page + 1, 0);
    }
    return;
  }

  if (step < 0) {
    if (state.preview.index > 0) {
      state.preview.index -= 1;
      refreshPreview();
      return;
    }
    if (state.preview.page > 1) {
      await loadPreviewPage(state.preview.page - 1, state.preview.limit - 1);
    }
  }
}

function refreshPreview() {
  const items = state.preview.items || [];
  if (!items.length) return;
  const idx = Math.max(0, Math.min(state.preview.index, items.length - 1));
  state.preview.index = idx;
  const item = items[idx];
  const globalIndex = (state.preview.page - 1) * state.preview.limit + idx + 1;

  fullImage.src = item.url;
  fullImage.alt = item.name;
  imageModalTitle.textContent = `${item.name} (${globalIndex}/${state.preview.total || items.length})`;
  previewPrevBtn.disabled = state.preview.page === 1 && idx === 0;
  previewNextBtn.disabled =
    state.preview.page === state.preview.totalPages && idx === items.length - 1;
}

function renderImagesToGrid(viewId, items) {
  const view = getViewById(viewId);
  const grid = document.getElementById(`grid_${viewId}`);
  if (!grid || !view) return;

  state.viewItems.set(viewId, items);

  const cols = getGridCols(view.limit);
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  grid.classList.toggle("grid-large", view.limit <= 3);

  if (!items.length) {
    grid.innerHTML = `<div class="muted">该目录此页暂无图片。</div>`;
    return;
  }

  grid.innerHTML = "";
  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "img-card";

    const img = document.createElement("img");
    img.src = item.url;
    img.alt = item.name;
    img.loading = "lazy";
    img.ondblclick = () => openPreview(viewId, index);

    const caption = document.createElement("div");
    caption.className = "img-name";
    caption.title = item.name;
    caption.textContent = item.name;

    card.append(img, caption);
    grid.appendChild(card);
  });
}

function renderViewCard(view) {
  const card = document.createElement("section");
  card.className = "view-card";
  card.dataset.viewId = view.id;
  if (view.id === state.activeViewId) card.classList.add("active");

  const header = document.createElement("div");
  header.className = "view-head";

  const title = document.createElement("strong");
  title.textContent = `对比视图 ${state.views.findIndex((v) => v.id === view.id) + 1}`;

  const actions = document.createElement("div");
  actions.className = "view-actions";

  const folderSelect = document.createElement("select");
  folderSelect.className = "small-select";
  folderSelect.id = `folderSelect_${view.id}`;
  state.folders.forEach((f) => {
    const op = document.createElement("option");
    op.value = f;
    op.textContent = f;
    if (f === view.folder) op.selected = true;
    folderSelect.appendChild(op);
  });
  folderSelect.onchange = (e) => updateViewFolder(view.id, e.target.value);

  const countInput = document.createElement("input");
  countInput.className = "small-input";
  countInput.id = `countInput_${view.id}`;
  countInput.type = "number";
  countInput.min = "1";
  countInput.max = "200";
  countInput.step = "1";
  countInput.value = String(view.limit);
  countInput.title = "输入要展示的图片数量，例如 2/4/6/8";
  countInput.onchange = (e) => {
    view.limit = clampCount(e.target.value);
    view.page = 1;
    loadViewImages(view.id);
  };

  const prevPageBtn = document.createElement("button");
  prevPageBtn.className = "btn ghost small-btn";
  prevPageBtn.id = `prevPage_${view.id}`;
  prevPageBtn.textContent = "上一页";
  prevPageBtn.onclick = () => {
    if (view.page > 1) {
      view.page -= 1;
      loadViewImages(view.id);
    }
  };

  const nextPageBtn = document.createElement("button");
  nextPageBtn.className = "btn ghost small-btn";
  nextPageBtn.id = `nextPage_${view.id}`;
  nextPageBtn.textContent = "下一页";
  nextPageBtn.onclick = () => {
    if (view.page < view.totalPages) {
      view.page += 1;
      loadViewImages(view.id);
    }
  };

  const pageInfo = document.createElement("span");
  pageInfo.className = "page-info";
  pageInfo.id = `pageInfo_${view.id}`;
  pageInfo.textContent = `第 ${view.page}/${view.totalPages} 页`;

  const activateBtn = document.createElement("button");
  activateBtn.className = "btn ghost small-btn activate-btn";
  activateBtn.dataset.viewId = view.id;
  activateBtn.textContent = view.id === state.activeViewId ? "当前激活" : "设为激活";
  activateBtn.disabled = view.id === state.activeViewId;
  activateBtn.onclick = () => setActiveView(view.id);

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "btn ghost small-btn";
  refreshBtn.textContent = "刷新";
  refreshBtn.onclick = () => loadViewImages(view.id);

  const closeBtn = document.createElement("button");
  closeBtn.className = "btn ghost small-btn";
  closeBtn.textContent = "关闭";
  closeBtn.onclick = () => removeView(view.id);

  actions.append(
    folderSelect,
    countInput,
    prevPageBtn,
    nextPageBtn,
    pageInfo,
    activateBtn,
    refreshBtn,
    closeBtn
  );
  header.append(title, actions);

  const body = document.createElement("div");
  body.className = "view-body";
  body.id = `grid_${view.id}`;
  body.innerHTML = `<div class="muted">加载中...</div>`;

  card.append(header, body);
  return card;
}

function renderViews() {
  viewsWrap.innerHTML = "";
  if (!state.views.length) {
    viewsWrap.innerHTML = `<div class="muted">暂无视图，点击“新增对比视图”。</div>`;
    return;
  }

  state.views.forEach((view) => {
    viewsWrap.appendChild(renderViewCard(view));
  });
  refreshActiveViewUI();
  state.views.forEach((view) => loadViewImages(view.id));
}

async function loadViewImages(viewId) {
  const view = getViewById(viewId);
  if (!view || !state.root || !view.folder) return;

  view.limit = clampCount(view.limit);
  const grid = document.getElementById(`grid_${viewId}`);
  if (grid) grid.innerHTML = `<div class="muted">正在加载图片...</div>`;

  try {
    const data = await apiGetImages(view.folder, view.limit, view.page);
    view.page = data.page || 1;
    view.totalPages = data.total_pages || 1;
    view.total = data.total || 0;
    syncViewControl(view.id);
    renderImagesToGrid(view.id, data.items || []);
    setStatus(
      `目录 ${view.folder}：第 ${view.page}/${view.totalPages} 页，共 ${view.total} 张图。`
    );
  } catch (err) {
    if (grid) grid.innerHTML = "";
    setStatus(err.message, true);
  }
}

async function loadFolders() {
  if (!state.root) return;
  setStatus("正在读取目录树...");

  try {
    const data = await apiGetFolders(state.recursive);
    state.folders = data.folders || [];
    rootText.textContent = data.root || state.root;

    if (!state.folders.length) {
      state.views = [];
      state.activeViewId = "";
      state.viewItems.clear();
      renderFolderTree();
      renderViews();
      setStatus("当前根目录下没有可选子目录。", true);
      return;
    }

    if (!state.views.length) {
      createView(state.folders[0]);
    } else {
      state.views.forEach((view) => {
        if (!state.folders.includes(view.folder)) {
          view.folder = state.folders[0];
          view.page = 1;
          ensureExpandedForPath(view.folder);
        }
      });
      renderFolderTree();
      renderViews();
    }

    setStatus("目录树已刷新。");
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function init() {
  try {
    const config = await apiGetConfig();
    state.root = config.default_root || "";
    if (!state.root) {
      setStatus("后端未配置默认根目录。", true);
      return;
    }
    if (!config.default_exists) {
      rootText.textContent = state.root;
      setStatus("默认目录不存在，请输入有效目录。", true);
      return;
    }
    await loadFolders();
  } catch (err) {
    setStatus(err.message || "初始化失败，请刷新重试。", true);
  }
}
changeRootBtn.onclick = () =>
  setStatus("根目录由后端启动时指定，请修改环境变量 EXP_RESULTS_ROOT 后重启服务。");
refreshFoldersBtn.onclick = loadFolders;
addViewBtn.onclick = () => createView(state.folders[0] || "");
recursiveToggle.onchange = () => {
  state.recursive = Boolean(recursiveToggle.checked);
  loadFolders();
};

expandAllBtn.onclick = () => {
  state.folders.forEach((p) => ensureExpandedForPath(p));
  renderFolderTree();
};
collapseAllBtn.onclick = () => {
  state.expandedPaths.clear();
  const activeFolder = getViewById(state.activeViewId)?.folder;
  if (activeFolder) ensureExpandedForPath(activeFolder);
  renderFolderTree();
};

closeImageModalBtn.onclick = closeImageModal;
previewPrevBtn.onclick = async () => movePreview(-1);
previewNextBtn.onclick = async () => movePreview(1);
imageModal.onclick = (e) => {
  if (e.target === imageModal) closeImageModal();
};

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeImageModal();
  if (imageModal.classList.contains("hidden")) return;
  if (e.key === "ArrowLeft") movePreview(-1);
  if (e.key === "ArrowRight") movePreview(1);
});

init();
