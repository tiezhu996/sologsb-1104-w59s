# 榫卯结构拆解图鉴

面向传统木作学习者与家具设计人员的纯前端单页应用。项目把榫卯类型、构件尺寸、配合公差、拆装步骤、内联 SVG 示意图与适用家具整理为一套可查询、可编排、可追溯的本地图鉴，所有数据均保存在当前浏览器中。

## Docker 一键启动

```bash
cp .env.example .env && docker compose up -d --build
```

服务启动后访问：`http://localhost:21804`

停止服务：

```bash
docker compose down
```

## 技术栈

| 类别 | 技术 |
| --- | --- |
| UI | React 18、TypeScript 5 |
| 构建 | Vite 5 |
| 样式 | Tailwind CSS 3 |
| 路由 | React Router 6 |
| 状态 | Zustand 4 |
| 本地数据 | Dexie 4、IndexedDB |
| 容器 | Docker 多阶段构建、Nginx |

## 访问地址

- 宿主机端口：`21804`
- 页面地址：`http://localhost:21804`
- 前端路由回退由 Nginx 的 `try_files` 规则处理。

## 本地开发方式

```bash
cd frontend
npm install
npm run dev
```

类型检查与生产构建：

```bash
cd frontend
npm run build
```

本地开发默认使用 Vite 的 `5173` 端口；应用数据由浏览器中的 Dexie 数据库维护，不需要后端服务。

## 目录结构

```text
.
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/common/   共享 SVG、步骤轨道、尺寸字段和标签
│   │   ├── hooks/               步序编排与 SVG 热区解析
│   │   ├── pages/               图鉴、详情、步序、绘制台与家具反查
│   │   ├── router/              前端路由
│   │   ├── stores/              Zustand 状态与数据落库
│   │   ├── types/               核心数据模型（含资料卷 volume.ts）
│   │   ├── utils/               Dexie、尺寸换算、JSON 导出与资料卷分卷/校验/恢复
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## 数据存储说明

应用使用 IndexedDB，数据库封装库为 Dexie 4，库名为 `gbmortise-db`。

- `version(1)`：建立 `joints`、`members`、`steps`、`diagrams`、`furniture` 五张表及查询索引。
- `version(2)`：执行升级迁移，为五张表回填 `schemaRev = 2` 字段。
- `version(3)`：新增资料卷分卷所需的 `exportTasks`（打包任务与断点）、`importStaging`（已收卷暂存）、`importTasks`（导入进度）三张表，不改动既有业务数据。
- 首次创建数据库时通过 Dexie `populate` 回调写入榫卯、构件、步骤、内联 SVG 与家具关联的种子数据。
- 新建记录、尺寸修改、SVG 保存和步骤拖拽调序都会实时写回 IndexedDB，刷新页面后仍可读取。

## 核心功能与路由表

| 路由 | 页面 | 核心功能 |
| --- | --- | --- |
| `/` | 入口重定向 | 自动进入榫卯图鉴 |
| `/joints` | 榫卯图鉴总览 | 按家族与难度分组，新建类型，显示构件数与步骤数，导出全部数据 |
| `/joints/:id` | 类型详情 | 查看尺寸表、公差校验、适用家具与步骤；导出当前类型 |
| `/joints/:id/steps` | 拆装步序编排 | 原生拖拽调序并落库，逐步预览内联 SVG 与风险提醒 |
| `/joints/:id/diagram` | 示意图绘制台 | 点击热区回填构件，编辑构件名称、尺寸与 SVG 源 |
| `/furniture` | 家具榫卯反查 | 按家具聚合使用部位与承力说明，新建家具关联 |
| `/volumes` | 资料卷工坊 | 按选中家具与 U 盘容量分卷打包、续发；资料卷校验、齐套导入与断点恢复 |

## 资料卷分卷与恢复

工坊只有几只固定容量的 U 盘时，可在「资料卷工坊」把选中家具做成一套能在另一台电脑恢复的资料卷（JSON，每卷一个文件）。

- **每卷内容**：榫卯本体、构件、拆装步骤、内联示意图与家具关系；清单（manifest）含套卷编号、卷号、总卷数、容量、榫卯目录与 SHA-256 校验和。
- **共用榫卯只存首卷**：同一榫卯被多件家具共用时，完整资料只进入它首次出现的卷，后续卷只放家具关系，并在 `referencesJoints` 与 `jointCatalog` 中引用首卷。
- **按家具顺序分批**：容量不够时按勾选顺序封卷新开；榫卯的四类资料作为原子整体，绝不散卷；单榫卯超过单卷容量会直接报错。
- **先校验后导入**：收卷只暂存不写库；校验全部卷的齐套性、格式版本、`schemaRev`、校验和与引用关系，缺卷或版本不对立即停止，已收卷继续保留。
- **断点续传、幂等写入**：打包/导入失败后从最后完成的卷继续；导入按卷事务落库并用 `bulkPut` 去重，重试不会重复写入。
