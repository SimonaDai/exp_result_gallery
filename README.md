# 实验结果图对比看板（内网访问）

用于在同一页面对比多个实验目录结果图，支持多层目录树、分页浏览和大图左右切换。

## 功能概览

| 模块 | 说明 |
|---|---|
| 根目录配置 | 根目录仅由后端启动时环境变量 `EXP_RESULTS_ROOT` 指定，前端不可修改 |
| 目录树 | 左侧文件夹树支持多层嵌套、展开/折叠、全部展开/全部折叠 |
| 普通对比视图 | 点击“新增对比视图”，按原逻辑新增一个普通图片面板，可与其他任意子目录并排比较 |
| 双行对照视图 | 点击“新增双行对照视图”，基于当前选中的根目录子文件夹，在其内部查找 `退化/` 与 `复原/` 两个子文件夹，并按同名图片双行显示 |
| 同页多视图 | 普通对比视图和双行对照视图可以混合存在于同一页面（当前上限 4） |
| 排序规则 | 普通视图与双行对照视图统一按图片文件名排序，采用自然顺序，例如 `1, 2, 10` |
| 默认图片数 | 每个新视图默认显示 2 张图，可改为任意正整数（前端限制 1~200） |
| 缩略图分页 | 每个视图支持“上一页/下一页” |
| 全图预览 | 双击图片弹层查看大图，不裁切 |
| 预览切换 | 大图弹层左右箭头 + 键盘 `←/→` 切换（支持跨页连续切换） |
| 路径安全 | 后端对目录/文件做边界校验，防止越界访问 |

## 项目结构

| 路径 | 作用 |
|---|---|
| `app.py` | Flask API 与路径校验 |
| `templates/index.html` | 页面结构（主面板 + 大图弹层） |
| `static/app.js` | 目录树、多视图、分页、预览逻辑 |
| `static/style.css` | 自适应与视觉样式 |
| `requirements.txt` | Python 依赖 |
| `README_EN.md` | 英文文档 |

## 目录约定

### 普通目录浏览 / 多面板对比

根目录下的任意普通子文件夹都会按原逻辑展示图片，例如：

```text
EXP_RESULTS_ROOT/
  exp_a/
    0001.png
    0002.png
  exp_b/
    0001.png
    0002.png
```

### 双行对照视图

双行对照不是直接在根目录找 `退化/复原`，而是：

1. 先在左侧目录树里选中一个根目录子文件夹
2. 点击“新增双行对照视图”
3. 程序会到这个子文件夹内部查找 `退化/` 和 `复原/`

目录结构约定如下：

```text
EXP_RESULTS_ROOT/
  exp_a/
    退化/
      1.png
      2.png
    复原/
      1.png
      2.png
  exp_b/
    退化/
      1.png
    复原/
      1.png
```

双行对照视图会：

- 第 1 行显示 `退化/` 中的图片
- 第 2 行显示 `复原/` 中的图片
- 只对同名图片做配对显示
- 排序与普通视图保持一致，统一按文件名自然排序
- 如果当前子文件夹下缺少 `退化/` 或 `复原/`，该双行视图会直接提示错误

## 环境准备（Conda）

### A. 新建独立环境（推荐）

| 步骤 | 命令 |
|---|---|
| 1. 创建环境 | `conda create -n exp-gallery python=3.10 -y` |
| 2. 激活环境 | `conda activate exp-gallery` |
| 3. 进入项目 | `cd D:\git_download\exp_result_gallery` |
| 4. 安装依赖 | `pip install -r requirements.txt` |
| 5. 安装生产服务（可选） | `pip install waitress` |

### B. 使用已有环境

| 步骤 | 命令 |
|---|---|
| 1. 激活环境 | `conda activate 你的环境名` |
| 2. 进入项目 | `cd D:\git_download\exp_result_gallery` |
| 3. 安装依赖 | `pip install -r requirements.txt` |

## 启动命令（开发）

### PowerShell

```powershell
conda activate exp-gallery
cd D:\git_download\exp_result_gallery
$env:EXP_RESULTS_ROOT="E:\vis_visdronegt\visdrone"
python app.py
```

### CMD

```bat
conda activate exp-gallery
cd /d D:\git_download\exp_result_gallery
set EXP_RESULTS_ROOT=E:\vis_visdronegt\visdrone
python app.py
```

### Ubuntu / Linux（bash）

```bash
conda activate exp-gallery
cd /path/to/exp_result_gallery
export EXP_RESULTS_ROOT=/data/vis_visdronegt/visdrone
python app.py
```

## 启动命令（生产，Windows 推荐）

### PowerShell + waitress

```powershell
conda activate exp-gallery
cd D:\git_download\exp_result_gallery
$env:EXP_RESULTS_ROOT="E:\vis_visdronegt\visdrone"
waitress-serve --listen=0.0.0.0:5000 app:app
```

