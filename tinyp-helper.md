# Fairy (`tinyp`) helper — instructions for the characters on the other accounts

Audience: Claude working in the CODE scripts of the other two accounts. The goal is to add a small
"Fairy helper" behaviour to every fighter there. The coordinator is the mage **HexNeo** on the first
account, the tank is the priest **HexPri**. All characters are in one party of nine damagers.

## 1. What the Fairy is (engine facts, kaansoral/adventureland_mongodb)

| fact | where | consequence |
|---|---|---|
| `escapist`: when a player attack with a projectile is **sent**, the server looks for a monster of type `fieldgen0` within 300 px (centre to centre) of the Fairy. None found: the Fairy is teleported to a random spot of the map. | `node/server.js:3283` | **Never send an attack unless a `fieldgen0` entity stands within 300 px of the Fairy.** Every class has a projectile, melee included. |
| `fieldgen0` ("Dampening Field Generator") is a trap monster spawned by HexNeo's party; 6400 hp, loses 60 hp every 200 ms, so it lives **~21 s**. | `design/monsters.js:1453` | Everything must happen inside that window. |
| `self_healing` 1200 hp with cooldown 10 ms = **+1200 hp on every server tick (~80 ms)**, up to max hp. | `design/monsters.js:1034`, `node/server.js:13196` | Only damage that lands **between two ticks** counts. Everyone lands their hit on the same wall-clock instant (the "volley", §4). |
| `immune`: every skill fails with `skill_immune` unless it has `pierces_immunity`. | `node/server.js:3174` | Damage comes from plain `attack` plus the piercing skills: ranger `supershot` (×1.5), `3shot`, `5shot`, `piercingshot`; rogue `quickstab`, `quickpunch`; paladin `shield_slam`, `smash`; warrior `cleave`. Do not cast anything else at it. |
| hp = 5600 + 2800 per level above 1; it levels **only when it kills a player**. Attack 240 physical, **5 attacks per second**. | `level_monster`, `can_attack` | A level 3 Fairy has 11 200 hp. Do not die to it: every death adds 2800 hp. Let HexPri hold it. |
| `special`, `respawn -1`, `roam`: one per server, never respawns, wanders the halloween map. | | The mage finds it and pulls the party in with magiport. |

## 2. Required behaviour, in order

1. **Accept magiports from HexNeo.** In `on_magiport(name)`: if `name === "HexNeo"`, call `accept_magiport(name)`. The accept promise resolves ~400 ms *before* the teleport, so wait until `character.map`/`x`/`y` actually change (poll for up to 2.5 s) before doing anything else. Then `stop("smart")`, `stop("move")`, `change_target(null)`, and cancel a pending town channel if `character.c.town` is set (`stop("town")`), otherwise it fires on the new map and pulls the character away.
2. **After arrival look for the Fairy**: `get_nearest_monster({ type: "tinyp" })`. If found, `change_target(fairy)` and remember its id. If not found within 10 s, resume the normal routine.
3. **Hold.** Walk into attack range (`move` / `smart_move`, no kiting, no running away) and then stand still. While a `fieldgen0` entity is visible within 300 px of the Fairy, stand next to that generator instead, as close as your range allows (the Fairy walks to whoever it targets, so it stays inside the field when the party stands at the generator). Do not attack yet.
4. **Wait for the tank.** Attack only while **both** are true on every check:
   - a `fieldgen0` entity exists within 300 px of the Fairy (`parent.entities`, `mtype === "fieldgen0"`, centre distance `Math.hypot(dx, dy) < 300`);
   - `fairy.target === "HexPri"`.
   If either is false: hold, log why, and keep checking. Re-check both right before every send.
