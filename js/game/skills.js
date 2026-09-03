// skills.js — 《梗灵大陆》角色技能实现
// castSkill(char, ctx)：ctx = { board, battle, rng, events: [] }
// 只通过 board 的原子操作（clearCells/clearRow/clearCol/clearArea/convertColor/shuffleAll/randomCells）
// 产生事件并追加到 ctx.events；技能伤害通过 battle.damageEnemy 回调结算。
// board 由外部注入（Battle 持有），本模块不 import core 目录，便于用 stub board 测试。

const ROWS = 8, COLS = 8;

function inBoard(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

/** 从 board.grid 统计各颜色数量，返回最多的颜色（board 无 grid 时返回 null） */
function dominantColor(board) {
  if (!board || !board.grid) return null;
  const counts = {};
  for (const row of board.grid) {
    for (const cell of row) {
      if (cell && typeof cell.color === 'number') counts[cell.color] = (counts[cell.color] || 0) + 1;
    }
  }
  let best = null, bestN = -1;
  for (const k of Object.keys(counts)) {
    if (counts[k] > bestN) { best = Number(k); bestN = counts[k]; }
  }
  return best;
}

/** 全场某颜色的所有格子（依赖 board.grid；无 grid 时退化为 randomCells） */
function cellsOfColor(board, color, rng) {
  const out = [];
  if (board && board.grid) {
    for (let r = 0; r < board.grid.length; r++) {
      const row = board.grid[r];
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (cell && cell.color === color) out.push({ r, c });
      }
    }
    return out;
  }
  return board.randomCells(8);
}