### CMD + waitress

```bat
conda activate exp-gallery
cd /d D:\git_download\exp_result_gallery
set EXP_RESULTS_ROOT=E:\vis_visdronegt\visdrone
waitress-serve --listen=0.0.0.0:5000 app:app
```

### Ubuntu / Linux + waitress

```bash
conda activate exp-gallery
cd /path/to/exp_result_gallery
export EXP_RESULTS_ROOT=/data/vis_visdronegt/visdrone
waitress-serve --listen=0.0.0.0:5000 app:app
```

## Shell 注意事项

| 终端 | 环境变量写法 |
|---|---|
| PowerShell | `$env:EXP_RESULTS_ROOT="E:\vis_visdronegt\visdrone"` |
| cmd | `set EXP_RESULTS_ROOT=E:\vis_visdronegt\visdrone` |

如果你在 `cmd` 里写 `$env:...`，会报：`文件名、目录名或卷标语法不正确`。  
在 `cmd` 可用 `echo %EXP_RESULTS_ROOT%` 验证。

## waitress 运行与停止

| 场景 | 操作 |
|---|---|
| 前台运行（终端被占用） | 直接按 `Ctrl + C` 停止 |
| 后台运行（Linux 常见，命令后加 `&`） | `ps -ef \| grep waitress-serve` 查 PID，再 `kill <PID>` |
| 强制结束（谨慎） | `kill -9 <PID>` |

说明：
- 前台：日志持续输出在当前终端，不能直接继续输入其他命令。
- 后台：服务不占当前终端，可继续输入命令。

## 访问地址

| 类型 | 地址示例 |
|---|---|
| 本机 | `http://127.0.0.1:5000` |
| 内网其他设备 | `http://你的本机IP:5000`（例如 `http://192.168.110.58:5000`） |

## 内网部署步骤（完整）

| 步骤 | 命令/操作 |
|---|---|
| 1. 查本机 IP | `ipconfig` |
| 2. 启动服务（监听 0.0.0.0） | 使用上面的 `waitress-serve --listen=0.0.0.0:5000 app:app` |
| 3. 放行防火墙端口（管理员 PowerShell） | `netsh advfirewall firewall add rule name="exp_gallery_5000" dir=in action=allow protocol=TCP localport=5000` |
| 4. 内网机器访问 | `http://你的IP:5000` |

## 页面使用说明

| 步骤 | 操作 |
|---|---|
| 1 | 左侧目录树展开到目标层级，点击一个根目录子文件夹 |
| 2 | 若要普通多面板比较，点击“新增对比视图” |
| 3 | 若要检查当前子文件夹内部的 `退化/复原` 配对结果，点击“新增双行对照视图” |
| 4 | 每个视图输入数量（默认 2）并翻页查看 |
| 5 | 双击缩略图进入大图预览 |
| 6 | 在大图两侧点三角箭头，或键盘 `←/→` 切换 |

### 使用提示

| 场景 | 说明 |
|---|---|
| 想比较两个实验目录整体结果 | 使用“新增对比视图” |
| 想看某个实验目录内部的 `退化/复原` 成对结果 | 先选中该目录，再点“新增双行对照视图” |
| 双行对照视图报目录不存在 | 检查当前选中的子文件夹下是否真的包含 `退化/` 与 `复原/` |

## 常见问题

| 问题 | 处理方式 |
|---|---|
| 页面改了但没生效 | 浏览器强制刷新：`Ctrl + F5` |
| 内网访问不到 | 检查服务是否监听 `0.0.0.0:5000`，并放行防火墙端口 |
| 启动报路径错误 | 检查 `EXP_RESULTS_ROOT` 是否存在且是目录 |
| 图片不显示 | 检查格式是否为 `.png/.jpg/.jpeg/.bmp/.gif/.webp/.svg` |
| 目录树为空 | 检查根目录下是否存在子目录，或切换递归开关后刷新 |

## 运维速查（Windows）

### 1) 查看某个文件夹总大小（PowerShell）

```powershell
$size = (Get-ChildItem "D:\your\folder" -Recurse -File | Measure-Object Length -Sum).Sum
"{0:N2} GB" -f ($size / 1GB)
```

### 2) 查看当前端口是否在监听（5000）

```bat
netstat -ano | findstr :5000
```

## 环境导出与复用（多人部署）

| 场景 | 命令 |
|---|---|
| 导出环境 | `conda activate exp-gallery` → `conda env export --from-history > environment.yml` |
| 导入环境 | `conda env create -f environment.yml` |
| 导入后安装依赖 | `conda activate exp-gallery` → `pip install -r requirements.txt` |

## 依赖清单

| 库 | 用途 |
|---|---|
| `Flask==3.0.3` | Web 服务与 API |
| `waitress`（可选） | Windows 生产部署服务 |
