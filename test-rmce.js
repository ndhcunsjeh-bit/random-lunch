/* 随机吃什么 · jsdom 回归测试
   用法：cd <node workspace> && NODE_PATH=<ws>/node_modules <node> 本文件
   覆盖：预置种子、增删改查、筛选/搜索、排除逻辑、随机命中、历史去重、导入导出、存储计量、抽取动画收敛 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML_PATH = 'C:\\作业\\ai小项目\\随机午饭\\index.html';
const html = fs.readFileSync(HTML_PATH, 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; failures.push(name + (extra ? '  → ' + extra : '')); console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n--- ' + t + ' ---'); }

const cssIssues = [];
const jsErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => cssIssues.push(String(e.message).slice(0, 160)));
vc.on('error', (...a) => jsErrors.push(a.map(String).join(' ').slice(0, 200)));
vc.on('warn', () => {});
vc.on('log', () => {});

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: vc,
  beforeParse(w) {
    // jsdom 没有 canvas / createObjectURL，按需打桩
    w.HTMLCanvasElement.prototype.getContext = function () {
      return {
        fillRect() {}, drawImage() {},
        set fillStyle(v) {}, get fillStyle() { return '#fff'; }
      };
    };
    w.HTMLCanvasElement.prototype.toDataURL = function () {
      return 'data:image/jpeg;base64,' + 'A'.repeat(400);
    };
    w.URL.createObjectURL = function () { return 'blob:mock'; };
    w.URL.revokeObjectURL = function () {};
    w.Element.prototype.scrollIntoView = function () {};
  }
});

const w = dom.window, d = w.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function click(node) {
  node.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
}
function input(node, val) {
  node.value = val;
  node.dispatchEvent(new w.Event('input', { bubbles: true }));
}

(async function run() {
  await sleep(120);
  const App = w.__RMCE__;
  section('0. 脚本加载 / 无致命报错');
  ok('全局 API 已暴露', !!App);
  ok('页面脚本无未捕获异常', jsErrors.length === 0, jsErrors[0]);
  if (!App) { finish(); return; }

  section('1. 首次打开预置 5 道示例菜');
  ok('清单为 5 道', App.state.dishes.length === 5, '实际 ' + App.state.dishes.length);
  ok('全部标记为示例', App.state.dishes.every(x => x.preset === true));
  ok('预置图走图库 URL 不占存储', App.state.dishes.every(x => /^https:\/\//.test(x.img)));
  ok('localStorage 已写入清单', !!w.localStorage.getItem('rmce.dishes.v1'));
  ok('示例菜立即落盘，用量计数不为 0', App.storageBytes() > 0, String(App.storageBytes()));
  ok('卡片渲染出 5 张', d.querySelectorAll('#grid .card').length === 5, String(d.querySelectorAll('#grid .card').length));
  ok('每张卡都挂了真实图片地址', d.querySelectorAll('#grid .card img[src^="https"]').length === 5);
  ok('类别筛选条含“全部 5”', d.querySelector('#catChips').textContent.indexOf('全部 5') > -1);
  ok('空清单提示此时隐藏', d.getElementById('empty').classList.contains('hidden'));

  section('2. 添加食物（含校验）');
  // 空菜名应被拦下
  click(d.getElementById('openAdd'));
  ok('添加弹窗已打开', !d.getElementById('addModal').classList.contains('hidden'));
  click(d.getElementById('saveDish'));
  ok('菜名为空时保存被拦截', App.state.dishes.length === 5 && d.getElementById('errName').textContent.length > 0);
  ok('空菜名输入框标红', d.getElementById('fName').classList.contains('invalid'));

  input(d.getElementById('fName'), '番茄炒蛋');
  input(d.getElementById('fCat'), '家常菜');
  click(d.getElementById('saveDish'));
  ok('保存成功后清单变 6 道', App.state.dishes.length === 6, String(App.state.dishes.length));
  ok('弹窗自动关闭', d.getElementById('addModal').classList.contains('hidden'));
  let added = App.state.dishes[5];
  ok('菜名/类别正确', added.name === '番茄炒蛋' && added.category === '家常菜');
  ok('无图时 img 为空（走色块兜底）', added.img === '');
  ok('重新加载后仍有 6 道', JSON.parse(w.localStorage.getItem('rmce.dishes.v1')).length === 6);
  ok('新增卡片出现在网格', d.querySelectorAll('#grid .card').length === 6);

  // 链接图片
  click(d.getElementById('openAdd'));
  input(d.getElementById('fName'), '酸梅汤');
  click(d.querySelector('#addModal .tab[data-tab="url"]'));
  input(d.getElementById('fUrl'), 'https://example.com/a.jpg');
  click(d.getElementById('saveDish'));
  ok('用图片链接也能添加', App.state.dishes.length === 7 && App.state.dishes[6].img === 'https://example.com/a.jpg');
  ok('链接图不产生 base64 占用', !/^data:/.test(App.state.dishes[6].img));

  section('3. 筛选 / 搜索');
  click(d.querySelector('#catChips .cat-chip[data-cat="家常菜"]'));
  ok('按类别筛选只剩 1 张', d.querySelectorAll('#grid .card').length === 1, String(d.querySelectorAll('#grid .card').length));
  click(d.querySelector('#catChips .cat-chip[data-cat="ALL"]'));
  input(d.getElementById('searchInput'), '拉面');
  ok('搜索“拉面”命中 1 道', App.visibleDishes().length === 1 && App.visibleDishes()[0].name === '日式拉面');
  input(d.getElementById('searchInput'), 'zzz');
  ok('无匹配时给出提示文案', d.querySelector('#grid').textContent.indexOf('没有匹配的食物') > -1);
  input(d.getElementById('searchInput'), '');
  ok('清空搜索恢复 7 道', App.visibleDishes().length === 7);

  section('4. 随机抽取逻辑（不靠运气也能验）');
  // 反复抽 400 次：必须都在清单内、绝不出现被排除项
  const ids = new Set(App.state.dishes.map(x => x.id));
  let allInList = true, allNotExcluded = true;
  App.setExcluded([App.state.dishes[0].id]);
  for (let i = 0; i < 400; i++) {
    const p = App.pickRandom();
    if (!p || !ids.has(p.id)) allInList = false;
    if (p && p.id === App.state.dishes[0].id) allNotExcluded = false;
  }
  ok('抽取结果始终来自清单', allInList);
  ok('已排除的菜不会被抽到', allNotExcluded);
  App.setExcluded([]);

  // 最近 3 次抽到过的降权：把其余全部排除，只剩 2 道，其中 1 道在历史里
  const a = App.state.dishes[1], b = App.state.dishes[2];
  App.setExcluded(App.state.dishes.filter(x => x !== a && x !== b).map(x => x.id));
  App.state.history = [{ id: a.id, name: a.name, t: Date.now() }];
  let hitsB = 0;
  for (let i = 0; i < 200; i++) if (App.pickRandom().id === b.id) hitsB++;
  ok('近期抽到过的菜被降权（优先没抽过的）', hitsB === 200, 'b 命中 ' + hitsB + '/200');
  App.setExcluded([]);
  App.state.history = [];

  section('5. 存储计量 & 数据清洗');
  ok('storageBytes 返回正数', App.storageBytes() > 0);
  ok('用量文案已渲染', /本地已用/.test(d.getElementById('storageText').textContent));
  ok('fmtSize 换算正确', App.fmtSize(2048) === '2.0 KB' && App.fmtSize(3 * 1024 * 1024) === '3.00 MB', App.fmtSize(2048));
  ok('清洗丢弃无菜名的脏数据', App.sanitizeDish({ name: '' }) === null && App.sanitizeDish(null) === null);
  const cleaned = App.sanitizeDish({ id: 'x', name: ' 测试 ', category: '' });
  ok('缺类别时兜底为“其他”', cleaned.category === '其他');
  ok('色相哈希稳定', App.hueOf('番茄炒蛋') === App.hueOf('番茄炒蛋') && App.hueOf('a') !== App.hueOf('b'));

  section('6. 抽取动画：转盘滚动 → 减速停住 → 结果大卡片');
  const beforeHist = App.state.history.length;
  click(d.getElementById('rollBtn'));
  ok('动画期间按钮禁用', d.getElementById('rollBtn').disabled === true);
  ok('转盘已显示并铺好行', !d.getElementById('wheelWrap').classList.contains('hidden') &&
     d.querySelectorAll('#wheel .wheel-row').length >= 4, String(d.querySelectorAll('#wheel .wheel-row').length));
  ok('不是瞬间出结果（此刻还没结果）', d.getElementById('result').classList.contains('hidden'));
  await sleep(4200);
  ok('动画结束后结果大字卡出现', !d.getElementById('result').classList.contains('hidden') &&
     d.getElementById('result').classList.contains('show'));
  const pickedName = d.getElementById('resultName').textContent;
  ok('结果卡有菜名', pickedName && pickedName !== '—', pickedName);
  ok('结果卡有类别', !!d.getElementById('resultCat').textContent && d.getElementById('resultCat').textContent !== '—');
  ok('结果卡有图片地址（无图时改用色块兜底）',
     !!d.getElementById('resultImg').getAttribute('src') ||
     !d.getElementById('resultFallback').classList.contains('hidden'));
  ok('结果 id 已记录到 dataset（供「换一批」用）', !!d.getElementById('result').dataset.currentId);
  ok('按钮恢复可用', d.getElementById('rollBtn').disabled === false);
  ok('转盘已收起', d.getElementById('wheelWrap').classList.contains('hidden'));
  ok('历史记录 +1', App.state.history.length === beforeHist + 1, String(App.state.history.length));
  ok('历史首条就是刚抽到的', App.state.history[0].name === pickedName);
  ok('历史已渲染成卡片', d.querySelectorAll('#history .hist-item').length === App.state.history.length);
  ok('历史落盘', JSON.parse(w.localStorage.getItem('rmce.history.v1')).length === App.state.history.length);

  section('7. 换一批：当前这道被临时排除 + 立刻重抽');
  const justPicked = d.getElementById('result').dataset.currentId;
  const totalNow = App.state.dishes.length;
  click(d.getElementById('swapBtn'));
  ok('当前这道进入排除列表', App.state.excluded.indexOf(justPicked) > -1);
  ok('排除提示条已显示', !d.getElementById('excludedBar').classList.contains('hidden'));
  ok('排除条有可恢复的 chip', d.querySelectorAll('#excludedList .chip').length === 1);
  ok('可选数量减 1', d.getElementById('poolCounter').textContent.indexOf('可选 ' + (totalNow - 1)) > -1,
     d.getElementById('poolCounter').textContent);
  await sleep(4200);
  ok('换一批后抽到的是别的菜', d.getElementById('result').dataset.currentId !== justPicked);
  ok('排除项从未被抽中', d.getElementById('result').dataset.currentId !== justPicked);

  // 恢复全部
  click(d.getElementById('restoreAll'));
  ok('全部恢复后排除列表清空', App.state.excluded.length === 0 &&
     d.getElementById('excludedBar').classList.contains('hidden'));

  section('8. 历史去重（连续抽到同一道只记一条）');
  const rid = App.state.dishes[3];
  App.state.history = [{ id: rid.id, name: rid.name, category: rid.category, img: '', t: Date.now() }];
  const hLen = App.state.history.length;
  App.state.excluded = App.state.dishes.filter(x => x.id !== rid.id).map(x => x.id);
  App.save();
  click(d.getElementById('rollBtn'));
  await sleep(3000);
  ok('只剩一道时连抽不重复记历史', App.state.history.length === hLen, '实际 ' + App.state.history.length);
  App.setExcluded([]);

  section('9. 导入 / 导出');
  const payload = JSON.stringify({
    app: '随机吃什么', version: 1,
    dishes: [{ id: 'imp-1', name: '导入的咖喱饭', category: '家常菜', img: 'https://example.com/c.jpg' },
             { id: 'preset-ramen', name: '日式拉面', category: '面食' }],
    history: []
  });
  const countBefore = App.state.dishes.length;
  App.importJSON(payload);
  await sleep(60);
  ok('导入前弹出确认', !d.getElementById('confirmModal').classList.contains('hidden'));
  click(d.getElementById('cfYes'));
  await sleep(80);
  ok('确认弹窗已关闭', d.getElementById('confirmModal').classList.contains('hidden'));
  ok('新增 1 道（同 ID 的拉面被跳过）', App.state.dishes.length === countBefore + 1,
     countBefore + ' → ' + App.state.dishes.length);
  ok('导入的菜名正确', !!App.state.dishes.find(x => x.name === '导入的咖喱饭'));
  ok('导入项不再标记为示例', App.state.dishes.find(x => x.name === '导入的咖喱饭').preset === false);
  App.importJSON('{ 坏掉的 json');
  await sleep(50);
  ok('坏文件不弹确认、不破坏清单', d.getElementById('confirmModal').classList.contains('hidden') &&
     App.state.dishes.length === countBefore + 1);
  App.importJSON(JSON.stringify({ foo: 1 }));
  await sleep(50);
  ok('没有清单字段的文件被拒绝', App.state.dishes.length === countBefore + 1);

  section('10. 删除 & 清空（含确认流程）');
  const delTarget = App.state.dishes.find(x => x.name === '导入的咖喱饭');
  const delBtn = d.querySelector('#grid .card[data-id="' + delTarget.id + '"] .card-del');
  ok('卡片上有删除按钮', !!delBtn);
  click(delBtn);
  await sleep(40);
  ok('删除前先确认', !d.getElementById('confirmModal').classList.contains('hidden'));
  ok('确认文案带菜名', d.getElementById('cfMsg').textContent.indexOf('咖喱饭') > -1 ||
     d.getElementById('cfTitle').textContent.indexOf('咖喱饭') > -1);
  click(d.getElementById('cfNo'));
  await sleep(40);
  ok('取消后不删除', !!App.state.dishes.find(x => x.name === '导入的咖喱饭'));
  click(delBtn); await sleep(40); click(d.getElementById('cfYes')); await sleep(40);
  ok('确认后删除成功', !App.state.dishes.find(x => x.name === '导入的咖喱饭'));
  ok('删除已落盘', JSON.parse(w.localStorage.getItem('rmce.dishes.v1')).length === App.state.dishes.length);

  section('11. 主题切换');
  const t0 = d.documentElement.getAttribute('data-theme');
  click(d.getElementById('themeBtn'));
  const t1 = d.documentElement.getAttribute('data-theme');
  ok('主题发生切换', t0 !== t1, t0 + ' → ' + t1);
  ok('主题已落盘', w.localStorage.getItem('rmce.theme.v1') === t1);
  ok('深浅图标同步', d.getElementById('themeBtn').textContent === (t1 === 'dark' ? '☀️' : '🌙'));
  click(d.getElementById('themeBtn'));

  section('12. 刷新不丢（模拟重新加载）');
  const disk = w.localStorage.getItem('rmce.dishes.v1');
  const dom2 = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: vc, beforeParse(w2) { w2.localStorage.setItem('rmce.dishes.v1', disk); }
  });
  await sleep(150);
  ok('二次打开读取磁盘清单而非重置示例菜',
     dom2.window.__RMCE__.state.dishes.length === JSON.parse(disk).length,
     '实际 ' + dom2.window.__RMCE__.state.dishes.length);
  ok('删除过的菜没有复活', !dom2.window.__RMCE__.state.dishes.find(x => x.name === '导入的咖喱饭'));
  dom2.window.close();

  section('13. 边界：清单清空后的空状态');
  click(d.getElementById('clearBtn'));
  await sleep(40);
  click(d.getElementById('cfYes'));
  await sleep(60);
  ok('清单被清空', App.state.dishes.length === 0);
  ok('显示空状态引导', !d.getElementById('empty').classList.contains('hidden'));
  ok('空状态含教学步骤', d.querySelectorAll('#empty .step').length === 3);
  ok('抽取按钮仍可点（点了给提示，不做一个死按钮）', d.getElementById('rollBtn').disabled === false);
  ok('可选数量为 0', d.getElementById('poolCounter').textContent.indexOf('可选 0') > -1);
  ok('清空后旧的结果卡被收起', d.getElementById('result').classList.contains('hidden'));
  click(d.getElementById('rollBtn'));
  await sleep(80);
  ok('空清单点抽取给出提示', d.getElementById('toastWrap').textContent.indexOf('空的') > -1,
     d.getElementById('toastWrap').textContent);
  ok('空清单不会进入动画', d.getElementById('wheelWrap').classList.contains('hidden') &&
     d.getElementById('result').classList.contains('hidden'));
  click(d.getElementById('restorePresets'));
  await sleep(60);
  ok('可一键恢复 5 道示例菜', App.state.dishes.length === 5 && App.state.dishes.every(x => x.preset));

  section('14. 本地图片上传：前置校验分支（jsdom 无渲染，只验拦截逻辑）');
  const badType = await App.processImage({ type: 'text/plain', size: 10 }).then(() => null, e => e);
  ok('非图片文件被拒绝', badType && /图片文件/.test(badType.message), badType && badType.message);
  const tooBig = await App.processImage({ type: 'image/png', size: 11 * 1024 * 1024 }).then(() => null, e => e);
  ok('超过 10MB 的图被拒绝', tooBig && /太大/.test(tooBig.message), tooBig && tooBig.message);
  ok('空文件被拒绝', await App.processImage(null).then(() => false, () => true));

  section('15. 样式表解析');
  ok('CSS 无解析报错', cssIssues.length === 0, cssIssues.slice(0, 2).join(' | '));

  finish();
})().catch(e => { console.error('测试脚本自身异常：', e); finish(); });

function finish() {
  console.log('\n================ 结果 ================');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (failures.length) { console.log('\n失败清单：'); failures.forEach(f => console.log('  - ' + f)); }
  try { dom.window.close(); } catch (e) {}
  process.exit(fail ? 1 : 0);
}
