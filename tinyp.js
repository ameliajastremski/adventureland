// tinyp.js — Fairy ("tinyp") helper : accept HexNeo's magiport, hold fire until the
// Dampening Field is up and HexPri has the aggro, then hit on the shared volley.
//
// Standalone : nothing in here needs farm.js, merchant.js, kiss.js or metrics.js. Any
// script can pull it in with load_code("tinyp") and then stay out of its way :
//
//   load_code("tinyp");                                                  once, at startup
//   if (typeof is_tinyp_farming == "function" && is_tinyp_farming()) return;   in movement /
//                                                                        attack / event loops
//   tinyp_set_auto(false);                            to stop it taking over the character
//
// load_code runs a script at top level in the shared CODE scope, so every name here is
// prefixed with tinyp_ and declared with var : a const that another loaded file already
// declares would throw and kill this whole file on load. on_magiport is the one exception,
// it has to keep the name the engine calls.
//
// Why the whole dance (engine facts, kaansoral/adventureland_mongodb) :
//   escapist      when a player attack with a projectile is SENT the server looks for a
//                 fieldgen0 within 300 px of the Fairy. None there : the Fairy teleports to
//                 a random spot of the map and the pull is wasted. Never send without a field.
//   self_healing  1200 hp on every server tick (~80 ms). Only damage landing between two
//                 ticks counts, so everyone lands on the same wall-clock instant : the volley.
//   immune        every skill without pierces_immunity fails with skill_immune. Plain attack
//                 plus the piercing skills only.
//   level_monster the Fairy gains 2800 hp for every player it kills. Do not die to it, let
//                 HexPri hold it : that is also why we hold fire until fairy.target is HexPri.

var tinyp_coordinator = "HexNeo";   // the mage that finds the Fairy and magiports the party
var tinyp_tank = "HexPri";          // the priest that holds the aggro, fire is held until then
var tinyp_mtype = "tinyp";
var tinyp_field_mtype = "fieldgen0";

var tinyp_field_radius = 300;       // server check : point_distance(fairy, generator) < 300
var tinyp_volley_ms = 1000;         // every hit lands on a multiple of this, shared clock
var tinyp_arm_ms = 150;             // arm the precise timer only this close to the volley
var tinyp_tick_ms = 100;            // how often the state machine runs
var tinyp_arrive_ms = 2500;         // the accept resolves before the teleport, poll for the move
var tinyp_search_ms = 10000;        // no Fairy this long after arrival : give up, resume farming
var tinyp_lost_ms = 60000;          // Fairy out of sight this long : the encounter is over
var tinyp_magiport_near = 320;      // already this close to the Fairy : ignore a re-magiport
var tinyp_stand_slack = 0.85;       // stand at 85 % of our range, leaves room for its steps
var tinyp_spot_tolerance = 30;      // close enough to the standing spot, stop moving
var tinyp_retreat_hp = 40;          // % hp under which we step back from a Fairy that is on us
var tinyp_retreat_px = 150;         // and only this far, then straight back
var tinyp_retreat_ms = 3000;        // do not retreat again inside this window
var tinyp_note_ms = 5000;           // repeat an unchanged hold reason at most this often

// 3shot / 5shot pierce immunity but only do 0.7x / 0.5x per target and share the attack
// cooldown, so on a single target they cost more damage than they add. Off by default, flip
// it if the Fairy is ever fought next to other monsters worth splashing.
var tinyp_use_multishot = false;

var tinyp_color_good = "#1ED97C";
var tinyp_color_warn = "#FFC857";
var tinyp_color_bad = "#FF6B6B";
var tinyp_color_dim = "#909CC0";

var tinyp_state = {
    auto: true,             // take over the character on our own
    phase: "idle",          // idle | accepting | arriving | seeking | engaged
    fairy_id: null,
    last_seen: 0,           // last tick the Fairy was visible
    deadline: 0,            // phase timeout (arrival / search)
    from: null,             // where we stood when the magiport was accepted
    ported: false,          // we got here on HexNeo's magiport, so the encounter is real
    retreat_until: 0,
    volleys: 0,
    note: "",               // last hold reason, so it is not logged 10x a second
    note_at: 0,
};

