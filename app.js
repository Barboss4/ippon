const DATA = Array.isArray(window.DATA) ? window.DATA : [];

const elLevel = document.getElementById("level");
const elType  = document.getElementById("type");
const elStart = document.getElementById("start");
const elPrompt = document.getElementById("prompt");
const elBadge = document.getElementById("badge");
const elVideoBox = document.getElementById("videoBox");
const elAnswers = document.getElementById("answers");
const elNext = document.getElementById("next");
const elStats = document.getElementById("stats");
const elVocabFlip = document.getElementById("vocabFlip");
const elWrapVocabFlip = document.getElementById("wrapVocabFlip");

// Itens possíveis de cair como "pergunta" (respeita nível)
let questionPool = [];
let questionBag = [];

// Itens possíveis de virar alternativa (pode usar outros níveis, e se preciso, outros tipos de técnica)
let optionPool = [];

let current = null;
let lastId = null;
let answered = false;

let hits = 0;
let misses = 0;

let roundActive = false;
let roundTotal = 0;
let roundHits = 0;
let roundMisses = 0;

let roundIndex = 0; // quantas questões já foram exibidas

function isVocabFlipOn(){
  return !!(elVocabFlip && elVocabFlip.checked);
}


function randInt(max){
  return Math.floor(Math.random() * max);
}

function normType(s){
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos
}

function sameType(a, b){
  return normType(a) === normType(b);
}

