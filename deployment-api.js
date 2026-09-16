// Deploy CODE slots through the game's public JSON API.
//
//   node deployment-api.js            — upload the files that changed
//   node deployment-api.js --all      — upload everything, changed or not
//   node deployment-api.js --dry      — show what would go up, write nothing
//   node deployment-api.js --list     — only show the slots on the server
//   node deployment-api.js farm kiss  — only these slots, by name
//
// How to run
//   1. Node 18 or newer, on Windows or in WSL. The script calls fetch() as a
//      global, older versions do not have it. Check with : node --version
//   2. Get a token at https://adventure.land/vscode > Sign in > Create token,
//      then either save it as .token next to this script (it is in .gitignore,
//      never commit it) or export it as ADVENTURELAND_TOKEN.
//   3. FILES and ROOT below have to point at files that really exist in this
//      repository, otherwise every slot fails with "cannot be read".
//   4. Start read only, and only then write :
//        node deployment-api.js --list    shows the slots, writes nothing
//        node deployment-api.js --dry     shows what would be uploaded
//        node deployment-api.js           uploads what changed
//   5. Uploading does not restart anything, restart the characters afterwards
//      so that they pick up the new code.
//
// Engine side : mcp_api.js, app.post("/mcp_api/:method"). Writing methods are
// limited to 30 calls per minute with a burst of 10, request body up to 5 MB.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;   // the slot scripts sit next to this file, in the repository root
const API = "https://adventure.land/mcp_api";
const WRITE_PACING_MS = 2200;   // 30/min, with room to spare for the read before each write

// slot -> file in the repository root and slot name. The name has to match the
// one used in load_code(), otherwise the game will not find the slot.
const FILES = {
    1: { file: "farm.js", name: "farm" },
    2: { file: "merchant.js", name: "merchant" },
    3: { file: "kiss.js", name: "kiss" },
    7: { file: "metrics.js", name: "metrics" },
};

const COLORS = { info: "", good: "\x1b[32m", warn: "\x1b[33m", error: "\x1b[31m" };
const RESET = "\x1b[0m";

function log(text, type = "info") {
    console.log((COLORS[type] || "") + text + (COLORS[type] ? RESET : ""));
}

function read_token() {
    if (process.env.ADVENTURELAND_TOKEN) return process.env.ADVENTURELAND_TOKEN.trim();
    const file = path.join(__dirname, ".token");
    try {
        const raw = fs.readFileSync(file, "utf8").trim();
        if (raw) return raw;
    } catch (ex) { }
    return null;
}

async function call(token, method, args) {
    let response;
    try {
        response = await fetch(API + "/" + method, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(Object.assign({ token }, args)),
        });
    } catch (ex) {
        throw new Error("network unreachable: " + ex.message);
    }

    let result;
    try {
        result = await response.json();
    } catch (ex) {
        throw new Error("response " + response.status + " is not JSON — the game is answering with a page, not the API");
    }

    if (result && result.failed) {
        // the most common reasons get a human readable text
        const readable = {
            invalid_token: "token rejected — expired or revoked, create a new one at https://adventure.land/vscode",
            missing_field: "the request has no " + result.field + " field",
            rate_limited: "write limit reached, wait " + Math.ceil((result.retry_after_ms || 1000) / 1000) + "s",
            save_failed: "the server could not save the slot",
            invalid_call: "method " + method + " does not exist",
        }[result.reason];
        throw new Error(readable || (result.reason || "unknown"));
    }
    if (!response.ok) throw new Error("HTTP " + response.status);
    return result;
}

function norm(text) {
    return text.replace(/\r\n/g, "\n").replace(/\s+$/, "");
}

function read_source(entry) {
    const file = path.join(ROOT, entry.file);
    let code;
    try {
        code = fs.readFileSync(file, "utf8");
    } catch (ex) {
        log("  " + entry.file + " cannot be read: " + ex.message, "error");
        return null;
    }
    if (!code.trim()) {
        log("  " + entry.file + " is empty — leaving the slot alone", "error");
        return null;
    }
    return code;
}

function age_text(file) {
    try {
        const hours = (Date.now() - fs.statSync(path.join(ROOT, file)).mtime.getTime()) / 3600000;
        return hours < 1 ? Math.round(hours * 60) + " min ago" : Math.round(hours) + " h ago";
    } catch (ex) {
        return "?";
    }
}