var tinyp_timer = null;     // the armed volley, one at a time

setInterval(tinyp_routine, tinyp_tick_ms);

// ========== ENTITIES ==========

// the Fairy : the one we locked on to if it is still visible, otherwise the nearest one
function tinyp_fairy() {
    // the one we locked on to, rip included : the client keeps a dead monster around for the
    // death animation, and that is how the encounter learns the Fairy is down instead of
    // waiting out the 60 s lost timer. tinyp_can_fire is what refuses to shoot a corpse
    if (tinyp_state.fairy_id) {
        let locked = parent.entities[tinyp_state.fairy_id];
        if (locked && locked.mtype == tinyp_mtype) return locked;
    }

    let best = null, best_d = Infinity;
    for (let id in parent.entities) {
        let e = parent.entities[id];
        if (!e || e.mtype != tinyp_mtype || e.rip) continue;
        let d = distance(character, e);
        if (d < best_d) { best = e; best_d = d; }
    }
    return best;
}

// the generator that covers the Fairy, or null. Mirrors the server's escapist check :
// centre to centre, not edge to edge, and it is the Fairy that has to be inside it, not us
function tinyp_field(fairy) {
    if (!fairy) return null;
    for (let id in parent.entities) {
        let e = parent.entities[id];
        if (!e || e.mtype != tinyp_field_mtype || e.rip) continue;
        if (Math.hypot(e.x - fairy.x, e.y - fairy.y) < tinyp_field_radius) return e;
    }
    return null;
}

// the single gate in front of every send. Nothing in this file attacks a tinyp without it
function tinyp_can_fire(fairy) {
    if (!fairy || fairy.rip || fairy.mtype != tinyp_mtype) return false;
    if (character.rip) return false;
    if (!tinyp_field(fairy)) return false;              // no field : the attack teleports it away
    if (fairy.target != tinyp_tank) return false;       // not on the tank : we would take the hits
    return true;
}

// why we are not firing, for the log
function tinyp_hold_reason(fairy) {
    if (!fairy) return "no fairy in sight";
    if (character.rip) return "dead";
    if (!tinyp_field(fairy)) return "no dampening field on the fairy";
    if (fairy.target != tinyp_tank) return "fairy targets " + (fairy.target || "nobody") + ", waiting for " + tinyp_tank;
    if (!is_in_range(fairy)) return "out of range";
    if (is_moving(character)) return "still moving into position";
    return "";
}

function is_tinyp_farming() {
    return tinyp_state.phase != "idle";
}

function tinyp_set_auto(value) {
    tinyp_state.auto = !!value;
    if (!tinyp_state.auto) tinyp_finish("auto off");
    tinyp_log("fairy helper " + (tinyp_state.auto ? "on" : "off"), tinyp_state.auto ? tinyp_color_good : tinyp_color_dim);
}

// ========== LOGGING ==========

function tinyp_log(text, color) {
    game_log("fairy > " + text, color || tinyp_color_dim);
}

// the hold reasons are checked ten times a second, only log a new one or a stale one
function tinyp_note(text, color) {
    if (text == tinyp_state.note && Date.now() - tinyp_state.note_at < tinyp_note_ms) return;
    tinyp_state.note = text;
    tinyp_state.note_at = Date.now();
    tinyp_log(text, color);
}

// ========== MAGIPORT ==========