export function castSkill(char, ctx) {
  const board = ctx.board;
  const battle = ctx.battle || null;
  const rng = ctx.rng || { next: Math.random, int: n => Math.floor(Math.random() * n) };
  const events = ctx.events || [];
  // board 原子操作返回 MoveResult {events:[...]} 或事件数组，统一展平
  // V5：同时累计 score/matchedCounts，让技能/转盘清除的方块计入关卡目标进度
  const push = (evs) => {
    const mr = Array.isArray(evs) ? { events: evs } : evs;
    if (mr && Array.isArray(mr.events)) events.push(...mr.events);
    if (mr) {
      ctx.score = (ctx.score || 0) + (mr.score || 0);
      ctx.matchedCounts = ctx.matchedCounts || {};
      for (const [k, v] of Object.entries(mr.matchedCounts || {})) {
        ctx.matchedCounts[k] = (ctx.matchedCounts[k] || 0) + v;
      }
    }
  };

  // 兼容传 skill 对象本身
  const skill = char.skill || char;
  const maxLv = (char.skillLv || 1) >= 10; // 技能满级（10 级）解锁强化效果
  const result = { effect: skill.effect, damage: 0, wheel: null, events };

  // 技能伤害：出技能者 ATK × dmgMult（怒吼王权共鸣 +50%）
  const deal = (mult) => {
    if (!mult || mult <= 0) return 0;
    let dmg = Math.round((char.atk || 0) * mult);
    if (battle && battle.hasResonance && battle.hasResonance('roarkingship')) {
      dmg = Math.round(dmg * 1.5);
    }
    if (battle && battle.damageEnemy) battle.damageEnemy(dmg, char);
    result.damage += dmg;
    return dmg;
  };

  switch (skill.effect) {
    case 'clearRow': { // 哈基喵 / 小牛：整行消除
      const row = (ctx.row != null) ? ctx.row : rng.int(ROWS);
      push(board.clearRow(row));
      if (maxLv) { // 满级：额外清除上下相邻行各 1 格
        const col = rng.int(COLS);
        const extra = [row - 1, row + 1].filter(r => inBoard(r, col)).map(r => ({ r, c: col }));
        if (extra.length) push(board.clearCells(extra));
      }
      deal(skill.dmgMult);
      break;
    }

    case 'clearCol': { // 飞天侠：整列消除
      const col = (ctx.col != null) ? ctx.col : rng.int(COLS);
      push(board.clearCol(col));
      if (maxLv) { // 满级：左右相邻列各 1 格
        const row = rng.int(ROWS);
        const extra = [col - 1, col + 1].filter(c => inBoard(row, c)).map(c => ({ r: row, c }));
        if (extra.length) push(board.clearCells(extra));
      }
      deal(skill.dmgMult);
      break;
    }

    case 'clearArea2': { // 大狗旺：棋盘中心 3×3（满级 5×5）
      const rad = maxLv ? 2 : 1;
      push(board.clearArea(4, 4, rad));
      deal(skill.dmgMult);
      break;
    }

    case 'randomClear': { // 自封之王：随机消除 n 个方块
      const n = maxLv ? (skill.maxCount || skill.count || 8) : (skill.count || 8);
      const cells = board.randomCells(n);
      push(board.clearCells(cells));
      deal(skill.dmgMult);
      break;
    }

    case 'convertColor': { // 面师傅：全场变同色（持续回合记录到 battle.state.convert）
      const from = rng.int(7);
      let to = rng.int(7);
      if (to === from) to = (to + 1) % 7;
      push(board.convertColor(from, to));
      if (battle && battle.state) {
        battle.state.convert = { color: to, turns: maxLv ? (skill.maxDuration || 3) : (skill.duration || 2) };
      }
      deal(skill.dmgMult);
      break;
    }

    case 'random': { // 转转君：命运转盘
      const wheel = skill.wheel || [];
      const byKey = (k) => wheel.find(w => w.key === k) || null;
      let opt = null;
      const roll = rng.next();
      const forceLucky = battle && battle.hasResonance && battle.hasResonance('skybet'); // 天上赌局：必大吉

      if (maxLv && !forceLucky && skill.maxWheel && roll < skill.maxWheel.p) {
        // 超级大吉：清除全场，秒杀非 Boss 敌人
        opt = skill.maxWheel;
        result.wheel = opt.key;
        const all = [];
        if (board && board.grid) {
          for (let r = 0; r < board.grid.length; r++) {
            for (let c = 0; c < board.grid[r].length; c++) all.push({ r, c });
          }
        } else {
          all.push(...board.randomCells(64));
        }
        push(board.clearCells(all));
        if (battle && battle.currentTarget) {
          const t = battle.currentTarget();
          if (t && !t.boss) battle.damageEnemy(t.hp, char); // 秒杀非 Boss
        }
      } else {
        // 普通/强制大吉：按 25/25/25/25 分支
        if (forceLucky) {
          opt = byKey('大吉');
        } else if (roll < 0.25) {
          opt = byKey('大吉');
        } else if (roll < 0.50) {
          opt = byKey('小吉');
        } else if (roll < 0.75) {
          opt = byKey('大凶');
        } else {
          opt = byKey('逆转');
        }
        result.wheel = opt ? opt.key : null;
        const action = opt ? opt.action : 'none';
        switch (action) {
          case 'sameColorBlast': { // 大吉：清除全部同色方块
            const color = dominantColor(board);
            const cells = cellsOfColor(board, color != null ? color : rng.int(7), rng);
            if (cells.length) push(board.clearCells(cells));
            deal(opt.dmgMult);
            break;
          }
          case 'clearArea5': { // 小吉：随机 5×5
            const r = 2 + rng.int(4), c = 2 + rng.int(4);
            push(board.clearArea(r, c, 2));
            deal(opt.dmgMult);
            break;
          }
          case 'shuffle': { // 逆转：打乱棋盘
            push(board.shuffleAll());
            break;
          }
          case 'none': // 大凶：啥也没发生
          default:
            break;
        }
      }
      break;
    }

    default: {
      // 未知 effect：仅按 dmgMult 结算伤害
      deal(skill.dmgMult || 0);
      break;
    }
  }

  return result;
}
