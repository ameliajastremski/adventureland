// kiss.js — the anniversary "I Kiss You" event : automatic visits and an overview window.
//
// Standalone : nothing in here needs farm.js, merchant.js or metrics.js. Any script
// can pull it in with load_code("kiss") and then stay out of its way :
//
//   load_code("kiss");                              once, at startup
//   if (typeof is_kissing == "function" && is_kissing()) return;   in movement / attack loops
//   kiss_set_auto(false);                           to stop it taking over the character
//
// load_code runs a script at top level in the shared CODE scope, so every name here
// is prefixed with kiss_ and declared with var : a const that another loaded file
// already declares would throw and kill this whole file on load.
//
// Every character running this file publishes itself into kiss_overview on the top
// window, the only window all of them share : parent is the character's own game
// window, so it is private to that character. See kiss_top(). That shared object is
// what lets one window show the ticket, distance and rewards of all four at once,
// and what carries the Auto switch from one character to the rest.
//
// The event, from the game source :
//   every 30 minutes each non-PvP realm features one reachable, non-AFK player.
//   Everyone online at that moment gets the anniversary_visit condition for 5 minutes.
//   Reach the featured player and use ikissyou (range 80, no mp, 10s cooldown) before
//   it expires : that turns the ticket into one cake slice + one Anniversary Gift.
//   Kissing twice gives nothing, and joining after the pick gives no ticket at all.

var kiss_state = {
    auto: true,             // take over the character on our own
    busy: false,            // we are driving : is_kissing() reports this
    done_round: null,       // the round we already spent our ticket on
    sent: 0,                // kisses that went out this session
    last: "waiting for an event",
    last_color: "#909CC0",
};

var kiss_color_good = "#1ED97C";
var kiss_color_warn = "#FFC857";
var kiss_color_bad = "#FF6B6B";
var kiss_color_dim = "#909CC0";
var kiss_color_gold = "#E6AE3F";

var kiss_slices = ["slice_strawberry", "slice_citrus", "slice_honey", "slice_mint", "slice_blueberry", "slice_nightberry"];
var kiss_stale_ms = 5000;   // a character that stopped publishing is shown as gone
var kiss_font_size = 28;    // the window is sized in em, this is the only knob for text size
var kiss_table_width = 1500;    // the character table keeps this width and scrolls sideways if it has to

setInterval(kiss_routine, 1000);

if (game.graphics && game.html) {
    setTimeout(function () {
        let $ = parent.$;
        $("#kissWindow").remove();
        $("#kissBackdrop").remove();
        if (parent.buttons && parent.buttons["kiss"]) {
            delete parent.buttons["kiss"];
            $(".codebuttonkiss").remove();
        }
        add_top_button("kiss", "Kiss", kiss_toggle_window);
    }, 100);
}

// ========== EVENT STATE ==========

// the live round, or null. Mirrors anniversary_live_event() in the game client :
// active is the celebration, live plus id is an actual featured player right now
function kiss_event() {
    let state = server.status && server.status.anniversary;
    if (state && state.active && state.live && state.id) return state;
    return null;
}

function kiss_ticket() {
    return character.s && character.s.anniversary_visit;
}

// our invitation has to belong to this round, on this realm, and both it and the
// round have to still be running
function kiss_can_visit(state) {
    let ticket = kiss_ticket();
    if (!state || !ticket) return false;
    if (!(ticket.ms > 0)) return false;
    if (ticket.round != state.round) return false;
    if (ticket.realm != server.region + " " + server.id) return false;
    if (Date.now() >= ticket.expires) return false;
    if (Date.now() >= state.expires) return false;
    return true;
}

// the featured player as an entity, only if we can see them. target is the name,
// id is what the client passes to use_skill
function kiss_player(state) {
    if (!state) return null;
    return get_player(state.target || state.id);
}

function kiss_range() {
    return (G.skills.ikissyou && G.skills.ikissyou.range) || 80;
}

function is_kissing() {
    return kiss_state.busy;
}

