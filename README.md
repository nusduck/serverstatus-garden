# Server Garden

为 ServerStatus-Rust 构建的监控前端，采用 Vue 3 + Vite，并提供无第三方依赖的 SQLite 历史旁路采集器。

在线实例：[Pod's Garden · Server Garden](https://cloud.kygoho.win/server/)。

## 功能

- 每 5 秒读取真实 stats；节点心跳与全局数据独立判断过期，离线、缺失和过期值不伪装为零。
- V6 控制台布局：全局概览条、按地域分组的高密度节点矩阵（三网 36 格质量条、资源、流量迷你曲线），桌面常驻详情面板、手机底部弹层；另有卡片视图、花园热力图和由历史推导的状态变化。
- 搜索（`/` 聚焦）、地域 / 状态筛选、排序、1h / 24h / 7d 全局时间窗口、跟随系统的深浅主题，方向键切换节点。
- 服务端定时采集到独立 SQLite，导出 1h / 24h / 7d 静态 JSON；前端每 30 秒读取历史。
- 拉丁字体（Bricolage Grotesque、IBM Plex）随构建自托管，中文使用系统字体；缺采区间保持空白或斜纹，不补造历史数据。
- 不修改现有探针、探针配置或 Nginx；没有 API key，也不会在请求失败时回退到演示数据。

## 本地开发与验证

需要 Node.js 20.19+ 或 22.12+，历史采集器需要 Python 3.9+。

```sh
npm ci
npm run build
npm test
python3 -m unittest discover -s history -v
npm run dev
```

`npm test` 中包含对生产构建的验收，因此先执行 `npm run build`。开发时需自行将同源的 `./json/stats.json` 与 `./assets/garden-history/` 路由到真实接口；当前 Vite 配置没有自动开发代理。也可构建后部署在提供这些同源资源的服务器上。

## 目录

- `src/`：生产前端。`live.js` / `history.js` 为数据层，`insights.js` 为舰队聚合、热力分桶与状态变化推导；其余为 Vue 组件。
- `tests/`：前端行为、真实 Vue 渲染、构建产物和样式回归测试；虚构 fixtures 仅供测试。
- `history/`：Python 采集器、测试和 systemd service/timer 模板。
- `design/garden-v5/`：最终确认的独立参考稿，含演示/快照数据，**不是生产前端**。
- `design/garden-v6/`：V6 重构原型（控制台式高密度布局：节点矩阵 + 详情面板 + 热力图 + 状态变化），全部为模拟数据，**不是生产前端**。
- `public/`：品牌图标。

## 数据与单位

ServerStatus 的内存字段使用 KiB/KB，磁盘使用 MiB/MB；由 `si` 决定基数。网络速率由 byte/s 转为 MiB/s。节点和全局数据超过 60 秒均视为过期，CPU/内存/磁盘达到 80% 显示资源偏高提示，不改变探针告警规则。

历史只从启用采集器后开始积累，1h / 24h / 7d 是查询窗口而非已有数据长度。每桶主指标取真实末次样本；质量取有效观测最大值，缺失不算 100% 丢包。完整契约和部署方法见 [历史旁路文档](history/README.md)。

## 部署

1. `npm ci && npm run build && npm test`。
2. 按 `history/README.md` 安装独立采集器；SQLite 必须在公开 webroot 外。
3. 备份现有前端；将 `dist/assets/` 中哈希资源和 `favicon.svg` 上传到前端 webroot。
4. 最后以同目录临时文件原子替换 `index.html`，保留现有 `json/`、历史输出及探针文件。
5. 从公开地址核对资源哈希、真实轮询和历史增长，并验证原探针 PID/重启次数、配置哈希不变。

构建使用相对 base，可部署在 `/server/` 等子目录。**不要对共享 webroot 使用无排除的 `rsync --delete`，不要为前端发布重启探针或改写探针配置。** 回滚时先恢复已备份资源，最后恢复旧 HTML；历史数据库无需覆盖。

## 验证

前端 49 项自动测试、Python 11 项测试通过，生产构建与公开资源逐文件哈希一致。实测真实节点轮询、浏览器侧请求失败与恢复、节点移除后的弹窗关闭与搜索焦点恢复；双主题在 390 / 700 / 1440 / 1920px 无横向溢出，页尾横线与内容板对齐。历史 timer 正常采集，SQLite integrity check 通过。

## 参考

- [ServerStatus-Rust](https://github.com/zdz/ServerStatus-Rust)：数据结构和接口。
- [ServerStatus-Theme-Light](https://github.com/orilights/ServerStatus-Theme-Light)：监控卡片展示参考。
- [ServerStatus-theme](https://github.com/JingBh/ServerStatus-theme)：前端与接口分离。
- [ServerStatus-web](https://github.com/krwu/ServerStatus-web)：子目录部署。

参考实现方法而非复制第三方源代码；品牌视觉来自现有 Pod's Garden。
