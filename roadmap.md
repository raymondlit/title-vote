# Roadmap

- [x] Add configurable system font, font size, color scheme, display mode, and layout style to school interface settings.
- [x] Expand theme fonts and palettes, add a 75–150% font-size slider, and improve live preview.
- [x] Ensure judge pages and their floating controls inherit the school's theme and font scale.
- [x] Add configurable 10/20/40/100-per-page pagination to the judge list.
- [x] 学科组线下推荐表设计/下载/打印/上传录入，及大评审委员会组建与大评审场次投票。
- [x] 全流程优化：评审进度看板、统一确认弹窗与加载/空状态、投票提交幂等、结果页轻量轮询、窄屏适配与中文错误页。
- [x] 学科组推荐表格增加学科分类列，上传自动按学科分组，投票页分组名自动带学科名
- [x] 评委确认单用绿红色区分推荐与不推荐；超过 20 人时投票区显示随鼠标移动的规则提醒浮窗。
- [x] 评委确认单打印支持按需在每个分页底部增加评委签字确认线。
- [x] 评委确认单支持全校统一的页眉、页脚、页码、签字线位置、分页设置与 A4 逐页预览。
- [x] 投票结果归档记录支持按高校、评审类别、学科组和归档时间筛选。
- [x] 评审对象按参评类型（评审类别）筛选。
- [x] 多轮差额遴选：确认本轮通过名单、剩余人员发起下一轮（可调整名单与名额）、评委端轮次标识、全轮次汇总表。
- [x] 投票场次归档区（归档/取回）与删除前管理员密码核验。
- [x] 评委投票页：推荐/不推荐一键直选、按表态状态筛选、「定位下一个未表态」快速定位。
- [x] 选票提交改为数据库单事务原子提交（P1）。
- [x] 应急纸质选票：指定学科组独立票 / 全类别一张票 / 按学科组批量，表头栏目可定制，预览、导出 PDF、直接打印。
- [ ] 延后：提交幂等重试、密码条扫码登录、选票哈希防伪存证、投屏监控看板（用户要求暂缓）。