// Auto is a shared setting : every character in this client window follows the last
// switch that was flipped, and a character that starts later adopts it on load.
// Pass everyone = false to change only this character without touching the others.
function kiss_set_auto(value, everyone) {
    kiss_state.auto = !!value;

    if (everyone !== false) {
        let control = kiss_control();
        control.auto = !!value;
        control.updated = Date.now();
        kiss_control_applied = control.updated;
    }

    kiss_note("auto visits " + (kiss_state.auto ? "on" : "off") + (everyone === false ? "" : " for every character"),
        kiss_state.auto ? kiss_color_good : kiss_color_dim);
}

// the auto switch lives next to the overview, on the one window every character shares
function kiss_control() {
    let top_window = kiss_top();
    if (!top_window.kiss_control) top_window.kiss_control = { auto: kiss_state.auto, updated: Date.now() };
    return top_window.kiss_control;
}

var kiss_control_applied = 0;

// pick up a switch that another character flipped. Only a newer stamp counts, so this
// never fights a local kiss_set_auto(value, false)
function kiss_sync_auto() {
    let control = kiss_control();
    if (!(control.updated > kiss_control_applied)) return;

    kiss_control_applied = control.updated;
    if (kiss_state.auto === !!control.auto) return;

    kiss_state.auto = !!control.auto;
    kiss_note("auto visits " + (kiss_state.auto ? "on" : "off") + ", set from another character",
        kiss_state.auto ? kiss_color_good : kiss_color_dim);
}

function kiss_note(text, color) {
    kiss_state.last = text;
    kiss_state.last_color = color || kiss_color_dim;
    game_log("kiss > " + text, color || kiss_color_dim);
}

// ========== SHARED STATE ACROSS CHARACTERS ==========

// Where the characters meet. parent is NOT shared : the main character's CODE sits in
// a frame of the game window, while every started character runs in an iframe of that
// same window and its CODE sits in a frame of the iframe. So parent is the character's
// own game window, one per character, and only the top window is common to all of them.
// Everything stays on adventure.land, so walking up is same origin, but the try guards
// the walk anyway and falls back to whatever we last reached.
function kiss_top() {
    let top_window = parent;
    try {
        while (top_window.parent && top_window.parent !== top_window && top_window.parent.document) {
            top_window = top_window.parent;
        }
    } catch (ex) { }
    return top_window;
}

function kiss_shared() {
    let top_window = kiss_top();
    if (!top_window.kiss_overview) top_window.kiss_overview = {};
    return top_window.kiss_overview;
}

function kiss_ticket_text(state) {
    let ticket = kiss_ticket();
    if (kiss_can_visit(state)) return "valid";
    if (ticket && ticket.ms > 0) return "other round";
    if (character.acx && character.acx.ikissyou) return "emote only";
    return "none";
}

function kiss_publish() {
    let state = kiss_event();
    let ticket = kiss_ticket();
    let player = kiss_player(state);
    let slices = {};
    let slices_total = 0;
    for (let name of kiss_slices) {
        let count = quantity(name);
        slices[name] = count;
        slices_total += count;
    }

    kiss_shared()[character.name] = {
        name: character.name,
        ctype: character.ctype,
        map: character.map,
        rip: character.rip,
        updated: Date.now(),
        auto: kiss_state.auto,
        busy: kiss_state.busy,
        sent: kiss_state.sent,
        last: kiss_state.last,
        last_color: kiss_state.last_color,
        ticket: kiss_ticket_text(state),
        ticket_ms: ticket && ticket.expires ? ticket.expires - Date.now() : 0,
        distance: player ? Math.round(distance(character, player)) : null,
        slices: slices,
        slices_total: slices_total,
        cakes: quantity("sixcake"),
        gifts: quantity("anniversarygift"),
    };
}

// ========== AUTO VISIT ==========

function kiss_routine() {
    kiss_sync_auto();
    kiss_publish();

    if (!kiss_state.auto || kiss_state.busy || character.rip) return;

    let state = kiss_event();
    if (!state) return;
    if (kiss_state.done_round == state.round) return;
    if (!kiss_can_visit(state)) return;

    kiss_visit();
}