// the engine calls this when someone offers a magiport. Only HexNeo's is taken : anyone
// else's would drop us somewhere we have no business being
function on_magiport(name) {
    if (!tinyp_state.auto) return;
    if (name != tinyp_coordinator) {
        tinyp_log("ignoring magiport from " + name, tinyp_color_dim);
        return;
    }

    // HexNeo re-sends every 6 s until we are near the Fairy. Once we stand there, taking
    // another one would only throw the position and the volley timing away
    let fairy = tinyp_fairy();
    if (fairy && distance(character, fairy) < tinyp_magiport_near) {
        tinyp_log("magiport from " + name + " ignored, already " + Math.round(distance(character, fairy)) + " px from the fairy", tinyp_color_dim);
        return;
    }

    if (tinyp_state.phase == "accepting" || tinyp_state.phase == "arriving") return;

    tinyp_log("magiport from " + name + ", accepting", tinyp_color_good);
    tinyp_state.phase = "accepting";
    tinyp_state.ported = true;
    tinyp_state.from = { map: character.map, x: character.x, y: character.y };

    // the accept resolves ~400 ms before the teleport actually happens, and on older
    // runners it returns nothing at all, so the arrival is polled either way
    let accepted = null;
    try {
        accepted = accept_magiport(name);
    }
    catch (e) {
        tinyp_log("accept_magiport threw : " + e, tinyp_color_bad);
        tinyp_finish("accept failed");
        return;
    }

    if (accepted && typeof accepted.catch == "function") {
        accepted.catch((e) => tinyp_log("magiport not accepted : " + (e && e.reason ? e.reason : e), tinyp_color_warn));
    }

    tinyp_state.phase = "arriving";
    tinyp_state.deadline = Date.now() + tinyp_arrive_ms;
}

// the teleport landed : drop everything the old routine had queued
function tinyp_arrived() {
    tinyp_log("arrived on " + character.map + " (" + Math.round(character.x) + "," + Math.round(character.y) + "), looking for the fairy", tinyp_color_good);

    stop("smart");
    stop("move");
    change_target(null);

    tinyp_state.phase = "seeking";
    tinyp_state.deadline = Date.now() + tinyp_search_ms;
}

// ========== POSITIONING ==========

// the spot to stand on : as close to the generator as our range allows, because the Fairy
// walks to whoever it targets, so the party standing at the generator keeps it in the field.
// Returns null when there is nothing better to do than close on the Fairy itself
function tinyp_spot(fairy, field) {
    if (!field) return null;

    let reach = character.range * tinyp_stand_slack;
    let d = Math.hypot(field.x - fairy.x, field.y - fairy.y);
    if (d <= reach) return { x: field.x, y: field.y };   // the generator itself is in range

    // walk from the Fairy towards the generator, as far as the range lets us
    let t = reach / d;
    return { x: fairy.x + (field.x - fairy.x) * t, y: fairy.y + (field.y - fairy.y) * t };
}

function tinyp_hp_percent() {
    return character.max_hp ? (100 * character.hp / character.max_hp) : 100;
}

// is the party actually fighting this Fairy ? A magiport says yes by itself, otherwise the
// proof is a generator on it or the coordinator / tank standing next to it. Walking up to a
// Fairy that is only roaming past gets us killed alone, and every death it scores adds
// 2800 hp to it for the real attempt
function tinyp_encounter_live(fairy) {
    if (tinyp_state.ported) return true;
    if (tinyp_field(fairy)) return true;

    for (let name of [tinyp_tank, tinyp_coordinator]) {
        let player = get_player(name);
        if (player && Math.hypot(player.x - fairy.x, player.y - fairy.y) < 600) return true;
    }

    return false;
}

// no kiting, no run_away, no town : the volley timing assumes a constant distance, and
// stepping out only hands the aggro around. The one exception is §5 : the Fairy is on us
// and we are under 40 % hp, then one short step back while HexPri pulls it off
function tinyp_position(fairy) {
    if (character.rip) return;

    if (fairy.target == character.name && tinyp_hp_percent() < tinyp_retreat_hp && Date.now() > tinyp_state.retreat_until) {
        tinyp_state.retreat_until = Date.now() + tinyp_retreat_ms;
        let d = distance(character, fairy) || 1;
        let x = character.x + (character.x - fairy.x) / d * tinyp_retreat_px;
        let y = character.y + (character.y - fairy.y) / d * tinyp_retreat_px;
        if (can_move_to(x, y)) {
            tinyp_log("fairy is on me at " + Math.round(tinyp_hp_percent()) + "% hp, stepping back " + tinyp_retreat_px + " px", tinyp_color_warn);
            move(x, y);
        }
        return;
    }

    if (is_moving(character)) return;    // let the current step finish before picking a new one

    // nobody is fighting it : stay where we are. The farm loops are parked either way, so we
    // are not going to shoot it by accident, we just do not walk into it on our own
    if (!tinyp_encounter_live(fairy)) {
        tinyp_note("fairy is only roaming past, no field and no " + tinyp_tank + " nearby : standing by", tinyp_color_dim);
        return;
    }

    let spot = tinyp_spot(fairy, tinyp_field(fairy));

    if (spot) {
        if (distance(character, spot) > tinyp_spot_tolerance && can_move_to(spot.x, spot.y)) {
            move(spot.x, spot.y);
        }
        return;
    }

    // no field up yet : just be in range of the Fairy and stand still
    if (!is_in_range(fairy)) {
        let d = distance(character, fairy) || 1;
        let reach = character.range * tinyp_stand_slack;
        let x = fairy.x + (character.x - fairy.x) / d * reach;
        let y = fairy.y + (character.y - fairy.y) / d * reach;
        if (can_move_to(x, y)) move(x, y);
        else smart_move({ x: fairy.x, y: fairy.y, map: fairy.map });
    }
}

