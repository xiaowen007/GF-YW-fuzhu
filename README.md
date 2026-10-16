# 光伏运维辅助小程序

基于微信小程序原生框架开发的库存管理工具，支持扫码录入、批量扫码、标签比对、图片批量解码、扫码累加、条码/二维码生成、库存预警以及本地/云端存储切换。

V2.7.0 起内置**「物料查询」工具分类**：扫码/关键词搜物料、正品与异常照片对照验真、收藏、批量导入维护，并带只读 / 维护员 / 负责人三级权限。

## 功能特性

- **单次扫码**：识别条码/二维码并保存记录
- **连续扫码**：高频连续扫描，结果自动累计
- **批量扫码**：统一扫描后批量保存
- **标签比对**：双标签自动比对一致性
- **图片批量解码**：导入图片识别条码（需后端 OCR 服务支持）
- **扫码累加**：重量、数量、金额汇总
- **库存盘点**：物料库存展示与低库存预警
- **条码/二维码生成**：自定义内容生成并保存历史
- **本地/云端存储切换**：基于微信云开发实现数据同步与备份
- **物料查询（大分类工具）**：
  - 模糊搜索：拼音全拼 / 首字母（duanluqi、dlq 均命中断路器）、同义词（空开=断路器）、多关键词空格分隔、料号笔误容错（编辑距离 1）、命中高亮、最近搜索历史
  - AI 识图查询：拍照 / 相册选图，云函数调用视觉大模型读出物料号、名称、型号等字段，结果可人工修正后查询匹配或直接入库（需部署 `ai-material` 云函数并配置 `AI_API_KEY`）
  - 查询首页：输入即搜、扫码直达、AI 识图、按系列/类型浏览、最近查看
  - 结果列表：关键词 + 系列/类型 + 精确字段（物料号/品牌/型号/位置）筛选，触底分页
  - 物料详情：照片轮播、**正品参照 / 异常对照**分区展示、判定要点、字段表、收藏、分享
  - 物料维护：新增/修改/删除、正品与异常照片上传（长边自动压缩到 1280px）
  - 批量导入：Excel 复制粘贴 / CSV / JSON 三种格式，表头中英文别名自动识别，按物料号 upsert
  - 三级权限：只读 / 维护员（editor）/ 负责人（owner），邀请码一次性使用，初始邀请码 `PUNTFUUS` 可激活第一位负责人

## 项目结构

```
inventory-wxapp/
├── app.js                  # 小程序入口
├── app.json                # 全局配置
├── app.wxss                # 全局样式
├── pages/                  # 页面（首页/扫码/盘点/设置 + 物料查询 7 页：query、query-list、material-detail、material-edit、query-import、query-admin、query-image）
├── components/             # 公共组件（feature-card、record-item、material-card）
├── utils/                  # 工具方法（storage、cloud、materials、material-roles、material-seed、material-synonyms、pinyin）
├── cloudfunctions/         # 云函数（login、ai-material、getMiniProgramCode）
├── assets/                 # 图标与物料照片（assets/materials）
├── web/                    # Web 端：admin.html 管理后台 + index.html UI 预览
└── scripts/                # 上传脚本、Web bundle 打包脚本
```

## 网页端管理后台

`web/admin.html` 是纯浏览器端的物料数据管理后台，解决小程序端批量维护困难的问题：

- **表格视图**：一屏 20 条，批量核对；**卡片视图**：看图为主
- **智能检索**：与小程序同一套算法（拼音 `duanluqi`/`dlq`、同义词 `空开`、多词 AND、料号笔误容错、命中高亮）
- **批量导入**：Excel 整块复制粘贴 / CSV / JSON，表头中英文别名自动识别
- **导出备份**：一键导出含照片的 JSON（照片以 dataURL 内嵌），可导回还原
- **照片管理**：正品与异常对照分开，多选上传自动压缩到长边 1280px

启动方式：

```bash
cd web && python -m http.server 8090
# 浏览器打开 http://127.0.0.1:8090/admin.html
```

详细说明见 `后台管理说明.md`。

> 改动 `utils/` 后需重新打包，否则网页端搜索行为会停旧版本：
>
> ```bash
> node scripts/build-web-bundle.js
> ```

## 使用说明

1. 使用微信开发者工具导入项目目录 `inventory-wxapp`
2. 在 `project.config.json` 中替换 `appid` 为你的小程序 AppID
3. 如需云端存储，在微信开发者工具中开通云开发，并在「设置」->「云环境配置」中填写环境 ID
4. 部署 `cloudfunctions/login` 云函数
5. 如需 AI 识图：部署 `cloudfunctions/ai-material` 并配置 `AI_API_KEY` 环境变量，详见 `部署指南.md` 第四章

## 上传与发布

| 目标 | 方式 |
| ---- | ---- |
| 小程序 | 开发者工具「上传」按钮（最简）或 GitHub Actions 自动上传；最后在公众平台提审发布 |
| Web 后台 | 本地起静态服务，或随 Cloudflare Pages 自动部署 |

完整步骤（含上传密钥、云函数部署、提审注意事项）见 `部署指南.md`。

## 部署目标

- 代码托管：GitHub
- 线上托管：Cloudflare Pages（Web 后台 / H5 预览）/ 微信小程序平台
