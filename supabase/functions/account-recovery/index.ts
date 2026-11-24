// Trackigami : fonction serveur « account-recovery » (récupération d'un compte avec son code de secours) (Supabase Edge Function).
// FICHIER GÉNÉRÉ par tools/build-function.mjs à partir de server.ts et du code du jeu :
// ne pas modifier à la main. À coller tel quel dans Supabase (Edge Functions).
// deno-lint-ignore-file
// @ts-nocheck
// js/accountRules.js
var FORBIDDEN_NAMES = [
  "player",
  "pilote"
];
function checkPseudo(raw, { account = false } = {}) {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return {
    ok: false,
    error: "Choisis un pseudo."
  };
  if (FORBIDDEN_NAMES.includes(name.toLowerCase())) return {
    ok: false,
    error: "\xAB Player \xBB et \xAB Pilote \xBB sont r\xE9serv\xE9s : choisis ton propre pseudo."
  };
  if (account) {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return {
      ok: false,
      error: "Le pseudo d\u2019un compte fait 3 \xE0 20 caract\xE8res : lettres, chiffres ou _ (sans espace ni accent)."
    };
  } else if (!/^[\p{L}\p{N} _.'-]{2,20}$/u.test(name)) {
    return {
      ok: false,
      error: "Le pseudo fait 2 \xE0 20 caract\xE8res (lettres, chiffres, espace, _ . - ')."
    };
  }
  return {
    ok: true,
    name
  };
}
function checkPassword(pw, pseudo = "") {
  const s = String(pw ?? "");
  if (s.length < 8) return {
    ok: false,
    error: "Le mot de passe doit faire au moins 8 caract\xE8res."
  };
  if (new TextEncoder().encode(s).length > 72) return {
    ok: false,
    error: "Le mot de passe est trop long (72 octets au plus)."
  };
  if (pseudo && s.toLowerCase() === String(pseudo).toLowerCase()) return {
    ok: false,
    error: "Le mot de passe ne doit pas \xEAtre ton pseudo."
  };
  return {
    ok: true
  };
}
var CODE_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/;
function normalizeRecoveryCode(raw) {
  if (typeof raw !== "string" || raw.length > 64) return {
    ok: false
  };
  const code = raw.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return CODE_RE.test(code) ? {
    ok: true,
    code
  } : {
    ok: false
  };
}

// supabase/functions/account-recovery/handler.js
var MAX_BODY_BYTES = 2048;
var MIN_DURATION_MS = 1500;
var UPSTREAM_TIMEOUT_MS = 8e3;
var RATE_LIMIT = {
  max: 10,
  windowMs: 6e4
};
var FAIL_MESSAGE = "Pseudo ou code de secours incorrect, ou trop d\u2019essais sur ce pseudo : r\xE9essaie dans 15 minutes.";
var WEAK_MESSAGE_CODE = "weak-password";
var sha256hex = async (text) => [
  ...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))
].map((b) => b.toString(16).padStart(2, "0")).join("");
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var Upstream = class extends Error {
};
async function readBodyLimited(req, maxBytes) {
  if (!req.body) {
    const t = await req.text();
    return new TextEncoder().encode(t).length > maxBytes ? null : t;
  }
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
      }
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.byteLength;
  }
  return new TextDecoder().decode(all);
}
function createRecoveryHandler({ supabaseUrl = "", serviceKey = "", allowedOrigin = "*", fetch: rawFetch = globalThis.fetch, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), minDurationMs = MIN_DURATION_MS, upstreamTimeoutMs = UPSTREAM_TIMEOUT_MS, rateLimit = RATE_LIMIT, log = console.error, build = null } = {}) {
  const buildStamp = () => {
    const b = build ?? globalThis.__COPYTRACK_BUILD__;
    return typeof b === "string" && /^[0-9a-f]{16}$/.test(b) ? b : null;
  };
  const fetchImpl = async (url, init = {}) => {
    try {
      return await rawFetch(url, {
        ...init,
        signal: AbortSignal.timeout(upstreamTimeoutMs)
      });
    } catch (e) {
      throw new Upstream(e && e.message);
    }
  };
  const cors = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin"
  };
  const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extra
    }
  });
  const fail = () => json(400, {
    error: FAIL_MESSAGE,
    code: "recovery-failed"
  });
  const rpc = (name, args) => fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  });
  const hits = /* @__PURE__ */ new Map();
  function tooFast(who) {
    const t = now();
    const recent = (hits.get(who) ?? []).filter((x) => t - x < rateLimit.windowMs);
    if (recent.length >= rateLimit.max) {
      hits.set(who, recent);
      return Math.max(1, Math.ceil((rateLimit.windowMs - (t - recent[0])) / 1e3));
    }
    recent.push(t);
    hits.set(who, recent);
    if (hits.size > 5e3) {
      for (const [k, v] of hits) if (!v.some((x) => t - x < rateLimit.windowMs)) hits.delete(k);
    }
    return 0;
  }
  async function recover(req) {
    if (!supabaseUrl || !serviceKey) {
      log("account-recovery : SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absentes : refus");
      return json(500, {
        error: "Fonction mal configur\xE9e."
      });
    }
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return json(413, {
      error: "Requ\xEAte trop volumineuse."
    });
    const text = await readBodyLimited(req, MAX_BODY_BYTES);
    if (text === null) return json(413, {
      error: "Requ\xEAte trop volumineuse."
    });
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, {
        error: "Requ\xEAte invalide.",
        code: "bad-request"
      });
    }
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.username !== "string" || typeof body.code !== "string" || typeof body.password !== "string" || body.username.length > 64 || body.code.length > 64 || body.password.length > 256) return json(400, {
      error: "Requ\xEAte invalide.",
      code: "bad-request"
    });
    const ip = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "inconnue").split(",")[0].trim().slice(0, 64);
    const ipKey = await sha256hex("copytrack-recovery-ip|" + ip);
    const wait = tooFast(ipKey);
    if (wait) return json(429, {
      error: `Trop de demandes : r\xE9essaie dans ${wait} s.`,
      code: "rate"
    }, {
      "Retry-After": String(wait)
    });
    const pseudo = checkPseudo(body.username, {
      account: true
    });
    const pw = checkPassword(body.password, pseudo.ok ? pseudo.name : "");
    if (!pw.ok) return json(400, {
      error: pw.error,
      code: WEAK_MESSAGE_CODE
    });
    const code = normalizeRecoveryCode(body.code);
    if (!pseudo.ok || !code.ok) return fail();
    const codeSha = await sha256hex(code.code);
    let begin;
    try {
      const r = await rpc("recovery_begin", {
        uname: pseudo.name,
        code_sha: codeSha,
        ip_key: ipKey
      });
      if (!r.ok) throw new Upstream("recovery_begin " + r.status);
      begin = await r.json();
    } catch (e) {
      log("account-recovery : recovery_begin indisponible (\xE9tape SQL 21 appliqu\xE9e ?) :", e && e.message);
      return json(503, {
        error: "Service momentan\xE9ment indisponible : r\xE9essaie dans un instant.",
        code: "unavailable"
      }, {
        "Retry-After": "30"
      });
    }
    if (!begin || typeof begin !== "object") {
      log("account-recovery : r\xE9ponse inattendue de recovery_begin");
      return json(503, {
        error: "Service momentan\xE9ment indisponible : r\xE9essaie dans un instant.",
        code: "unavailable"
      }, {
        "Retry-After": "30"
      });
    }
    if (begin.status === "rate") {
      const retry = Number.isInteger(begin.retry) ? Math.min(3600, Math.max(1, begin.retry)) : 60;
      return json(429, {
        error: `Trop de demandes : r\xE9essaie dans ${retry < 90 ? retry + " s" : Math.ceil(retry / 60) + " min"}.`,
        code: "rate"
      }, {
        "Retry-After": String(retry)
      });
    }
    if (begin.status !== "ok") return fail();
    const uid = String(begin.user_id || ""), nonce = String(begin.nonce || "");
    if (!UUID_RE.test(uid) || !UUID_RE.test(nonce)) {
      log("account-recovery : identifiants invalides dans recovery_begin");
      return json(503, {
        error: "Service momentan\xE9ment indisponible : r\xE9essaie dans un instant.",
        code: "unavailable"
      }, {
        "Retry-After": "30"
      });
    }
    const abort = async () => {
      try {
        await rpc("recovery_abort", {
          p_uid: uid,
          p_nonce: nonce
        });
      } catch {
      }
    };
    let put;
    try {
      put = await fetchImpl(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
        method: "PUT",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          password: body.password
        })
      });
    } catch (e) {
      await abort();
      log("account-recovery : Auth injoignable :", e && e.message);
      return json(503, {
        error: "Service momentan\xE9ment indisponible : r\xE9essaie dans un instant.",
        code: "unavailable"
      }, {
        "Retry-After": "10"
      });
    }
    if (!put.ok) {
      await abort();
      let ec = "";
      try {
        const j = await put.json();
        ec = String(j && (j.error_code || j.code) || "");
      } catch {
      }
      log("account-recovery : Auth a refus\xE9 le nouveau mot de passe, statut", put.status, ec);
      if (put.status === 422 || ec === "weak_password") return json(400, {
        error: "Mot de passe refus\xE9 par le serveur (trop faible ou d\xE9j\xE0 divulgu\xE9) : choisis-en un autre.",
        code: WEAK_MESSAGE_CODE
      });
      return json(503, {
        error: "Service momentan\xE9ment indisponible : r\xE9essaie dans un instant.",
        code: "unavailable"
      }, {
        "Retry-After": "10"
      });
    }
    try {
      const r = await rpc("recovery_finish", {
        p_uid: uid,
        p_nonce: nonce
      });
      if (!r.ok) throw new Upstream("recovery_finish " + r.status);
      const out = await r.json();
      if (!out || out.consumed !== true) log("account-recovery : ALERTE : le code n\u2019a pas pu \xEAtre marqu\xE9 consomm\xE9 (r\xE9servation expir\xE9e ?) : \xE0 v\xE9rifier dans recovery_log");
      else if (out.sessions === -1) log("account-recovery : ALERTE : les sessions n\u2019ont pas pu \xEAtre r\xE9voqu\xE9es c\xF4t\xE9 base : \xE0 v\xE9rifier (auth.sessions)");
    } catch (e) {
      log("account-recovery : ALERTE : recovery_finish a \xE9chou\xE9 :", e && e.message);
    }
    return json(200, {
      ok: true
    });
  }
  return async function handle(req) {
    if (req.method === "OPTIONS") return new Response("ok", {
      headers: cors
    });
    if (req.method === "GET") return json(200, {
      ok: true,
      service: "account-recovery",
      build: buildStamp(),
      actions: [
        "recover"
      ],
      limits: {
        maxBodyBytes: MAX_BODY_BYTES,
        perMinute: rateLimit.max
      }
    });
    if (req.method !== "POST") return json(405, {
      error: "M\xE9thode non autoris\xE9e."
    });
    const t0 = now();
    let res;
    try {
      res = await recover(req);
    } catch (e) {
      log("account-recovery : erreur interne :", e instanceof Upstream ? e.message : e && e.message);
      res = e instanceof Upstream ? json(503, {
        error: "Service momentan\xE9ment indisponible : r\xE9essaie dans un instant.",
        code: "unavailable"
      }, {
        "Retry-After": "10"
      }) : json(500, {
        error: "Erreur interne."
      });
    }
    const left = minDurationMs - (now() - t0);
    if (left > 0) await sleep(left);
    return res;
  };
}

// supabase/functions/account-recovery/server.ts
Deno.serve(createRecoveryHandler({
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  allowedOrigin: Deno.env.get("ALLOWED_ORIGIN") ?? "*"
}));
globalThis.__COPYTRACK_BUILD__ = "566404abcf254be2";