function shuffle(arr){
  for(let i = arr.length - 1; i > 0; i--){
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isAtaqueCombinadoType(type){
  return sameType(type, "tecnica de ataque combinado");
}

function isContraAtaqueType(type){
  return sameType(type, "tecnica de contra ataque");
}

function isComboOuContraType(type){
  return isAtaqueCombinadoType(type) || isContraAtaqueType(type);
}

function isKanoQuestion(item){
  return isVocabType(elType.value) && normType(vocabWord(item)) === normType("Jigoro Kano");
}


function niceTypeLabel(type){
  if(type === "quiz_faixa_projecao") return "Quiz: Projeção por faixa";
  if(type === "vocabulario") return "Vocabulário";
  if(type === "tecnica de projeção") return "Técnica de projeção";
  if(type === "tecnica de solo") return "Técnica de solo";
  if(type === "tecnica de ataque combinado") return "Técnica de ataque combinado";
  if(type === "tecnica de contra ataque") return "Técnica de contra ataque";
  return type;
}


function isVocabType(type){
  return type === "vocabulario";
}

function isTecnicaType(type){
  return normType(type).startsWith("tecnica");
}


function vocabWord(it){
  return (it.palavra ?? it.nome ?? "").trim();
}

function vocabMeaning(it){
  return (it.significado ?? "").trim();
}

function techniqueName(it){
  return (it.nome ?? "").trim();
}

function isFaixaQuizType(type){
  return type === "quiz_faixa_projecao";
}

function isProjecaoType(type){
  return sameType(type, "tecnica de projeção");
}




function isItemUsable(it, type){
  if(isVocabType(type)){
    return vocabWord(it).length > 0 && vocabMeaning(it).length > 0;
  }

  // ataque combinado / contra ataque: precisa de nome e segunda_tecnica
  if(isComboOuContraType(type)){
    return techniqueName(it).length > 0 && String(it.segunda_tecnica ?? "").trim().length > 0;
  }

  // outras técnicas
  return techniqueName(it).length > 0;
}



// Identificador estável do item (já que não existe id no JSON)
function itemKey(it){
  if(typeof it === "number") return `faixa|${it}`;
  const main = (sameType(it.tipo, "vocabulario")) ? (it.palavra ?? it.nome ?? "") : (it.nome ?? "");
  return `${it.tipo}|${it.numero_faixa}|${main}|${it.segunda_tecnica ?? ""}`;
}


// ====== UI: esconder/desabilitar tipos sem PERGUNTAS possíveis no nível ======
function updateTypeOptions(){
  const level = Number(elLevel.value);
  const opts = [...elType.options];

  // inicializa contagem por valor real do <option>
  const counts = Object.fromEntries(opts.map(o => [o.value, 0]));

  for(const it of DATA){
    if(Number(it.numero_faixa) > level) continue;

    for(const opt of opts){
      // regra especial: esse "tipo" não existe no JSON
      if(opt.value === "quiz_faixa_projecao") continue;

      if(!sameType(it.tipo, opt.value)) continue;

      // vocabulário: sempre tratar como "vocabulario" (sem acento) para isItemUsable
      if(sameType(opt.value, "vocabulario")){
        if(!isItemUsable(it, "vocabulario")) continue;
      }else{
        if(!isItemUsable(it, opt.value)) continue;
      }

      counts[opt.value] = (counts[opt.value] || 0) + 1;
    }
  }

  // habilita quiz por faixa se existir ao menos 1 técnica de projeção até o nível
  if("quiz_faixa_projecao" in counts){
    let faixaQuizCount = 0;
    for(const it of DATA){
      if(Number(it.numero_faixa) > level) continue;
      if(!isProjecaoType(it.tipo)) continue;
      if(!isItemUsable(it, it.tipo)) continue;
      faixaQuizCount++;
    }
    counts["quiz_faixa_projecao"] = faixaQuizCount;
  }

  // aplica hide/disable
  opts.forEach(opt => {
    const c = counts[opt.value] || 0;
    const disabled = c === 0;
    opt.disabled = disabled;
    opt.hidden = disabled;
  });

  // corrige seleção se ficou inválida
  const sel = elType.selectedOptions[0];
  if(sel && sel.disabled){
    const firstEnabled = opts.find(o => !o.disabled);
    if(firstEnabled) elType.value = firstEnabled.value;
  }

  // mostra/esconde o toggle de inverter vocabulário
  if(elWrapVocabFlip){
    elWrapVocabFlip.style.display = isVocabType(elType.value) ? "inline-flex" : "none";
  }
}



// ====== Pool / Sorteio ======
function makePools(){
  const level = Number(elLevel.value);
  const type = elType.value;

  // ===== NOVO MODO: quiz por faixa (técnicas de projeção) =====
  if(isFaixaQuizType(type)){
    const setFaixas = new Set();
    for(const it of DATA){
      const faixa = Number(it.numero_faixa);
      if(faixa > level) continue;
      if(!isProjecaoType(it.tipo)) continue;
      if(!isItemUsable(it, it.tipo)) continue;
      setFaixas.add(faixa);
    }

    questionPool = [...setFaixas];
    questionBag = shuffle([...questionPool]);

    optionPool = DATA.filter(it =>
      isProjecaoType(it.tipo) &&
      isItemUsable(it, it.tipo)
    );
    return;
  }

  // ===== MODO ANTIGO: sempre monta perguntas primeiro =====
  questionPool = DATA.filter(it =>
    Number(it.numero_faixa) <= level &&
    sameType(it.tipo, type) &&
    isItemUsable(it, type)
  );
  questionBag = shuffle([...questionPool]);

  // ===== Ataque combinado / contra ataque: alternativas = projeção =====
  if(isComboOuContraType(type)){
    optionPool = DATA.filter(it =>
      isProjecaoType(it.tipo) &&
      isItemUsable(it, it.tipo)
    );
    return;
  }

  // ===== Alternativas padrão: mesmo tipo em qualquer nível =====
  optionPool = DATA.filter(it =>
    sameType(it.tipo, type) &&
    isItemUsable(it, type)
  );

  // Fallback técnicas: qualquer tipo de técnica
  if(optionPool.length < 4 && isTecnicaType(type)){
    optionPool = DATA.filter(it =>
      isTecnicaType(it.tipo) &&
      isItemUsable(it, it.tipo)
    );
  }

  // Fallback vocabulário: vocabulário de qualquer nível
  if(optionPool.length < 4 && isVocabType(type)){
    optionPool = DATA.filter(it =>
      sameType(it.tipo, "vocabulario") &&
      isItemUsable(it, "vocabulario")
    );
  }
}

function pickNextQuestion(){
  if(questionPool.length === 0) return null;

  if(questionBag.length === 0){
    // no modo prova, acabou = fim.
    if(roundActive) return null;

    // modo treino (antigo): reembaralha e continua
    questionBag = shuffle([...questionPool]);
  }

  let candidate = questionBag.pop();

  if(lastId && itemKey(candidate) === lastId && questionPool.length > 1){
    const alt = questionBag.pop();
    questionBag.unshift(candidate);
    candidate = alt ?? candidate;
  }

  return candidate;
}


function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function embedMediaOrPrompt(item, type){
  elVideoBox.innerHTML = "";

  // Vocabulário: pergunta textual (normal ou invertido)
  if(isVocabType(type)){
    const w = vocabWord(item);
    const m = vocabMeaning(item);

    if(isVocabFlipOn && isVocabFlipOn()){
      elVideoBox.innerHTML =
        `<div class="placeholder">Como se escreve em japonês: <code>${escapeHtml(m)}</code>?</div>`;
    }else{
      elVideoBox.innerHTML =
        `<div class="placeholder">O que significa <code>${escapeHtml(w)}</code>?</div>`;
    }
    return;
  }

  // No quiz por faixa, não tem vídeo
  if(isFaixaQuizType(type)){
    elVideoBox.innerHTML =
      `<div class="placeholder">Marque todas as corretas e clique em Confirmar.</div>`;
    return;
  }

  // Ataque combinado / contra ataque: sem vídeo, é pergunta textual
  if(isComboOuContraType(type)){
    elVideoBox.innerHTML = `<div class="placeholder">Responda escolhendo a técnica correta.</div>`;
    return;
  }


  const link = String(item.link || "").trim();
  if(!link){
    elVideoBox.innerHTML =
      `<div class="placeholder">Técnica sem vídeo cadastrado.</div>`;
    return;
  }

  const video = document.createElement("video");
  video.src = link;
  video.controls = true;
  video.preload = "metadata";
  video.style.width = "100%";
  video.style.height = "100%";

  video.addEventListener("error", () => {
    elVideoBox.innerHTML =
      `<div class="placeholder">Não consegui abrir o vídeo <code>${escapeHtml(link)}</code>.</div>`;
  });

  elVideoBox.appendChild(video);
}

function optionTextForItem(it, type){
  if(isVocabType(type)){
    return isVocabFlipOn() ? vocabWord(it) : vocabMeaning(it);
  }
  return techniqueName(it);
}



function buildOptions(correctItem, type){
  const correct = optionTextForItem(correctItem, type);
  const options = new Set([correct]);

  let guard = 0;
  while(options.size < 4 && guard < 1000){
    const it = optionPool[randInt(optionPool.length)];
    const txt = optionTextForItem(it, type);
    if(txt && txt !== correct){
      options.add(txt);
    }
    guard++;
  }

  const opts = shuffle([...options]);
  return { opts, correct };
}

function canBuild4Options(type){
  if(isFaixaQuizType(type)){
    // precisa ter pelo menos 1 faixa perguntável e, para alguma faixa,
    // conseguir gerar 2*k distratores (k corretas)
    if(questionPool.length === 0) return false;

    // valida a “pior” faixa: se k=1, precisa 2 distratores; se k=4, precisa 8, etc.
    for(const faixa of questionPool){
      const correctCount = optionPool.filter(it => Number(it.numero_faixa) === Number(faixa)).length;
      if(correctCount <= 0) continue;
      const otherCount = optionPool.filter(it => Number(it.numero_faixa) !== Number(faixa)).length;

      // distratores são 2*k, então tem que existir base suficiente.
      if(otherCount >= 2 * correctCount) return true;
    }
    return false;
  }

  // modo antigo: 4 alternativas distintas
  const set = new Set();
  for(const it of optionPool){
    const txt = optionTextForItem(it, type);
    if(txt) set.add(txt);
    if(set.size >= 4) return true;
  }
  return false;
}


function renderQuestion(item){
  answered = false;
  current = item;
  lastId = itemKey(item);
  elNext.style.display = "none";
  elNext.textContent = "Próxima";

  const level = Number(elLevel.value);
  const type = elType.value;

  elBadge.textContent = roundActive
    ? `Nível ≤ ${level} · ${niceTypeLabel(type)} · ${roundIndex}/${roundTotal}`
    : `Nível ≤ ${level} · ${niceTypeLabel(type)}`;

  // ===== QUIZ POR FAIXA (multi-seleção) =====
  if(isFaixaQuizType(type)){
    const faixaNumero = Number(item);

    elPrompt.textContent = `Quais são as técnicas de projeção da faixa ${faixaNumero}?`;
    embedMediaOrPrompt(item, type);

    elAnswers.innerHTML = "";

    const { opts, correctSet, k } = buildOptionsFaixaProjecao(faixaNumero);

    opts.forEach(txt => {
      const btn = document.createElement("button");
      btn.className = "ans";
      btn.type = "button";
      btn.textContent = txt;
      btn.dataset.value = txt;
      btn.dataset.selected = "0";

      btn.addEventListener("click", () => {
        if(answered) return;
        const selected = btn.dataset.selected === "1";
        const next = selected ? "0" : "1";
        btn.dataset.selected = next;
        btn.classList.toggle("selected", next === "1");
      });

      elAnswers.appendChild(btn);
    });

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "confirm";
    confirm.textContent = `Confirmar (${k} corretas)`;

    confirm.addEventListener("click", () => {
      if(answered) return;
      answered = true;

      const all = [...elAnswers.querySelectorAll("button.ans")];
      const picked = new Set(
        all.filter(b => b.dataset.selected === "1").map(b => b.dataset.value)
      );

      all.forEach(b => b.disabled = true);
      confirm.disabled = true;

      all.forEach(b => {
        const v = b.dataset.value;
        const isCorrect = correctSet.has(v);
        const didPick = picked.has(v);

        if(isCorrect) b.classList.add("ok");
        if(didPick && !isCorrect) b.classList.add("bad");
      });

      const pickedAllCorrect = [...correctSet].every(v => picked.has(v));
      const pickedNoWrong = [...picked].every(v => correctSet.has(v));
      const perfect = pickedAllCorrect && pickedNoWrong;

      if(perfect){
        hits++;
        if(roundActive) roundHits++;
      }else{
        misses++;
        if(roundActive) roundMisses++;
      }

      elStats.textContent = `Acertos: ${hits} · Erros: ${misses}`;
      elNext.style.display = "inline-block";
    });

    elAnswers.appendChild(confirm);
    return;
  }

  // ===== VOCABULÁRIO (normal/invertido + questão especial Jigoro Kano) =====
  if(isVocabType(type)){
    const w = vocabWord(item);
    const m = vocabMeaning(item);

    // questão especial: fundador do judô
    if(normType(w) === normType("Jigoro Kano")){
      elPrompt.textContent = "Quem é o fundador do judô?";
      // se quiser mostrar vídeo, troque pela linha abaixo:
      // embedMediaOrPrompt(item, type);
      elVideoBox.innerHTML = `<div class="placeholder">Escolha a resposta correta.</div>`;

      const correct = "Jigoro Kano";
      const opts = shuffle([
        correct,
        "Julio Nagaita",
        "Hagio Taje",
        "Josmar Amaral"
      ]);

      elAnswers.innerHTML = "";
      opts.forEach(txt => {
        const btn = document.createElement("button");
        btn.className = "ans";
        btn.type = "button";
        btn.textContent = txt;
        btn.dataset.value = txt;

        btn.addEventListener("click", () => {
          if(answered) return;
          answered = true;

          const all = [...elAnswers.querySelectorAll("button.ans")];
          all.forEach(b => b.disabled = true);

          if(txt === correct){
            btn.classList.add("ok");
            hits++;
            if(roundActive) roundHits++;
          }else{
            btn.classList.add("bad");
            misses++;
            if(roundActive) roundMisses++;

            const rightBtn = all.find(b => b.dataset.value === correct);
            if(rightBtn) rightBtn.classList.add("ok");
          }

          elStats.textContent = `Acertos: ${hits} · Erros: ${misses}`;
          elNext.style.display = "inline-block";
        });

        elAnswers.appendChild(btn);
      });

      return;
    }

    // vocabulário normal/invertido
    if(isVocabFlipOn()){
      elPrompt.textContent = `Como se escreve em japonês: "${m}"?`;
    }else{
      elPrompt.textContent = `O que significa "${w}"?`;
    }

    embedMediaOrPrompt(item, type);

    elAnswers.innerHTML = "";
    const pack = buildOptions(item, type);
    const { opts, correct } = pack;

    opts.forEach(txt => {
      const btn = document.createElement("button");
      btn.className = "ans";
      btn.type = "button";
      btn.textContent = txt;
      btn.dataset.value = txt;

      btn.addEventListener("click", () => {
        if(answered) return;
        answered = true;

        const all = [...elAnswers.querySelectorAll("button.ans")];
        all.forEach(b => b.disabled = true);

        if(txt === correct){
          btn.classList.add("ok");
          hits++;
          if(roundActive) roundHits++;
        }else{
          btn.classList.add("bad");
          misses++;
          if(roundActive) roundMisses++;

          const rightBtn = all.find(b => b.dataset.value === correct);
          if(rightBtn) rightBtn.classList.add("ok");
        }

        elStats.textContent = `Acertos: ${hits} · Erros: ${misses}`;
        elNext.style.display = "inline-block";
      });

      elAnswers.appendChild(btn);
    });

    return;
  }

  // ===== TÉCNICAS (modo antigo) =====
  const faixaLabel = (item && (item.faixa ?? item.numero_faixa)) ?? "";
  if(isAtaqueCombinadoType(type)){
    elPrompt.textContent =
      `Qual o ataque que combina com "${techniqueName(item)}" na faixa ${faixaLabel}?`;
  }else if(isContraAtaqueType(type)){
    elPrompt.textContent =
      `Qual o contra ataque de "${techniqueName(item)}" na faixa ${faixaLabel}?`;
  }else{
    elPrompt.textContent = "Qual é o nome da técnica mostrada?";
  }

  embedMediaOrPrompt(item, type);

  elAnswers.innerHTML = "";

  const pack = isComboOuContraType(type)
    ? buildOptionsComboOuContra(item)
    : buildOptions(item, type);

  const { opts, correct } = pack;

  opts.forEach(txt => {
    const btn = document.createElement("button");
    btn.className = "ans";
    btn.type = "button";
    btn.textContent = txt;
    btn.dataset.value = txt;

    btn.addEventListener("click", () => {
      if(answered) return;
      answered = true;

      const all = [...elAnswers.querySelectorAll("button.ans")];
      all.forEach(b => b.disabled = true);

      if(txt === correct){
        btn.classList.add("ok");
        hits++;
        if(roundActive) roundHits++;
      }else{
        btn.classList.add("bad");
        misses++;
        if(roundActive) roundMisses++;

        const rightBtn = all.find(b => b.dataset.value === correct);
        if(rightBtn) rightBtn.classList.add("ok");
      }

      elStats.textContent = `Acertos: ${hits} · Erros: ${misses}`;
      elNext.style.display = "inline-block";
    });

    elAnswers.appendChild(btn);
  });
}




function resetToNeedStart(messageHtml){
  questionPool = [];
  questionBag = [];
  optionPool = [];

  current = null;
  lastId = null;
  answered = false;

  elAnswers.innerHTML = "";
  elVideoBox.innerHTML = `<div class="placeholder">${messageHtml || "Clique em Começar para gerar a primeira questão."}</div>`;
  elPrompt.textContent = "Clique em Começar para gerar a primeira questão.";
  elBadge.textContent = "—";
  elNext.style.display = "none";
  elNext.textContent = "Próxima";
}

function startOrRestart(){
  if(!Array.isArray(DATA) || DATA.length === 0){
    resetToNeedStart("Seu <code>data.js</code> está vazio (window.DATA não é um array ou não tem itens).");
    return;
  }

  updateTypeOptions();
  makePools();

  const type = elType.value;

  if(questionPool.length === 0){
    resetToNeedStart("Não há itens para esse nível/tipo. Ajuste o nível ou preencha o JSON.");
    return;
  }

  if(!canBuild4Options(type)){
    resetToNeedStart("Ainda não consigo gerar 4 alternativas distintas para esse tipo. Adicione mais itens (ou aceite misturar mais tipos).");
    return;
  }

  // inicia rodada (prova)
  roundActive = true;
  roundTotal = questionPool.length;
  roundHits = 0;
  roundMisses = 0;
  roundIndex = 0;

  const item = pickNextQuestion();
  if(!item){
    resetToNeedStart("Não consegui sortear uma questão. Verifique os dados.");
    return;
  }

  roundIndex++;
  renderQuestion(item);
}


elStart.addEventListener("click", startOrRestart);

elNext.addEventListener("click", () => {
  const type = elType.value;
  if(questionPool.length === 0) return;
  if(!canBuild4Options(type)) return;

  const item = pickNextQuestion();

  // se acabou o bag e está em rodada: finaliza
  if(!item){
    if(roundActive){
      finishRound();
    }
    return;
  }

  if(roundActive) roundIndex++;
  renderQuestion(item);
});

elLevel.addEventListener("change", () => {
  updateTypeOptions();
  resetToNeedStart("Mudou o nível. Clique em <code>Começar</code>.");
});

elType.addEventListener("change", () => {
  updateTypeOptions();
  resetToNeedStart("Mudou o tipo. Clique em <code>Começar</code>.");
});


// Init
if(!DATA.length){
  resetToNeedStart("Não encontrei dados. Confirme que <code>data.js</code> está na mesma pasta e define <code>window.DATA = [...]</code>.");
} else {
  updateTypeOptions();
  resetToNeedStart("Dados carregados. Clique em <code>Começar</code>.");
}

function toYouTubeEmbedUrl(rawUrl){
  try{
    const u = new URL(String(rawUrl).trim());
    const host = u.hostname.replace(/^www\./, "");

    // youtu.be/VIDEOID
    if(host === "youtu.be"){
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    // youtube.com / m.youtube.com
    if(host.endsWith("youtube.com")){
      // watch?v=VIDEOID
      const v = u.searchParams.get("v");
      if(v) return `https://www.youtube.com/embed/${v}`;

      // /shorts/VIDEOID
      const shorts = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,})/);
      if(shorts) return `https://www.youtube.com/embed/${shorts[1]}`;

      // /embed/VIDEOID
      const embed = u.pathname.match(/^\/embed\/([A-Za-z0-9_-]{6,})/);
      if(embed) return `https://www.youtube.com/embed/${embed[1]}`;

      // /v/VIDEOID (formato antigo)
      const vPath = u.pathname.match(/^\/v\/([A-Za-z0-9_-]{6,})/);
      if(vPath) return `https://www.youtube.com/embed/${vPath[1]}`;

      return null;
    }

    return null;
  }catch{
    return null;
  }
}

