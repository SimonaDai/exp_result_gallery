# Experiment Result Comparison Dashboard (LAN Access)

A lightweight dashboard to compare experiment result images in one page, with nested folder tree navigation and multi-panel comparison.

## Feature Summary

| Module | Description |
|---|---|
| Default root | Backend keeps a single default root (`EXP_RESULTS_ROOT`) without mutating global runtime state |
| Root source | Root directory is fixed by backend startup variable `EXP_RESULTS_ROOT` (not editable in UI) |
| Folder tree | Nested tree with expand/collapse and expand-all/collapse-all |
| Multi-panel comparison | Multiple comparison panels in the same page (current limit: 4) |
| Image count | Per-panel custom image count (supports values like `2/4/6/8`, UI range 1~200) |
| Thumbnail pagination | Per-panel `Previous/Next` page controls |
| Full-image preview | Double-click image to open full view modal (`contain`, no crop) |
| Preview navigation | `Previous/Next` image buttons and keyboard left/right arrows |
| Security checks | Backend validates `root/folder/file` path boundaries |

## Project Structure

| Path | Purpose |
|---|---|
| `app.py` | Flask API and path boundary checks |
| `templates/index.html` | UI layout (root modal + preview modal) |
| `static/app.js` | Folder tree, panel logic, interactions |
| `static/style.css` | Responsive and visual styles |
| `requirements.txt` | Dependency list |
| `README.md` | Chinese documentation |

## Quick Start (Conda)

### 1) Create a dedicated environment (recommended)

| Step | Command |
|---|---|
| Create env (Python 3.10 example) | `conda create -n exp-gallery python=3.10 -y` |
| Activate env | `conda activate exp-gallery` |
| Go to project | `cd D:\git_download\exp_result_gallery` |
| Install deps | `pip install -r requirements.txt` |
| Optional (production server) | `pip install waitress` |

### 2) Use an existing environment

| Step | Command |
|---|---|
| Activate env | `conda activate <your_env_name>` |
| Go to project | `cd D:\git_download\exp_result_gallery` |
| Install deps | `pip install -r requirements.txt` |

## Run

| Scenario | Command |
|---|---|
| Development (PowerShell) | `conda activate exp-gallery` → `cd D:\git_download\exp_result_gallery` → `$env:EXP_RESULTS_ROOT="D:\your_results"; python app.py` |
| Development (CMD) | `conda activate exp-gallery` → `cd D:\git_download\exp_result_gallery` → `set EXP_RESULTS_ROOT=D:\your_results && python app.py` |
| Production (Windows) | `conda activate exp-gallery` → `cd D:\git_download\exp_result_gallery` → `$env:EXP_RESULTS_ROOT="D:\your_results"; waitress-serve --listen=0.0.0.0:5000 app:app` |

Shell notes:

| Shell | Env var syntax |
|---|---|
| `PowerShell` | `$env:EXP_RESULTS_ROOT="E:\vis_visdronegt\visdrone"` |
| `cmd` | `set EXP_RESULTS_ROOT=E:\vis_visdronegt\visdrone` |

If you run `$env:...` in `cmd`, it will fail with an invalid filename/directory syntax error.  
In `cmd`, verify with: `echo %EXP_RESULTS_ROOT%`.

Access URLs:

| Type | URL |
|---|---|
| Local machine | `http://127.0.0.1:5000` |
| Other devices in LAN | `http://<your-local-ip>:5000` |

## UI Workflow

| Step | Action |
|---|---|
| 1 | On first visit, choose default root or input a custom root |
| 2 | Use the left folder tree to expand/collapse and select target folder |
| 3 | Add more panels with `Add Comparison Panel` |
| 4 | Set image count per panel (e.g. 2/4/6/8) and refresh |
| 5 | Double-click image for full preview; press `Esc` or click `Close` |

## LAN Deployment Notes

| Item | Recommendation |
|---|---|
| App server | Prefer `waitress` on Windows |
| Firewall | Allow inbound traffic on app port (default `5000`) |
| Permissions | Ensure runtime account can read experiment folders |
| Stability | Use fixed conda environment and lock versions |

## Export and Reuse Conda Environment

| Scenario | Command |
|---|---|
| Export current env | `conda activate exp-gallery` → `conda env export --from-history > environment.yml` |
| Import on another machine | `conda env create -f environment.yml` |
| Install project deps after import | `conda activate exp-gallery` → `cd D:\git_download\exp_result_gallery` → `pip install -r requirements.txt` |

## Troubleshooting

| Issue | Fix |
|---|---|
| UI not updated after changes | Hard refresh browser: `Ctrl + F5` |
| LAN access fails | Check firewall rule and ensure server listens on `0.0.0.0` |
| Folder tree is empty | Verify root path and enable recursive folder listing |
| Images not loading | Check supported formats: `.png/.jpg/.jpeg/.bmp/.gif/.webp/.svg` |

## Dependencies

| Package | Purpose |
|---|---|
| `Flask==3.0.3` | Web app and API |
| `waitress` (optional) | Production server for Windows |
