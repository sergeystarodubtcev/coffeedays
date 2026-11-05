(function () {
  "use strict";

  var CFG = window.CD_CONFIG || {};

  /* ---------- Роли ---------- */
  var ROLES = [
    { id: "Координатор волонтёров", ico: "🧭", c: "#F3E3D3", tag: "Срочно",
      text: "Распределяете людей по зонам, проводите брифинги и держите связь с организаторами в дни фестиваля." },
    { id: "Координатор зоны", ico: "📍", c: "#E3EBEF", tag: "Срочно",
      text: "Отвечаете за свою площадку: опен-эйр, фойе, лекторий или консольный этаж с чемпионатами." },
    { id: "Волонтёр площадки", ico: "🙌", c: "#E7E9E0",
      text: "Встреча и навигация гостей, регистрация, помощь участникам маркета и порядок на площадке." },
    { id: "Команда чемпионатов", ico: "🏆", c: "#F3E3D3",
      text: "Подготовка станций, таймкипинг, раннеры, помощь судьям и кураторам латте-арта, классики и альтернативы." },
    { id: "Лекторий и дегустации", ico: "🎤", c: "#E3EBEF",
      text: "Встречаете спикеров, следите за таймингом и техникой, помогаете на каппингах и чайных церемониях." },
    { id: "Маркет и участники", ico: "🛍", c: "#E7E9E0",
      text: "Работа с обжарщиками, кондитерами и мастерами: заезд, расстановка, ответы на вопросы." },
    { id: "SMM и контент", ico: "📱", c: "#F3E3D3",
      text: "Сторис, посты и анонсы в Telegram и ВКонтакте, репортажи с площадки в реальном времени." },
    { id: "Фото и видео", ico: "📸", c: "#E3EBEF",
      text: "Снимаете чемпионаты, лекции и атмосферу — именно эти кадры станут лицом фестиваля." },
    { id: "Дизайн", ico: "🎨", c: "#E7E9E0",
      text: "Афиши, навигация, сертификаты и визуалы для соцсетей в фирменном стиле КофеДней." },
    { id: "Партнёры и спонсоры", ico: "🤝", c: "#F3E3D3",
      text: "Поиск и ведение партнёров, подготовка предложений, коммуникация с брендами." },
    { id: "Монтаж и логистика", ico: "📦", c: "#E3EBEF",
      text: "Застройка и демонтаж площадки, перевозка оборудования, техническая подготовка." },
    { id: "Другое — предложу сам(а)", ico: "✨", c: "#E7E9E0",
      text: "Есть идея или навык, которого нет в списке? Расскажите о нём в анкете!" }
  ];

  var grid = document.getElementById("rolesGrid");
  var chipsBox = document.getElementById("roleChips");

  ROLES.forEach(function (r) {
    // карточка
    var card = document.createElement("button");
    card.type = "button";
    card.className = "role reveal";
    card.dataset.role = r.id;
    card.style.setProperty("--c", r.c);
    card.innerHTML =
      (r.tag ? '<span class="role__tag">' + r.tag + "</span>" : "") +
      '<span class="role__ico" aria-hidden="true">' + r.ico + "</span>" +
      "<h3>" + r.id + "</h3><p>" + r.text + "</p>" +
      '<span class="role__pick">Выбрать в анкете →</span>';
    grid.appendChild(card);

    // чип в форме
    var label = document.createElement("label");
    label.className = "chip";
    label.innerHTML = '<input type="checkbox" name="roles" value="' + r.id + '"><span>' + r.ico + " " + r.id + "</span>";
    chipsBox.appendChild(label);
  });

  function roleInput(id) {
    return chipsBox.querySelector('input[value="' + id.replace(/"/g, '\\"') + '"]');
  }
  function syncCards() {
    grid.querySelectorAll(".role").forEach(function (card) {
      var inp = roleInput(card.dataset.role);
      card.classList.toggle("is-picked", !!(inp && inp.checked));
      card.querySelector(".role__pick").textContent = inp && inp.checked ? "Выбрано в анкете" : "Выбрать в анкете →";
    });
  }
  grid.addEventListener("click", function (e) {
    var card = e.target.closest(".role");
    if (!card) return;
    var inp = roleInput(card.dataset.role);
    var wasChecked = inp.checked;
    inp.checked = !wasChecked;
    syncCards();
    if (!wasChecked) {
      toast("«" + card.dataset.role + "» добавлено в анкету");
    }
  });
  chipsBox.addEventListener("change", syncCards);

  /* ---------- Тост ---------- */
  var toastEl;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement("a");
      toastEl.href = "#apply";
      toastEl.className = "toast";
      Object.assign(toastEl.style, {
        position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%) translateY(20px)",
        background: "var(--burgundy)", color: "var(--cream)", padding: "14px 22px", borderRadius: "999px",
        fontWeight: "700", fontSize: ".92rem", textDecoration: "none", boxShadow: "0 12px 30px -10px rgba(89,21,32,.6)",
        opacity: "0", transition: "all .3s ease", zIndex: "100", whiteSpace: "nowrap", maxWidth: "calc(100% - 32px)",
        overflow: "hidden", textOverflow: "ellipsis"
      });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text + " · к анкете ↓";
    requestAnimationFrame(function () {
      toastEl.style.opacity = "1";
      toastEl.style.transform = "translateX(-50%) translateY(0)";
    });
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      toastEl.style.opacity = "0";
      toastEl.style.transform = "translateX(-50%) translateY(20px)";
    }, 2600);
  }

  /* ---------- Партнёры ---------- */
  var LOGOS = [
    ["ok_logo", "Окспрессо"], ["gemma_logo", "Gemma"], ["ekoniva", "Эконива"], ["buntaro", "Buntaro"],
    ["zames", "Замешательство"], ["kultura", "Культура"], ["pauza", "Пауза на кофе"], ["barrel", "Barrel"],
    ["mkale", "M/KALE"], ["znak", "Знак"], ["tk", "Только Классика"], ["seeumatcha", "See you matcha"],
    ["vega", "Vega Natura"], ["hiwater", "HIWATER"], ["herbarista", "Herbarista"], ["lanota", "LA NOTA"],
    ["hogarcafe", "Hogar Cafe"], ["torrefacto", "Torrefacto"], ["triptikh", "ТРИПТИХ Кофе"], ["submarine", "Submarine"],
    ["restea", "Restea"], ["chillesta", "Chillesta"], ["shu-i-sheng", "Шу и Шэн"], ["li-bo", "Ли Бо"],
    ["chernogolovka", "Черноголовка"], ["endorphin", "Endorphin cakebar"], ["carimali", "Carimali"], ["lebedyan", "Лебедянь"],
    ["zinus", "Zinus"], ["aist", "Керамика АИСТ"], ["bernin", "BЁRNIN"], ["west4", "West4 Roasters"],
    ["cofix_logo", "Cofix"], ["aqua-balance", "Aqua balance"], ["new-coffee-machines", "New Coffee Machines"],
    ["slavyanka", "Славянка"], ["felida", "Пряничная Фелида"], ["wts", "WTS?!"], ["media-1", "Медиа-гид Шарф"],
    ["vrnfoodblog", "@vrnfoodblog"]
  ];
  var marquee = document.getElementById("marquee");
  var half = Math.ceil(LOGOS.length / 2);
  [LOGOS.slice(0, half), LOGOS.slice(half)].forEach(function (set, i) {
    var row = document.createElement("div");
    row.className = "marquee__row" + (i ? " marquee__row--rev" : "");
    var html = set.map(function (l) {
      return '<div class="logo-card" title="' + l[1] + '"><img src="assets/logos/' + l[0] + '.webp" alt="' + l[1] + '" decoding="async"></div>';
    }).join("");
    row.innerHTML = html + html; // дубль для бесшовной прокрутки
    marquee.appendChild(row);
  });

  /* ---------- Шапка и появление ---------- */
  var header = document.querySelector(".header");
  window.addEventListener("scroll", function () {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }, { passive: true });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------- Форма ---------- */
  var form = document.getElementById("applyForm");
  var btn = document.getElementById("submitBtn");
  var msg = document.getElementById("formMsg");
  var success = document.getElementById("success");

  function setMsg(text, isError) {
    msg.textContent = text || "";
    msg.classList.toggle("is-error", !!isError);
  }
  function markInvalid(el, bad) {
    var holder = el.closest(".field") || el.closest(".consent");
    if (holder) holder.classList.toggle("is-invalid", bad);
  }

  function validate() {
    var ok = true, first = null;
    var name = form.elements.name, phone = form.elements.phone, consent = form.elements.consent;
    var roles = form.querySelectorAll('input[name="roles"]:checked');

    var nameBad = name.value.trim().length < 2;
    markInvalid(name, nameBad); if (nameBad) { ok = false; first = first || name; }

    var digits = phone.value.replace(/\D/g, "");
    var phoneBad = digits.length < 10;
    markInvalid(phone, phoneBad); if (phoneBad) { ok = false; first = first || phone; }

    var rolesBad = roles.length === 0;
    markInvalid(chipsBox, rolesBad); if (rolesBad) { ok = false; first = first || chipsBox; }

    var email = form.elements.email;
    var emailBad = email.value.trim() !== "" && !/^\S+@\S+\.\S+$/.test(email.value.trim());
    markInvalid(email, emailBad); if (emailBad) { ok = false; first = first || email; }

    markInvalid(consent, !consent.checked); if (!consent.checked) { ok = false; first = first || consent; }

    if (!ok) {
      setMsg("Проверьте отмеченные поля: имя, телефон, роль и согласие обязательны.", true);
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      if (first.focus) first.focus({ preventScroll: true });
    }
    return ok;
  }

  form.addEventListener("input", function (e) { markInvalid(e.target, false); });
  form.addEventListener("change", function (e) { if (e.target.name === "roles") markInvalid(chipsBox, false); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    setMsg("");
    if (form.elements.website.value) return; // бот
    if (!validate()) return;

    if (!CFG.SCRIPT_URL) {
      setMsg("Форма ещё не подключена к Google Таблице: укажите SCRIPT_URL в config.js.", true);
      return;
    }

    var fd = new FormData(form);
    var data = new URLSearchParams();
    ["name", "age", "phone", "telegram", "email", "city", "experience", "about"].forEach(function (k) {
      data.append(k, (fd.get(k) || "").toString().trim());
    });
    data.append("roles", fd.getAll("roles").join(", "));
    data.append("availability", fd.getAll("availability").join(", "));
    data.append("source", location.href);
    data.append("userAgent", navigator.userAgent);

    btn.disabled = true;
    btn.classList.add("is-loading");
    btn.querySelector(".btn__label").textContent = "Отправляем…";

    // Apps Script не отдаёт CORS-заголовки на POST, поэтому no-cors:
    // ответ прочитать нельзя, но строка в таблицу записывается.
    fetch(CFG.SCRIPT_URL, { method: "POST", mode: "no-cors", body: data })
      .then(function () {
        form.hidden = true;
        success.hidden = false;
        success.scrollIntoView({ behavior: "smooth", block: "center" });
      })
      .catch(function () {
        setMsg("Не получилось отправить. Проверьте интернет и попробуйте ещё раз.", true);
      })
      .finally(function () {
        btn.disabled = false;
        btn.classList.remove("is-loading");
        btn.querySelector(".btn__label").textContent = "Отправить заявку";
      });
  });

  document.getElementById("againBtn").addEventListener("click", function () {
    form.reset();
    syncCards();
    success.hidden = true;
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
