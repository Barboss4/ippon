(function () {
  "use strict";

  const STORAGE_RECORDS = "ippon_records_v1";
  const STORAGE_PROFILE = "ippon_profile_v1";
  const STORAGE_ACTIVE_EXAM = "ippon_active_exam_v1";
  const params = new URLSearchParams(window.location.search);
  const route = params.has("prova") ? "exam" : params.has("relatorio") ? "report" : "training";
  const specialRoot = document.getElementById("specialMode");
  const memoryStorage = new Map();

  const BELTS = ["Cinza / Azul", "Amarela", "Laranja", "Verde", "Roxa", "Marrom"];
  const AVAILABLE_VIDEOS = new Set([
    "videos/DE-ASHI-BARAI.mp4",
    "videos/HIZA-GURUMA.mp4",
    "videos/O-GOSHI.mp4",
    "videos/O-SOTO-GARI.mp4",
    "videos/O-UCHI-GARI.mp4",
    "videos/SASSAE-TSURI-KOMI-ASHI.mp4",
  ]);

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStorage.get(key) ?? null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memoryStorage.set(key, value);
    }
  }

  function safeRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      memoryStorage.delete(key);
    }
  }

  function readJson(key, fallback) {
    try {
      const value = safeGet(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    safeSet(key, JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function makeId(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function shuffle(items) {
    const array = [...items];
    for (let index = array.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
    }
    return array;
  }

  function getRecords() {
    const records = readJson(STORAGE_RECORDS, []);
    return Array.isArray(records) ? records : [];
  }

  function saveRecord(record) {
    const records = getRecords();
    const existingIndex = records.findIndex((item) => item.id === record.id);
    if (existingIndex >= 0) records[existingIndex] = record;
    else records.push(record);
    writeJson(STORAGE_RECORDS, records.slice(-1500));
  }

  function getProfile() {
    const profile = readJson(STORAGE_PROFILE, null);
    return profile && typeof profile.name === "string" && profile.name.trim()
      ? { name: profile.name.trim() }
      : null;
  }

  function setProfile(name) {
    const profile = { name: String(name).trim() };
    writeJson(STORAGE_PROFILE, profile);
    updateProfileChip();
    return profile;
  }

  function modeHeader(label) {
    return `
      <header class="mode-header">
        <a class="mode-brand" href="${escapeHtml(window.location.pathname)}" aria-label="Voltar ao Ippon Quiz">
          <span class="mode-brand-mark"><img src="./Logo.png" alt="" /></span>
          <span><small>Associação Esportiva</small><strong>Ippon Quiz</strong></span>
        </a>
        <span class="mode-label">${escapeHtml(label)}</span>
      </header>
    `;
  }

  function openProfileDialog(onSaved) {
    document.getElementById("profileDialog")?.remove();
    const current = getProfile();
    const overlay = document.createElement("div");
    overlay.className = "profile-overlay";
    overlay.id = "profileDialog";
    overlay.innerHTML = `
      <div class="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profileTitle">
        <button class="dialog-close" type="button" aria-label="Fechar">×</button>
        <p class="mode-eyebrow">Identificação do treino</p>
        <h2 id="profileTitle">Quem está treinando?</h2>
        <p>O nome e os resultados serão salvos somente neste aparelho.</p>
        <form>
          <label for="profileName">Nome ou apelido</label>
          <input id="profileName" name="name" maxlength="50" autocomplete="name" required value="${escapeHtml(current?.name ?? "")}" />
          <button class="mode-primary" type="submit">Continuar treino <span>→</span></button>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    const form = overlay.querySelector("form");
    const input = overlay.querySelector("input");
    const close = () => overlay.remove();
    overlay.querySelector(".dialog-close").addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (name.length < 2) {
        input.setCustomValidity("Digite pelo menos duas letras.");
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      setProfile(name);
      close();
      if (typeof onSaved === "function") onSaved();
    });
    window.setTimeout(() => input.focus(), 0);
  }

  function updateProfileChip() {
    if (route !== "training") return;
    const header = document.querySelector(".site-header");
    if (!header) return;
    const profile = getProfile();
    let button = document.getElementById("profileSwitch");
    if (!profile) {
      button?.remove();
      return;
    }
    if (!button) {
      button = document.createElement("button");
      button.id = "profileSwitch";
      button.className = "profile-switch";
      button.type = "button";
      button.addEventListener("click", () => openProfileDialog());
      header.insertBefore(button, header.querySelector(".school-link"));
    }
    button.innerHTML = `<small>Aluno</small><strong>${escapeHtml(profile.name)}</strong>`;
    button.setAttribute("aria-label", `Aluno atual: ${profile.name}. Clique para trocar.`);
  }

  function ensureTrainingProfile(onReady) {
    if (route !== "training") return true;
    if (getProfile()) return true;
    openProfileDialog(onReady);
    return false;
  }

  function saveTrainingResult(result) {
    if (route !== "training") return;
    const profile = getProfile();
    if (!profile || !result || !Number.isFinite(result.total) || result.total <= 0) return;
    saveRecord({
      id: makeId("training"),
      kind: "training",
      student: profile.name,
      level: result.level,
      belt: result.belt,
      modality: result.modality,
      modalityKey: result.modalityKey,
      total: result.total,
      correct: result.correct,
      wrong: result.wrong,
      accuracy: result.accuracy,
      bestStreak: result.bestStreak,
      completedAt: new Date().toISOString(),
    });
  }

  function choiceOptions(correct, pool) {
    const options = new Set([correct]);
    for (const candidate of shuffle(pool)) {
      if (candidate && candidate !== correct) options.add(candidate);
      if (options.size === 4) break;
    }
    return options.size === 4 ? shuffle(options) : [];
  }

  function buildExamQuestions(level) {
    const data = Array.isArray(window.DATA) ? window.DATA : [];
    const allVocabulary = data.filter((item) => normalize(item.tipo) === "vocabulario");
    const allProjections = data.filter((item) => normalize(item.tipo) === "tecnica de projecao");
    const projectionNames = [...new Set(allProjections.map((item) => String(item.nome ?? "").trim()).filter(Boolean))];
    const meaningPool = [...new Set(allVocabulary.map((item) => String(item.significado ?? "").trim()).filter(Boolean))];
    const groups = {
      vocabulary: [],
      projection: [],
      combination: [],
      counter: [],
    };

    data.forEach((item, sourceIndex) => {
      if (Number(item.numero_faixa) > level) return;
      const type = normalize(item.tipo);
      const name = String(item.nome ?? "").trim();
      const itemId = `${type}|${item.numero_faixa}|${name}|${sourceIndex}`;

      if (type === "vocabulario") {
        const word = String(item.palavra ?? item.nome ?? "").trim();
        const correct = String(item.significado ?? "").trim();
        if (!word || !correct) return;
        const options = choiceOptions(correct, meaningPool);
        if (!options.length) return;
        groups.vocabulary.push({
          id: itemId,
          category: "Vocabulário",
          prompt: normalize(word) === "jigoro kano" ? "Quem é o fundador do judô?" : `O que significa “${word}”?`,
          helper: "Escolha uma alternativa.",
          options: normalize(word) === "jigoro kano"
            ? shuffle(["Jigoro Kano", "Julio Nagaita", "Hagio Taje", "Josmar Amaral"])
            : options,
          correct: normalize(word) === "jigoro kano" ? "Jigoro Kano" : correct,
          media: null,
        });
        return;
      }

      if (type === "tecnica de projecao" && AVAILABLE_VIDEOS.has(String(item.link ?? ""))) {
        if (!name) return;
        const options = choiceOptions(name, projectionNames);
        if (!options.length) return;
        groups.projection.push({
          id: itemId,
          category: "Projeção",
          prompt: "Qual é o nome da técnica mostrada?",
          helper: "Assista ao vídeo e escolha uma alternativa.",
          options,
          correct: name,
          media: String(item.link),
        });
        return;
      }

      if (type === "tecnica de ataque combinado" || type === "tecnica de contra ataque") {
        const correct = String(item.segunda_tecnica ?? "").trim();
        if (!name || !correct) return;
        const options = choiceOptions(correct, projectionNames);
        if (!options.length) return;
        const isCombination = type === "tecnica de ataque combinado";
        groups[isCombination ? "combination" : "counter"].push({
          id: itemId,
          category: isCombination ? "Ataque combinado" : "Contra-ataque",
          prompt: isCombination
            ? `Qual ataque combina com “${name}”?`
            : `Qual é o contra-ataque de “${name}”?`,
          helper: `Conteúdo da faixa ${BELTS[Number(item.numero_faixa)] ?? item.faixa ?? ""}.`,
          options,
          correct,
          media: null,
        });
      }
    });

    const queues = Object.values(groups).map(shuffle);
    const selected = [];
    while (selected.length < 20 && queues.some((queue) => queue.length)) {
      for (const queue of queues) {
        if (selected.length >= 20) break;
        if (queue.length) selected.push(queue.pop());
      }
    }
    return shuffle(selected);
  }

  function examSetupMarkup() {
    return `
      <section class="mode-card exam-setup-card">
        <p class="mode-eyebrow">Preparação do professor</p>
        <h1>Preparar nova prova</h1>
        <p class="mode-intro">Informe o aluno e a faixa. Depois de iniciar, esses dados ficam bloqueados até a conclusão.</p>
        <form id="examSetupForm" class="mode-form">
          <label for="examStudent">Nome do aluno</label>
          <input id="examStudent" name="student" maxlength="50" autocomplete="off" required placeholder="Nome ou apelido" />

          <label for="examLevel">Prova para a faixa</label>
          <select id="examLevel" name="level">
            ${BELTS.map((belt, index) => `<option value="${index}">${escapeHtml(belt)}</option>`).join("")}
          </select>

          <div class="exam-rule-list">
            <span><strong>20</strong> questões variadas</span>
            <span><strong>Sem</strong> correção durante a prova</span>
            <span><strong>Local</strong> salvo neste aparelho</span>
          </div>

          <button class="mode-primary mode-primary--large" type="submit">Iniciar e bloquear prova <span>→</span></button>
          <p class="mode-form-note">Confira o nome e a faixa antes de iniciar.</p>
        </form>
      </section>
    `;
  }

  function saveActiveExam(state) {
    writeJson(STORAGE_ACTIVE_EXAM, state);
  }

  function getActiveExam() {
    const state = readJson(STORAGE_ACTIVE_EXAM, null);
    return state && Array.isArray(state.questions) && state.questions.length ? state : null;
  }

  function startExam(student, level) {
    const questions = buildExamQuestions(level);
    if (!questions.length) {
      window.alert("Não há questões suficientes para essa prova.");
      return;
    }
    const state = {
      id: makeId("exam"),
      student,
      level,
      belt: BELTS[level] ?? String(level),
      questions,
      index: 0,
      selected: null,
      answers: [],
      startedAt: new Date().toISOString(),
    };
    saveActiveExam(state);
    renderExamSession(state);
  }

  function bindExamSetup() {
    const form = document.getElementById("examSetupForm");
    const input = document.getElementById("examStudent");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const student = input.value.trim();
      const level = Number(document.getElementById("examLevel").value);
      if (student.length < 2) {
        input.setCustomValidity("Digite pelo menos duas letras.");
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      startExam(student, level);
    });
  }

  function renderExamSetup() {
    const main = document.getElementById("modeMain");
    main.innerHTML = examSetupMarkup();
    bindExamSetup();
  }

  function scrollExamQuestionIntoView() {
    const questionCopy = document.querySelector(".exam-question-copy");
    if (!questionCopy) return;

    window.requestAnimationFrame(() => {
      questionCopy.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function revealExamAdvanceButton() {
    const advanceButton = document.getElementById("examAdvance");
    if (!advanceButton) return;

    window.requestAnimationFrame(() => {
      advanceButton.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function renderExamSession(state) {
    const main = document.getElementById("modeMain");
    const question = state.questions[state.index];
    const progress = Math.round(((state.index + 1) / state.questions.length) * 100);
    const media = question.media
      ? `<div class="exam-media"><video src="${escapeHtml(question.media)}" controls preload="metadata" playsinline></video></div>`
      : "";
    main.innerHTML = `
      <section class="exam-session" aria-labelledby="examQuestion">
        <div class="exam-session-top">
          <div>
            <small>Aluno</small>
            <strong>${escapeHtml(state.student)}</strong>
          </div>
          <div>
            <small>Prova</small>
            <strong>Faixa ${escapeHtml(state.belt)}</strong>
          </div>
          <span class="exam-counter">${state.index + 1} / ${state.questions.length}</span>
        </div>
        <div class="exam-progress"><span style="width:${progress}%"></span></div>

        <div class="exam-question-copy">
          <p class="mode-eyebrow">${escapeHtml(question.category)}</p>
          <h1 id="examQuestion">${escapeHtml(question.prompt)}</h1>
          <p>${escapeHtml(question.helper)}</p>
        </div>

        ${media}

        <div class="exam-answers">
          ${question.options.map((option, index) => `
            <button class="exam-answer${state.selected === option ? " is-selected" : ""}" type="button" data-option="${escapeHtml(option)}">
              <span>${index + 1}</span>${escapeHtml(option)}
            </button>
          `).join("")}
        </div>

        <div class="exam-actions">
          <p>Escolha uma resposta para continuar.</p>
          <button id="examAdvance" class="mode-primary" type="button" ${state.selected === null ? "disabled" : ""}>
            ${state.index === state.questions.length - 1 ? "Finalizar prova" : "Confirmar e avançar"} <span>→</span>
          </button>
        </div>
      </section>
    `;

    main.querySelectorAll(".exam-answer").forEach((button) => {
      button.addEventListener("click", () => {
        state.selected = button.dataset.option;
        saveActiveExam(state);
        main.querySelectorAll(".exam-answer").forEach((item) => item.classList.remove("is-selected"));
        button.classList.add("is-selected");
        document.getElementById("examAdvance").disabled = false;
        revealExamAdvanceButton();
      });
    });

    document.getElementById("examAdvance").addEventListener("click", () => {
      if (state.selected === null) return;
      state.answers.push({
        questionId: question.id,
        category: question.category,
        selected: state.selected,
        correct: state.selected === question.correct,
      });
      state.index += 1;
      state.selected = null;
      if (state.index >= state.questions.length) finishExam(state);
      else {
        saveActiveExam(state);
        renderExamSession(state);
        scrollExamQuestionIntoView();
      }
    });
  }

  function finishExam(state) {
    const correct = state.answers.filter((answer) => answer.correct).length;
    const total = state.questions.length;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    saveRecord({
      id: state.id,
      kind: "exam",
      student: state.student,
      level: state.level,
      belt: state.belt,
      modality: "Prova completa",
      total,
      correct,
      wrong: total - correct,
      accuracy,
      startedAt: state.startedAt,
      completedAt: new Date().toISOString(),
      answers: state.answers,
    });
    safeRemove(STORAGE_ACTIVE_EXAM);

    const main = document.getElementById("modeMain");
    main.innerHTML = `
      <section class="mode-card exam-finished">
        <div class="finished-mark" aria-hidden="true">✓</div>
        <p class="mode-eyebrow">Respostas registradas</p>
        <h1>Prova concluída</h1>
        <p><strong>${escapeHtml(state.student)}</strong>, chame um professor para continuar.</p>
        <div class="finished-summary">
          <span>Faixa ${escapeHtml(state.belt)}</span>
          <span>${total} questões respondidas</span>
        </div>
        <button id="newExam" class="mode-secondary" type="button">Preparar próximo aluno</button>
      </section>
    `;
    document.getElementById("newExam").addEventListener("click", renderExamSetup);
  }

  function initExamMode() {
    document.body.classList.add("special-mode-active", "exam-mode");
    specialRoot.hidden = false;
    specialRoot.innerHTML = `
      <div class="mode-page">
        ${modeHeader("Modo prova")}
        <main class="mode-main" id="modeMain"></main>
      </div>
    `;
    const active = getActiveExam();
    if (active) renderExamSession(active);
    else renderExamSetup();
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value));
    } catch {
      return "—";
    }
  }

  function aggregateStudents(records) {
    const students = new Map();
    records.forEach((record) => {
      const key = normalize(record.student);
      if (!key) return;
      const current = students.get(key) ?? {
        name: record.student,
        attempts: 0,
        trainings: 0,
        exams: 0,
        correct: 0,
        total: 0,
        lastAt: record.completedAt,
      };
      current.name = record.student;
      current.attempts += 1;
      current.trainings += record.kind === "training" ? 1 : 0;
      current.exams += record.kind === "exam" ? 1 : 0;
      current.correct += Number(record.correct) || 0;
      current.total += Number(record.total) || 0;
      if (new Date(record.completedAt) > new Date(current.lastAt)) current.lastAt = record.completedAt;
      students.set(key, current);
    });
    return [...students.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  function reportHistoryRows(records) {
    if (!records.length) {
      return '<tr><td colspan="6"><div class="report-empty">Nenhum resultado encontrado neste aparelho.</div></td></tr>';
    }
    return records.map((record) => `
      <tr>
        <td><strong>${escapeHtml(record.student)}</strong></td>
        <td><span class="record-badge record-badge--${record.kind}">${record.kind === "exam" ? "PROVA" : "TREINO"}</span></td>
        <td>${escapeHtml(record.kind === "exam" ? `Faixa ${record.belt}` : record.modality)}</td>
        <td><strong>${Number(record.correct)}/${Number(record.total)}</strong></td>
        <td>${Number(record.accuracy)}%</td>
        <td>${escapeHtml(formatDate(record.completedAt))}</td>
      </tr>
    `).join("");
  }

  function reportStudentRows(students) {
    if (!students.length) {
      return '<tr><td colspan="6"><div class="report-empty">Nenhum aluno encontrado.</div></td></tr>';
    }
    return students.map((student) => {
      const accuracy = student.total ? Math.round((student.correct / student.total) * 100) : 0;
      return `
        <tr>
          <td><strong>${escapeHtml(student.name)}</strong></td>
          <td>${student.attempts}</td>
          <td>${student.trainings}</td>
          <td>${student.exams}</td>
          <td><strong>${accuracy}%</strong></td>
          <td>${escapeHtml(formatDate(student.lastAt))}</td>
        </tr>
      `;
    }).join("");
  }

  function exportRecords() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      records: getRecords(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ippon-relatorio-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function initReportMode() {
    document.body.classList.add("special-mode-active", "report-mode");
    specialRoot.hidden = false;
    const allRecords = getRecords().sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const totalCorrect = allRecords.reduce((sum, record) => sum + (Number(record.correct) || 0), 0);
    const totalQuestions = allRecords.reduce((sum, record) => sum + (Number(record.total) || 0), 0);
    const average = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const studentCount = aggregateStudents(allRecords).length;

    specialRoot.innerHTML = `
      <div class="mode-page report-page">
        ${modeHeader("Relatórios do aparelho")}
        <main class="mode-main report-main">
          <section class="report-heading">
            <div>
              <p class="mode-eyebrow">Histórico local</p>
              <h1>Treinos e provas</h1>
              <p>Resultados salvos somente neste aparelho e navegador.</p>
            </div>
            <div class="report-actions">
              <button id="printReport" class="mode-secondary" type="button">Imprimir</button>
              <button id="exportReport" class="mode-primary" type="button">Exportar backup</button>
            </div>
          </section>

          <section class="report-stats">
            <article><small>Alunos</small><strong>${studentCount}</strong></article>
            <article><small>Registros</small><strong>${allRecords.length}</strong></article>
            <article><small>Provas</small><strong>${allRecords.filter((item) => item.kind === "exam").length}</strong></article>
            <article><small>Aproveitamento geral</small><strong>${average}%</strong></article>
          </section>

          <section class="report-card">
            <div class="report-card-heading">
              <div><small>Visão por aluno</small><h2>Resumo dos participantes</h2></div>
            </div>
            <div class="report-table-wrap">
              <table class="report-table">
                <thead><tr><th>Aluno</th><th>Tentativas</th><th>Treinos</th><th>Provas</th><th>Aproveitamento</th><th>Última atividade</th></tr></thead>
                <tbody id="studentRows">${reportStudentRows(aggregateStudents(allRecords))}</tbody>
              </table>
            </div>
          </section>

          <section class="report-card">
            <div class="report-card-heading report-card-heading--filters">
              <div><small>Histórico completo</small><h2>Resultados registrados</h2></div>
              <div class="report-filter-group" role="group" aria-label="Filtrar resultados">
                <button class="is-active" type="button" data-filter="all">Todos</button>
                <button type="button" data-filter="training">Treinos</button>
                <button type="button" data-filter="exam">Provas</button>
              </div>
              <label class="report-search"><span class="sr-only">Buscar aluno</span><input id="reportSearch" type="search" placeholder="Buscar aluno" /></label>
            </div>
            <div class="report-table-wrap">
              <table class="report-table">
                <thead><tr><th>Aluno</th><th>Tipo</th><th>Conteúdo</th><th>Resultado</th><th>Acerto</th><th>Data</th></tr></thead>
                <tbody id="historyRows">${reportHistoryRows(allRecords)}</tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    `;

    let activeFilter = "all";
    let search = "";
    const refresh = () => {
      const filtered = allRecords.filter((record) => {
        const matchesType = activeFilter === "all" || record.kind === activeFilter;
        const matchesSearch = !search || normalize(record.student).includes(normalize(search));
        return matchesType && matchesSearch;
      });
      document.getElementById("historyRows").innerHTML = reportHistoryRows(filtered);
      document.getElementById("studentRows").innerHTML = reportStudentRows(aggregateStudents(filtered));
    };

    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;
        document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        refresh();
      });
    });
    document.getElementById("reportSearch").addEventListener("input", (event) => {
      search = event.target.value;
      refresh();
    });
    document.getElementById("exportReport").addEventListener("click", exportRecords);
    document.getElementById("printReport").addEventListener("click", () => window.print());
  }

  window.IpponRecords = {
    ensureTrainingProfile,
    saveTrainingResult,
    getRecords,
  };

  if (route === "exam") initExamMode();
  else if (route === "report") initReportMode();
  else updateProfileChip();
})();
