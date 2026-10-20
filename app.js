const DATA = Array.isArray(window.DATA) ? window.DATA : [];

const elLevel = document.getElementById("level");
const elType = document.getElementById("type");
const elStart = document.getElementById("start");
const elPrompt = document.getElementById("prompt");
const elQuestionHelper = document.getElementById("questionHelper");
const elBadge = document.getElementById("badge");
const elVideoBox = document.getElementById("videoBox");
const elAnswers = document.getElementById("answers");
const elNext = document.getElementById("next");
const elStats = document.getElementById("stats");
const elVocabFlip = document.getElementById("vocabFlip");
const elWrapVocabFlip = document.getElementById("wrapVocabFlip");
const elProgressFill = document.getElementById("progressFill");
const elProgressText = document.getElementById("progressText");
const elFeedback = document.getElementById("feedback");
const elHitCount = document.getElementById("hitCount");
const elMissCount = document.getElementById("missCount");
const elAvailableCount = document.getElementById("availableCount");
const elStreakCount = document.getElementById("streakCount");
const elAccuracyValue = document.getElementById("accuracyValue");
const elBeltPreview = document.getElementById("beltPreview");
const elBeltName = document.getElementById("beltName");
const elConfettiLayer = document.getElementById("confettiLayer");

const BELT_LABELS = [
  "Cinza / Azul",
  "Amarela",
  "Laranja",
  "Verde",
  "Roxa",
  "Marrom",
  "Preta",
];

const SUCCESS_MESSAGES = [
  "Ippon! Resposta certa.",
  "Boa técnica! Você acertou.",
  "Excelente leitura de jogo.",
  "Acertou em cheio. Continue assim!",
];

let questionPool = [];
let questionBag = [];
let optionPool = [];
let current = null;
let lastId = null;
let answered = false;

let hits = 0;
let misses = 0;
let streak = 0;
let bestStreak = 0;

let roundActive = false;
let roundTotal = 0;
let roundHits = 0;
let roundMisses = 0;
let roundIndex = 0;

function randInt(max) {
  return Math.floor(Math.random() * max);
}

function shuffle(items) {
  const array = [...items];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = randInt(index + 1);
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }
  return array;
}

