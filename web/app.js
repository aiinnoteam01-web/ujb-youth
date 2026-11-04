/* 의정부 청년모아 — 정적 화면 (외부 스크립트 없음) */
(() => {
  "use strict";

  // ---------- 상수 ----------
  const SCOPE = { uijeongbu: "의정부시", gyeonggi: "경기도", national: "전국" };
  const SITUATIONS = [
    { cat: "일자리", name: "일자리를 찾고 있어요", desc: "구직·면접·인턴·채용", icon: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' },
    { cat: "주거", name: "독립해서 살고 있어요", desc: "월세·전세·임대주택", icon: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>' },
    { cat: "교육", name: "배우고 싶어요", desc: "장학·교육·훈련", icon: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>' },
    { cat: "생활·복지", name: "생활비가 걱정돼요", desc: "수당·감면·건강·금융", icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4.5a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3H15"/>' },
    { cat: "창업", name: "창업을 준비해요", desc: "사업화 자금·공간·멘토링", icon: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8l5.5-.8z"/>' },
    { cat: "문화·참여", name: "즐기고 참여하고 싶어요", desc: "문화·여가·정책 참여", icon: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.8 6 5.5"/>' },
  ];
  const SORTS = { deadline: "마감 임박순", views: "많이 본 순", name: "이름순" };
  const STORE = { saved: "ujb.saved", age: "ujb.age" };

  // ---------- 상태 ----------
  let ITEMS = [], STATUS = null, UPDATED = "";
  const byId = new Map();

  // ---------- 저장 (이 브라우저에만) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  };
  const saved = new Set(store.get(STORE.saved, []));
  let myAge = store.get(STORE.age, null);

  // ---------- 날짜 ----------
  const kstToday = () => {
    const d = new Date(Date.now() + 9 * 3600e3);
    return d.toISOString().slice(0, 10);
  };
  const TODAY = kstToday();
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const fmt = (iso) => iso ? `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}` : "";

  function state(it) {
    if (it.start && it.start > TODAY) return "upcoming";
    if (it.always || !it.end) return "always";
    return "open";
  }
  function dLeft(it) { return it.end && !it.always ? days(TODAY, it.end) : null; }

  // ---------- DOM 도우미 ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  function svg(paths, cls) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    if (cls) s.setAttribute("class", cls);
    s.innerHTML = paths; // 고정 문자열만 사용 (데이터 아님)
    return s;
  }
  const BOOKMARK = '<path d="M6 3h12v18l-6-4-6 4z"/>';

  // ---------- 필터 ----------
  function ageOk(it) {
    if (myAge === null || myAge === "") return true;
    const a = Number(myAge);
    if (it.age_min !== null && it.age_min !== undefined && a < it.age_min) return false;
    if (it.age_max !== null && it.age_max !== undefined && a > it.age_max) return false;
    return true;
  }
  const norm = (s) => (s || "").replace(/\s+/g, "").toLowerCase();
  function matches(it, q) {
    if (q.scope && it.scope !== q.scope) return false;
    if (q.cat && it.category !== q.cat) return false;
    if (q.state && state(it) !== q.state) return false;
    if (q.soon) { const d = dLeft(it); if (d === null || d > 7) return false; }
    if (q.date && it.end !== q.date) return false;
    if (q.mine && !ageOk(it)) return false;
    if (q.q) {
      const hay = norm(`${it.title} ${it.agency} ${it.target_text} ${it.summary}`);
      if (!norm(q.q).split(/[,]/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }
  function sortItems(list, how) {
    const big = 99999;
    const key = {
      deadline: (it) => { const d = dLeft(it); return d === null ? big : d; },
      views: (it) => -(it.views || 0),
      name: () => 0,
    }[how] || (() => 0);
    return list.slice().sort((a, b) => (key(a) - key(b)) || a.title.localeCompare(b.title, "ko"));
  }

  // ---------- 조각 ----------
  function scopeBadge(it) { return h("span", { class: `badge b-${it.scope}` }, SCOPE[it.scope] || ""); }
  function ddayBadge(it) {
    const st = state(it);
    if (st === "upcoming") return h("span", { class: "dday soon" }, `${fmt(it.start)} 접수 시작`);
    if (st === "always") return h("span", { class: "dday" }, "상시");
    const d = dLeft(it);
    const cls = d <= 3 ? "dday d3" : d <= 7 ? "dday d7" : "dday";
    return h("span", { class: cls, title: `마감 ${it.end}` }, d === 0 ? "오늘 마감" : `D-${d}`);
  }
  function saveButton(it) {
    const on = saved.has(it.id);
    return h("button", {
      class: "save", type: "button", "aria-pressed": on ? "true" : "false",
      "aria-label": on ? `${it.title} 관심 목록에서 빼기` : `${it.title} 관심 담기`,
      onclick: (e) => { toggleSave(it.id); const b = e.currentTarget; const now = saved.has(it.id); b.setAttribute("aria-pressed", String(now)); b.setAttribute("aria-label", now ? `${it.title} 관심 목록에서 빼기` : `${it.title} 관심 담기`); },
    }, svg(BOOKMARK));
  }
  function itemRow(it) {
    return h("li", { class: "item" },
      scopeBadge(it),
      h("div", { class: "item-body" },
        h("button", { class: "item-title", type: "button", onclick: () => openDetail(it.id) }, it.title),
        h("div", { class: "item-meta" }, [it.category, it.agency].filter(Boolean).join(" · ")),
      ),
      ddayBadge(it),
      saveButton(it),
    );
  }
  function itemList(list, emptyText) {
    if (!list.length) return h("p", { class: "empty" }, emptyText || "조건에 맞는 지원사업이 없습니다.");
    return h("ul", { class: "items" }, list.map(itemRow));
  }
  function meBar() {
    const id = "my-age";
    const input = h("input", { id, type: "number", min: "15", max: "45", inputmode: "numeric", value: myAge ?? "", placeholder: "예: 27" });
    const apply = () => { const v = input.value.trim(); myAge = v === "" ? null : Math.max(0, Math.min(99, Number(v))); store.set(STORE.age, myAge); render(); };
    input.addEventListener("change", apply);
    return h("div", { class: "me" },
      h("strong", {}, "내 조건"),
      h("label", { for: id }, "만 나이"), input,
      h("button", { class: "btn", type: "button", onclick: apply }, "적용"),
      myAge !== null ? h("button", { class: "btn", type: "button", onclick: () => { myAge = null; store.set(STORE.age, null); render(); } }, "지우기") : null,
      h("span", { class: "muted" }, "이 브라우저에만 저장돼요"),
    );
  }
  function searchForm(initial) {
    const input = h("input", { type: "search", name: "q", value: initial || "", placeholder: "월세, 면접, 창업처럼 낱말로 찾기", "aria-label": "지원사업 검색" });
    return h("form", { class: "search", role: "search", onsubmit: (e) => { e.preventDefault(); go({ q: input.value.trim() }); } },
      input, h("button", { class: "btn btn-primary", type: "submit" }, "검색"));
  }

  // ---------- 달력 ----------
  function calendar() {
    const y = Number(TODAY.slice(0, 4)), m = Number(TODAY.slice(5, 7));
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const counts = {};
    for (const it of ITEMS) if (it.end && !it.always && it.end.startsWith(TODAY.slice(0, 7)) && it.end >= TODAY && ageOk(it)) counts[it.end] = (counts[it.end] || 0) + 1;
    const max = Math.max(1, ...Object.values(counts));
    const cells = ["일", "월", "화", "수", "목", "금", "토"].map((d) => h("span", { class: "dow", "aria-hidden": "true" }, d));
    for (let i = 0; i < first; i++) cells.push(h("span", {}));
    for (let d = 1; d <= last; d++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const n = counts[iso] || 0;
      const lvl = n ? Math.min(4, 1 + Math.floor((n / max) * 3.99)) : 0;
      cells.push(h("button", {
        type: "button", class: `${lvl ? "h" + lvl : ""} ${iso === TODAY ? "today" : ""}`.trim(), disabled: !n,
        "aria-label": `${m}월 ${d}일 마감 ${n}건`, onclick: () => go({ date: iso }),
      }, d));
    }
    return h("section", { class: "panel", "aria-labelledby": "cal-h" },
      h("h2", { id: "cal-h" }, `${m}월 마감 달력`),
      h("div", { class: "cal" }, cells),
      h("p", { class: "muted" }, "색이 진할수록 마감이 몰린 날 · 날짜를 누르면 그날 마감 목록"));
  }

  // ---------- 화면: 홈 ----------
  function viewHome() {
    const live = ITEMS.filter(ageOk);
    const count = (q) => live.filter((it) => matches(it, q)).length;
    const soon = sortItems(live.filter((it) => matches(it, { soon: true })), "deadline");
    const deadlineList = sortItems(live.filter((it) => state(it) === "open"), "deadline").slice(0, 8);
    const popular = sortItems(live, "views").slice(0, 5);

    return [
      h("section", { class: "hero" },
        h("h1", {}, "의정부 청년이 지금 신청할 수 있는 지원 ", h("span", { class: "accent" }, `${live.length.toLocaleString()}건`)),
        h("p", { class: "muted" }, "의정부시 · 경기도 전체 · 전국 대상 청년 지원사업만 모았습니다. 다른 시·군 사업은 뺐어요."),
        searchForm(""),
        meBar(),
      ),
      h("section", { class: "situations", "aria-labelledby": "sit-h" },
        h("h2", { id: "sit-h" }, "지금 어떤 상황인가요?"),
        h("div", { class: "sit-grid" }, SITUATIONS.map((s) =>
          h("a", { class: "sit", href: `#/list?cat=${encodeURIComponent(s.cat)}` },
            svg(s.icon), h("span", { class: "sit-name" }, s.name), h("span", { class: "sit-desc" }, s.desc),
            h("span", { class: "sit-count" }, `${count({ cat: s.cat })}건`)))),
      ),
      h("section", { class: "tiles", "aria-label": "한눈에 보기" },
        tile("7일 안에 마감", soon.length, "#/list?soon=1", "hot"),
        tile("의정부시 사업", count({ scope: "uijeongbu" }), "#/list?scope=uijeongbu", "ujb"),
        tile("경기도 사업", count({ scope: "gyeonggi" }), "#/list?scope=gyeonggi", "gg"),
        tile("전국 대상", count({ scope: "national" }), "#/list?scope=national", ""),
        tile("곧 접수 시작", count({ state: "upcoming" }), "#/list?state=upcoming", ""),
        tile("관심 담음", saved.size, "#/saved", ""),
      ),
      h("div", { class: "cols" },
        h("section", { class: "col-main", "aria-labelledby": "dl-h" },
          h("div", { class: "section-head" }, h("h2", { id: "dl-h" }, "마감이 가까운 지원사업"), h("a", { href: "#/list?sort=deadline" }, "모두 보기")),
          itemList(deadlineList, "마감일이 정해진 지원사업이 없습니다.")),
        h("aside", { class: "col-side" },
          calendar(),
          h("section", { class: "panel", "aria-labelledby": "pop-h" },
            h("h2", { id: "pop-h" }, "많이 찾는 지원사업"),
            popular.length ? h("ol", { class: "popular" }, popular.map((it) => h("li", {}, h("button", { class: "item-title", type: "button", onclick: () => openDetail(it.id) }, it.title)))) : h("p", { class: "muted" }, "아직 자료가 없습니다."))),
      ),
    ];
  }
  function tile(label, n, href, cls) {
    return h("a", { class: `tile ${cls}`.trim(), href }, h("span", { class: "tile-label" }, label), h("span", { class: "tile-num" }, n.toLocaleString()));
  }

  // ---------- 화면: 목록 ----------
  function viewList(q) {
    const list = sortItems(ITEMS.filter((it) => matches(it, { ...q, mine: q.mine !== "0" })), q.sort || "deadline");
    const chipRow = (label, key, options) => h("div", { class: "frow", role: "group", "aria-label": label },
      h("span", { class: "flabel" }, label),
      [["", "전체"], ...options].map(([v, t]) => h("button", { class: "chip", type: "button", "aria-pressed": String((q[key] || "") === v), onclick: () => go({ ...q, [key]: v || undefined }) }, t)));
    const title = q.date ? `${fmt(q.date)} 마감` : q.cat ? `${q.cat} 지원사업` : q.soon ? "7일 안에 마감" : "전체 지원사업";
    return [
      h("section", { class: "hero" }, h("h1", {}, title), searchForm(q.q), meBar()),
      h("section", { class: "filters", "aria-label": "조건" },
        chipRow("구분", "scope", Object.entries(SCOPE)),
        chipRow("분야", "cat", SITUATIONS.map((s) => [s.cat, s.cat])),
        chipRow("신청 상태", "state", [["open", "접수 중"], ["upcoming", "접수 예정"], ["always", "상시·예산 소진 시"]]),
        h("div", { class: "frow" },
          h("span", { class: "flabel" }, "기타"),
          h("button", { class: "chip", type: "button", "aria-pressed": String(!!q.soon), onclick: () => go({ ...q, soon: q.soon ? undefined : "1" }) }, "7일 안에 마감"),
          q.date ? h("button", { class: "chip", type: "button", "aria-pressed": "true", onclick: () => go({ ...q, date: undefined }) }, `${fmt(q.date)} 마감 ✕`) : null,
          h("label", { class: "sr-only", for: "sort" }, "정렬"),
          h("select", { id: "sort", onchange: (e) => go({ ...q, sort: e.target.value }) },
            Object.entries(SORTS).map(([v, t]) => h("option", { value: v, selected: (q.sort || "deadline") === v }, t))),
          h("a", { href: "#/list", class: "btn" }, "조건 지우기"))),
      h("div", { class: "result-bar" }, h("h2", {}, `${list.length.toLocaleString()}건`),
        myAge !== null ? h("span", { class: "muted" }, `만 ${myAge}세 조건 적용 중`) : null),
      itemList(list),
    ];
  }

  // ---------- 화면: 관심 / 안내 ----------
  function viewSaved() {
    const list = sortItems([...saved].map((id) => byId.get(id)).filter(Boolean), "deadline");
    const gone = [...saved].filter((id) => !byId.has(id)).length;
    return [
      h("section", { class: "hero" }, h("h1", {}, "관심 목록"), h("p", { class: "muted" }, "마감이 가까운 순서입니다. 이 브라우저에만 저장돼요.")),
      gone ? h("p", { class: "muted" }, `담아 둔 ${gone}건은 마감되었거나 목록에서 사라졌습니다.`) : null,
      itemList(list, "아직 담은 지원사업이 없습니다. 목록에서 책갈피 단추를 눌러 담아 보세요."),
    ];
  }
  function viewAbout() {
    const rows = STATUS ? Object.values(STATUS.sources) : [];
    return [h("section", { class: "about" },
      h("h1", {}, "안내"),
      h("p", {}, "의정부 청년모아는 공공데이터포털·경기데이터드림의 공개 API를 하루 두 번(09:00·16:00) 모아, 의정부시에 사는 청년(만 19~39세)이 신청할 수 있는 지원사업만 정리해 보여 줍니다. 의정부시 공식 사이트가 아니며, 신청 전에는 반드시 원문 공고를 확인하세요."),
      h("h2", {}, "무엇을 보여 주나요?"),
      h("ul", {},
        h("li", {}, "의정부시 사업 — 의정부시가 소관하는 사업"),
        h("li", {}, "경기도 사업 — 경기도 전체 또는 의정부를 포함한 지역 대상 사업"),
        h("li", {}, "전국 사업 — 지역 제한이 없는 중앙부처·공공기관 사업"),
        h("li", {}, "다른 시·군·도만 대상인 사업, 이미 마감된 공고는 뺍니다")),
      h("h2", {}, "자료 출처와 최근 수집"),
      h("table", {},
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "출처"), h("th", { scope: "col" }, "상태"), h("th", { scope: "col" }, "의정부 청년 해당"))),
        h("tbody", {}, rows.map((s) => h("tr", {}, h("td", {}, s.name),
          h("td", {}, s.ok ? h("span", { class: "ok" }, "정상") : h("span", { class: "fail" }, "수집 실패 (이전 자료 표시)")),
          h("td", {}, `${(s.kept || 0).toLocaleString()}건${s.fetched ? ` / 전체 ${s.fetched.toLocaleString()}건` : ""}`))))),
      h("p", { class: "muted" }, `최근 수집: ${UPDATED || "-"}`),
      h("h2", {}, "개인정보"),
      h("p", {}, "가입·로그인·쿠키·방문 분석이 없습니다. 관심 목록과 내 나이는 이 브라우저 안에만 저장되고 서버로 보내지 않습니다."),
      h("h2", {}, "이용 조건"),
      h("p", {}, "기업마당 공고는 공공누리 제3유형(출처표시·변경금지)에 따라 원문 내용을 고치지 않고 출처와 함께 보여 줍니다."),
    )];
  }

  // ---------- 상세 ----------
  const dlg = () => document.getElementById("detail");
  function openDetail(id, push = true) {
    const it = byId.get(id);
    if (!it) return;
    const d = dlg();
    d.replaceChildren(detailContent(it));
    if (!d.open) d.showModal();
    if (push) history.replaceState(null, "", withParam("id", id));
  }
  function closeDetail() {
    const d = dlg();
    if (d.open) d.close();
  }
  function detailContent(it) {
    const sec = (title, text) => text ? h("section", {}, h("h3", {}, title), h("p", {}, text)) : null;
    const share = async () => {
      const url = location.href;
      try {
        if (navigator.share) await navigator.share({ title: it.title, url });
        else { await navigator.clipboard.writeText(url); shareBtn.textContent = "링크를 복사했어요"; }
      } catch { /* 취소 */ }
    };
    const shareBtn = h("button", { class: "btn", type: "button", onclick: share }, "공유");
    const periodText = it.always && !it.end ? (it.period_text || "상시") : [it.start && `${it.start} 부터`, it.end && `${it.end} 까지`].filter(Boolean).join(" ") || it.period_text;
    return h("div", {},
      h("div", { class: "d-head" },
        h("button", { class: "btn d-close", type: "button", "aria-label": "닫기", onclick: closeDetail }, "닫기"),
        h("div", { class: "d-badges" }, scopeBadge(it), h("span", { class: "badge b-cat" }, it.category), ddayBadge(it)),
        h("h2", { id: "detail-title" }, it.title),
        h("p", { class: "muted" }, it.agency)),
      h("div", { class: "d-body" },
        sec("신청 기간", periodText),
        sec("지원 대상", it.target_text),
        sec("내용", it.summary),
        sec("신청 방법", it.apply_method),
        sec("문의", it.contact),
        h("div", { class: "d-actions" },
          it.url ? h("a", { class: "btn btn-primary", href: it.url, target: "_blank", rel: "noopener noreferrer" }, "원문 공고 보기") : null,
          saveButton(it), shareBtn,
          h("button", { class: "btn", type: "button", onclick: () => window.print() }, "인쇄")),
        h("p", { class: "license" }, `출처: ${{ gov24: "행정안전부 보조금24", bizinfo: "중소벤처기업부 기업마당(공공누리 제3유형)", kstartup: "창업진흥원 K-Startup", jobaba: "경기도 잡아바(경기데이터드림)" }[it.source] || it.source} · 신청 전 원문 공고를 꼭 확인하세요.`)));
  }

  // ---------- 관심 ----------
  function toggleSave(id) {
    saved.has(id) ? saved.delete(id) : saved.add(id);
    store.set(STORE.saved, [...saved]);
    document.getElementById("saved-count").textContent = saved.size;
  }

  // ---------- 주소(해시) ----------
  function parse() {
    const raw = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = raw.split("?");
    const q = Object.fromEntries(new URLSearchParams(qs || ""));
    return { path: path || "/", q };
  }
  function withParam(k, v) {
    const { path, q } = parse();
    if (v === undefined) delete q[k]; else q[k] = v;
    const s = new URLSearchParams(Object.entries(q).filter(([, x]) => x !== undefined && x !== "")).toString();
    return `#${path}${s ? "?" + s : ""}`;
  }
  function go(q) {
    const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== "")).toString();
    location.hash = `#/list${s ? "?" + s : ""}`;
  }

  // ---------- 그리기 ----------
  function render() {
    const { path, q } = parse();
    const main = document.getElementById("main");
    const view = path === "/list" ? viewList(q) : path === "/saved" ? viewSaved() : path === "/about" ? viewAbout() : viewHome();
    main.replaceChildren(...view.filter(Boolean));
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const on = (a.dataset.nav === "home" && path === "/") || `/${a.dataset.nav}` === path;
      on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
    });
    document.getElementById("saved-count").textContent = saved.size;
    if (q.id) openDetail(q.id, false); else closeDetail();
  }

  let lastPath = null;
  window.addEventListener("hashchange", () => {
    const { path } = parse();
    render();
    if (path !== lastPath) { window.scrollTo(0, 0); document.getElementById("main").focus({ preventScroll: true }); }
    lastPath = path;
  });

  document.addEventListener("DOMContentLoaded", async () => {
    dlg().addEventListener("close", () => { if (parse().q.id) history.replaceState(null, "", withParam("id", undefined)); });
    dlg().addEventListener("click", (e) => { if (e.target === dlg()) closeDetail(); });
    try {
      const [data, status] = await Promise.all([
        fetch("data/items.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
        fetch("data/status.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      ITEMS = data.items || [];
      UPDATED = (data.updated_at || "").replace("T", " ").slice(0, 16);
      STATUS = status;
      ITEMS.forEach((it) => byId.set(it.id, it));
      const failed = STATUS ? Object.values(STATUS.sources).filter((s) => !s.ok).map((s) => s.name) : [];
      document.getElementById("updated").textContent = `${UPDATED} 갱신` + (failed.length ? ` · 수집 실패: ${failed.join(", ")}` : "");
    } catch {
      document.getElementById("updated").textContent = "자료 없음";
      document.getElementById("main").replaceChildren(h("p", { class: "empty" }, "아직 수집된 자료가 없습니다. 첫 수집이 끝나면 지원사업이 표시됩니다."));
      return;
    }
    lastPath = parse().path;
    render();
  });
})();
