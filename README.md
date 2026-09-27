# Loreweaver Studio dev

基于 [Loreweaver Studio](https://github.com/1A7432/loreweaver-studio) 与 [Loreweaver](https://github.com/1A7432/loreweaver) 的个人开发版，提供中文桌面跑团界面、素材编辑和本地 AI 主持人服务。本仓库同时保存配套客户端与服务端源码，保留上游 MIT 许可证及署名；不是上游官方发行版。

当前版本：**local4**（Studio `0.1.1-local.4`，Server `2.3.dev357+g48dabea.local4`）。

## 下载与使用

本仓库现已提供源码。Windows x64 便携包已在本机打包验证，尚未公开发布；以下便携包使用步骤适用于发布后。解压时需保留整个目录，不要只移动其中的 EXE。Windows 需要可用的 Microsoft Edge WebView2 Runtime。

1. 打开 `loreweaver-studio.exe`。
2. 在「我的房间」中，将「服务器目录」选择为便携包内的 `host` 文件夹。这一步让客户端使用随包提供的 local4 服务端。
3. 在右上角「设置」中打开本地服务配置，填写自己的模型服务地址、模型和 API Key，保存后启动本地服务。服务已启动时，启动配置需要退出服务后再启动才会生效；房间内已有的运行时模型设置可能覆盖启动默认值。
4. 点击本地开团按钮。连接后可继续原房间，或创建独立新局。联机时将连接票据与对应邀请密钥私下提供给玩家。

不配置模型凭据时，可以使用服务端的离线演示功能，但不会生成真实 AI 剧情。外观从右上角「设置」修改；先进入目标房间，可保存该房间关联的模组外观方案。

**配套版本说明：**当前客户端的自动下载后备地址仍指向上游。若跳过上述 `host` 目录选择，可能下载缺少本版房间/历史扩展的上游服务端。请使用便携包附带的服务端，或本仓库 `server/` 的源码环境。

## local4 的主要改动

- 清晰的「我的房间 / 跑团 / 角色 / 历史 / 管理」导航，连接后直接进入跑团。
- 不同局独立保存；公共跑团历史持续归档，支持类型筛选、搜索和分页。私有内容保持身份与角色隔离。
- 紧凑叙事排版、多行草稿、中文输入法保护、失败内容恢复、快捷骰子与技能检定。
- JSON/PNG 素材导入与微调，修改名称、描述、面板标签和数值后另存副本，保留未知扩展、世界书和脚本。
- 可导入背景、根据图片自动配色，保存命名模组方案；支持人物头像与房间音乐。
- 配置表单与原文编辑，支持 UTF-8、BOM、GBK 读取、冲突检查、备份及 UTF-8 保存。
- 修复 Windows 媒体目录名导致的图片、头像和音频上传失败。

完整历史保证适用于新版开始保存的内容。旧版从未落盘、已经裁掉或明确删除且没有备份的内容无法通过升级补回。房间备份不等于整台服务器备份；外部素材包仍需单独保留。

## 源码结构

```text
studio/           Tauri / React / TypeScript 客户端
server/           Python 服务端、规则、协议与测试
release-info.json  版本、上游来源和验证信息
CHANGELOG.md       本版改动及已知限制
```

源码导入自已验证的 local4 快照，未包含个人存档、真实配置、密钥、日志、虚拟环境或构建目录。子目录内的 README 与 `.github/` 文件保留了上游说明；上游发行链接及 CI 路径不代表本仓库已经提供相同的自动化发布。

## 从源码运行

服务端需要 Python 3.11+ 和 uv；客户端需要 Bun、Rust 与 Tauri 对应平台的系统构建依赖。

```powershell
cd server
$env:SETUPTOOLS_SCM_PRETEND_VERSION = '2.3.dev357+g48dabea.local4'
uv sync --extra anthropic --extra gemini
uv run python -m app --doctor
cd ../studio
bun install --frozen-lockfile
bun run tauri dev
```

这是合并后的源码快照，Git 提交历史不再等同于两个上游仓库的版本历史，因此构建发布版时显式设置上述版本变量。Bash 用户可使用 `export SETUPTOOLS_SCM_PRETEND_VERSION=2.3.dev357+g48dabea.local4`。

在客户端的素材工坊 → AI 设置中配置本仓库 `server` 源码目录后，本地启动会优先使用该目录的虚拟环境。也可单独运行服务端：在 `server` 中将 `.env.example` 复制为 `.env` 并填写自己的模型配置，再执行 `uv run python -m app --serve`，使用它输出的票据和密钥连接。服务端需保持运行；不要把 `.env` 或连接密钥提交到 Git。

跨仓库 roundtrip 检查还需要可选的 `ejs` / QuickJS 依赖。本版未验证完整 roundtrip，不将其标记为通过。

## 验证与限制

- 前端 1004 项通过；TypeScript、ESLint、i18n 检查通过。
- Rust 工作区 84 项通过、1 项忽略；Clippy 通过。
- 服务端相关定向测试 233 项通过、4 项跳过；协议测试 94 项通过。
- Windows 打包后的 doctor、服务启动、UTF-8 中文日志与身份重启持久化验证通过。
- 两项既有 Windows updater shell 测试仍受 POSIX 命令语法影响；未宣称完整后端套件全部通过。
- 当前提供的是 Windows x64 便携开发版，未签名。未验证 macOS/Linux 本版安装包，也未进行图形界面的视觉验收。

模型调用需要使用者自行配置服务；使用远程模型时，跑团所需的模组和剧情内容会发给所配置的模型服务。

## 来源与许可证

客户端来源：[1A7432/loreweaver-studio](https://github.com/1A7432/loreweaver-studio)；服务端来源：[1A7432/loreweaver](https://github.com/1A7432/loreweaver)。上游修订号记录在 `release-info.json`。

代码遵循 [MIT License](LICENSE)。各子目录保留原始许可证和已有第三方许可说明。
