const rootText = document.getElementById("rootText");
const changeRootBtn = document.getElementById("changeRootBtn");
const refreshFoldersBtn = document.getElementById("refreshFoldersBtn");
const addViewBtn = document.getElementById("addViewBtn");
const addCompareViewBtn = document.getElementById("addCompareViewBtn");
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
  compareLabels: {
    source: "目录A",
    result: "目录B",
  },
  preview: {
    viewId: "",
    mode: "single",
    folder: "",
    folderA: "",
    folderB: "",
    page: 1,
    limit: 1,
    totalPages: 1,
    total: 0,
    items: [],
    index: 0,
    slot: "single",
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

function getCompareFolderOptions() {
  return state.folders.map((folder) => ({ value: folder, label: folder }));
}

function getCurrentFolderForNewView() {
  const activeView = getViewById(state.activeViewId);
  if (activeView?.mode === "compare" && activeView?.folderA) {
    return activeView.folderA;
  }
  if (activeView?.folder) {
    return activeView.folder;
  }
  return state.folders[0] || "";
}

function createCompareView(initialFolder = "") {
  const folderA = initialFolder || getCurrentFolderForNewView();
  const fallback = state.folders[0] || "";
  const folderB = state.folders.find((folder) => folder !== folderA) || folderA || fallback;
  createView(folderA, "compare", folderB);
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

async function apiGetPairedImages(folderA, folderB, limit, page) {
  const url = `/api/paired-images?folder_a=${encodeURIComponent(folderA)}&folder_b=${encodeURIComponent(folderB)}&limit=${limit}&page=${page}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "读取对照图片失败");
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

function createView(initialFolder = "", mode = "single", initialFolderB = "") {
  if (!state.folders.length) return;
  if (state.views.length >= MAX_VIEWS) {
    setStatus(`最多支持 ${MAX_VIEWS} 个对比视图。`, true);
    return;
  }

  const folder = initialFolder || state.folders[0] || "";
  const view = {
    id: `view_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
    mode,
    folder,
    folderA: mode === "compare" ? folder : "",
    folderB: mode === "compare" ? (initialFolderB || folder) : "",
    limit: 2,
    page: 1,
    totalPages: 1,
    total: 0,
  };
  state.views.push(view);
  state.activeViewId = view.id;
  if (folder) ensureExpandedForPath(folder);

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
  if (view.mode === "compare") {
    view.folderA = folderName;
    view.folder = folderName;
  } else {
    view.folder = folderName;
  }
  view.page = 1;
  const selectedFolder = view.mode === "compare" ? view.folderA : view.folder;
  if (selectedFolder) ensureExpandedForPath(selectedFolder);
  renderFolderTree();
  syncViewControl(viewId);
  loadViewImages(viewId);
}

function updateViewCompareFolders(viewId, folderA, folderB) {
  const view = getViewById(viewId);
  if (!view || view.mode !== "compare") return;
  view.folderA = folderA;
  view.folderB = folderB;
  view.folder = folderA;
  view.page = 1;
  if (view.folderA) ensureExpandedForPath(view.folderA);
  if (view.folderB) ensureExpandedForPath(view.folderB);
  renderFolderTree();
  syncViewControl(viewId);
  loadViewImages(viewId);
}

function updateViewMode(viewId, mode) {
  const view = getViewById(viewId);
  if (!view) return;
  view.mode = mode === "compare" ? "compare" : "single";
  if (view.mode === "compare") {
    view.folderA = state.folders.includes(view.folderA) ? view.folderA : view.folder || state.folders[0] || "";
    view.folderB = state.folders.includes(view.folderB) ? view.folderB : view.folderA || state.folders[0] || "";
    view.folder = view.folderA;
  } else {
    if (!state.folders.includes(view.folder)) {
      view.folder = state.folders[0] || "";
    }
  }
  view.page = 1;
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

  const modeSelect = document.getElementById(`modeSelect_${viewId}`);
  const folderSelect = document.getElementById(`folderSelect_${viewId}`);
  const folderASelect = document.getElementById(`folderASelect_${viewId}`);
  const folderBSelect = document.getElementById(`folderBSelect_${viewId}`);
  const countInput = document.getElementById(`countInput_${viewId}`);
  const pageInfo = document.getElementById(`pageInfo_${viewId}`);
  const pageJumpInput = document.getElementById(`pageJumpInput_${viewId}`);
  const prevBtn = document.getElementById(`prevPage_${viewId}`);
  const nextBtn = document.getElementById(`nextPage_${viewId}`);

  if (modeSelect) modeSelect.value = view.mode;
  if (folderSelect) folderSelect.value = view.folder;
  if (folderASelect) folderASelect.value = view.folderA || "";
  if (folderBSelect) folderBSelect.value = view.folderB || "";
  if (countInput) countInput.value = String(view.limit);
  if (pageInfo) pageInfo.textContent = `第 ${view.page}/${view.totalPages} 页`;
  if (pageJumpInput) pageJumpInput.max = String(Math.max(1, view.totalPages));
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

  const activeView = getViewById(state.activeViewId);
  const activeFolder =
    activeView?.mode === "compare" ? activeView?.folderA || "" : activeView?.folder || "";
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

function openPreview(viewId, index, slot = "single") {
  const view = getViewById(viewId);
  if (!view) return;
  const currentData = state.viewItems.get(viewId) || { mode: "single", items: [] };
  state.preview.viewId = viewId;
  state.preview.mode = currentData.mode || "single";
  state.preview.folder = view.folder;
  state.preview.folderA = view.folderA || "";
  state.preview.folderB = view.folderB || "";
  state.preview.page = view.page;
  state.preview.limit = view.limit;
  state.preview.totalPages = view.totalPages;
  state.preview.total = view.total;
  state.preview.items = currentData.items || [];
  state.preview.index = index;
  state.preview.slot = slot;
  openImageModal();
  refreshPreview();
}

async function loadPreviewPage(page, keepIndex = 0) {
  const { folder, folderA, folderB, limit, mode } = state.preview;
  if (mode !== "compare" && !folder) return;
  if (mode === "compare" && (!folderA || !folderB)) return;
  const data =
    mode === "compare"
      ? await apiGetPairedImages(folderA, folderB, limit, page)
      : await apiGetImages(folder, limit, page);
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
  const currentPreviewItem =
    state.preview.mode === "compare"
      ? state.preview.slot === "source"
        ? item.source
        : item.result
      : item;

  fullImage.src = currentPreviewItem.url;
  fullImage.alt = currentPreviewItem.name;
  imageModalTitle.textContent =
    state.preview.mode === "compare"
      ? `${item.name} | ${state.preview.slot === "source" ? state.compareLabels.source : state.compareLabels.result} (${globalIndex}/${state.preview.total || items.length})`
      : `${item.name} (${globalIndex}/${state.preview.total || items.length})`;
  previewPrevBtn.disabled = state.preview.page === 1 && idx === 0;
  previewNextBtn.disabled =
    state.preview.page === state.preview.totalPages && idx === items.length - 1;
}

function createImageCard(item, onPreview, tone = "") {
  const card = document.createElement("article");
  card.className = `img-card ${tone}`.trim();

  const img = document.createElement("img");
  img.src = item.url;
  img.alt = item.name;
  img.loading = "lazy";
  img.ondblclick = onPreview;

  const caption = document.createElement("div");
  caption.className = "img-name";
  caption.title = item.name;
  caption.textContent = item.name;

  card.append(img, caption);
  return card;
}

function renderPairedImagesToGrid(viewId, items) {
  const view = getViewById(viewId);
  const grid = document.getElementById(`grid_${viewId}`);
  if (!grid || !view) return;

  const cols = Math.max(1, items.length);
  grid.className = "view-body paired-view-body";
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  grid.classList.toggle("grid-large", cols <= 3);

  if (!items.length) {
    grid.innerHTML = `<div class="muted">两个目录中没有找到同名图片。</div>`;
    return;
  }

  grid.innerHTML = "";

  const legend = document.createElement("div");
  legend.className = "paired-legend";
  legend.innerHTML = `
    <span class="paired-legend-chip source">第 1 行：${state.compareLabels.source}</span>
    <span class="paired-legend-chip result">第 2 行：${state.compareLabels.result}</span>
  `;
  grid.appendChild(legend);

  items.forEach((item, index) => {
    grid.appendChild(
      createImageCard(item.source, () => openPreview(viewId, index, "source"), "source-card")
    );
  });
  items.forEach((item, index) => {
    grid.appendChild(
      createImageCard(item.result, () => openPreview(viewId, index, "result"), "result-card")
    );
  });
}

function renderImagesToGrid(viewId, items) {
  const view = getViewById(viewId);
  const grid = document.getElementById(`grid_${viewId}`);
  if (!grid || !view) return;

  state.viewItems.set(viewId, { mode: view.mode, items });

  if (view.mode === "compare") {
    renderPairedImagesToGrid(viewId, items);
    return;
  }

  const cols = getGridCols(view.limit);
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  grid.className = "view-body";
  grid.classList.toggle("grid-large", view.limit <= 3);

  if (!items.length) {
    grid.innerHTML = `<div class="muted">该目录此页暂无图片。</div>`;
    return;
  }

  grid.innerHTML = "";
  items.forEach((item, index) => {
    const card = createImageCard(item, () => openPreview(viewId, index));
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

  const modeSelect = document.createElement("select");
  modeSelect.className = "small-select mode-select";
  modeSelect.id = `modeSelect_${view.id}`;
  [
    { value: "single", label: "单目录" },
    { value: "compare", label: "双行对照" },
  ].forEach((item) => {
    const op = document.createElement("option");
    op.value = item.value;
    op.textContent = item.label;
    if (item.value === view.mode) op.selected = true;
    modeSelect.appendChild(op);
  });
  modeSelect.onchange = (e) => updateViewMode(view.id, e.target.value);

  const folderSelect = document.createElement("select");
  folderSelect.className = "small-select";
  folderSelect.id = `folderSelect_${view.id}`;
  folderSelect.title = "普通目录";
  state.folders.forEach((folder) => {
    const op = document.createElement("option");
    op.value = folder;
    op.textContent = folder;
    if (folder === view.folder) op.selected = true;
    folderSelect.appendChild(op);
  });
  folderSelect.onchange = (e) => updateViewFolder(view.id, e.target.value);

  const folderASelect = document.createElement("select");
  folderASelect.className = "small-select";
  folderASelect.id = `folderASelect_${view.id}`;
  folderASelect.title = "对照目录 A";
  getCompareFolderOptions().forEach(({ value, label }) => {
    const op = document.createElement("option");
    op.value = value;
    op.textContent = `A: ${label}`;
    if (value === view.folderA) op.selected = true;
    folderASelect.appendChild(op);
  });

  const folderBSelect = document.createElement("select");
  folderBSelect.className = "small-select";
  folderBSelect.id = `folderBSelect_${view.id}`;
  folderBSelect.title = "对照目录 B";
  getCompareFolderOptions().forEach(({ value, label }) => {
    const op = document.createElement("option");
    op.value = value;
    op.textContent = `B: ${label}`;
    if (value === view.folderB) op.selected = true;
    folderBSelect.appendChild(op);
  });

  folderASelect.onchange = () => updateViewCompareFolders(view.id, folderASelect.value, folderBSelect.value);
  folderBSelect.onchange = () => updateViewCompareFolders(view.id, folderASelect.value, folderBSelect.value);

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

  const pageJumpInput = document.createElement("input");
  pageJumpInput.className = "small-input";
  pageJumpInput.id = `pageJumpInput_${view.id}`;
  pageJumpInput.type = "number";
  pageJumpInput.min = "1";
  pageJumpInput.step = "1";
  pageJumpInput.placeholder = "页码";
  pageJumpInput.title = "输入页码后跳转";
  pageJumpInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pageJumpBtn.click();
    }
  };

  const pageJumpBtn = document.createElement("button");
  pageJumpBtn.className = "btn ghost small-btn";
  pageJumpBtn.textContent = "跳转";
  pageJumpBtn.onclick = () => {
    const raw = Number(pageJumpInput.value);
    if (!Number.isFinite(raw)) {
      setStatus("请输入有效页码。", true);
      return;
    }
    const target = Math.trunc(raw);
    if (target < 1 || target > view.totalPages) {
      setStatus(`页码超出范围，请输入 1 ~ ${view.totalPages}。`, true);
      return;
    }
    if (target === view.page) return;
    view.page = target;
    loadViewImages(view.id);
  };

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
    modeSelect,
    view.mode === "compare" ? folderASelect : folderSelect,
    ...(view.mode === "compare" ? [folderBSelect] : []),
    countInput,
    prevPageBtn,
    nextPageBtn,
    pageInfo,
    pageJumpInput,
    pageJumpBtn,
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
    viewsWrap.innerHTML = `<div class="muted">暂无视图，点击“新增对比视图”或“新增双行对照视图”。</div>`;
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
  if (!view || !state.root) return;
  if (view.mode === "compare") {
    if (!view.folderA || !view.folderB) return;
  } else if (!view.folder) {
    return;
  }

  view.limit = clampCount(view.limit);
  const grid = document.getElementById(`grid_${viewId}`);
  if (grid) grid.innerHTML = `<div class="muted">正在加载图片...</div>`;

  try {
    const data =
      view.mode === "compare"
        ? await apiGetPairedImages(view.folderA, view.folderB, view.limit, view.page)
        : await apiGetImages(view.folder, view.limit, view.page);
    view.page = data.page || 1;
    view.totalPages = data.total_pages || 1;
    view.total = data.total || 0;
    if (view.mode === "compare") {
      state.compareLabels.source = data.source_label || state.compareLabels.source;
      state.compareLabels.result = data.result_label || state.compareLabels.result;
    }
    syncViewControl(view.id);
    renderImagesToGrid(view.id, data.items || []);
    setStatus(
      view.mode === "compare"
        ? `对照目录 ${view.folderA} vs ${view.folderB}：第 ${view.page}/${view.totalPages} 页，共匹配 ${view.total} 组图片。`
        : `目录 ${view.folder}：第 ${view.page}/${view.totalPages} 页，共 ${view.total} 张图。`
    );
  } catch (err) {
    if (grid) grid.innerHTML = "";
    setStatus(err.message || "加载图片失败", true);
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
      createView(state.folders[0], "single");
    } else {
      state.views.forEach((view) => {
        if (view.mode === "compare") {
          if (!state.folders.includes(view.folderA)) {
            view.folderA = state.folders[0] || "";
            view.page = 1;
          }
          if (!state.folders.includes(view.folderB)) {
            view.folderB = state.folders.find((folder) => folder !== view.folderA) || view.folderA;
            view.page = 1;
          }
          view.folder = view.folderA;
          if (view.folderA) ensureExpandedForPath(view.folderA);
          if (view.folderB) ensureExpandedForPath(view.folderB);
        } else {
          if (!state.folders.includes(view.folder)) {
            view.folder = state.folders[0] || "";
            view.page = 1;
          }
          if (view.folder) {
            ensureExpandedForPath(view.folder);
          }
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
addViewBtn.onclick = () => createView(getCurrentFolderForNewView(), "single");
addCompareViewBtn.onclick = () => createCompareView(getCurrentFolderForNewView());
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
  const activeView = getViewById(state.activeViewId);
  const activeFolder =
    activeView?.mode === "compare" ? activeView?.folderA : activeView?.folder;
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