async function main() {
    const argv = process.argv.slice(2);
    const all = argv.includes("--all");
    const list_only = argv.includes("--list");
    const dry = argv.includes("--dry");
    const only = argv.filter(a => !a.startsWith("--"));

    const token = read_token();
    if (!token) {
        log("no token: put it in .token next to this script, or export ADVENTURELAND_TOKEN", "error");
        log("create one: https://adventure.land/vscode > Sign in > Create token");
        process.exit(1);
    }

    // list_codes shows what actually sits in the slots — this replaces the old
    // mirror in %APPDATA%, only without depending on a running client
    let remote;
    try {
        remote = await call(token, "list_codes", {});
    } catch (ex) {
        log("list_codes > " + ex.message, "error");
        process.exit(1);
    }

    const by_slot = {};
    for (const code of remote.codes || []) by_slot[String(code.slot)] = code;

    log("slots on the server: " + (remote.codes || [])
        .sort((a, b) => Number(a.slot) - Number(b.slot))
        .map(c => c.slot + " " + c.name)
        .join(", "));

    // One name in two slots is a trap : find_code_slot in the engine returns the
    // first match, and for..in over numeric keys walks them in ascending order,
    // so load_code() always takes the lower slot and the higher one quietly rots.
    const seen = {};
    for (const code of remote.codes || []) {
        const key = String(code.name).toLowerCase();
        (seen[key] = seen[key] || []).push(code.slot);
    }
    for (const name of Object.keys(seen)) {
        if (seen[name].length < 2) continue;
        const slots = seen[name].sort((a, b) => Number(a) - Number(b));
        log("the name '" + name + "' sits in slots " + slots.join(", ") + " — load_code will take "
            + slots[0] + ", the rest are dead. Delete the extras in the code editor", "warn");
    }

    if (list_only) return;

    let ok = 0, skipped = 0, failed = 0;

    for (const slot of Object.keys(FILES)) {
        const entry = FILES[slot];
        if (only.length && !only.includes(entry.name)) continue;

        const occupant = by_slot[slot];
        if (occupant && occupant.name.toLowerCase() !== entry.name.toLowerCase()) {
            log("slot " + slot + " is taken by '" + occupant.name + "' and we are sending '" + entry.name
                + "' — save_code would rename it. Fix FILES or free the slot", "error");
            failed++;
            continue;
        }

        const code = read_source(entry);
        if (code === null) { failed++; continue; }

        // compare with what is on the server : a needless write bumps the slot
        // version and makes the clients re-read the code for no reason
        if (!all && occupant) {
            try {
                const current = await call(token, "get_code", { slot });
                if (current && current.code && norm(current.code.code) === norm(code)) {
                    log("slot " + slot + " '" + entry.name + "' is already up to date (" + entry.file
                        + ", built " + age_text(entry.file) + ")");
                    skipped++;
                    continue;
                }
            } catch (ex) {
                log("  could not compare slot " + slot + " (" + ex.message + "), sending it as is", "warn");
            }
        }

        if (dry) {
            log("slot " + slot + " '" + entry.name + "' <- " + entry.file + " ("
                + Math.round(Buffer.byteLength(code, "utf8") / 1024) + "kb, built " + age_text(entry.file)
                + ")" + (occupant ? " — differs from the server copy" : " — the slot is still empty"), "warn");
            ok++;
            continue;
        }

        try {
            const saved = await call(token, "save_code", { slot, name: entry.name, code });
            const version = saved && saved.code ? saved.code.version : "?";
            log("slot " + slot + " '" + entry.name + "' <- " + entry.file + " ("
                + Math.round(Buffer.byteLength(code, "utf8") / 1024) + "kb, version " + version
                + ", built " + age_text(entry.file) + ")", "good");
            ok++;
        } catch (ex) {
            log("slot " + slot + " '" + entry.name + "' > " + ex.message, "error");
            failed++;
        }

        await new Promise(r => setTimeout(r, WRITE_PACING_MS));
    }

    log("done: " + ok + (dry ? " would go up" : " uploaded") + ", " + skipped + " unchanged, " + failed + " errors",
        failed ? "error" : (ok ? "good" : "info"));
    if (ok && dry) log("this was a dry run, nothing was written — run it again without --dry", "warn");
    else if (ok) log("the characters are still running the old code — restart them", "warn");
    if (failed) process.exit(1);
}

main().catch(ex => {
    log(ex.stack || String(ex), "error");
    process.exit(1);
});