// ========== THE VOLLEY ==========

// the server flight time : floor(1000 * distance / speed) with our mainhand's projectile,
// falling back to the class one (momentum 320, magic 400, pmagic 360, arrow 500 ...)
function tinyp_projectile() {
    let mainhand = character.slots.mainhand && G.items[character.slots.mainhand.name];
    return (mainhand && mainhand.projectile) || (G.classes[character.ctype] && G.classes[character.ctype].projectile);
}

function tinyp_eta_ms(target) {
    let p = G.projectiles[tinyp_projectile()];
    if (!p || p.instant || !p.speed) return 0;
    return Math.floor(1000 * distance(character, target) / p.speed);
}

// ms to wait before sending so the hit lands on the next volley instant. Every account runs
// on this machine, so Date.now() is the same clock for all nine damagers
function tinyp_volley_delay_ms(target) {
    let land = Date.now() + tinyp_eta_ms(target);
    return Math.ceil(land / tinyp_volley_ms) * tinyp_volley_ms - land;
}

// the piercing skills of this class, everything else fails with skill_immune and only
// wastes the moment. supershot (x1.5) is the one that matters
function tinyp_piercing_skills() {
    let names = ["supershot", "piercingshot", "quickstab", "quickpunch", "shield_slam", "smash", "cleave"];
    if (tinyp_use_multishot) names = names.concat(["5shot", "3shot"]);

    return names.filter((name) => {
        let skill = G.skills[name];
        return skill && skill.class && skill.class.includes(character.ctype);
    });
}

function tinyp_send_volley(fairy, expected_land) {
    let eta = tinyp_eta_ms(fairy);
    let offset = Date.now() + eta - expected_land;

    attack(fairy).catch(() => {});

    for (let name of tinyp_piercing_skills()) {
        if (!can_use(name) || !is_in_range(fairy, name)) continue;

        // cleave is an axe / scythe skill and splashes, the rest take the single target
        if (name == "3shot" || name == "5shot") use_skill(name, [fairy]).catch(() => {});
        else if (name == "cleave") use_skill(name).catch(() => {});
        else use_skill(name, fairy).catch(() => {});
    }

    tinyp_state.volleys++;
    tinyp_log("volley " + tinyp_state.volleys + " sent, eta " + eta + " ms, landing " + offset + " ms off the instant, fairy hp " + fairy.hp + "/" + fairy.max_hp, tinyp_color_good);
}

