from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from urllib.parse import quote

from flask import Flask, abort, jsonify, render_template, request, send_file

app = Flask(__name__)

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".svg"}
#映射端口，默认为 5000，可以通过环境变量 EXP_PORT 指定
DEFAULT_PORT = 5000

# 固定默认根目录：通过环境变量或当前目录下的 demo_results 指定
DEFAULT_ROOT = Path(
    os.getenv("EXP_RESULTS_ROOT", str(Path.cwd() / "demo_results"))
).resolve()

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
    images = [
        p
        for p in folder_path.iterdir()
        if p.is_file() and p.suffix.lower() in ALLOWED_EXTENSIONS
    ]
    # 按修改时间倒序，更贴近实验结果查看习惯
    return sorted(images, key=lambda p: p.stat().st_mtime, reverse=True)


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

    folder_path = (root / folder_name).resolve()
    if not _is_subpath(root, folder_path):
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
    items = [
        {
            "name": p.name,
            "url": f"/api/image?root={quote(str(root))}&folder={quote(folder_name)}&name={quote(p.name)}",
            "mtime": int(p.stat().st_mtime),
        }
        for p in image_files
    ]
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