5. **Damage on the volley** (§4): plain `attack(fairy)` plus every piercing skill your class has, each on its own cooldown, all timed to land on the same instant. Nothing else.
6. **Stop** when the Fairy is dead (`rip`) or has not been visible for 60 s. Then resume the normal routine.
7. **Log every step** (`game_log` or the account's log helper): magiport received/accepted/arrived, Fairy found/not found, why fire is held (no field / target is not HexPri), every volley (eta, landing offset, hp), and the outcome.

## 3. Detecting the field and the Fairy

```js
function fairy_get() {
    let best = null, best_d = Infinity;
    for (let id in parent.entities) {
        let e = parent.entities[id];
        if (!e || e.mtype !== "tinyp" || e.rip) continue;
        let d = distance(character, e);
        if (d < best_d) { best = e; best_d = d; }
    }
    return best;
}

// the generator that covers the fairy, or null (server: point_distance(fairy, trap) < 300)
function fairy_field(fairy) {
    for (let id in parent.entities) {
        let e = parent.entities[id];
        if (!e || e.mtype !== "fieldgen0" || e.rip) continue;
        if (Math.hypot(e.x - fairy.x, e.y - fairy.y) < 300) return e;
    }
    return null;
}

function fairy_can_fire(fairy) {
    return !!fairy && !fairy.rip && !!fairy_field(fairy) && fairy.target === "HexPri";
}
```

## 4. The volley: land every hit on the same instant

The server computes the flight time of an attack as `floor(1000 * distance / speed)` with the speed of
your projectile (`design/projectiles.js`): class projectile, overridden by the mainhand item's
`projectile` field.

| projectile | speed | who |
|---|---|---|
| `momentum` | 320 | warrior, paladin, rogue, ranger (bows without their own projectile) |
| `magic` | 400 | mage |
| `pmagic` | 360 | priest |
| `arrow` | 500 | bows that define it |
| `magic_purple` / `magic_divine` | 400 / 480 | oozingterror / harbringer |

All accounts run on the same machine, so `Date.now()` is a shared clock and the latency is the same for
everyone. Every fighter sends its attack so that it lands on the next multiple of **1000 ms**:

```js
const VOLLEY_MS = 1000;

function fairy_projectile() {
    let mh = character.slots.mainhand && G.items[character.slots.mainhand.name];
    return (mh && mh.projectile) || G.classes[character.ctype].projectile;
}
function fairy_eta_ms(target) {
    let p = G.projectiles[fairy_projectile()];
    if (!p || p.instant || !p.speed) return 0;
    return Math.floor(1000 * distance(character, target) / p.speed);
}
// ms to wait before sending so the hit lands on the next volley instant
function fairy_volley_delay_ms(target) {
    let land = Date.now() + fairy_eta_ms(target);
    return Math.ceil(land / VOLLEY_MS) * VOLLEY_MS - land;
}

let fairy_timer = null;
function fairy_attack_tick() {                 // call every 100 ms
    let fairy = fairy_get();
    if (!fairy_can_fire(fairy)) return;        // hold: no field, or the fairy is not on HexPri
    if (!is_in_range(fairy) || !can_attack(fairy) || fairy_timer) return;
    let delay = fairy_volley_delay_ms(fairy);
    if (delay > 150) return;                   // arm the precise timer only when the volley is close
    fairy_timer = setTimeout(() => {
        fairy_timer = null;
        let f = get_entity(fairy.id);
        if (!fairy_can_fire(f)) return;        // re-check right before sending
        attack(f).catch(() => {});
        // piercing skills of this class, same instant, own cooldowns
        for (let s of ["supershot", "3shot", "quickstab", "quickpunch", "shield_slam", "smash", "cleave"]) {
            if (G.skills[s] && G.skills[s].class && G.skills[s].class.includes(character.ctype) && can_use(s)) {
                use_skill(s, f).catch(() => {});
            }
        }
    }, Math.max(0, delay));
}
```

Notes on the piercing skills: `3shot`/`5shot` do 0.7×/0.5× per target and only add value when the
Fairy is the sole target; `cleave` is 0.1–0.9× random; `supershot` (×1.5, 30 s cooldown) is the one
that matters. Skills without `pierces_immunity` fail and only waste the moment.

Do not attack between volleys: a free-running attack never lines up with the others, and if your attack
cooldown is longer than 1000 ms you simply skip that volley (the timer arms again on the next one).

## 5. Movement rules while the Fairy is the target

- No kiting, no `run_away`, no `town`, no smart_move to farm spots. If your routine has a "move to
  farm point when idle" branch, gate it on "no Fairy in sight".
- Stand still once in position: the volley timing assumes a constant distance.
- If the Fairy targets **you** (not HexPri), keep holding fire. HexPri pulls it back; do not step away
  unless your hp drops below 40 %, and then only ~150 px, straight back afterwards.
- Do not stand on the Fairy's path between it and HexPri if you are squishy.

## 6. What HexNeo does, so you know what to expect

1. Finds the Fairy, walks in, magiports **every** party member (900 mp each, so arrivals are spread over
   a few seconds; a re-send comes every 6 s until you are within 320 px of the Fairy).
2. Waits until all nine damagers are near, then orders the field generator to be placed on the Fairy.
3. HexPri opens with the first hit only when everyone is near and the field is up. From then on the
   Fairy targets HexPri and everyone volleys.
4. If the field expires with the Fairy alive, a new generator is placed (up to three per encounter).
   Your rule in §2.4 keeps you safe across the gap.
5. After the kill (or a give-up) HexNeo does nothing more; resume your routine when the Fairy is gone.

## 7. Checklist before deploying

- [ ] `on_magiport` accepts HexNeo and waits for the real teleport.
- [ ] No code path can call `attack`, `3shot`, `supershot`, etc. at a `tinyp` without `fairy_can_fire`.
- [ ] Non-piercing skills are never cast at `tinyp` (`burst`, `cburst`, `curse`, `stomp`, `agitate`, `huntersmark`, `poisonarrow`, `4fingers`... all fail on immune; `taunt` pierces but does no damage).
- [ ] The idle-farm movement is suspended while a Fairy is in sight.
- [ ] The volley timer is used, not the regular 100 ms attack loop.
- [ ] Each step is logged with the reason.