// called every tick while engaged. Never attacks outside the volley : a free running attack
// never lines up with the other eight and the Fairy heals 1200 hp back every 80 ms
function tinyp_attack_tick(fairy) {
    if (tinyp_timer) return;

    let reason = tinyp_hold_reason(fairy);
    if (!reason && !tinyp_can_fire(fairy)) reason = "not clear to fire";
    if (reason) {
        tinyp_note("holding fire : " + reason, tinyp_color_warn);
        return;
    }

    if (!can_attack(fairy)) return;     // attack cooldown : we simply skip this volley

    let delay = tinyp_volley_delay_ms(fairy);
    if (delay > tinyp_arm_ms) return;   // arm the precise timer only when the volley is close

    let expected_land = Date.now() + tinyp_eta_ms(fairy) + delay;

    tinyp_timer = setTimeout(() => {
        tinyp_timer = null;

        // the field can expire and the aggro can move in the ms we waited, so the gate is
        // checked once more right before the send
        let f = get_entity(tinyp_state.fairy_id) || tinyp_fairy();
        if (!tinyp_can_fire(f)) {
            tinyp_note("volley dropped : " + tinyp_hold_reason(f), tinyp_color_warn);
            return;
        }
        if (!is_in_range(f) || !can_attack(f)) return;

        tinyp_send_volley(f, expected_land);
    }, Math.max(0, delay));
}

// ========== STATE MACHINE ==========

function tinyp_finish(why) {
    if (tinyp_timer) {
        clearTimeout(tinyp_timer);
        tinyp_timer = null;
    }

    if (tinyp_state.phase != "idle") {
        tinyp_log("done : " + why + " (" + tinyp_state.volleys + " volleys), resuming the routine", tinyp_color_dim);
    }

    tinyp_state.phase = "idle";
    tinyp_state.fairy_id = null;
    tinyp_state.deadline = 0;
    tinyp_state.from = null;
    tinyp_state.ported = false;
    tinyp_state.volleys = 0;
    tinyp_state.note = "";
}

function tinyp_routine() {
    if (!tinyp_state.auto) return;

    // a town channel started by the old routine fires on the new map and pulls us away
    if (tinyp_state.phase != "idle" && character.c && character.c.town) {
        tinyp_log("cancelling a pending town channel", tinyp_color_warn);
        stop("town");
    }

    if (tinyp_state.phase == "accepting") return;   // the accept is in flight

    if (tinyp_state.phase == "arriving") {
        let from = tinyp_state.from;
        let moved = !from || character.map != from.map || distance(character, from) > 200;
        if (moved) tinyp_arrived();
        else if (Date.now() > tinyp_state.deadline) tinyp_finish("magiport never landed");
        return;
    }

    if (tinyp_state.phase == "seeking") {
        let fairy = get_nearest_monster({ type: tinyp_mtype });
        if (fairy) {
            tinyp_state.fairy_id = fairy.id;
            tinyp_state.last_seen = Date.now();
            change_target(fairy);
            tinyp_log("fairy found at " + Math.round(distance(character, fairy)) + " px, hp " + fairy.hp + "/" + fairy.max_hp + ", holding fire until the field is up and it is on " + tinyp_tank, tinyp_color_good);
            tinyp_state.phase = "engaged";
        }
        else if (Date.now() > tinyp_state.deadline) {
            tinyp_finish("no fairy within " + (tinyp_search_ms / 1000) + "s of arriving");
        }
        return;
    }

    if (tinyp_state.phase == "idle") {
        // no magiport needed : if a Fairy walks into sight we join in, and this is also what
        // keeps the idle farm movement parked while one is around (§5)
        let fairy = get_nearest_monster({ type: tinyp_mtype });
        if (!fairy) return;

        tinyp_state.fairy_id = fairy.id;
        tinyp_state.last_seen = Date.now();
        tinyp_state.volleys = 0;
        tinyp_state.phase = "engaged";
        change_target(fairy);
        tinyp_log("fairy in sight at " + Math.round(distance(character, fairy)) + " px, no magiport needed", tinyp_color_good);
        return;
    }

    // engaged
    let fairy = tinyp_fairy();

    if (!fairy) {
        if (Date.now() - tinyp_state.last_seen > tinyp_lost_ms) tinyp_finish("fairy gone for " + (tinyp_lost_ms / 1000) + "s");
        return;
    }

    if (fairy.rip) {
        tinyp_finish("fairy is dead");
        return;
    }

    tinyp_state.fairy_id = fairy.id;
    tinyp_state.last_seen = Date.now();

    if (character.rip) return;          // the outer routine handles the respawn

    if (character.target != fairy.id) change_target(fairy);

    tinyp_position(fairy);
    tinyp_attack_tick(fairy);
}