function buildOptionsFaixaProjecao(faixaNumero){
  // corretas = todas as técnicas de projeção dessa faixa
  const correctItems = optionPool.filter(it => Number(it.numero_faixa) === Number(faixaNumero));
  const correctTexts = [...new Set(correctItems.map(it => techniqueName(it)).filter(Boolean))];

  const k = correctTexts.length;
  const correctSet = new Set(correctTexts);

  // distratores: 2*k de outras faixas (sem duplicar texto)
  const allOther = optionPool.filter(it => Number(it.numero_faixa) !== Number(faixaNumero));
  const distractors = new Set();

  let guard = 0;
  while(distractors.size < 2 * k && guard < 5000){
    const it = allOther[randInt(allOther.length)];
    const txt = techniqueName(it);
    if(txt && !correctSet.has(txt)){
      distractors.add(txt);
    }
    guard++;
  }

  const opts = shuffle([...correctSet, ...distractors]);
  return { opts, correctSet, k };
}

function buildOptionsComboOuContra(questionItem){
  const correct = String(questionItem.segunda_tecnica ?? "").trim();
  const options = new Set([correct]);

  let guard = 0;
  while(options.size < 4 && guard < 3000){
    const it = optionPool[randInt(optionPool.length)]; // aqui optionPool já é projeção
    const txt = techniqueName(it); // distrator = nome da técnica de projeção
    if(txt && txt !== correct) options.add(txt);
    guard++;
  }

  const opts = shuffle([...options]);
  return { opts, correct };
}

function finishRound(){
  roundActive = false;

  const total = roundTotal || 0;
  const pct = total ? Math.round((roundHits / total) * 100) : 0;

  elPrompt.textContent = `Fim da rodada. Você acertou ${roundHits} de ${total} (${pct}%).`;
  elVideoBox.innerHTML = `<div class="placeholder">Rodada finalizada. Troque o tipo/nível e clique em Começar para outra rodada.</div>`;
  elAnswers.innerHTML = "";
  elNext.style.display = "none";

  // Se quiser manter o placar global, não mexe em hits/misses aqui.
  // Se quiser que rodada = placar, você pode sincronizar:
  // hits = roundHits; misses = roundMisses;
}


;
