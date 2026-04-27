from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote

from flask import Flask, abort, jsonify, render_template, request, send_file

app = Flask(__name__)

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".svg"}
# 映射端口，默认为 5000，可以通过环境变量 EXP_PORT 指定
DEFAULT_PORT = 5000

# 固定默认根目录：通过环境变量或当前目录下的 demo_results 指定
DEFAULT_ROOT = Path(os.getenv("EXP_RESULTS_ROOT", str(Path.cwd() / "test"))).resolve()
PAIRED_SOURCE_DIRNAME = "退化"
PAIRED_RESULT_DIRNAME = "复原"


def _is_subpath(parent: Path, child: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def _list_subfolders(root_dir: Path) -> list[str]:
    if not root_dir.exists() or not root_dir.is_dir():
        return []
    folders = [p.name for p in root_dir.iterdir() if p.is_dir()]
    return sorted(folders, key=lambda x: x.lower())


def _list_nested_folders(root_dir: Path) -> list[str]:
    if not root_dir.exists() or not root_dir.is_dir():
        return []
    folders: list[str] = []
    for p in root_dir.rglob("*"):
        if p.is_dir():
            rel = p.relative_to(root_dir).as_posix()
            if rel != ".":
                folders.append(rel)
    return sorted(folders, key=lambda x: x.lower())


def _list_images(folder_path: Path) -> list[Path]:
    if not folder_path.exists() or not folder_path.is_dir():
        return []
    images = [p for p in folder_path.iterdir() if p.is_file() and p.suffix.lower() in ALLOWED_EXTENSIONS]
    return sorted(images, key=lambda p: _natural_sort_key(p.name))


def _natural_sort_key(value: str) -> list[Any]:
    parts = re.split(r"(\d+)", value.lower())
    return [int(part) if part.isdigit() else part for part in parts]


def _resolve_folder(root: Path, folder_name: str) -> Path | None:
    folder_path = (root / folder_name).resolve()
    if not _is_subpath(root, folder_path):
        return None
    return folder_path


def _build_image_item(root: Path, folder_name: str, file_path: Path) -> dict[str, Any]:
    return {
        "name": file_path.name,
        "url": f"/api/image?root={quote(str(root))}&folder={quote(folder_name)}&name={quote(file_path.name)}",
        "mtime": int(file_path.stat().st_mtime),
    }


def _resolve_paired_folder(parent_folder: Path, fixed_dirname: str) -> Path | None:
    pair_root = (parent_folder / fixed_dirname).resolve()
    if not _is_subpath(parent_folder, pair_root):
        return None
    return pair_root


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.get("/api/config")
def get_config() -> Any:
    return jsonify(
        {
            "default_root": str(DEFAULT_ROOT),
            "default_exists": DEFAULT_ROOT.exists() and DEFAULT_ROOT.is_dir(),
            "paired_source_label": PAIRED_SOURCE_DIRNAME,
            "paired_result_label": PAIRED_RESULT_DIRNAME,
        }
    )


@app.get("/api/folders")
def get_folders() -> Any:
    root = DEFAULT_ROOT
    if not root.exists() or not root.is_dir():
        return jsonify({"error": "根目录不存在或不是文件夹"}), 400
    recursive = (request.args.get("recursive") or "1").strip() == "1"
    folders = _list_nested_folders(root) if recursive else _list_subfolders(root)
    return jsonify({"root": str(root), "recursive": recursive, "folders": folders})


@app.get("/api/images")
def get_images() -> Any:
    root = DEFAULT_ROOT
    if not root.exists() or not root.is_dir():
        return jsonify({"error": "根目录不存在或不是文件夹"}), 400

    folder_name = (request.args.get("folder") or "").strip()
    if not folder_name:
        return jsonify({"error": "缺少 folder 参数"}), 400

    try:
        limit = int(request.args.get("limit", 6))
    except ValueError:
        limit = 6
    limit = max(1, min(200, limit))

    try:
        page = int(request.args.get("page", 1))
    except ValueError:
        page = 1
    page = max(1, page)

    folder_path = _resolve_folder(root, folder_name)
    if folder_path is None:
        return jsonify({"error": "非法路径访问"}), 403
    if not folder_path.exists() or not folder_path.is_dir():
        return jsonify({"error": "目标子文件夹不存在"}), 404

    all_images = _list_images(folder_path)
    total = len(all_images)
    total_pages = max(1, (total + limit - 1) // limit)
    if page > total_pages:
        page = total_pages

    start = (page - 1) * limit
    end = start + limit
    image_files = all_images[start:end]
    items = [_build_image_item(root, folder_name, p) for p in image_files]
    return jsonify(
        {
            "root": str(root),
            "folder": folder_name,
            "count": len(items),
            "items": items,
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
        }
    )


@app.get("/api/paired-images")
def get_paired_images() -> Any:
    root = DEFAULT_ROOT
    if not root.exists() or not root.is_dir():
        return jsonify({"error": "根目录不存在或不是文件夹"}), 400

    folder_name = (request.args.get("folder") or "").strip()
    if not folder_name:
        return jsonify({"error": "缺少 folder 参数"}), 400

    try:
        limit = int(request.args.get("limit", 6))
    except ValueError:
        limit = 6
    limit = max(1, min(200, limit))

    try:
        page = int(request.args.get("page", 1))
    except ValueError:
        page = 1
    page = max(1, page)

    parent_folder = _resolve_folder(root, folder_name)
    if parent_folder is None:
        return jsonify({"error": "非法路径访问"}), 403
    if not parent_folder.exists() or not parent_folder.is_dir():
        return jsonify({"error": "目标子文件夹不存在"}), 404

    source_path = _resolve_paired_folder(parent_folder, PAIRED_SOURCE_DIRNAME)
    result_path = _resolve_paired_folder(parent_folder, PAIRED_RESULT_DIRNAME)
    if source_path is None or result_path is None:
        return jsonify({"error": "非法路径访问"}), 403
    if not source_path.exists() or not source_path.is_dir():
        return jsonify({"error": f"{PAIRED_SOURCE_DIRNAME}目录不存在"}), 404
    if not result_path.exists() or not result_path.is_dir():
        return jsonify({"error": f"{PAIRED_RESULT_DIRNAME}目录不存在"}), 404

    source_images = _list_images(source_path)
    result_images = _list_images(result_path)
    result_map = {p.name: p for p in result_images}
    paired_files = [(src, result_map[src.name]) for src in source_images if src.name in result_map]

    total = len(paired_files)
    total_pages = max(1, (total + limit - 1) // limit)
    if page > total_pages:
        page = total_pages

    start = (page - 1) * limit
    end = start + limit
    page_pairs = paired_files[start:end]
    items = [
        {
            "name": src.name,
            "source": _build_image_item(root, f"{folder_name}/{PAIRED_SOURCE_DIRNAME}", src),
            "result": _build_image_item(root, f"{folder_name}/{PAIRED_RESULT_DIRNAME}", dst),
        }
        for src, dst in page_pairs
    ]

    return jsonify(
        {
            "root": str(root),
            "folder": folder_name,
            "source_label": PAIRED_SOURCE_DIRNAME,
            "result_label": PAIRED_RESULT_DIRNAME,
            "count": len(items),
            "items": items,
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
        }
    )


@app.get("/api/image")
def get_image() -> Any:
    root = DEFAULT_ROOT
    if not root.exists() or not root.is_dir():
        abort(400)

    folder_name = (request.args.get("folder") or "").strip()
    file_name = (request.args.get("name") or "").strip()
    if not folder_name or not file_name:
        abort(400)

    folder_path = (root / folder_name).resolve()
    file_path = (folder_path / file_name).resolve()

    if not _is_subpath(root, folder_path) or not _is_subpath(folder_path, file_path):
        abort(403)
    if not file_path.exists() or not file_path.is_file():
        abort(404)
    if file_path.suffix.lower() not in ALLOWED_EXTENSIONS:
        abort(415)

    return send_file(file_path)


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=DEFAULT_PORT,
        debug=os.getenv("FLASK_DEBUG", "0") == "1",
    )