// Walk to the featured player and kiss them. The round can roll over while we are
// travelling, so everything is checked again after the move : a kiss sent to last
// round's player is simply wasted.
async function kiss_visit(forced) {
    if (kiss_state.busy) return;

    let state = kiss_event();
    if (!state) return kiss_note("nobody is featured right now", kiss_color_dim);
    if (!forced && kiss_state.done_round == state.round) return;
    if (!kiss_can_visit(state) && !(character.acx && character.acx.ikissyou)) {
        return kiss_note("no anniversary visit for round " + state.round, kiss_color_dim);
    }

    kiss_state.busy = true;
    try {
        let player = kiss_player(state);

        // travel to the round position first : the featured player is usually far
        // away and out of our view, so there is no entity to move to yet
        if (!player || distance(character, player) > kiss_range()) {
            kiss_note("going to " + (state.target || state.id) + " on " + state.map, kiss_color_warn);
            stop("move");
            stop("smart");
            await smart_move({ map: state.map, x: state.x, y: state.y });

            state = kiss_event();
            if (!state) return kiss_note("the round ended on the way", kiss_color_bad);
            if (!kiss_can_visit(state) && !(character.acx && character.acx.ikissyou)) {
                return kiss_note("the visit expired on the way", kiss_color_bad);
            }
            player = kiss_player(state);
        }

        if (!player) return kiss_note("cannot see " + (state.target || state.id) + ", they moved", kiss_color_bad);

        // close the last few steps : the round position is where they were, not where they are
        if (distance(character, player) > kiss_range()) {
            await smart_move({ map: player.map || state.map, x: player.x, y: player.y });
            player = kiss_player(state);
            if (!player) return kiss_note("lost sight of the featured player", kiss_color_bad);
        }

        if (distance(character, player) > kiss_range()) {
            return kiss_note("still " + Math.round(distance(character, player)) + " away, out of range " + kiss_range(), kiss_color_bad);
        }

        if (is_on_cooldown("ikissyou")) {
            return kiss_note("ikissyou on cooldown, trying again shortly", kiss_color_dim);
        }

        await use_skill("ikissyou", player);
        kiss_state.sent++;
        kiss_state.done_round = state.round;
        kiss_note("kissed " + player.name + " > slice and gift on the way", kiss_color_good);
    } catch (ex) {
        kiss_note("visit failed : " + (ex && ex.message ? ex.message : JSON.stringify(ex)), kiss_color_bad);
    } finally {
        kiss_state.busy = false;
    }
}

// ========== WINDOW ==========

var kiss_update_interval = null;

function kiss_toggle_window() {
    let $ = parent.$;
    let window_element = $("#kissWindow");
    if (window_element.length === 0) {
        kiss_create_window();
        window_element = $("#kissWindow");
    }

    if (window_element.is(":visible")) {
        kiss_close_window();
    } else {
        $("#kissBackdrop").show();
        window_element.show();
        kiss_update_window();
        if (!kiss_update_interval) kiss_update_interval = setInterval(kiss_update_window, 1000);
    }
}

function kiss_close_window() {
    let $ = parent.$;
    $("#kissWindow").hide();
    $("#kissBackdrop").hide();
    if (kiss_update_interval) {
        clearInterval(kiss_update_interval);
        kiss_update_interval = null;
    }
}

function kiss_row(label, id) {
    return "<div class='kiss-row'><span class='kiss-label'>" + label + "</span><span class='kiss-value' id='" + id + "'>-</span></div>";
}

