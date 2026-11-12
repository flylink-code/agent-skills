## 代码地图（多工程工作区）

本工作区有多个独立工程，每个工程各自维护自己的代码地图；根目录只有一张登记表，不合并地图。

| 要做的事 | 动作 |
| --- | --- |
| 不知道该找哪个工程 | 先读 `doc/CODE_MAP_INDEX.md` |
| 知道是哪个工程 | `node <工程>/doc/codemap.mjs --find <名字>` |
| 不知道在哪个工程 | `node doc/codemap-workspace.mjs find <名字>`（只读各工程缓存，不重新解析） |
| 看某个工程的架构主轴 | `node <工程>/doc/codemap.mjs --map` |
| 提交前 | `node doc/codemap-workspace.mjs check`（任一工程漂移即失败） |

规则：

- 改了哪个工程，就只重新生成那个工程的地图；顺手重建其他工程只会污染它们的 diff。
- 跨工程引用边不做推断：两份地图没有共同的解析器。共用头文件/协议定义写进 `doc/codemap-workspace.json` 的 `shared`。
- 地图页只能由生成器写；手写说明放在该工程的 `doc/` 根。
- 只有一个工程的仓库不需要这套登记表，直接用该工程自己的 `doc/CODE_MAP_INDEX.md`。