function normType(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sameType(first, second) {
  return normType(first) === normType(second);
}

function isVocabType(type) {
  return type === "vocabulario";
}

function isTechniqueType(type) {
  return normType(type).startsWith("tecnica");
}

function isProjectionType(type) {
  return sameType(type, "tecnica de projeção");
}

function isCombinedType(type) {
  return sameType(type, "tecnica de ataque combinado");
}

function isCounterType(type) {
  return sameType(type, "tecnica de contra ataque");
}

function isComboOrCounterType(type) {
  return isCombinedType(type) || isCounterType(type);
}

function isBeltQuizType(type) {
  return type === "quiz_faixa_projecao";
}

function isVocabFlipOn() {
  return Boolean(elVocabFlip?.checked);
}

function vocabWord(item) {
  return String(item?.palavra ?? item?.nome ?? "").trim();
}

function vocabMeaning(item) {
  return String(item?.significado ?? "").trim();
}

function techniqueName(item) {
  return String(item?.nome ?? "").trim();
}

function itemKey(item) {
  if (typeof item === "number") return `faixa|${item}`;
  const main = sameType(item?.tipo, "vocabulario")
    ? item?.palavra ?? item?.nome ?? ""
    : item?.nome ?? "";
  return `${item?.tipo}|${item?.numero_faixa}|${main}|${item?.segunda_tecnica ?? ""}`;
}

function niceTypeLabel(type) {
  const labels = {
    vocabulario: "Vocabulário",
    "tecnica de projeção": "Projeções",
    "tecnica de solo": "Técnicas de solo",
    "tecnica de ataque combinado": "Ataques combinados",
    "tecnica de contra ataque": "Contra-ataques",
    quiz_faixa_projecao: "Projeções por faixa",
  };
  return labels[type] ?? type;
}

function isItemUsable(item, type) {
  if (isVocabType(type)) {
    return vocabWord(item).length > 0 && vocabMeaning(item).length > 0;
  }
  if (isComboOrCounterType(type)) {
    return techniqueName(item).length > 0 && String(item?.segunda_tecnica ?? "").trim().length > 0;
  }
  return techniqueName(item).length > 0;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateSelectionPreview() {
  const level = Number(elLevel.value);
  elBeltPreview.dataset.level = String(level);
  elBeltName.textContent = `Faixa ${BELT_LABELS[level] ?? level}`;
  updateAvailableCount();
}

function updateTypeOptions() {
  const level = Number(elLevel.value);
  const options = [...elType.options];
  const counts = Object.fromEntries(options.map((option) => [option.value, 0]));

  for (const item of DATA) {
    if (Number(item.numero_faixa) > level) continue;

    for (const option of options) {
      if (option.value === "quiz_faixa_projecao") continue;
      if (!sameType(item.tipo, option.value)) continue;
      if (!isItemUsable(item, option.value)) continue;
      counts[option.value] += 1;
    }
  }

  const projectionBelts = new Set(
    DATA.filter(
      (item) =>
        Number(item.numero_faixa) <= level &&
        isProjectionType(item.tipo) &&
        isItemUsable(item, item.tipo),
    ).map((item) => Number(item.numero_faixa)),
  );
  counts.quiz_faixa_projecao = projectionBelts.size;

  options.forEach((option) => {
    const disabled = counts[option.value] === 0;
    option.disabled = disabled;
    option.hidden = disabled;
  });

  if (elType.selectedOptions[0]?.disabled) {
    const firstEnabled = options.find((option) => !option.disabled);
    if (firstEnabled) elType.value = firstEnabled.value;
  }

  elWrapVocabFlip.style.display = isVocabType(elType.value) ? "flex" : "none";
  updateSelectionPreview();
}

function getAvailableQuestionCount() {
  const level = Number(elLevel.value);
  const type = elType.value;

  if (isBeltQuizType(type)) {
    return new Set(
      DATA.filter(
        (item) =>
          Number(item.numero_faixa) <= level &&
          isProjectionType(item.tipo) &&
          isItemUsable(item, item.tipo),
      ).map((item) => Number(item.numero_faixa)),
    ).size;
  }

  return DATA.filter(
    (item) =>
      Number(item.numero_faixa) <= level &&
      sameType(item.tipo, type) &&
      isItemUsable(item, type),
  ).length;
}

function updateAvailableCount() {
  elAvailableCount.textContent = String(getAvailableQuestionCount());
}

function updateScoreboard() {
  const total = hits + misses;
  const accuracy = total ? `${Math.round((hits / total) * 100)}%` : "—";

  elHitCount.textContent = String(hits);
  elMissCount.textContent = String(misses);
  elStreakCount.textContent = String(bestStreak);
  elAccuracyValue.textContent = accuracy;
  elStats.textContent = `Sessão: ${hits} ${hits === 1 ? "acerto" : "acertos"} · ${misses} ${misses === 1 ? "erro" : "erros"}`;
}

function makePools() {
  const level = Number(elLevel.value);
  const type = elType.value;

  if (isBeltQuizType(type)) {
    const belts = new Set();
    for (const item of DATA) {
      if (Number(item.numero_faixa) > level) continue;
      if (!isProjectionType(item.tipo) || !isItemUsable(item, item.tipo)) continue;
      belts.add(Number(item.numero_faixa));
    }
    questionPool = [...belts];
    questionBag = shuffle(questionPool);
    optionPool = DATA.filter(
      (item) => isProjectionType(item.tipo) && isItemUsable(item, item.tipo),
    );
    return;
  }

  questionPool = DATA.filter(
    (item) =>
      Number(item.numero_faixa) <= level &&
      sameType(item.tipo, type) &&
      isItemUsable(item, type),
  );
  questionBag = shuffle(questionPool);

  if (isComboOrCounterType(type)) {
    optionPool = DATA.filter(
      (item) => isProjectionType(item.tipo) && isItemUsable(item, item.tipo),
    );
    return;
  }

  optionPool = DATA.filter(
    (item) => sameType(item.tipo, type) && isItemUsable(item, type),
  );

  if (optionPool.length < 4 && isTechniqueType(type)) {
    optionPool = DATA.filter(
      (item) => isTechniqueType(item.tipo) && isItemUsable(item, item.tipo),
    );
  }

  if (optionPool.length < 4 && isVocabType(type)) {
    optionPool = DATA.filter(
      (item) => sameType(item.tipo, "vocabulario") && isItemUsable(item, "vocabulario"),
    );
  }
}

function pickNextQuestion() {
  if (questionPool.length === 0) return null;
  if (questionBag.length === 0) return roundActive ? null : shuffle(questionPool).pop();

  let candidate = questionBag.pop();
  if (lastId && itemKey(candidate) === lastId && questionPool.length > 1) {
    const alternative = questionBag.pop();
    questionBag.unshift(candidate);
    candidate = alternative ?? candidate;
  }
  return candidate;
}

function optionTextForItem(item, type) {
  if (isVocabType(type)) return isVocabFlipOn() ? vocabWord(item) : vocabMeaning(item);
  return techniqueName(item);
}

function buildOptions(correctItem, type) {
  const correct = optionTextForItem(correctItem, type);
  const options = new Set([correct]);
  let guard = 0;

  while (options.size < 4 && guard < 1000) {
    const item = optionPool[randInt(optionPool.length)];
    const text = optionTextForItem(item, type);
    if (text && text !== correct) options.add(text);
    guard += 1;
  }

  return { options: shuffle(options), correct };
}

function buildOptionsComboOrCounter(questionItem) {
  const correct = String(questionItem.segunda_tecnica ?? "").trim();
  const options = new Set([correct]);
  let guard = 0;

  while (options.size < 4 && guard < 3000) {
    const item = optionPool[randInt(optionPool.length)];
    const text = techniqueName(item);
    if (text && text !== correct) options.add(text);
    guard += 1;
  }

  return { options: shuffle(options), correct };
}

function buildOptionsBeltProjection(beltNumber) {
  const correctItems = optionPool.filter(
    (item) => Number(item.numero_faixa) === Number(beltNumber),
  );
  const correctTexts = [...new Set(correctItems.map(techniqueName).filter(Boolean))];
  const correctSet = new Set(correctTexts);
  const otherItems = optionPool.filter(
    (item) => Number(item.numero_faixa) !== Number(beltNumber),
  );
  const distractors = new Set();
  let guard = 0;

  while (distractors.size < correctTexts.length * 2 && guard < 5000) {
    const item = otherItems[randInt(otherItems.length)];
    const text = techniqueName(item);
    if (text && !correctSet.has(text)) distractors.add(text);
    guard += 1;
  }

  return {
    options: shuffle([...correctSet, ...distractors]),
    correctSet,
    correctCount: correctTexts.length,
  };
}

function canBuildOptions(type) {
  if (isBeltQuizType(type)) {
    return questionPool.some((belt) => {
      const correctCount = optionPool.filter(
        (item) => Number(item.numero_faixa) === Number(belt),
      ).length;
      const otherCount = optionPool.filter(
        (item) => Number(item.numero_faixa) !== Number(belt),
      ).length;
      return correctCount > 0 && otherCount >= correctCount * 2;
    });
  }

  const distinctOptions = new Set(
    optionPool.map((item) => optionTextForItem(item, type)).filter(Boolean),
  );
  return distinctOptions.size >= 4;
}

function setEmptyMedia({ symbol = "礼", title, detail }) {
  elVideoBox.classList.remove("is-hidden");
  elVideoBox.classList.add("is-empty");
  elVideoBox.innerHTML = `
    <div class="placeholder">
      <span class="placeholder-symbol" aria-hidden="true">${escapeHtml(symbol)}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${detail}</small>
    </div>
  `;
}

function hideMedia() {
  elVideoBox.className = "videoBox is-hidden";
  elVideoBox.innerHTML = "";
}

function embedMediaOrPrompt(item, type) {
  elVideoBox.innerHTML = "";

  if (isVocabType(type)) {
    hideMedia();
    return;
  }

  if (isBeltQuizType(type)) {
    hideMedia();
    return;
  }

  if (isComboOrCounterType(type)) {
    hideMedia();
    return;
  }

  const link = String(item.link || "").trim();
  if (!link) {
    setEmptyMedia({
      symbol: "映",
      title: "Técnica sem vídeo",
      detail: "Use as alternativas para continuar o treino.",
    });
    return;
  }

  elVideoBox.classList.remove("is-empty", "is-hidden");
  const video = document.createElement("video");
  video.src = link;
  video.controls = true;
  video.preload = "metadata";
  video.setAttribute("playsinline", "");
  video.addEventListener("error", () => {
    setEmptyMedia({
      symbol: "映",
      title: "Vídeo indisponível",
      detail: `Não foi possível abrir <code>${escapeHtml(link)}</code>.`,
    });
  });
  elVideoBox.appendChild(video);
}

function answerKey(index) {
  return index < 9 ? String(index + 1) : "•";
}

function makeAnswerButton(text, index) {
  const button = document.createElement("button");
  button.className = "ans";
  button.type = "button";
  button.textContent = text;
  button.dataset.value = text;
  button.dataset.key = answerKey(index);
  return button;
}

function showFeedback(correct) {
  elFeedback.className = `feedback show ${correct ? "success" : "error"}`;
  elFeedback.innerHTML = correct
    ? `<span aria-hidden="true">✓</span> ${SUCCESS_MESSAGES[randInt(SUCCESS_MESSAGES.length)]}`
    : '<span aria-hidden="true">↺</span> Quase! A resposta correta está marcada em verde.';
}

function burstConfetti(amount = 18) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#ffd400", "#3451ff", "#55d995", "#f7f5ee"];
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < amount; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${8 + Math.random() * 84}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.16}s`;
    piece.style.setProperty("--drift", `${-110 + Math.random() * 220}px`);
    piece.style.setProperty("--spin", `${360 + Math.random() * 720}deg`);
    fragment.appendChild(piece);
    window.setTimeout(() => piece.remove(), 2300);
  }
  elConfettiLayer.appendChild(fragment);
}

function isCompactViewport() {
  return window.matchMedia("(max-width: 980px), (max-height: 820px)").matches;
}

function scrollQuestionIntoView() {
  if (!isCompactViewport()) return;
  window.requestAnimationFrame(() => {
    document.querySelector(".question-copy")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

function keepNextButtonVisible() {
  if (!isCompactViewport()) return;
  window.requestAnimationFrame(() => {
    elNext.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function registerResult(correct) {
  if (correct) {
    hits += 1;
    roundHits += 1;
    streak += 1;
    bestStreak = Math.max(bestStreak, streak);
    burstConfetti(streak >= 3 ? 26 : 14);
  } else {
    misses += 1;
    roundMisses += 1;
    streak = 0;
  }

  updateScoreboard();
  showFeedback(correct);
  elNext.style.display = "inline-flex";
  elNext.innerHTML = roundIndex >= roundTotal
    ? 'Ver resultado <span aria-hidden="true">→</span>'
    : 'Próxima questão <span aria-hidden="true">→</span>';
  keepNextButtonVisible();
}

function renderSingleChoice(options, correct) {
  elAnswers.innerHTML = "";

  options.forEach((text, index) => {
    const button = makeAnswerButton(text, index);
    button.addEventListener("click", () => {
      if (answered) return;
      answered = true;

      const allButtons = [...elAnswers.querySelectorAll("button.ans")];
      allButtons.forEach((answer) => { answer.disabled = true; });

      const isCorrect = text === correct;
      if (isCorrect) {
        button.classList.add("ok");
      } else {
        button.classList.add("bad");
        allButtons.find((answer) => answer.dataset.value === correct)?.classList.add("ok");
      }
      registerResult(isCorrect);
    });
    elAnswers.appendChild(button);
  });
}

function renderBeltQuestion(beltNumber) {
  const label = BELT_LABELS[Number(beltNumber)] ?? String(beltNumber);
  elPrompt.textContent = `Quais projeções pertencem à faixa ${label}?`;
  elQuestionHelper.textContent = "Marque todas as alternativas corretas e confirme sua seleção.";
  embedMediaOrPrompt(beltNumber, elType.value);

  const { options, correctSet, correctCount } = buildOptionsBeltProjection(beltNumber);
  elAnswers.innerHTML = "";

  options.forEach((text, index) => {
    const button = makeAnswerButton(text, index);
    button.dataset.selected = "0";
    button.addEventListener("click", () => {
      if (answered) return;
      const selected = button.dataset.selected === "1";
      button.dataset.selected = selected ? "0" : "1";
      button.classList.toggle("selected", !selected);
    });
    elAnswers.appendChild(button);
  });

  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "confirm";
  confirm.textContent = `Confirmar seleção · ${correctCount} corretas`;
  confirm.addEventListener("click", () => {
    if (answered) return;
    answered = true;

    const buttons = [...elAnswers.querySelectorAll("button.ans")];
    const picked = new Set(
      buttons.filter((button) => button.dataset.selected === "1").map((button) => button.dataset.value),
    );

    buttons.forEach((button) => {
      button.disabled = true;
      const value = button.dataset.value;
      if (correctSet.has(value)) button.classList.add("ok");
      if (picked.has(value) && !correctSet.has(value)) button.classList.add("bad");
    });
    confirm.disabled = true;

    const pickedAllCorrect = [...correctSet].every((value) => picked.has(value));
    const pickedNoWrong = [...picked].every((value) => correctSet.has(value));
    registerResult(pickedAllCorrect && pickedNoWrong);
  });
  elAnswers.appendChild(confirm);
}

function renderQuestion(item) {
  answered = false;
  current = item;
  lastId = itemKey(item);
  elFeedback.className = "feedback";
  elFeedback.textContent = "";
  elNext.style.display = "none";

  const level = Number(elLevel.value);
  const type = elType.value;
  const progress = roundTotal ? Math.round((roundIndex / roundTotal) * 100) : 0;

  elProgressFill.style.width = `${progress}%`;
  elProgressText.textContent = `Questão ${roundIndex} de ${roundTotal}`;
  elBadge.textContent = `${BELT_LABELS[level]} · ${niceTypeLabel(type)}`;

  if (isBeltQuizType(type)) {
    renderBeltQuestion(Number(item));
    return;
  }

  if (isVocabType(type)) {
    const word = vocabWord(item);
    const meaning = vocabMeaning(item);

    if (normType(word) === normType("Jigoro Kano")) {
      elPrompt.textContent = "Quem é o fundador do judô?";
      elQuestionHelper.textContent = "Escolha o nome correto entre as alternativas.";
      hideMedia();
      renderSingleChoice(
        shuffle(["Jigoro Kano", "Julio Nagaita", "Hagio Taje", "Josmar Amaral"]),
        "Jigoro Kano",
      );
      return;
    }

    elPrompt.textContent = isVocabFlipOn()
      ? `Como se escreve em japonês: “${meaning}”?`
      : `O que significa “${word}”?`;
    elQuestionHelper.textContent = isVocabFlipOn()
      ? "Reconheça o termo japonês correspondente."
      : "Escolha o significado correto.";
    embedMediaOrPrompt(item, type);
    const pack = buildOptions(item, type);
    renderSingleChoice(pack.options, pack.correct);
    return;
  }

  const beltLabel = item?.faixa ?? BELT_LABELS[Number(item?.numero_faixa)] ?? "";
  if (isCombinedType(type)) {
    elPrompt.textContent = `Qual ataque combina com “${techniqueName(item)}”?`;
    elQuestionHelper.textContent = `Combinação prevista para a faixa ${beltLabel}.`;
  } else if (isCounterType(type)) {
    elPrompt.textContent = `Qual é o contra-ataque de “${techniqueName(item)}”?`;
    elQuestionHelper.textContent = `Contra-ataque previsto para a faixa ${beltLabel}.`;
  } else {
    elPrompt.textContent = "Qual é o nome da técnica mostrada?";
    elQuestionHelper.textContent = "Observe o movimento e escolha a alternativa correta.";
  }

  embedMediaOrPrompt(item, type);
  const pack = isComboOrCounterType(type)
    ? buildOptionsComboOrCounter(item)
    : buildOptions(item, type);
  renderSingleChoice(pack.options, pack.correct);
}

function resetToNeedStart(message) {
  document.body.classList.remove("round-running");
  questionPool = [];
  questionBag = [];
  optionPool = [];
  current = null;
  lastId = null;
  answered = false;
  roundActive = false;
  roundTotal = 0;
  roundHits = 0;
  roundMisses = 0;
  roundIndex = 0;

  elAnswers.innerHTML = "";
  elFeedback.className = "feedback";
  elFeedback.textContent = "";
  elPrompt.textContent = "Tudo pronto para começar?";
  elQuestionHelper.textContent = message;
  elBadge.textContent = "Pronto";
  elProgressText.textContent = "Aguardando seu treino";
  elProgressFill.style.width = "0%";
  elNext.style.display = "none";
  setEmptyMedia({
    symbol: "礼",
    title: "Rei",
    detail: "Prepare-se, cumprimente e comece.",
  });
}

function startOrRestart() {
  if (window.IpponRecords && !window.IpponRecords.ensureTrainingProfile(startOrRestart)) {
    return;
  }

  if (!DATA.length) {
    resetToNeedStart("Não encontrei os dados do quiz.");
    return;
  }

  updateTypeOptions();
  makePools();
  const type = elType.value;

  if (!questionPool.length) {
    resetToNeedStart("Não há questões para esta combinação. Tente outro nível ou modalidade.");
    return;
  }

  if (!canBuildOptions(type)) {
    resetToNeedStart("Ainda não há alternativas suficientes para montar este treino.");
    return;
  }

  roundActive = true;
  roundTotal = questionPool.length;
  roundHits = 0;
  roundMisses = 0;
  roundIndex = 1;

  document.body.classList.add("round-running");

  const item = pickNextQuestion();
  if (!item) {
    resetToNeedStart("Não foi possível sortear uma questão.");
    return;
  }

  renderQuestion(item);

  scrollQuestionIntoView();
}

function finishRound() {
  roundActive = false;
  answered = true;
  current = null;
  const percentage = roundTotal ? Math.round((roundHits / roundTotal) * 100) : 0;
  const resultTitle = percentage === 100
    ? "Rodada perfeita!"
    : percentage >= 90
      ? "Excelente resultado!"
      : percentage >= 70
        ? "Ótima rodada!"
        : percentage >= 50
          ? "Bom caminho!"
          : "Todo treino conta.";

  elProgressFill.style.width = "100%";
  elProgressText.textContent = "Rodada concluída";
  elBadge.textContent = "Resultado";
  elPrompt.textContent = resultTitle;
  elQuestionHelper.textContent = `Você acertou ${roundHits} de ${roundTotal} questões nesta rodada.`;
  elAnswers.innerHTML = "";
  elFeedback.className = "feedback";
  elNext.style.display = "none";
  elVideoBox.classList.add("is-empty");
  elVideoBox.classList.remove("is-hidden");
  elVideoBox.innerHTML = `
    <div class="round-result">
      <div>
        <div class="round-result-ring"><span>${percentage}%</span></div>
        <h3>${escapeHtml(resultTitle)}</h3>
        <p>${roundHits} acertos · ${roundMisses} erros · melhor sequência da sessão: ${bestStreak}</p>
        <button class="restart-round" id="restartRound" type="button">Treinar novamente <span aria-hidden="true">↻</span></button>
      </div>
    </div>
  `;
  document.getElementById("restartRound")?.addEventListener("click", startOrRestart);

  window.IpponRecords?.saveTrainingResult({
    level: Number(elLevel.value),
    belt: BELT_LABELS[Number(elLevel.value)] ?? String(elLevel.value),
    modality: niceTypeLabel(elType.value),
    modalityKey: elType.value,
    total: roundTotal,
    correct: roundHits,
    wrong: roundMisses,
    accuracy: percentage,
    bestStreak,
  });

  if (percentage >= 70) burstConfetti(48);
  document.body.classList.remove("round-running");
  if (isCompactViewport()) {
    window.requestAnimationFrame(() => {
      document.querySelector(".round-result")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }
}

elStart.addEventListener("click", startOrRestart);

elNext.addEventListener("click", () => {
  if (!roundActive || !answered) return;
  const item = pickNextQuestion();
  if (!item) {
    finishRound();
    return;
  }
  roundIndex += 1;
  renderQuestion(item);
  scrollQuestionIntoView();
});

elLevel.addEventListener("change", () => {
  updateTypeOptions();
  resetToNeedStart("Nível atualizado. Comece quando estiver pronto.");
  updateSelectionPreview();
});

elType.addEventListener("change", () => {
  updateTypeOptions();
  resetToNeedStart("Modalidade atualizada. Comece quando estiver pronto.");
  updateAvailableCount();
});

elVocabFlip.addEventListener("change", () => {
  resetToNeedStart("Modo de vocabulário atualizado. Comece quando estiver pronto.");
});

document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (["SELECT", "INPUT", "VIDEO"].includes(document.activeElement?.tagName)) return;

  const number = Number(event.key);
  if (!answered && number >= 1 && number <= 9) {
    const button = elAnswers.querySelectorAll("button.ans")[number - 1];
    if (button && !button.disabled) {
      event.preventDefault();
      button.click();
    }
  }

  if (event.key === "Enter" && answered && elNext.style.display !== "none") {
    event.preventDefault();
    elNext.click();
  }
});

const JUDO_QUOTES = [
  "Conhecer-se é dominar-se; dominar-se é triunfar sobre si mesmo.",
  "Somente se aproxima da perfeição quem a procura com constância, sabedoria e humildade.",
  "Quando perceberes que não sabes nada, terás feito teu primeiro progresso no aprendizado.",
  "A única vitória que perdura é a que se conquista sobre a própria ignorância.",
  "O verdadeiro judoca não se aperfeiçoa para lutar; luta para se aperfeiçoar.",
  "Saber cada dia um pouco e usá-lo todos os dias para o bem: este é o caminho.",
];

function showRandomQuote() {
  const quote = document.getElementById("fraseJudo");
  if (quote) quote.textContent = JUDO_QUOTES[randInt(JUDO_QUOTES.length)];
}

showRandomQuote();
updateScoreboard();

if (!DATA.length) {
  resetToNeedStart("Não encontrei os dados do quiz.");
} else {
  updateTypeOptions();
  resetToNeedStart("Configure sua rodada ao lado e aperte “Começar treino”.");
  updateSelectionPreview();
}