function kiss_create_window() {
    let $ = parent.$;
    $("#kissWindow").remove();
    $("#kissBackdrop").remove();

    let backdrop = $("<div id='kissBackdrop'></div>").css({
        position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
        background: "rgba(0, 0, 0, 0.5)", zIndex: 9998, display: "none"
    });

    let window_element = $(""
        + "<div id='kissWindow'>"
        + "  <div id='kissHeader'><span id='kissTitle'>Anniversary Kiss</span><button id='kissCloseBtn'>x</button></div>"
        + "  <div id='kissContent'>"
        + "    <div class='kiss-section'>"
        + "      <h3>Event</h3>"
        + "      <div class='kiss-grid'>"
        + kiss_row("Status", "kissStatus")
        + kiss_row("Round", "kissRound")
        + kiss_row("Round ends in", "kissRoundEnds")
        + kiss_row("Featured player", "kissPlayer")
        + kiss_row("Where", "kissWhere")
        + kiss_row("In sight", "kissSight")
        + "      </div>"
        + "    </div>"
        + "    <div class='kiss-section'>"
        + "      <h3>Characters</h3>"
        + "      <div id='kissChars'></div>"
        + "    </div>"
        + "    <div class='kiss-section'>"
        + "      <h3>Account rewards</h3>"
        + "      <div id='kissSlices' class='kiss-slices'></div>"
        + "      <div class='kiss-grid'>"
        + kiss_row("Sixfold Cakes", "kissCakes")
        + kiss_row("Anniversary Gifts", "kissGifts")
        + kiss_row("Slices in total", "kissSliceTotal")
        + kiss_row("Kisses this session", "kissSent")
        + "      </div>"
        + "    </div>"
        + "    <div class='kiss-actions'>"
        + "      <button id='kissAutoBtn'>Auto all: on</button>"
        + "      <button id='kissNowBtn'>Kiss now</button>"
        + "      <button id='kissMiraBtn'>Go to Mira</button>"
        + "    </div>"
        + "    <div id='kissFooter'>Auto switches every character in this window, Kiss now and Mira act on " + character.name + " only</div>"
        + "  </div>"
        + "</div>");

    // the whole window scales off this one font size : everything below is set in em
    // so that bumping kiss_font_size is all it takes to make the text bigger again
    window_element.css({
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "1400px", maxWidth: "98vw", maxHeight: "90vh", overflowY: "auto",
        zIndex: 9999, display: "none",
        background: "#1C222B", border: "2px solid " + kiss_color_gold, borderRadius: "6px",
        color: "#EFF6FF", padding: "1em",
        fontFamily: $("#bottomrightcorner").css("font-family") || "pixel",
        fontSize: kiss_font_size + "px", lineHeight: "1.4"
    });

    $("body").append(backdrop);
    $("body").append(window_element);

    $("#kissHeader").css({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6em" });
    $("#kissTitle").css({ color: kiss_color_gold, fontSize: "1.4em" });
    $("#kissCloseBtn").css({ background: "rgba(255,255,255,0.1)", color: "#EFF6FF", border: "none", cursor: "pointer", padding: "0.2em 0.6em", fontSize: "1em" });
    $(".kiss-section").css({ border: "1px solid rgba(230, 174, 63, 0.3)", borderRadius: "4px", padding: "0.5em", marginBottom: "0.5em" });
    $(".kiss-section h3").css({ margin: "0 0 0.4em 0", fontSize: "1.1em", color: kiss_color_gold });
    $(".kiss-grid").css({ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "1.5em" });
    $(".kiss-row").css({ display: "flex", justifyContent: "space-between", padding: "0.1em 0" });
    $(".kiss-label").css({ color: kiss_color_dim });
    $(".kiss-slices").css({ display: "flex", flexWrap: "wrap", gap: "0.5em", marginBottom: "0.5em" });
    // the character table needs the room its columns ask for, scroll it instead of
    // squeezing eight columns of big text into the window width
    $("#kissChars").css({ overflowX: "auto" });
    $(".kiss-actions").css({ display: "flex", gap: "0.5em" });
    $(".kiss-actions button").css({
        flex: "1", background: "rgba(230, 174, 63, 0.15)", color: "#EFF6FF",
        border: "1px solid " + kiss_color_gold, borderRadius: "3px", cursor: "pointer",
        padding: "0.5em", fontSize: "1em"
    });
    $("#kissFooter").css({ color: kiss_color_dim, fontSize: "0.7em", marginTop: "0.5em", textAlign: "center" });

    $("#kissCloseBtn").on("click", kiss_close_window);
    $("#kissBackdrop").on("click", kiss_close_window);
    parent.$(parent.document).on("keydown.kissWindow", function (e) {
        if (e.key === "Escape" && $("#kissWindow").is(":visible")) kiss_close_window();
    });

    $("#kissAutoBtn").on("click", function () {
        kiss_set_auto(!kiss_state.auto);
        kiss_update_window();
    });

    // a manual kiss ignores the auto switch, but still refuses to waste a used ticket
    $("#kissNowBtn").on("click", function () {
        kiss_visit(true);
    });

    $("#kissMiraBtn").on("click", function () {
        let mira = find_npc("anniversary_baker");
        if (!mira) return kiss_note("Mira is not around, the celebration is over", kiss_color_dim);
        kiss_note("walking to Mira", kiss_color_warn);
        smart_move("anniversary_baker").catch(function () { });
    });
}

function kiss_format_ms(ms) {
    if (!(ms > 0)) return "-";
    let total = Math.round(ms / 1000);
    let minutes = Math.floor(total / 60);
    let seconds = total % 60;
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
}

function kiss_set(id, text, color) {
    let element = parent.$("#" + id);
    element.text(text);
    element.css("color", color || "#EFF6FF");
}

function kiss_cell(text, color, width) {
    return "<div style='flex:" + (width || 1) + ";color:" + (color || "#EFF6FF") + ";overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" + text + "</div>";
}

function kiss_ticket_color(text) {
    if (text == "valid") return kiss_color_good;
    if (text == "other round" || text == "emote only") return kiss_color_warn;
    return kiss_color_dim;
}

// one row per character that publishes into the shared overview, plus a row for any
// character the client has running that never loaded this file
function kiss_render_characters(state) {
    let shared = kiss_shared();
    let active = {};
    try {
        active = get_active_characters() || {};
    } catch (ex) { }

    let names = Object.keys(shared);
    for (let name of Object.keys(active)) {
        if (!names.includes(name)) names.push(name);
    }
    names.sort();

    let header = "<div style='display:flex;gap:8px;color:" + kiss_color_dim + ";border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:4px;margin-bottom:4px'>"
        + kiss_cell("Character", kiss_color_dim, 2)
        + kiss_cell("Map", kiss_color_dim, 1.4)
        + kiss_cell("Ticket", kiss_color_dim, 1.4)
        + kiss_cell("Left", kiss_color_dim, 1)
        + kiss_cell("Dist", kiss_color_dim, 1)
        + kiss_cell("Auto", kiss_color_dim, 1)
        + kiss_cell("Kisses", kiss_color_dim, 1)
        + kiss_cell("Last", kiss_color_dim, 3.5)
        + "</div>";

    let rows = "";
    let totals = { slices: {}, slices_total: 0, cakes: 0, gifts: 0, sent: 0 };
    for (let name of kiss_slices) totals.slices[name] = 0;

    for (let name of names) {
        let entry = shared[name];

        if (!entry) {
            rows += "<div style='display:flex;gap:8px;padding:2px 0'>"
                + kiss_cell(name, kiss_color_dim, 2)
                + kiss_cell(active[name] || "?", kiss_color_dim, 1.4)
                + kiss_cell("no kiss.js", kiss_color_dim, 1.4)
                + kiss_cell("-", kiss_color_dim, 1)
                + kiss_cell("-", kiss_color_dim, 1)
                + kiss_cell("-", kiss_color_dim, 1)
                + kiss_cell("-", kiss_color_dim, 1)
                + kiss_cell("not loaded on this character", kiss_color_dim, 3.5)
                + "</div>";
            continue;
        }

        let stale = Date.now() - entry.updated > kiss_stale_ms;
        let name_color = entry.name == character.name ? kiss_color_gold : (stale ? kiss_color_dim : "#EFF6FF");
        let distance_text = entry.distance === null || entry.distance === undefined ? "-" : String(entry.distance);
        let distance_color = entry.distance === null || entry.distance === undefined
            ? kiss_color_dim
            : (entry.distance <= kiss_range() ? kiss_color_good : kiss_color_warn);

        rows += "<div style='display:flex;gap:8px;padding:2px 0" + (stale ? ";opacity:0.45" : "") + "'>"
            + kiss_cell(entry.name + (entry.rip ? " (dead)" : ""), name_color, 2)
            + kiss_cell(stale ? "gone" : entry.map, stale ? kiss_color_bad : "#EFF6FF", 1.4)
            + kiss_cell(entry.ticket, kiss_ticket_color(entry.ticket), 1.4)
            + kiss_cell(kiss_format_ms(entry.ticket_ms), entry.ticket_ms > 0 ? "#EFF6FF" : kiss_color_dim, 1)
            + kiss_cell(distance_text, distance_color, 1)
            + kiss_cell(entry.busy ? "busy" : (entry.auto ? "on" : "off"), entry.busy ? kiss_color_warn : (entry.auto ? kiss_color_good : kiss_color_dim), 1)
            + kiss_cell(String(entry.sent), entry.sent ? kiss_color_good : "#EFF6FF", 1)
            + kiss_cell(entry.last || "-", entry.last_color || kiss_color_dim, 3.5)
            + "</div>";

        // a character that stopped publishing still holds its items, so it keeps counting
        for (let slice of kiss_slices) totals.slices[slice] += (entry.slices && entry.slices[slice]) || 0;
        totals.slices_total += entry.slices_total || 0;
        totals.cakes += entry.cakes || 0;
        totals.gifts += entry.gifts || 0;
        totals.sent += entry.sent || 0;
    }

    let body = rows || kiss_cell("no character is publishing yet", kiss_color_dim);
    parent.$("#kissChars").html("<div style='min-width:" + kiss_table_width + "px'>" + header + body + "</div>");
    return totals;
}

function kiss_update_window() {
    let $ = parent.$;
    if (!$("#kissWindow").is(":visible")) return;

    let raw = server.status && server.status.anniversary;
    let state = kiss_event();

    if (!raw || !raw.active) kiss_set("kissStatus", "no celebration running", kiss_color_dim);
    else if (!state) kiss_set("kissStatus", "celebration on, nobody featured yet", kiss_color_warn);
    else kiss_set("kissStatus", "live", kiss_color_good);

    kiss_set("kissRound", state ? String(state.round) : "-");
    kiss_set("kissRoundEnds", state ? kiss_format_ms(state.expires - Date.now()) : "-");
    kiss_set("kissPlayer", state ? (state.target || state.id) : "-");
    kiss_set("kissWhere", state ? state.map + " " + Math.round(state.x) + "," + Math.round(state.y) : "-");

    let player = kiss_player(state);
    if (!state) kiss_set("kissSight", "-");
    else if (!player) kiss_set("kissSight", "not from " + character.name, kiss_color_dim);
    else kiss_set("kissSight", Math.round(distance(character, player)) + " away, need " + kiss_range(),
        distance(character, player) <= kiss_range() ? kiss_color_good : kiss_color_warn);

    let totals = kiss_render_characters(state);

    let slices_html = kiss_slices.map(function (name) {
        let count = totals.slices[name];
        return "<div style='display:flex;gap:6px;border:1px solid rgba(255,255,255,0.15);border-radius:3px;padding:2px 6px'>"
            + "<span style='color:" + kiss_color_dim + "'>" + name.replace("slice_", "") + "</span>"
            + "<span style='color:" + (count ? kiss_color_good : kiss_color_dim) + "'>" + count + "</span></div>";
    }).join("");
    $("#kissSlices").html(slices_html);

    kiss_set("kissCakes", String(totals.cakes), totals.cakes ? kiss_color_good : "#EFF6FF");
    kiss_set("kissGifts", String(totals.gifts), totals.gifts ? kiss_color_good : "#EFF6FF");
    kiss_set("kissSliceTotal", totals.slices_total + " of 6 flavors: " + kiss_slices.filter(function (n) { return totals.slices[n] > 0; }).length);
    kiss_set("kissSent", String(totals.sent), totals.sent ? kiss_color_good : "#EFF6FF");

    $("#kissAutoBtn").text("Auto all: " + (kiss_state.auto ? "on" : "off"));
    $("#kissAutoBtn").css("border-color", kiss_state.auto ? kiss_color_good : kiss_color_dim);
    $("#kissNowBtn").text(kiss_state.busy ? "visiting..." : "Kiss now");
    $("#kissNowBtn").css("border-color", kiss_state.busy ? kiss_color_warn : kiss_color_gold);
}
