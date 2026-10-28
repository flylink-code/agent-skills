## 代码地图（所有代码任务必须先做）

定位顺序，按已知信息选最省 token 的一步：

1. 不知道从哪下手：`node doc/codemap.mjs --map` 或 `doc/codemap/hubs.md`，先读被导入最多的声明。
2. 知道符号名：`node doc/codemap.mjs --find <名字>`，直接拿 `路径:行号`。
3. 知道文件：`node doc/codemap.mjs --outline <文件>`，拿该文件全部声明。
4. 都没有才走模块路由：`doc/CODE_MAP_INDEX.md` → `doc/codemap/<模块>.md` → 符号页 → 源码 `#L行号`。

只读命中段源码，不要整图加载。引用图仅覆盖生成器支持的导入语句，C#、Go、Java、C、C++ 当前只有声明索引，没有引用边；真实调用关系、类型与接口实现用 `rg` 或 LSP 确认。零引用不代表没有依赖。

- 教程：`doc/codemap-guide.md`。方法、覆盖范围、命令：`doc/CODE_MAP.md`。
- 任何文件新增 / 编辑 / 删除 / 重命名后：`node doc/codemap.mjs`，再 `node doc/codemap.mjs --check`，必须零漂移。
- 解析恢复条数以 `doc/CODE_MAP.md` 记录的基线为准；基线升高时在汇报中说明，不要手改页面。
- 导出面变化时确认索引尾部的引用边统计与 `hubs.md` 已更新，不是旧数字。
- **禁止手改** `doc/CODE_MAP_INDEX.md`、`doc/codemap/hubs.md` 与 `doc/codemap/`。
