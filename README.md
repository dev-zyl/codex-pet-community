# Codex Pet Community

一个轻量的 Codex 宠物社区浏览器，用纯静态前端复刻并扩展 CodexPet 社区列表体验。页面直接读取 `codexpet.xyz` 的公开 API，展示社区宠物、动态预览、详情页、下载入口和安装命令。

## 功能

- 宠物列表：分页展示社区宠物卡片。
- 动态预览：使用宠物 `spritesheet.webp` 的 idle 行做 CSS steps 动画。
- 搜索与筛选：支持关键词搜索、热门/最新/下载排序、标签筛选、刷新。
- 分页：支持上一页、下一页和指定页跳转。
- 本地详情页：列表中的“查看”进入本地 `detail.html`，不跳转到远端详情页。
- 详情增强：展示宠物元数据、下载按钮、安装命令、9 种动画状态预览和完整精灵图。
- 风格切换：内置 4 套页面风格，选择会保存到本地。

## 页面风格

- 清爽社区：干净的默认社区列表。
- 紧凑信息：更高密度的信息浏览布局。
- 展示橱窗：更大的预览图和作品展示感。
- 夜间像素：深色像素风界面。

## 文件结构

```text
.
├── index.html      # 列表页
├── detail.html     # 本地详情页
├── app.js          # 列表页逻辑
├── detail.js       # 详情页逻辑
├── styles.css      # 全局样式与 4 套主题
└── README.md
```

## 本地预览

可以直接打开 `index.html`，也可以启动一个静态服务器：

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

然后访问：

```text
http://127.0.0.1:4173/
```

## 数据来源

项目没有自建后端，运行时直连 CodexPet 的公开接口：

- 列表：`https://codexpet.xyz/api/pets`
- 标签：`https://codexpet.xyz/api/pets/tags`
- 详情：`https://codexpet.xyz/api/pets/{slug}`
- 下载：`https://codexpet.xyz/api/pets/{slug}/download`
- 精灵图：`https://codexpet.xyz/api/pets/{slug}/spritesheet`

## 部署到 Cloudflare Pages

这是纯静态项目，不需要构建步骤。

Cloudflare Pages 设置：

- Framework preset: `None`
- Build command: 留空
- Build output directory: `/`

也可以部署到 GitHub Pages、Netlify、Vercel 等静态托管平台。

## 说明

社区宠物的版权和授权信息来自远端接口。本项目只是浏览和安装入口，不重新托管宠物包文件。
