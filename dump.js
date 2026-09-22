"use strict";
// Dump — окно максимального дампа персонажей аккаунта в JSON, кнопка Dump сверху.
//
//   load_code('dump');   // main.ts, только при game.graphics
//
//   dump_toggle()   — то же, что кнопка
//   dump_show()
//   dump_hide()
//   dump_collect()      — собрать свой аккаунт, промис с результатом
//   dump_collect_all()  — свой аккаунт + запрос дампов у пиров по cm
//   dump_request(name)  — спросить одного персонажа из пати
//   dump_party()        — кого видим в пати, кто ответил, у кого будем просить
//   dump_last()         — свой дамп (он же parent.LAST_DUMP)
//   dump_merged()       — объединённый дамп (он же parent.LAST_DUMP_ALL)
//
// Зачем: снять с живого сервера всё, что клиент вообще знает о персонажах, и
// перенести их на тестовый сервер (adventureland_mongodb, /executor) как можно
// точнее. Поэтому в JSON кладутся два слоя на каждого персонажа:
//   • raw      — объект character ЦЕЛИКОМ (всё, что прислал сервер в
//                player_to_client для себя: статы, items[42], slots, cx, s, q,
//                acx/xcx, home, cash, gold, xp, ...), без функций, DOM и сокетов;
//   • transfer — компактная выжимка тех же данных в порядке полей движка, чтобы
//                скрипт импорта не копался в raw.
// Кроме того: roster (parent.X.characters — все персонажи аккаунта, включая
// оффлайн, но у оффлайновых сервер отдаёт только name/level/type/map/x/y),
// bank (общий на аккаунт: живой, пока кто-то стоит в bank/bank_b/bank_u, иначе
// кэш bank_items / game_state.bank_items, как в gui/bank_view.ts, с пометкой source),
// friends, achievements — ОДИН блок на аккаунт: ступени открываются по
// max(лучший личный Score, Max Score аккаунта), поэтому разбор общий. Внутри
// account_max, сырые счётчики каждого ответившего персонажа (characters) для
// импорта и by_monster как карточка монстра в предмете tracker: Count, Score,
// Max Score с владельцем, ВСЕ ступени с состоянием done/left/pct и личные
// Count/Score. Трекер спрашиваем ОДИН раз на аккаунт: max_stats приходит целиком
// кому угодно, так что хватает одного tracker/supercomputer в одной сумке. Запрос
// открывает окно трекера у этого персонажа, если он в UI-режиме.
//
// Полный character есть только у ЗАПУЩЕННЫХ персонажей. Хочешь всех — запусти
// всех (можно в [CODE] режиме): сборщик сам обходит iframe'ы ichar<имя> в
// главном окне. Сборка идёт с любого персонажа, у которого есть графика.
//
// Три аккаунта: у каждого свои куки, поэтому в одном окне их не открыть и чужие
// iframe'ы не видны. Дампы соседних аккаунтов приходят по cm через игровой сервер,
// нарезанные на куски (подробности и лимиты движка — в регионе обмена ниже).
// Кого спрашивать, берём из ПАТИ: имена вписывать не надо. Персонажи своего
// аккаунта отсеиваются по ростеру, на каждый чужой аккаунт запрашивается один
// персонаж. Дамп отдаётся только своим или тем, кто сейчас в пати, иначе его мог
// бы вытянуть любой игрок, знающий протокол.
// Объединённый дамп кладёт аккаунты в accounts[]: у каждого свой ростер, банк и
// достижения, потому что это величины аккаунта, а не персонажа.
//
// Самостоятельный файл: без modal-template.
(function () {
    const p = parent;
    const w = window;
    w.dump_loaded = true; // ленивый загрузчик проверяет, что слот поднялся
    const MODAL_ID = 'dumpModal';
    const BUTTON_KEY = 'dmp'; // короткий, латиницей: станет классом codebuttondmp
    const BUTTON_LABEL = 'Dump';
    const ACCENT = '#F97316';
    const ACCENT_RGBA = 'rgba(249, 115, 22, 0.5)';
    const UPDATE_MS = 1000;
    const TRACKER_TIMEOUT_MS = 8000;
    const SNAP_DEPTH = 12;
    // #region данные
    // Ключи character, которые не имеют смысла в дампе или тянут за собой пол-движка.
    const SKIP_KEYS = {
        socket: 1, parent: 1, document: 1, window: 1, G: 1, S: 1, X: 1,
        entities: 1, tracker: 1, ctx: 1,
        bank: 1, user: 1, // банк выносим на верхний уровень, чтобы не дублировать
    };
    // Ключи, которые нельзя показывать в JSON, который потом куда-то копируют.
    const SECRET_KEYS = { secret: 1, auth: 1, token: 1, cookie: 1, password: 1, ipass: 1 };
    const opts = { achievements: true, bank: true, secrets: false, sparse_bank: false };
    let last = null; // последний собранный дамп своего аккаунта
    let merged = null; // объединённый дамп нескольких аккаунтов (есть, когда ответили пиры)
    let merged_size = 0;
    let last_rows = []; // сводка для таблицы
    let last_size = 0; // байт JSON
    let collecting = false;
    let collect_started = 0;
    let status = 'нажми «Собрать»';
    function log(text, fn, type = 'info') {
        if (typeof w.event_log_push === 'function') {
            try {
                w.event_log_push(text, fn, type);
            }
            catch (e) { }
        }
    }
    // Безопасный снимок: без функций, без DOM/PIXI/socket.io, без циклов.
    // instanceof через realm-границу не работает, поэтому Object.prototype.toString.
    function snap(v, depth, seen) {
        if (v === null || v === undefined)
            return null;
        const t = typeof v;
        if (t === 'number')
            return isFinite(v) ? v : String(v);
        if (t === 'string' || t === 'boolean')
            return v;
        if (t === 'function')
            return undefined;
        if (t !== 'object')
            return String(v);
        const tag = Object.prototype.toString.call(v);
        if (tag === '[object Date]')
            return v.toISOString();
        if (depth <= 0)
            return '[depth-limit]';
        if (seen.indexOf(v) !== -1)
            return '[circular]';
        seen.push(v);
        let out;
        try {
            if (Array.isArray(v)) {
                out = [];
                for (let i = 0; i < v.length; i++) {
                    const e = snap(v[i], depth - 1, seen);
                    out.push(e === undefined ? null : e);
                }
            }
            else {
                let ctor = '';
                try {
                    ctor = (v.constructor && v.constructor.name) || '';
                }
                catch (e) { }
                // всё, что не голый Object — это спрайт/сокет/jQuery/Map и т.п.
                if (ctor && ctor !== 'Object')
                    return '[' + ctor + ']';
                out = {};
                for (const k in v) {
                    if (SKIP_KEYS[k])
                        continue;
                    if (!opts.secrets && SECRET_KEYS[k]) {
                        out[k] = '[redacted]';
                        continue;
                    }
                    let val;
                    try {
                        val = v[k];
                    }
                    catch (e) {
                        val = '[getter threw: ' + e.message + ']';
                    }
                    const s = snap(val, depth - 1, seen);
                    if (s !== undefined)
                        out[k] = s;
                }
            }
        }
        finally {
            seen.pop();
        }
        return out;
    }
    // character в клиенте — PIXI-спрайт (js/game.js add_character: new_sprite +
    // adopt_soft_properties(data)), поэтому обычный snap отбросил бы его целиком как
    // «не голый Object». У корня берём только собственные ключи, выкидываем служебные
    // поля спрайта и всё, что свернулось в "[Ctor]" (текстуры, дети, анимации).
    // x/y у PIXI это геттеры на прототипе — читаем их явно.
    const SPRITE_KEYS = {
        children: 1, transform: 1, filters: 1, filterArea: 1, hitArea: 1, mask: 1, anchor: 1, scale: 1,
        position: 1, pivot: 1, skew: 1, texture: 1, tint: 1, blendMode: 1, shader: 1, pluginName: 1,
        vertexData: 1, uvs: 1, indices: 1, roundPixels: 1, isSprite: 1, isMask: 1, cursor: 1,
        interactive: 1, interactiveChildren: 1, buttonMode: 1, tempDisplayObjectParent: 1, sortDirty: 1,
        sortableChildren: 1, worldAlpha: 1, alpha: 1, visible: 1, renderable: 1, cacheAsBitmap: 1,
        parentGroup: 1, displayGroup: 1, animations: 1, fx: 1, emblems: 1, base: 1, walking: 1,
        real_alpha: 1, last_ms: 1, me: 1, cscale: 1, zIndex: 1, textures: 1, ping: 1,
        // клиентские довески, найденные в реальном дампе [19/09/26]: кэш косметики, фильтры,
        // текст подсказки, кэш ярлыка имени, счётчики отрисовки и интерполяции
        cxc: 1, filter_list: 1, explanation: 1, ntag_cache: 1, pixel_name_font: 1, updates: 1,
        cachedTint: 1, vertexTrimmedData: 1, width: 1, height: 1, awidth: 1, aheight: 1,
        updateOrder: 1, zOrder: 1, displayOrder: 1, i: 1, j: 1, stype: 1, cskin: 1,
        ref_speed: 1, vx: 1, vy: 1, from_x: 1, from_y: 1, real_x: 1, real_y: 1,
    };
    function snap_character(v) {
        if (!v || typeof v !== 'object')
            return null;
        const out = {};
        let keys = [];
        try {
            keys = Object.keys(v);
        }
        catch (e) {
            return '[keys failed: ' + e.message + ']';
        }
        let dropped = 0;
        for (const k of keys) {
            if (SKIP_KEYS[k] || SPRITE_KEYS[k] || k.charAt(0) === '_')
                continue;
            if (!opts.secrets && SECRET_KEYS[k]) {
                out[k] = '[redacted]';
                continue;
            }
            let val;
            try {
                val = v[k];
            }
            catch (e) {
                continue;
            }
            if (typeof val === 'function')
                continue;
            const sn = snap(val, SNAP_DEPTH - 1, [v]);
            if (sn === undefined)
                continue;
            // вложенный спрайт/текстура/сокет свернулся в "[Ctor]" — это не данные персонажа
            if (val && typeof val === 'object' && typeof sn === 'string' && sn.charAt(0) === '[') {
                dropped++;
                continue;
            }
            out[k] = sn;
        }
        if (typeof v.x === 'number')
            out.x = v.real_x !== undefined ? v.real_x : v.x;
        if (typeof v.y === 'number')
            out.y = v.real_y !== undefined ? v.real_y : v.y;
        out.__dump = { own_keys: keys.length, kept: Object.keys(out).length - 1, dropped_objects: dropped };
        return out;
    }
    // Верхнее игровое окно: у второстепенных персонажей parent — их собственное
    // окно-iframe, а список всех iframe'ов живёт в главном (js/functions.js:1740).
    function root_window() {
        let win = p;
        let guard = 0;
        try {
            while (win.parent && win.parent !== win && win.parent.X && guard++ < 10)
                win = win.parent;
        }
        catch (e) { }
        return win;
    }
    // Все окна с живым персонажем: главное + каждый ichar<name> iframe.
    function game_windows(root) {
        const list = [];
        const seen = {};
        const add = (win, via) => {
            try {
                if (!win || !win.character || !win.character.name)
                    return;
                if (seen[win.character.name])
                    return;
                seen[win.character.name] = 1;
                list.push({ name: win.character.name, win, via });
            }
            catch (e) { } // cross-origin / ещё не загрузился
        };
        add(root, 'main');
        let frames = [];
        try {
            frames = root.document.getElementsByTagName('iframe');
        }
        catch (e) { }
        for (let i = 0; i < frames.length; i++) {
            let win = null;
            try {
                win = frames[i].contentWindow;
            }
            catch (e) {
                continue;
            }
            add(win, frames[i].id || 'iframe' + i);
        }
        return list;
    }
    function has_tracker(win) {
        let items = [];
        try {
            items = win.character.items || [];
        }
        catch (e) { }
        return items.some(it => it && (it.name === 'tracker' || it.name === 'supercomputer'));
    }
    // Трекер отдаёт ещё и таблицы дропа — они не нужны, берём только счётчики.
    // Побочка: клиент этого персонажа откроет своё окно трекера (js/game.js:3093).
    function fetch_tracker(win, ms) {
        return new Promise(resolve => {
            if (!has_tracker(win))
                return resolve({ ok: false, reason: 'нет tracker/supercomputer в сумке' });
            let done = false;
            const fin = (r) => { if (!done) {
                done = true;
                resolve(r);
            } };
            try {
                win.socket.once('tracker', (d) => fin({
                    ok: true,
                    monsters: d.monsters || {},
                    monsters_diff: d.monsters_diff || {},
                    exchanges: d.exchanges || {},
                    max: (d.max && { monsters: d.max.monsters || {} }) || {},
                }));
                win.socket.emit('tracker');
            }
            catch (e) {
                return fin({ ok: false, reason: 'socket: ' + e.message });
            }
            setTimeout(() => fin({ ok: false, reason: 'timeout ' + ms + 'ms' }), ms);
        });
    }
    // Трекер нужен ОДИН на аккаунт: ступени считаются от max_stats аккаунта, а его
    // сервер кладёт в ответ целиком, кому бы ни ответил (node/server.js:5199).
    // Поэтому спрашиваем первого персонажа с tracker/supercomputer в сумке и
    // переходим к следующему, только если он не ответил. Лишние запросы ничего не
    // добавляют, зато открывают окно трекера и тратят вызовы [22/09/26].
    function fetch_tracker_once(wins) {
        const holders = wins.filter(gw => has_tracker(gw.win));
        if (!holders.length)
            return Promise.resolve(null);
        let i = 0;
        const next = () => {
            if (i >= holders.length)
                return Promise.resolve(null);
            const gw = holders[i++];
            return fetch_tracker(gw.win, TRACKER_TIMEOUT_MS).then(tr => {
                if (tr.ok) {
                    log(`достижения взяты у ${gw.name} (трекеров в сумках: ${holders.length})`, 'dump_tracker');
                    return { name: gw.name, tr };
                }
                log(`трекер у ${gw.name} не ответил: ${tr.reason}${i < holders.length ? ' — пробуем следующего' : ''}`, 'dump_tracker', 'warning');
                return next();
            });
        };
        return next();
    }
    // Достижения одни на весь аккаунт: ступень открыта, когда max(лучший Score
    // среди своих персонажей, Max Score аккаунта) ≥ порог (node/server.js:1339),
    // поэтому разбор делается один раз по всем ответившим трекерам. Как карточка
    // монстра в предмете tracker (js/html.js render_monster_info + render_item):
    // Count = kills, Score = kills + monsters_diff (diff копит score − 1 за
    // убийство), Max Score = рекорд аккаунта с владельцем. Перечисляются все
    // монстры из списка трекера, у каждого ВСЕ ступени с текущим состоянием и
    // личные Count/Score каждого персонажа.
    function achievements_account(trackers) {
        const ok = trackers.filter(t => t.tr && t.tr.ok);
        if (!ok.length)
            return null;
        const best = (ok[0].tr.max && ok[0].tr.max.monsters) || {}; // max одинаков у всех, берём первый
        const GD = (typeof G !== 'undefined' && G) || p.G;
        const out = {
            source: ok.map(t => t.name),
            account_max: best,
            characters: {},
            by_monster: [],
            bonus: {},
            totals: {},
        };
        // сырые счётчики того, кто ответил: у остальных персонажей они свои, но на
        // ступени не влияют — там решает max_stats аккаунта
        for (const t of ok)
            out.characters[t.name] = { monsters: t.tr.monsters, monsters_diff: t.tr.monsters_diff, exchanges: t.tr.exchanges };
        let sum_kills = 0, sum_counted = 0, earned_tiers = 0, total_tiers = 0, with_progress = 0;
        for (const mtype in GD.monsters) {
            const def = GD.monsters[mtype];
            if ((def.cute && !def.achievements) || def.unlist)
                continue; // тот же фильтр, что у трекера
            const by_character = {};
            let kills = 0, score = 0, score_owner = null;
            for (const t of ok) {
                const c = t.tr.monsters[mtype] || 0;
                const sc = c + (t.tr.monsters_diff[mtype] || 0);
                if (!c && !sc)
                    continue;
                by_character[t.name] = { count: c, score: +sc.toFixed(2) };
                kills += c;
                if (sc > score) {
                    score = sc;
                    score_owner = t.name;
                }
            }
            const mrec = best[mtype] || [0, ''];
            const max_score = mrec[0] || 0;
            const counted = Math.max(score, max_score);
            const defs = def.achievements || [];
            if (!counted && !defs.length)
                continue;
            if (counted)
                with_progress++;
            const levels = [];
            let next = null;
            for (const d of defs) {
                const done = counted >= d[0];
                const lv = {
                    at: d[0], type: d[1], stat: d[2], value: d[3], done,
                    left: done ? 0 : Math.round(d[0] - counted),
                    pct: done ? 100 : +(100 * counted / d[0]).toFixed(2),
                };
                levels.push(lv);
                total_tiers++;
                if (done) {
                    earned_tiers++;
                    if (d[1] === 'stat')
                        out.bonus[d[2]] = (out.bonus[d[2]] || 0) + d[3];
                }
                else if (!next)
                    next = lv;
            }
            sum_kills += kills;
            sum_counted += counted;
            out.by_monster.push({
                mtype,
                name: def.name,
                kills, // трупов у того, кто отдал трекер
                score: +score.toFixed(2), // его Score = kills + monsters_diff
                score_owner,
                max_score, // Max Score аккаунта (с сервера)
                max_owner: mrec[1] || null,
                counted: +counted.toFixed(2), // max(score, max_score) — по нему ступени
                earned: levels.filter(l => l.done).length,
                total: levels.length,
                next,
                levels,
                by_character,
            });
        }
        out.by_monster.sort((x, y) => y.counted - x.counted || x.mtype.localeCompare(y.mtype));
        out.totals = {
            monster_types: out.by_monster.length,
            with_progress,
            kills: sum_kills,
            counted: Math.round(sum_counted),
            earned_tiers,
            total_tiers,
            note: 'counted = max(лучший личный kills + monsters_diff, max_score аккаунта); monsters_diff копит (score-1) за убийство',
        };
        return out;
    }
    // Банк по убыванию свежести, как в gui/bank_view.ts:
    //   1. character.bank любого запущенного окна — персонаж стоит в банке (live);
    //   2. bank_items / bank_items_ts — снимок в памяти этого персонажа (configuration.ts);
    //   3. get("game_state").bank_items — общий кэш аккаунта в localStorage, его пишет main.ts.
    // Кэш — копия character.bank (gold + items0..items47), поэтому формат один.
    function bank_source(wins) {
        for (const gw of wins) {
            let b = null;
            try {
                b = gw.win.character.bank;
            }
            catch (e) { }
            if (b)
                return { bank: b, source: 'live', by: gw.name, ts: Date.now() };
        }
        let mem = null;
        if (w.bank_items)
            mem = { bank: w.bank_items, source: 'memory', by: character.name, ts: w.bank_items_ts || 0 };
        let stored = null;
        try {
            const gs = get('game_state');
            if (gs && gs.bank_items)
                stored = { bank: gs.bank_items, source: 'storage', by: gs.bank_items_by || '?', ts: gs.bank_items_ts || 0 };
        }
        catch (e) { }
        if (mem && stored)
            return mem.ts >= stored.ts ? mem : stored;
        return mem || stored || null;
    }
    function grab_bank(wins) {
        const src = bank_source(wins);
        if (!src) {
            log('bank: ни live, ни memory, ни storage', 'dump_bank', 'warning');
            return null;
        }
        const b = src.bank;
        const out = {
            source: src.source, from: src.by,
            taken_at: src.ts ? new Date(src.ts).toISOString() : null,
            age_min: src.ts ? Math.round((Date.now() - src.ts) / 60000) : null,
            gold: b.gold || 0, unlocked: [], packs: {}, total_items: 0,
        };
        for (const pack in b) {
            if (pack === 'gold' || !Array.isArray(b[pack]))
                continue;
            out.unlocked.push(pack);
            const arr = b[pack];
            let filled = 0;
            if (opts.sparse_bank) {
                const o = { size: arr.length, slots: {} };
                for (let s = 0; s < arr.length; s++)
                    if (arr[s]) {
                        o.slots[s] = snap(arr[s], 6, []);
                        filled++;
                    }
                out.packs[pack] = o;
            }
            else {
                out.packs[pack] = snap(arr, 6, []);
                for (let s = 0; s < arr.length; s++)
                    if (arr[s])
                        filled++;
            }
            out.total_items += filled;
        }
        out.unlocked.sort((a, b2) => parseInt(a.slice(5)) - parseInt(b2.slice(5)));
        log(`bank: source=${src.source} by=${src.by} age=${out.age_min === null ? '?' : out.age_min + ' min'} packs=${out.unlocked.length} items=${out.total_items} gold=${out.gold}`, 'dump_bank');
        return out;
    }
    // Компактная выжимка для скрипта импорта: поля в порядке, в котором их
    // хранит движок (models.js Character + player.p), без клиентских довесков.
    const TRANSFER_KEYS = [
        'name', 'ctype', 'level', 'xp', 'max_xp', 'gold', 'cash', 'skin', 'cx', 'acx', 'xcx',
        'home', 'map', 'in', 'x', 'y', 'hp', 'max_hp', 'mp', 'max_mp',
        'isize', 'esize', 'items', 'slots', 's', 'q', 'age', 'guild', 'owner', 'party',
        'str', 'int', 'dex', 'vit', 'for', 'attack', 'armor', 'resistance', 'speed', 'range',
        'frequency', 'goldm', 'xpm', 'luckm', 'targets', 'm',
        // остальное из player_to_client (node/server.js:755) для себя
        'heal', 'mp_cost', 'mp_reduction', 'evasion', 'miss', 'reflection', 'lifesteal', 'manasteal',
        'rpiercing', 'apiercing', 'crit', 'critdamage', 'dreturn', 'tax', 'xrange', 'pnresistance',
        'firesistance', 'fzresistance', 'phresistance', 'stresistance', 'incdmgamp', 'stun', 'blast',
        'explosion', 'courage', 'mcourage', 'pcourage', 'fear', 'rip', 'afk', 'pdps', 'id', 'cid',
        'stand', 'controller', 'code', 'cc', 'moving', 'going_x', 'going_y', 'angle',
    ];
    function transfer_view(ch) {
        if (!ch || typeof ch !== 'object')
            return null;
        const out = {};
        for (const k of TRANSFER_KEYS)
            if (ch[k] !== undefined)
                out[k] = ch[k];
        return out;
    }
    function collect() {
        if (collecting)
            return Promise.resolve(last);
        collecting = true;
        collect_started = Date.now();
        status = 'собираем…';
        log(`collect start achievements=${opts.achievements} bank=${opts.bank} secrets=${opts.secrets} sparse_bank=${opts.sparse_bank}`, 'dump_collect');
        render();
        const root = root_window();
        const wins = game_windows(root);
        const warnings = [];
        if (!wins.length) {
            collecting = false;
            status = 'не нашёл ни одного окна с персонажем';
            log(status, 'dump_collect', 'error');
            render();
            return Promise.reject(status);
        }
        let roster = [];
        try {
            roster = snap(root.X.characters, 4, []) || [];
        }
        catch (e) {
            warnings.push('X.characters недоступен: ' + e.message);
        }
        const running = {};
        wins.forEach(gw => { running[gw.name] = 1; });
        roster.forEach(c => {
            if (c && c.name && !running[c.name])
                warnings.push(`персонаж ${c.name} (lvl ${c.level} ${c.type}) не запущен — только имя/уровень/тип из ростера`);
        });
        const tracker_job = opts.achievements ? fetch_tracker_once(wins) : Promise.resolve(null);
        return tracker_job.then(tracked => {
            if (!opts.achievements)
                warnings.push('достижения отключены переключателем');
            else if (!tracked)
                warnings.push('достижения не выгружены: ни у одного запущенного персонажа нет tracker/supercomputer в сумке — хватит одного на аккаунт');
            // снимок персонажа синхронный: ждать было нечего, кроме трекера
            const characters = wins.map(gw => {
                let ch = null;
                try {
                    ch = snap_character(gw.win.character);
                }
                catch (e) {
                    ch = '[snapshot failed: ' + e.message + ']';
                    warnings.push(`снимок ${gw.name} не удался: ${e.message}`);
                }
                let mode = '?';
                try {
                    mode = gw.win.no_html ? 'CODE' : 'UI';
                }
                catch (e) { }
                let items_used = '?';
                try {
                    items_used = (gw.win.character.items || []).filter(Boolean).length + '/' + (gw.win.character.isize || 42);
                }
                catch (e) { }
                let friends = null;
                try {
                    friends = snap(gw.win.friends, 3, []);
                }
                catch (e) { }
                const dd = (ch && ch.__dump) || {};
                const is_source = !!tracked && tracked.name === gw.name;
                log(`${gw.name} via=${gw.via} mode=${mode} items=${items_used} raw keys=${dd.kept}/${dd.own_keys} dropped=${dd.dropped_objects}${is_source ? ' tracker=источник' : ''}`, 'dump_collect');
                return {
                    name: gw.name,
                    window: gw.via,
                    mode,
                    items_used,
                    friends,
                    transfer: transfer_view(ch),
                    raw: ch,
                    tracker_reason: is_source ? 'ok' : '—',
                };
            });
            const bank = opts.bank ? grab_bank(wins) : null;
            if (!opts.bank)
                warnings.push('банк отключён переключателем');
            else if (!bank)
                warnings.push('банк не выгружен: никто не стоит в банке и кэша game_state.bank_items нет — заведи любого в bank/bank_b/bank_u и собери снова');
            else if (bank.source !== 'live')
                warnings.push(`банк взят из кэша (${bank.source}, снят ${bank.from}${bank.age_min === null ? '' : ' ' + bank.age_min + ' мин назад'}) — для свежего снимка заведи кого-нибудь в банк`);
            const out = {
                meta: {
                    script: 'dump v1',
                    exported_at: new Date().toISOString(),
                    engine_version: (() => { try {
                        return root.Version;
                    }
                    catch (e) {
                        return null;
                    } })(),
                    server: (() => {
                        try {
                            return { region: root.server_region, id: root.server_identifier, mode: root.gameplay, pvp: !!root.is_pvp };
                        }
                        catch (e) {
                            return null;
                        }
                    })(),
                    collected_by: character.name,
                    running_characters: wins.length,
                    roster_size: roster.length,
                    options: Object.assign({}, opts),
                },
                roster,
                characters: characters.map(c => ({
                    name: c.name, window: c.window, mode: c.mode, items_used: c.items_used,
                    tracker: c.tracker_reason,
                    transfer: c.transfer, raw: c.raw, friends: c.friends,
                })),
                achievements: achievements_account(tracked ? [tracked] : []),
                bank,
                warnings,
            };
            last = out;
            try {
                p.LAST_DUMP = out;
            }
            catch (e) { }
            try {
                last_size = JSON.stringify(out).length;
            }
            catch (e) {
                last_size = 0;
            }
            merge_all(); // свой дамп мог обновиться, а чужие уже лежат
            last_rows = characters.map(c => {
                const ch = (c.raw && typeof c.raw === 'object') ? c.raw : {};
                return {
                    name: c.name, window: c.window, mode: c.mode,
                    type: ch.ctype || '?', level: ch.level || 0, gold: ch.gold || 0,
                    items_used: c.items_used, tracker: c.tracker_reason,
                    warnings: warnings.filter(x => x.indexOf(c.name) >= 0),
                };
            });
            for (const c of roster) {
                if (!c || !c.name || running[c.name])
                    continue;
                last_rows.push({
                    name: c.name, window: '—', mode: 'offline',
                    type: c.type || '?', level: c.level || 0, gold: 0,
                    items_used: '—', tracker: '—', warnings: [],
                });
            }
            last_rows.sort((a, b) => a.name.localeCompare(b.name));
            collecting = false;
            status = `собрано за ${Date.now() - collect_started} мс`;
            const msg = `dump: ${characters.length} персонажей, ${bank ? `банк ${bank.total_items} предметов / ${bank.gold} золота` : 'БЕЗ банка'}, ${Math.round(last_size / 1024)} КБ, предупреждений ${warnings.length}`;
            log(msg, 'dump_collect', warnings.length ? 'warning' : 'info');
            game_log(msg, warnings.length ? '#F59E0B' : '#10B981');
            render();
            return out;
        }, err => {
            collecting = false;
            status = 'ошибка: ' + (err && err.message || err);
            log(status, 'dump_collect', 'error');
            render();
            throw err;
        });
    }
    // в файл и в буфер уходит объединённый дамп, когда пиры ответили, иначе свой
    function export_object() { return merged || last; }
    function export_size() { return merged ? merged_size : last_size; }
    function json_text() {
        return JSON.stringify(export_object(), null, '\t');
    }
    function copy_text(text, what) {
        const ok = () => { game_log(`${what} copied to clipboard`, '#10B981'); log(`copied ${what}`, 'dump_copy'); };
        const fail = () => { game_log('Clipboard copy failed', '#EF4444'); log('clipboard copy failed', 'dump_copy', 'error'); };
        const fallback = () => {
            try {
                const ta = p.document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                p.document.body.appendChild(ta);
                ta.select();
                const copied = p.document.execCommand('copy');
                p.document.body.removeChild(ta);
                copied ? ok() : fail();
            }
            catch (e) {
                fail();
            }
        };
        if (p.navigator && p.navigator.clipboard && p.navigator.clipboard.writeText) {
            p.navigator.clipboard.writeText(text).then(ok, fallback);
        }
        else {
            fallback();
        }
    }
    function copy_json() {
        const o = export_object();
        if (!o)
            return game_log('сначала собери дамп', '#F59E0B');
        const what = merged
            ? `Dump JSON (${merged.meta.accounts} accounts, ${merged.meta.characters} chars, ${Math.round(export_size() / 1024)} KB)`
            : `Dump JSON (${o.characters.length} chars, ${Math.round(export_size() / 1024)} KB)`;
        copy_text(json_text(), what);
    }
    function download_json() {
        if (!export_object())
            return game_log('сначала собери дамп', '#F59E0B');
        const fname = (merged ? 'al_dump_all_' : 'al_dump_') + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
        try {
            const blob = new p.Blob([json_text()], { type: 'application/json' });
            const url = p.URL.createObjectURL(blob);
            const a = p.document.createElement('a');
            a.href = url;
            a.download = fname;
            p.document.body.appendChild(a);
            a.click();
            setTimeout(() => { p.document.body.removeChild(a); p.URL.revokeObjectURL(url); }, 2000);
            game_log(`${fname} saved`, '#10B981');
            log(`download ${fname}`, 'dump_download');
        }
        catch (e) {
            game_log('скачать не вышло — данные в parent.LAST_DUMP', '#EF4444');
            log('download failed: ' + e.message, 'dump_download', 'error');
        }
    }
    function escape_html(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    // #endregion данные
    // #region обмен с другими аккаунтами
    // Три аккаунта нельзя открыть в одном окне браузера: у каждого свои куки, и
    // iframe'ы чужого аккаунта нам не видны. Общий канал ровно один — cm через
    // игровой сервер (node/server.js:4673). Что диктует движок:
    //   • пакет сокета не больше 64 КБ (maxHttpBufferSize и msgpack maxPacketBytes
    //     в node/server.js), поэтому дамп режется на куски по CHUNK_CHARS: кусок
    //     12000 символов после экранирования весит ~17 КБ;
    //   • cm длиннее 100 символов стоит 2 «звонка» на получателя при лимите 200 за
    //     4 с (node/server.js:4516 и limits.calls), поэтому куски идут через
    //     CHUNK_GAP_MS, а на отказ сервера пауза учетверяется;
    //   • cm доставляется ТОЛЬКО игрокам на том же сервере: имя ищется в players
    //     этого процесса, кросс-серверного релея у cm нет (в отличие от pm).
    //     Пати и так живёт внутри одного сервера, так что это условие выполнено.
    // Кого спрашивать — берём из пати (parent.party_list), имена вписывать не надо.
    // В пати сидят и свои персонажи, поэтому сначала короткий опрос «кто ты»: в
    // ответе приходит character.owner, один и тот же у всех персонажей аккаунта.
    // Свой аккаунт отсеиваем по ростеру, а на каждый чужой owner запрашиваем дамп
    // ровно у одного персонажа — того, кто ответил первым.
    // Протокол (у всех сообщений message:'dump', чтобы чужие аддоны их не трогали):
    //   who    — кто ты и с какого аккаунта
    //   iam    — ответ: owner аккаунта
    //   req    — пришли дамп, с опциями сборки
    //   head   — пир собрал и говорит, сколько будет кусков
    //   part   — кусок i
    //   tail   — пир отправил всё: получатель сразу проверяет дырки
    //   resend — просим недостающие куски (пир держит их KEEP_OUTGOING_MS)
    //   err    — у пира не вышло
    const CHUNK_CHARS = 6000; // ~8.5 КБ пакета: с 12000 передача рвалась на живой игре [22/09/26]
    const CHUNK_GAP_MS = 250;
    const CC_PAUSE = 100; // сервер рвёт связь при call cost > 200 за 4 с
    const CC_WAIT_MS = 1000;
    const DISCOVER_MS = 6000; // ждём ответы на who
    const HEAD_TIMEOUT_MS = 60000; // ждём шапку: у пира сборка с трекером до ~10 с
    const STALL_MS = 15000; // тишина в середине передачи → просим недостающее
    const MAX_RESENDS = 8; // подряд, без прогресса
    const TOTAL_RESENDS = 24; // всего за передачу
    const KEEP_OUTGOING_MS = 300000; // сколько держим свои куски на случай resend
    const DONE_STATUSES = ['готово', 'таймаут', 'ошибка', 'битый JSON', 'ошибка у пира', 'не доставлено'];
    const incoming = {};
    const restarts = {}; // сколько раз перезапрашивали дамп целиком
    const outgoing = {};
    let peer_timer = null;
    // опрос пати
    let who_id = '';
    let discovering = false;
    let candidates = []; // кого спросили «кто ты»
    const found = {}; // имя -> аккаунт
    let picked = []; // по одному персонажу на аккаунт
    // #region пати
    function my_roster() {
        const mine = {};
        try {
            for (const c of (p.X && p.X.characters) || [])
                if (c && c.name)
                    mine[c.name] = 1;
        }
        catch (e) { }
        return mine;
    }
    function party_names() {
        try {
            if (p.party_list && p.party_list.length)
                return p.party_list.slice();
            return Object.keys(p.party || {});
        }
        catch (e) {
            return [];
        }
    }
    function in_party(name) {
        return party_names().indexOf(name) >= 0;
    }
    // Все в пати, кроме персонажей своего аккаунта: их дамп и так собирается локально.
    function party_candidates() {
        const mine = my_roster();
        return party_names().filter(n => n && n !== character.name && !mine[n]);
    }
    // #endregion пати
    // Обёртка над send_cm с логом обеих веток: движок возвращает промис,
    // а «сервер принял, но получателей нет» отказом НЕ считается.
    function cm(to, msg, what) {
        let pr;
        try {
            pr = w.send_cm(to, msg);
        }
        catch (e) {
            log(`cm ${what} > ${to}: бросил ${e.message}`, 'dump_cm', 'error');
            return Promise.reject(e);
        }
        return Promise.resolve(pr).then((r) => {
            const got = (r && r.receivers) || [];
            if (got.indexOf(to) < 0)
                log(`cm ${what} > ${to}: получателей нет — он оффлайн или на другом сервере`, 'dump_cm', 'warning');
            return r;
        }, (err) => {
            log(`cm ${what} > ${to}: отказ ${(err && (err.reason || err.message)) || err}`, 'dump_cm', 'error');
            throw err;
        });
    }
    // #region я прошу
    // Короткий опрос пати. Отвечают только те, у кого поднят этот слот, поэтому
    // персонажи без графики и чужие игроки отсеиваются сами собой.
    function discover() {
        candidates = party_candidates();
        for (const k of Object.keys(found))
            delete found[k];
        picked = [];
        if (!candidates.length) {
            log('в пати нет персонажей с других аккаунтов', 'dump_discover', 'warning');
            return Promise.resolve([]);
        }
        who_id = 'w' + Date.now().toString(36);
        discovering = true;
        status = `опрашиваем пати (${candidates.length})…`;
        log(`опрос пати: ${candidates.join(', ')}`, 'dump_discover');
        for (const n of candidates)
            cm(n, { message: 'dump', cmd: 'who', id: who_id }, 'who').catch(() => { });
        render();
        return new Promise(resolve => setTimeout(() => {
            discovering = false;
            // на каждый чужой аккаунт оставляем одного персонажа — ответившего первым
            const by_owner = {};
            for (const name of Object.keys(found)) {
                const owner = found[name].owner || ('unknown:' + name);
                if (!by_owner[owner])
                    by_owner[owner] = name;
                else
                    log(`${name} с того же аккаунта, что ${by_owner[owner]} — не спрашиваем`, 'dump_discover');
            }
            picked = Object.keys(by_owner).map(o => by_owner[o]);
            const silent = candidates.filter(n => !found[n]);
            log(`опрос: ответили ${Object.keys(found).length} из ${candidates.length}, аккаунтов ${picked.length}`
                + (silent.length ? `, молчат: ${silent.join(', ')}` : ''), 'dump_discover', silent.length ? 'warning' : 'info');
            render();
            resolve(picked);
        }, DISCOVER_MS));
    }
    function request_peer(name) {
        const id = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
        incoming[name] = {
            name, id, status: 'запрос отправлен', reason: '',
            n: 0, len: 0, got: {}, count: 0,
            started: Date.now(), last_ms: Date.now(), resends: 0, total_resends: 0,
            progress_at: 0, dump: null,
        };
        log(`запрос дампа у ${name}, id=${id}`, 'dump_request');
        cm(name, {
            message: 'dump', cmd: 'req', id,
            opts: { achievements: opts.achievements, bank: opts.bank, sparse_bank: opts.sparse_bank },
        }, 'req').then((r) => {
            const st = incoming[name];
            if (!st || st.id !== id)
                return;
            const got = (r && r.receivers) || [];
            if (got.indexOf(name) < 0) {
                st.status = 'не доставлено';
                st.reason = 'оффлайн или на другом сервере';
            }
            else if (st.status === 'запрос отправлен') {
                st.status = 'пир собирает';
            }
            render();
        }, (err) => {
            const st = incoming[name];
            if (st && st.id === id) {
                st.status = 'ошибка';
                st.reason = (err && (err.reason || err.message)) || String(err);
            }
            render();
        });
        watchdog_start();
    }
    function finish(st) {
        let text = '';
        for (let i = 0; i < st.n; i++)
            text += st.got[i] || '';
        try {
            st.dump = JSON.parse(text);
            st.status = 'готово';
            const msg = `дамп от ${st.name}: ${Math.round(text.length / 1024)} КБ, персонажей ${(st.dump.characters || []).length}`;
            log(msg, 'dump_receive');
            game_log(msg, '#10B981');
        }
        catch (e) {
            st.status = 'битый JSON';
            st.reason = `${e.message}; ждали ${st.len} символов, собрали ${text.length}`;
            log(`дамп от ${st.name} не разобрался: ${st.reason}`, 'dump_receive', 'error');
        }
        merge_all();
    }
    // Недостающие куски просим точечно, а не гоняем дамп заново.
    // Возвращает true, если чего-то не хватило и мы попросили повтор.
    function request_missing(st, why) {
        const miss = [];
        for (let i = 0; i < st.n; i++)
            if (!(i in st.got))
                miss.push(i);
        if (!miss.length) {
            finish(st);
            return false;
        }
        // пока куски идут, попытки не сгорают: важна не их штука, а остановка прогресса
        if (st.count > st.progress_at) {
            st.progress_at = st.count;
            st.resends = 0;
        }
        if (st.resends >= MAX_RESENDS || st.total_resends >= TOTAL_RESENDS) {
            st.status = 'таймаут';
            st.reason = `не дошли куски: ${miss.length} из ${st.n} (${miss.slice(0, 10).join(',')}${miss.length > 10 ? '…' : ''})`;
            log(`${st.name}: ${st.reason}`, 'dump_watchdog', 'error');
            return false;
        }
        st.resends++;
        st.total_resends++;
        st.last_ms = Date.now();
        log(`${st.name}: ${why}, просим ${miss.length} кусков (попытка ${st.resends})`, 'dump_watchdog', 'warning');
        cm(st.name, { message: 'dump', cmd: 'resend', id: st.id, miss: miss.slice(0, 60) }, 'resend').catch(() => { });
        return true;
    }
    // Сторож на случай, если пир замолчал совсем: лимит вызовов, рестарт кода,
    // смена сервера. Нормальную потерю кусков ловит tail, а не он.
    function watchdog_start() {
        if (peer_timer)
            return;
        peer_timer = setInterval(() => {
            let active = 0;
            for (const name of Object.keys(incoming)) {
                const st = incoming[name];
                if (DONE_STATUSES.indexOf(st.status) >= 0)
                    continue;
                active++;
                const quiet = Date.now() - st.last_ms;
                if (!st.n) {
                    if (quiet > HEAD_TIMEOUT_MS) {
                        st.status = 'таймаут';
                        st.reason = 'пир не ответил на запрос дампа';
                        log(`${st.name}: ${st.reason}`, 'dump_watchdog', 'error');
                    }
                    continue;
                }
                if (quiet <= STALL_MS)
                    continue;
                request_missing(st, `тишина ${Math.round(quiet / 1000)} с`);
            }
            if (!active) {
                clearInterval(peer_timer);
                peer_timer = null;
            }
            render();
        }, 2000);
    }
    // #endregion я прошу
    // #region у меня просят
    // Отвечаем только своим: персонажу своего аккаунта или тому, кто сейчас в
    // пати. Без этой проверки содержимое аккаунта (вещи, золото, банк) мог бы
    // вытянуть любой игрок, знающий протокол, — cm присылает кто угодно.
    function allowed(name) {
        if (name === character.name)
            return true;
        if (my_roster()[name])
            return true;
        return in_party(name);
    }
    function respond(to, id, ropts) {
        if (!allowed(to)) {
            log(`${to} просит дамп, но он не в пати — отказ`, 'dump_respond', 'warning');
            game_log(`${to} просит дамп аккаунта — отказано (не в пати)`, '#EF4444');
            cm(to, { message: 'dump', cmd: 'err', id, reason: 'не в пати получателя' }, 'err').catch(() => { });
            return;
        }
        if (collecting) {
            log(`${to} просит дамп, но сборка уже идёт — отказ`, 'dump_respond', 'warning');
            cm(to, { message: 'dump', cmd: 'err', id, reason: 'сборка уже идёт, повтори' }, 'err').catch(() => { });
            return;
        }
        // Чужие опции применяем на время сборки, кроме secrets: свой secret/ipass
        // по игровому каналу не уходит никогда, даже если попросили. Свои
        // переключатели возвращаем обратно, чтобы запрос не менял их насовсем.
        const saved = Object.assign({}, opts);
        if (ropts) {
            if (typeof ropts.achievements === 'boolean')
                opts.achievements = ropts.achievements;
            if (typeof ropts.bank === 'boolean')
                opts.bank = ropts.bank;
            if (typeof ropts.sparse_bank === 'boolean')
                opts.sparse_bank = ropts.sparse_bank;
        }
        if (opts.secrets)
            log('запрос пришёл при включённых «секретах» — на отправку они выключены', 'dump_respond', 'warning');
        opts.secrets = false;
        const restore = () => { Object.assign(opts, saved); render(); };
        log(`${to} просит дамп id=${id}: achievements=${opts.achievements} bank=${opts.bank} sparse_bank=${opts.sparse_bank}`, 'dump_respond');
        game_log(`${to} просит дамп аккаунта`, '#F97316');
        collect().then(d => {
            restore();
            for (const old of Object.keys(outgoing))
                if (Date.now() - outgoing[old].at > KEEP_OUTGOING_MS)
                    delete outgoing[old];
            const text = JSON.stringify(d);
            const chunks = split_chunks(text);
            outgoing[id] = { to, chunks, timer: null, at: Date.now(), seq: 0 };
            log(`отдаём ${to} дамп id=${id}: ${Math.round(text.length / 1024)} КБ, кусков ${chunks.length}`, 'dump_respond');
            cm(to, { message: 'dump', cmd: 'head', id, n: chunks.length, len: text.length, who: character.name }, 'head')
                .then(() => send_chunks(id), () => { delete outgoing[id]; });
        }, err => {
            restore();
            const reason = String((err && err.message) || err);
            log(`сборка для ${to} не удалась: ${reason}`, 'dump_respond', 'error');
            cm(to, { message: 'dump', cmd: 'err', id, reason }, 'err').catch(() => { });
        });
    }
    // Половинка суррогатной пары на границе куска превращается в битый UTF-8,
    // и такой пакет msgpack не переживает — режем по целым символам.
    function split_chunks(text) {
        const chunks = [];
        let i = 0;
        while (i < text.length) {
            let end = Math.min(i + CHUNK_CHARS, text.length);
            const c = text.charCodeAt(end - 1);
            if (end < text.length && c >= 0xD800 && c <= 0xDBFF)
                end--;
            chunks.push(text.slice(i, end));
            i = end;
        }
        return chunks;
    }
    function send_chunks(id, only) {
        const o = outgoing[id];
        if (!o)
            return;
        const list = (only && only.length) ? only.slice() : o.chunks.map((_, i) => i);
        if (o.timer) {
            clearTimeout(o.timer);
            o.timer = null;
        }
        const seq = ++o.seq; // старый цикл, если он ещё жив, увидит чужой номер и встанет
        let k = 0, failed = 0;
        const step = () => {
            const cur = outgoing[id];
            if (!cur || cur.seq !== seq)
                return;
            if (k >= list.length) {
                log(`куски ${id} отправлены: ${list.length}${failed ? `, отказов ${failed}` : ''}`, 'dump_respond', failed ? 'warning' : 'info');
                // маркер конца: получатель сразу видит дырки и просит повтор,
                // не дожидаясь STALL_MS тишины
                cm(cur.to, { message: 'dump', cmd: 'tail', id, n: cur.chunks.length }, 'tail').catch(() => { });
                return;
            }
            // при call cost > 200 за 4 с сервер рвёт соединение: под нагрузкой ждём
            const cc = Number(character.cc) || 0;
            if (cc > CC_PAUSE) {
                cur.timer = setTimeout(step, CC_WAIT_MS);
                return;
            }
            const i = list[k++];
            if (cur.chunks[i] !== undefined)
                cm(cur.to, { message: 'dump', cmd: 'part', id, i, d: cur.chunks[i] }, `part ${i}`).catch(() => { failed++; });
            // Шаг по таймеру, а НЕ по ответу сервера. Промис send_cm может зависнуть
            // или потеряться, когда рядом идёт чужой cm-трафик (log_helper и прочее),
            // и тогда отправка обрывалась молча на середине [22/09/26].
            cur.timer = setTimeout(step, CHUNK_GAP_MS);
        };
        step();
    }
    // #endregion у меня просят
    // Аддитивный слушатель: on_cm определяет хост-код, его не трогаем.
    character.on('cm', function (m) {
        const d = m && m.message;
        if (!d || d.message !== 'dump' || !d.cmd)
            return;
        try {
            if (d.cmd === 'who') {
                if (!allowed(m.name))
                    return;
                log(`${m.name} спрашивает, кто мы`, 'dump_cm');
                return void cm(m.name, {
                    message: 'dump', cmd: 'iam', id: d.id,
                    owner: character.owner || null, ctype: character.ctype,
                }, 'iam').catch(() => { });
            }
            if (d.cmd === 'iam') {
                if (d.id !== who_id)
                    return;
                found[m.name] = { owner: String(d.owner || ''), ctype: String(d.ctype || '') };
                log(`${m.name}: аккаунт ${d.owner}`, 'dump_discover');
                return render();
            }
            if (d.cmd === 'req')
                return respond(m.name, d.id, d.opts);
            if (d.cmd === 'resend') {
                if (!allowed(m.name))
                    return;
                const o = outgoing[d.id];
                if (!o) {
                    log(`${m.name} просит куски ${d.id}, но их уже нет`, 'dump_cm', 'warning');
                    return void cm(m.name, { message: 'dump', cmd: 'err', id: d.id, reason: 'кусков уже нет, нужен новый запрос' }, 'err').catch(() => { });
                }
                log(`${m.name} просит ${(d.miss || []).length} кусков id=${d.id}`, 'dump_cm', 'warning');
                if (o.timer)
                    clearTimeout(o.timer);
                return send_chunks(d.id, d.miss);
            }
            const st = incoming[m.name];
            if (!st || st.id !== d.id)
                return log(`cm ${d.cmd} от ${m.name} с чужим id=${d.id} — игнор`, 'dump_cm', 'warning');
            st.last_ms = Date.now();
            if (d.cmd === 'head') {
                st.n = d.n || 0;
                st.len = d.len || 0;
                st.status = `приём 0/${st.n}`;
                log(`${m.name}: шапка id=${d.id}, кусков ${st.n}, ${Math.round(st.len / 1024)} КБ`, 'dump_receive');
            }
            else if (d.cmd === 'part') {
                if (!(d.i in st.got)) {
                    st.got[d.i] = d.d;
                    st.count++;
                }
                st.status = `приём ${st.count}/${st.n || '?'}`;
                if (st.n && st.count >= st.n)
                    finish(st);
            }
            else if (d.cmd === 'tail') {
                if (st.n)
                    request_missing(st, 'пир закончил отправку');
            }
            else if (d.cmd === 'err') {
                st.status = 'ошибка у пира';
                st.reason = String(d.reason || '');
                log(`${m.name} не смог отдать дамп: ${st.reason}`, 'dump_receive', 'error');
                // у пира перезапустился код и куски пропали — просим дамп заново, один раз
                if (/кусков уже нет|повтори/.test(st.reason) && (restarts[m.name] || 0) < 1) {
                    restarts[m.name] = (restarts[m.name] || 0) + 1;
                    log(`${m.name}: запрашиваем дамп заново`, 'dump_receive', 'warning');
                    setTimeout(() => request_peer(m.name), 2000);
                }
            }
            render();
        }
        catch (e) {
            log(`разбор cm от ${m && m.name}: ${e.message}`, 'dump_cm', 'error');
        }
    });
    // #region объединение
    // Аккаунт узнаём по character.owner (US_...): он одинаков у всех персонажей
    // аккаунта и разный у разных аккаунтов. Банк, ростер и достижения — величины
    // именно аккаунта, поэтому в объединённом дампе они лежат внутри accounts[].
    function account_of(d) {
        for (const c of (d && d.characters) || []) {
            const o = c && c.raw && c.raw.owner;
            if (o)
                return String(o);
        }
        return 'unknown:' + ((d && d.meta && d.meta.collected_by) || '?');
    }
    function to_account(d, owner) {
        d = d || {};
        return {
            owner,
            collected_by: (d.meta && d.meta.collected_by) || null,
            exported_at: (d.meta && d.meta.exported_at) || null,
            server: (d.meta && d.meta.server) || null,
            options: (d.meta && d.meta.options) || null,
            roster: d.roster || [],
            characters: d.characters || [],
            achievements: d.achievements || null,
            bank: d.bank || null,
            warnings: d.warnings || [],
        };
    }
    function merge_all() {
        const dumps = [];
        if (last)
            dumps.push(last);
        let from_peers = 0;
        for (const name of Object.keys(incoming))
            if (incoming[name].dump) {
                dumps.push(incoming[name].dump);
                from_peers++;
            }
        // без чужих дампов объединять нечего: экспортируется обычный одиночный дамп
        if (!from_peers) {
            merged = null;
            merged_size = 0;
            return;
        }
        const accounts = [];
        const by_owner = {};
        const warnings = [];
        for (const d of dumps) {
            const owner = account_of(d);
            const a = to_account(d, owner);
            const prev = by_owner[owner];
            if (prev) {
                // два персонажа одного аккаунта прислали дамп: берём более поздний
                warnings.push(`аккаунт ${owner} прислали дважды (${prev.collected_by} и ${a.collected_by}) — взят более поздний`);
                if (String(a.exported_at) > String(prev.exported_at))
                    accounts[accounts.indexOf(prev)] = (by_owner[owner] = a);
                continue;
            }
            by_owner[owner] = a;
            accounts.push(a);
        }
        let chars = 0;
        const servers = [];
        for (const a of accounts) {
            chars += a.characters.length;
            const s = a.server ? `${a.server.region}${a.server.id}` : '?';
            if (servers.indexOf(s) < 0)
                servers.push(s);
            if (!a.achievements)
                warnings.push(`аккаунт ${a.owner} (${a.collected_by}): достижений нет — нужен один tracker/supercomputer в сумке любого запущенного персонажа`);
            if (!a.bank)
                warnings.push(`аккаунт ${a.owner} (${a.collected_by}): банка нет`);
            else if (a.bank.source !== 'live')
                warnings.push(`аккаунт ${a.owner} (${a.collected_by}): банк из кэша ${a.bank.source}, снят ${a.bank.from}${a.bank.age_min === null ? '' : ' ' + a.bank.age_min + ' мин назад'}`);
        }
        if (servers.length > 1)
            warnings.push(`аккаунты собраны на разных серверах: ${servers.join(', ')}`);
        for (const name of Object.keys(incoming)) {
            const st = incoming[name];
            if (!st.dump)
                warnings.push(`от ${name} дампа нет: ${st.status}${st.reason ? ' — ' + st.reason : ''}`);
        }
        merged = {
            meta: {
                script: 'dump v1 merged',
                merged_at: new Date().toISOString(),
                merged_by: character.name,
                accounts: accounts.length,
                characters: chars,
                servers,
            },
            accounts,
            warnings,
        };
        try {
            p.LAST_DUMP_ALL = merged;
        }
        catch (e) { }
        try {
            merged_size = JSON.stringify(merged).length;
        }
        catch (e) {
            merged_size = 0;
        }
        log(`объединено: аккаунтов ${accounts.length}, персонажей ${chars}, ${Math.round(merged_size / 1024)} КБ`, 'dump_merge');
    }
    // #endregion объединение
    // Свой аккаунт + дампы остальных аккаунтов из пати. Ответы приходят
    // асинхронно, окно показывает прогресс; объединение пересобирается на каждом
    // готовом дампе.
    function collect_all() {
        for (const k of Object.keys(restarts))
            delete restarts[k];
        return collect().then(d => discover().then(list => {
            if (!list.length) {
                const why = candidates.length
                    ? 'в пати никто не ответил: у них не поднят слот dump или персонажи без графики'
                    : 'в пати нет персонажей с других аккаунтов — позови их в пати';
                log(why, 'dump_collect_all', 'warning');
                game_log(why, '#F59E0B');
                return d;
            }
            for (const name of list)
                request_peer(name);
            return d;
        }));
    }
    // #endregion обмен с другими аккаунтами
    // #region отрисовка
    function chip(cls, data_attr, data_value, label, color, active) {
        return `<button class="${cls}" ${data_attr}="${escape_html(data_value)}" style="
			padding: 10px 22px;
			background: ${active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'};
			border: 1px solid ${color};
			color: ${color};
			cursor: pointer;
			border-radius: 4px;
			font-family: inherit;
			font-size: 26px;
		">${escape_html(label)}</button>`;
    }
    function render() {
        const $ = p.$;
        if (!$(`#${MODAL_ID}`).length)
            return;
        const cell = (html, color = '#ddd', align = 'right') => `<td style="padding:8px 10px; color:${color}; text-align:${align}; white-space:nowrap;">${html}</td>`;
        let body = '';
        for (const r of last_rows) {
            const mode_color = r.mode === 'offline' ? '#666' : r.mode === 'UI' ? '#34D399' : '#60A5FA';
            const tracker_color = r.tracker === 'ok' ? '#34D399' : r.tracker === '—' ? '#666' : '#F59E0B';
            body += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">`
                + cell(escape_html(r.name), '#fff', 'left')
                + cell(escape_html(r.mode), mode_color, 'left')
                + cell(escape_html(r.type), '#ddd', 'left')
                + cell(String(r.level))
                + cell(r.gold ? r.gold.toLocaleString() : '—')
                + cell(escape_html(r.items_used))
                + cell(escape_html(r.tracker), tracker_color, 'left')
                + `</tr>`;
        }
        if (!body)
            body = `<tr>${cell(collecting ? 'собираем…' : 'дамп ещё не собран', '#888', 'left')}</tr>`;
        $(`#${MODAL_ID}Rows`).html(body);
        const in_pt = party_candidates();
        let pl = `<div style="color:#888; padding:3px 0;">в пати с других аккаунтов: <span style="color:#fff">${in_pt.length ? escape_html(in_pt.join(', ')) : 'никого'}</span>`
            + (discovering ? ' <span style="color:#F59E0B">— опрашиваем…</span>' : '') + '</div>';
        // сперва те, у кого запросили дамп, затем ответившие на who, но не выбранные
        for (const name of Object.keys(incoming)) {
            const st = incoming[name];
            const bad = /ошибк|таймаут|битый|не доставлено/.test(st.status);
            const color = st.status === 'готово' ? '#34D399' : bad ? '#EF4444' : '#F59E0B';
            const acc = found[name] ? ` <span style="color:#666">${escape_html(found[name].owner)}</span>` : '';
            let extra = '';
            if (st.dump)
                extra += `, персонажей ${(st.dump.characters || []).length}, ${Math.round(st.len / 1024)} КБ`;
            if (st.reason)
                extra += ` — ${st.reason}`;
            pl += `<div style="padding:3px 0;"><span style="color:#fff">${escape_html(name)}</span>${acc}`
                + ` <span style="color:${color}">${escape_html(st.status + extra)}</span></div>`;
        }
        for (const name of Object.keys(found)) {
            if (incoming[name] || picked.indexOf(name) >= 0)
                continue;
            pl += `<div style="padding:3px 0; color:#666">${escape_html(name)} — тот же аккаунт, что уже спросили</div>`;
        }
        const silent = candidates.filter(n => !found[n]);
        if (!discovering && silent.length) {
            // молчат обычно персонажи в режиме CODE: окно грузится только при графике.
            // Тревожно это только когда не ответил вообще никто.
            const color = picked.length ? '#666' : '#F59E0B';
            const tail = picked.length ? ' (нормально: слот dump есть только у персонажа с графикой)'
                : ' — ни у кого не поднят слот dump или они не с других аккаунтов';
            pl += `<div style="padding:3px 0; color:${color}">молчат: ${escape_html(silent.join(', ') + tail)}</div>`;
        }
        if (merged)
            pl += `<div style="padding:6px 0 0; color:#34D399">объединено: аккаунтов ${merged.meta.accounts}, персонажей ${merged.meta.characters}, ${Math.round(merged_size / 1024)} КБ — уйдёт в Copy JSON и в файл</div>`;
        $(`#${MODAL_ID}PeerRows`).html(pl);
        const warn = last ? last.warnings : [];
        let wl = '';
        for (const t of warn)
            wl += `<div style="color:#F59E0B; padding:4px 0;">• ${escape_html(t)}</div>`;
        if (last && !wl)
            wl = `<div style="color:#34D399; padding:4px 0;">предупреждений нет</div>`;
        $(`#${MODAL_ID}Warnings`).html(wl);
        const info = last
            ? `<span style="color:#888">персонажей: </span><span style="color:#fff">${last.characters.length}</span>`
                + `<span style="color:#888">, ростер: </span><span style="color:#fff">${last.roster.length}</span>`
                + `<span style="color:#888">, банк: </span><span style="color:${!last.bank ? '#EF4444' : last.bank.source === 'live' ? '#34D399' : '#F59E0B'}">${last.bank ? last.bank.total_items + ' предм. (' + last.bank.source + (last.bank.age_min === null ? '' : ', ' + last.bank.age_min + ' мин') + ')' : 'нет'}</span>`
                + `<span style="color:#888">, JSON: </span><span style="color:#fff">${Math.round(last_size / 1024)} КБ</span>`
                + `<span style="color:#888">, </span><span style="color:#888">${escape_html(last.meta.exported_at.slice(11, 19))}</span>`
            : '';
        $(`#${MODAL_ID}Head`).html(`<span style="color:${collecting ? '#F59E0B' : '#888'}">${escape_html(status)}</span>${info ? ' &nbsp; ' + info : ''}`);
        $(`#${MODAL_ID}Toggles`).html(chip('dump-opt', 'data-opt', 'achievements', 'достижения', '#60A5FA', opts.achievements)
            + chip('dump-opt', 'data-opt', 'bank', 'банк', '#60A5FA', opts.bank)
            + chip('dump-opt', 'data-opt', 'sparse_bank', 'банк без пустых', '#60A5FA', opts.sparse_bank)
            + chip('dump-opt', 'data-opt', 'secrets', 'секреты', '#EF4444', opts.secrets));
        $(`#${MODAL_ID}Collect, #${MODAL_ID}CollectAll`).css('opacity', collecting ? 0.5 : 1);
        $(`#${MODAL_ID}Copy, #${MODAL_ID}Download`).css('opacity', export_object() ? 1 : 0.5);
    }
    // #endregion отрисовка
    // #region окно
    let update_timer = null;
    function build() {
        const $ = p.$;
        // повторный load_code не должен плодить окна
        $(`#${MODAL_ID}`).remove();
        $(`#${MODAL_ID}Backdrop`).remove();
        const th = (label, align = 'right') => `<th style="padding:8px 10px; text-align:${align}; color:#888; font-weight:normal; font-size:24px; white-space:nowrap;">${label}</th>`;
        const button = (id, label, color) => `<button id="${id}" style="padding:10px 22px; background:rgba(255,255,255,0.08); border:1px solid ${color}; color:${color}; cursor:pointer; border-radius:4px; font-family:inherit; font-size:26px;">${label}</button>`;
        $('body').append($(`<div id="${MODAL_ID}Backdrop"></div>`).css({
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0, 0, 0, 0.5)', zIndex: 9998, display: 'none',
        }));
        $('body').append($(`
			<div id="${MODAL_ID}">
				<div id="${MODAL_ID}Header">
					<span id="${MODAL_ID}Title">${BUTTON_LABEL}</span>
					<button id="${MODAL_ID}Close">&times;</button>
				</div>
				<div id="${MODAL_ID}Content">
					<div style="display:flex; flex-direction:column; height:100%; gap:16px;">
						<div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
							${button(MODAL_ID + 'Collect', 'Собрать', '#34D399')}
							${button(MODAL_ID + 'Copy', 'Copy JSON', '#60A5FA')}
							${button(MODAL_ID + 'Download', 'Скачать .json', '#60A5FA')}
							<span id="${MODAL_ID}Toggles" style="display:flex; gap:12px; margin-left:auto;"></span>
						</div>
						<div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
							${button(MODAL_ID + 'CollectAll', 'Собрать все аккаунты из пати', '#F97316')}
							<span style="color:#666; font-size:22px;">имена вписывать не надо: спрашиваем всех в пати, кто не с этого аккаунта</span>
						</div>
						<div id="${MODAL_ID}Head" style="font-size:26px;"></div>
						<div id="${MODAL_ID}PeerRows" style="font-size:24px; background:rgba(0,0,0,0.3); border-radius:6px; border:1px solid rgba(255,255,255,0.05); padding:8px 12px; max-height:200px; overflow-y:auto;"></div>

						<div style="flex:1; overflow-y:auto; background:rgba(0,0,0,0.3); border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
							<table style="width:100%; border-collapse:collapse; font-size:24px;">
								<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.15)">
									${th('Персонаж', 'left')}
									${th('Режим', 'left')}
									${th('Класс', 'left')}
									${th('Уровень')}
									${th('Золото')}
									${th('Сумка')}
									${th('Трекер', 'left')}
								</tr></thead>
								<tbody id="${MODAL_ID}Rows"></tbody>
							</table>
						</div>

						<div id="${MODAL_ID}Warnings" style="max-height:220px; overflow-y:auto; font-size:24px; background:rgba(0,0,0,0.3); border-radius:6px; border:1px solid rgba(255,255,255,0.05); padding:8px 12px;"></div>

						<div style="font-size:22px; color:#666;">
							raw = character целиком, transfer = выжимка для импорта, bank: живой если кто-то стоит в банке, иначе кэш game_state.bank_items,
							достижения берутся одним запросом трекера: хватает одного tracker/supercomputer на аккаунт. Результат также в parent.LAST_DUMP.
							«Собрать все аккаунты из пати» опрашивает пати по cm и берёт по одному персонажу на каждый чужой аккаунт: держи их в пати и со слотом dump.
							Дамп отдаётся только своим: персонажу этого же аккаунта или тому, кто сейчас в пати.
							Объединённый дамп лежит в parent.LAST_DUMP_ALL, банк/ростер/достижения в нём разложены по accounts[].
						</div>
					</div>
				</div>
			</div>
		`).css({
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '1200px', maxHeight: '120vh',
            background: 'rgba(20, 20, 30, 0.98)',
            border: `3px solid ${ACCENT}`, borderRadius: '10px',
            zIndex: 9999, display: 'none',
            boxShadow: `0 0 30px ${ACCENT_RGBA}`,
            overflow: 'hidden',
            fontFamily: $('#bottomrightcorner').css('font-family') || 'pixel',
        }));
        $(`#${MODAL_ID}Header`).css({
            background: 'linear-gradient(to right, #1a1a2e, #16213e)',
            padding: '12px 15px', borderBottom: `2px solid ${ACCENT}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderRadius: '7px 7px 0 0', userSelect: 'none',
        });
        $(`#${MODAL_ID}Title`).css({
            color: ACCENT, fontSize: '34px', fontWeight: 'bold',
            textShadow: `0 0 10px ${ACCENT_RGBA}`,
        });
        $(`#${MODAL_ID}Close`).css({
            background: 'rgba(255, 255, 255, 0.1)', border: `1px solid ${ACCENT}`,
            color: ACCENT, fontSize: '25px', width: '30px', height: '30px',
            cursor: 'pointer', borderRadius: '3px', fontFamily: 'inherit',
        });
        $(`#${MODAL_ID}Content`).css({
            padding: '15px', color: 'white',
            height: 'calc(90vh - 70px)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
        });
        $(`#${MODAL_ID}Close`).on('click', hide);
        $(`#${MODAL_ID}Backdrop`).on('click', hide);
        p.$(p.document).off(`keydown.${MODAL_ID}`).on(`keydown.${MODAL_ID}`, (e) => {
            if (e.key === 'Escape' && $(`#${MODAL_ID}`).is(':visible'))
                hide();
        });
        $(`#${MODAL_ID}Collect`).on('click', () => { collect().catch(() => { }); });
        $(`#${MODAL_ID}CollectAll`).on('click', () => { collect_all().catch(() => { }); });
        $(`#${MODAL_ID}Copy`).on('click', copy_json);
        $(`#${MODAL_ID}Download`).on('click', download_json);
        // чипы перестраивает render, поэтому делегированно
        $(`#${MODAL_ID}Toggles`).on('click', '.dump-opt', function () {
            const key = $(this).attr('data-opt');
            opts[key] = !opts[key];
            log(`option ${key}=${opts[key]}`, 'dump_options');
            render();
        });
    }
    function show() {
        if (!p.$(`#${MODAL_ID}`).length)
            build();
        p.$(`#${MODAL_ID}Backdrop`).show();
        p.$(`#${MODAL_ID}`).show();
        render();
        if (!update_timer)
            update_timer = setInterval(render, UPDATE_MS);
    }
    function hide() {
        p.$(`#${MODAL_ID}`).hide();
        p.$(`#${MODAL_ID}Backdrop`).hide();
        if (update_timer) {
            clearInterval(update_timer);
            update_timer = null;
        }
    }
    function toggle() {
        if (!p.$(`#${MODAL_ID}`).length)
            build();
        if (p.$(`#${MODAL_ID}`).is(':visible'))
            hide();
        else
            show();
    }
    // Безголовому персонажу рисовать некуда: сборщик у него всё равно доступен как dump_collect().
    if (!w.game || w.game.graphics) {
        // движок чистит кнопки при старте кода, поэтому ставим с задержкой
        setTimeout(() => {
            const buttons = w.buttons || p.code_buttons;
            if (buttons && buttons[BUTTON_KEY]) {
                delete buttons[BUTTON_KEY];
                p.$('.codebutton' + BUTTON_KEY).remove();
            }
            p.$(`#${MODAL_ID}`).remove();
            p.$(`#${MODAL_ID}Backdrop`).remove();
            add_top_button(BUTTON_KEY, BUTTON_LABEL, toggle);
        }, 100);
    }
    // #endregion окно
    w.dump_show = show;
    w.dump_hide = hide;
    w.dump_toggle = toggle;
    w.dump_collect = collect;
    w.dump_collect_all = collect_all;
    w.dump_last = () => last;
    w.dump_merged = () => merged;
    w.dump_request = request_peer;
    w.dump_party = () => ({ candidates: party_candidates(), found, picked });
})();
