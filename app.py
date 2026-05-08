from __future__ import annotations

import os
import re
from pathlib import Path
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import quote

from flask import Flask, abort, jsonify, render_template, request, send_file

app = Flask(__name__)

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".svg"}
# 映射端口，默认为 5000，可以通过环境变量 EXP_PORT 指定
DEFAULT_PORT = 5000

# 固定默认根目录：通过环境变量或当前目录下的 demo_results 指定
DEFAULT_ROOT = Path(os.getenv("EXP_RESULTS_ROOT", str(Path.cwd() / "test"))).resolve()


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


def _list_images(folder_path: Path, recursive: bool = False) -> list[Path]:
    if not folder_path.exists() or not folder_path.is_dir():
        return []
    if recursive:
        iterator = folder_path.rglob("*")
    else:
        iterator = folder_path.iterdir()
    images = [p for p in iterator if p.is_file() and p.suffix.lower() in ALLOWED_EXTENSIONS]
    return sorted(images, key=lambda p: _natural_sort_key(p.name))


def _natural_sort_key(value: str) -> list[Any]:
    parts = re.split(r"(\d+)", value.lower())
    return [int(part) if part.isdigit() else part for part in parts]


def _pair_images(images_a: list[Path], root_a: Path, images_b: list[Path], root_b: Path) -> list[tuple[Path, Path]]:
    # 1) 优先按相对路径配对；2) 若失败则按同名唯一文件兜底
    map_b_by_rel = {p.relative_to(root_b).as_posix(): p for p in images_b}
    map_b_by_name: dict[str, list[Path]] = {}
    for p in images_b:
        map_b_by_name.setdefault(p.name, []).append(p)

    used_b: set[Path] = set()
    pairs: list[tuple[Path, Path]] = []

    for src in images_a:
        rel = src.relative_to(root_a).as_posix()
        dst = map_b_by_rel.get(rel)
        if dst is not None and dst not in used_b:
            used_b.add(dst)
            pairs.append((src, dst))
            continue

        same_name = [p for p in map_b_by_name.get(src.name, []) if p not in used_b]
        if len(same_name) == 1:
            dst = same_name[0]
            used_b.add(dst)
            pairs.append((src, dst))

    return pairs


def _resolve_folder(root: Path, folder_name: str) -> Path | None:
    # 允许 root 内部的软链接目录，但拒绝绝对路径与 .. 路径穿越
    normalized = folder_name.replace("\\", "/").strip("/")
    pure = PurePosixPath(normalized)
    if pure.is_absolute() or ".." in pure.parts:
        return None
    folder_path = root.joinpath(*pure.parts)
    return folder_path


def _resolve_relative_path(root: Path, relative_path: str) -> Path | None:
    normalized = relative_path.replace("\\", "/").strip("/")
    pure = PurePosixPath(normalized)
    if not normalized:
        return None
    if pure.is_absolute() or ".." in pure.parts:
        return None
    return root.joinpath(*pure.parts)


def _build_image_item(root: Path, file_path: Path) -> dict[str, Any]:
    relative_path = file_path.relative_to(root).as_posix()
    return {
        "name": file_path.name,
        "rel_path": relative_path,
        "url": f"/api/image?path={quote(relative_path)}",
        "mtime": int(file_path.stat().st_mtime),
    }


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.get("/api/config")
def get_config() -> Any:
    return jsonify(
        {
            "default_root": str(DEFAULT_ROOT),
            "default_exists": DEFAULT_ROOT.exists() and DEFAULT_ROOT.is_dir(),
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

    recursive_images = (request.args.get("recursive_images") or "1").strip() == "1"
    all_images = _list_images(folder_path, recursive=recursive_images)
    total = len(all_images)
    total_pages = max(1, (total + limit - 1) // limit)
    if page > total_pages:
        page = total_pages

    start = (page - 1) * limit
    end = start + limit
    image_files = all_images[start:end]
    items = [_build_image_item(root, p) for p in image_files]
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
            "recursive_images": recursive_images,
        }
    )


@app.get("/api/paired-images")
def get_paired_images() -> Any:
    root = DEFAULT_ROOT
    if not root.exists() or not root.is_dir():
        return jsonify({"error": "根目录不存在或不是文件夹"}), 400

    folder_a = (request.args.get("folder_a") or request.args.get("folder") or "").strip()
    folder_b = (request.args.get("folder_b") or "").strip()
    if not folder_a:
        return jsonify({"error": "缺少 folder_a 参数"}), 400
    if not folder_b:
        return jsonify({"error": "缺少 folder_b 参数"}), 400

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

    folder_a_path = _resolve_folder(root, folder_a)
    folder_b_path = _resolve_folder(root, folder_b)
    if folder_a_path is None or folder_b_path is None:
        return jsonify({"error": "非法路径访问"}), 403
    if not folder_a_path.exists() or not folder_a_path.is_dir():
        return jsonify({"error": "folder_a 对应目录不存在"}), 404
    if not folder_b_path.exists() or not folder_b_path.is_dir():
        return jsonify({"error": "folder_b 对应目录不存在"}), 404

    images_a = _list_images(folder_a_path, recursive=True)
    images_b = _list_images(folder_b_path, recursive=True)
    paired_files = _pair_images(images_a, folder_a_path, images_b, folder_b_path)

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
            "source_rel_path": src.relative_to(folder_a_path).as_posix(),
            "result_rel_path": dst.relative_to(folder_b_path).as_posix(),
            "source": _build_image_item(root, src),
            "result": _build_image_item(root, dst),
        }
        for src, dst in page_pairs
    ]

    return jsonify(
        {
            "root": str(root),
            "folder_a": folder_a,
            "folder_b": folder_b,
            "source_label": folder_a,
            "result_label": folder_b,
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

    rel_path = (request.args.get("path") or "").strip()
    if not rel_path:
        abort(400)
    file_path = _resolve_relative_path(root, rel_path)
    if file_path is None:
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
