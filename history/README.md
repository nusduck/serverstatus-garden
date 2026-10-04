# Server Garden 历史旁路

Python 3.9+ 标准库采集器：只读 ServerStatus 当前状态，写独立 SQLite 和三个静态 JSON。不需要 pip、API key 或新增 HTTP 服务，不修改探针和 Nginx。

## 文件与目录

- `collector.py`：单次 fetch → validate → 去重 INSERT → prune → 同一 SQLite 读快照导出。
- `test_collector.py`：11 项 stdlib unittest。
- `server-garden-history.service` / `.timer`：root oneshot，完成后等待 10 秒再运行，实际间隔还包含执行耗时。
- 默认源：`http://127.0.0.1:8080/json/stats.json`。部署前核实实际接口，不使用探针私有 API。
- 私有 DB：`/opt/server-garden-history/history.sqlite`。
- 公开输出：`/opt/ServerStatus/web/assets/garden-history/{1h,24h,7d}.json`。
- 实例 URL：`https://cloud.kygoho.win/server/assets/garden-history/1h.json` 等。

## 运行与测试

```sh
python3 -m unittest discover -s history -v
python3 history/collector.py \
  --source http://127.0.0.1:8080/json/stats.json \
  --db /path/to/private/history.sqlite \
  --output /path/to/public/assets/garden-history --once
```

必须带 `--once`，没有 daemon 模式；CLI 使用 flock 防止同一数据库重入。HTTP timeout=8s，响应上限 2 MiB、单快照上限 256 节点、嵌套深度上限 16。失败返回 1，成功返回 0，打印真实范围计数和时间。

## 数据契约

所有时间为 Unix UTC 秒。窗口/桶间隔：1h=3600/10 秒，24h=86400/240 秒，7d=604800/1680 秒，每个范围最多 360 桶。

- `start = generated_at - window`；桶相对 start 划分、左闭右开，恰好等于 generated_at 的真实样本归入最后一桶，不生成第 361 桶。桶边界随导出时间移动，不能假定 epoch 对齐。
- `bucket_end` 是桶边界，`updated` 是桶末真实全局采样时间。没有采样的桶不输出，不 forward-fill。
- `end` 是最后真实采样时间，无采样时 null；`collected_since` 是数据库中第一条当前仍保留的样本时间。
- `sample_count` 是范围内去重快照数，`samples[].count` 是桶内原始快照数。真实空 servers 快照仍算一次采样，但不会沿用旧节点。
- 同桶使用节点 union；主字段取该节点桶内末次真实观测，其他快照中缺失则增加 missing；跨桶不延续已移除节点。历史可能保留旧节点，实时列表仍以 stats 为准。节点 identity 是 name，改名视为新节点。
- `bucket_quality` 包含 `189` / `10010` / `10086`，每项为 `max_loss`、`max_latency`、`count`、`missing`。
- quality 仅使用在线节点且 `0 <= updated-latest_ts <= 60`、ping 有限且在 0..100、time 有限且 >0 的观测。loss/latency 分别取最大值，不一定来自同一样本。无有效观测时最大值为 null；离线、缺失、过期或未来心跳不制造 100% 丢包。

SQLite 节点 JSON 和公开输出均使用严格字段白名单：节点标识、位置、在线状态、心跳、资源、流量、负载、连接与进程统计、uptime、si 和三网 ping/time。labels 仅保留符合 `[A-Za-z0-9_.-]{1,64}` 的 os。custom、secret、password、token、notify、gid、weight 等不存储、不导出。保留 si=false，不在旁路猜测或转换单位。

## 校验与失败保护

- 全局 updated 必须为正整数，不接受 bool、未来或超过 60 秒的旧数据；拒绝无效 servers、重复/空节点名、公开字段类型错误和非有限数值。
- updated 是 SQLite 主键，相同 updated 只保留首次快照。保存 7 天加 60 秒边界 buffer，成功采集时 prune；不会每轮 VACUUM。
- checks 仅保存 checked_at、ok、稳定 reason、source_updated、真实 source_gap，不保存响应 body 或凭据。失败不会补造缺口或覆盖 good JSON。
- 流式聚合 SQLite 行，三个范围使用同一 read transaction 与 generated_at，不一次载入整周原始数据。
- 三个新文件和 rollback 副本先准备并 fsync，再逐个同目录 os.replace。普通发布失败回滚已替换文件；准备、fetch、校验失败保持旧文件内容。DB 已插入样本不会因导出失败回滚，下轮可重导。

**限制：**三个文件不是跨文件原子事务，极短的替换窗口可能读到不同 generated_at。SIGKILL、掉电或持续文件系统故障时不能承诺全部回滚；下一轮恢复后重新导出。256 节点限制针对单个快照，长期 name churn 仍可扩大节点 union。尚未完成整周真实持续采集和负载测量。建议至少预留 1 GB，并观察数据库大小和单次执行耗时；空间需求是估算，不是实测整周用量。

## 部署

先核实源接口、webroot、权限和回滚备份，将本目录文件上传到目标暂存目录，再在该目录执行。两个 ReadWritePaths 必须提前创建，否则 unit 无法启动。

```sh
install -d -m 0750 /opt/server-garden-history
install -d -m 0755 /opt/ServerStatus/web/assets/garden-history
install -m 0644 collector.py /opt/server-garden-history/collector.py
install -m 0644 server-garden-history.service /etc/systemd/system/server-garden-history.service
install -m 0644 server-garden-history.timer /etc/systemd/system/server-garden-history.timer
python3 /opt/server-garden-history/collector.py \
  --source http://127.0.0.1:8080/json/stats.json \
  --db /opt/server-garden-history/history.sqlite \
  --output /opt/ServerStatus/web/assets/garden-history --once
systemd-analyze verify /etc/systemd/system/server-garden-history.service /etc/systemd/system/server-garden-history.timer
systemctl daemon-reload
systemctl enable --now server-garden-history.timer
systemctl list-timers server-garden-history.timer
journalctl -u server-garden-history.service -n 20 --no-pager
```

模板使用 root + NoNewPrivileges / PrivateTmp / ProtectSystem=strict / 限定 ReadWritePaths / 无 capabilities。使用专用用户时须同步调整路径所有权与 unit。DB 目录应为 0750、DB 0640，公开目录 0755、JSON 0644；不要把数据库放到 webroot，也不要更改探针配置。

部署后读取三个公开 JSON 和源接口，确认真实 sample_count 增长、generated_at 新鲜、无敏感字段、SQLite integrity_check=ok，以及原探针 PID/重启次数、Nginx 和探针配置哈希不变。回滚旁路时仅禁用本 timer 并停止其 oneshot，不 stop/restart 原探针；前端回滚备份独立保存。

## 验证

Python 3.9.2 和目标 Python 3.11.2 均通过 11 项测试，覆盖去重、时间校验、白名单、桶聚合、无效数据、极大整数和故障注入回滚；systemd 模板校验通过。生产实例的 timer 已启用，公开历史持续增长，SQLite 完整性通过。测试数据库和开发样例不会进入仓库或导入生产历史。
