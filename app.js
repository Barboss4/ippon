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

function randInt(max){
  return Math.floor(Math.random() * max);
}

function shuffle(arr){
  for(let i = arr.length - 1; i > 0; i--){
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function niceTypeLabel(type){
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
  return String(type || "").startsWith("tecnica");
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

function isItemUsable(it, type){
  if(isVocabType(type)){
    return vocabWord(it).length > 0 && vocabMeaning(it).length > 0;
  }
  return techniqueName(it).length > 0;
}

function optionTextForItem(it, type){
  if(isVocabType(type)) return vocabMeaning(it);
  return techniqueName(it);
}

// Identificador estável do item (já que não existe id no JSON)
function itemKey(it){
  const main = (it.tipo === "vocabulario") ? (it.palavra ?? it.nome ?? "") : (it.nome ?? "");
  return `${it.tipo}|${it.numero_faixa}|${main}|${it.segunda_tecnica ?? ""}`;
}

// ====== UI: esconder/desabilitar tipos sem PERGUNTAS possíveis no nível ======
function updateTypeOptions(){
  const level = Number(elLevel.value);

  const counts = {};
  for(const it of DATA){
    if(Number(it.numero_faixa) > level) continue;
    const t = String(it.tipo || "").trim();
    if(!t) continue;
    if(!isItemUsable(it, t)) continue;
    counts[t] = (counts[t] || 0) + 1;
  }

  const opts = [...elType.options];
  opts.forEach(opt => {
    const t = opt.value;
    const c = counts[t] || 0;

    // aqui é intencional: só mostra o que tem pelo menos 1 pergunta possível no nível
    const disabled = c === 0;
    opt.disabled = disabled;
    opt.hidden = disabled;
  });

  // Se a opção atual ficou inválida, muda para a primeira disponível
  const sel = elType.selectedOptions[0];
  if(sel && sel.disabled){
    const firstEnabled = opts.find(o => !o.disabled);
    if(firstEnabled) elType.value = firstEnabled.value;
  }
}

// ====== Pool / Sorteio ======
function makePools(){
  const level = Number(elLevel.value);
  const type = elType.value;

  // 1) Perguntas: respeita o nível selecionado
  questionPool = DATA.filter(it =>
    Number(it.numero_faixa) <= level &&
    String(it.tipo).trim() === type &&
    isItemUsable(it, type)
  );
  questionBag = shuffle([...questionPool]);

  // 2) Alternativas: primeiro tenta o MESMO tipo em QUALQUER nível
  optionPool = DATA.filter(it =>
    String(it.tipo).trim() === type &&
    isItemUsable(it, type)
  );

  // 3) Fallback: se ainda não der pra montar 4 alternativas (1 correta + 3 distratores),
  //   e for técnica, usa técnicas de outros tipos (qualquer nível).
  //   (você pediu "outros níveis"; isso aqui só entra se nem com outros níveis do mesmo tipo der.)
  if(optionPool.length < 4 && isTecnicaType(type)){
    optionPool = DATA.filter(it =>
      isTecnicaType(it.tipo) &&
      isItemUsable(it, it.tipo)
    );
  }

  // 4) Fallback para vocabulário: usa vocabulário de qualquer nível
  if(optionPool.length < 4 && isVocabType(type)){
    optionPool = DATA.filter(it =>
      String(it.tipo).trim() === "vocabulario" &&
      isItemUsable(it, "vocabulario")
    );
  }
}

function pickNextQuestion(){
  if(questionPool.length === 0) return null;

  if(questionBag.length === 0){
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

  // Vocabulário: pergunta textual
  if(type === "vocabulario"){
    const w = (item.palavra ?? item.nome ?? "").trim();
    elVideoBox.innerHTML =
      `<div class="placeholder">O que significa <code>${w}</code>?</div>`;
    return;
  }

  const link = String(item.link || "").trim();

  if(!link){
    elVideoBox.innerHTML =
      `<div class="placeholder">Técnica sem vídeo cadastrado.</div>`;
    return;
  }

  // Vídeo local
  const video = document.createElement("video");
  video.src = link;
  video.controls = true;
  video.preload = "metadata";
  video.style.width = "100%";
  video.style.height = "100%";

  video.addEventListener("error", () => {
    elVideoBox.innerHTML =
      `<div class="placeholder">Não consegui abrir o vídeo <code>${link}</code>.</div>`;
  });

  elVideoBox.appendChild(video);
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
  // checa se dá pra ter 4 alternativas distintas
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

  const level = Number(elLevel.value);
  const type = elType.value;

  elBadge.textContent = `Nível ≤ ${level} · ${niceTypeLabel(type)}`;

  if(isVocabType(type)){
    const w = vocabWord(item);
    elPrompt.textContent = `O que significa "${w}"?`;
  }else{
    elPrompt.textContent = "Qual é o nome da técnica mostrada?";
  }

  embedMediaOrPrompt(item, type);

  elAnswers.innerHTML = "";
  const { opts, correct } = buildOptions(item, type);

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
      }else{
        btn.classList.add("bad");
        misses++;

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
  elVideoBox.innerHTML = `<div class="placeholder">${messageHtml}</div>`;
  elPrompt.textContent = "Clique em Começar para gerar a primeira questão.";
  elBadge.textContent = "—";
  elNext.style.display = "none";
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
    // Aqui entra o seu caso: 2 ou 3 itens no tipo. A pergunta pode existir, mas faltam distratores.
    // Como você pediu, o código já tenta outros níveis do mesmo tipo; se ainda assim não der, tenta outras técnicas.
    resetToNeedStart("Ainda não consigo gerar 4 alternativas distintas para esse tipo. Adicione mais itens (ou aceite misturar mais tipos).");
    return;
  }

  const item = pickNextQuestion();
  if(!item){
    resetToNeedStart("Não consegui sortear uma questão. Verifique os dados.");
    return;
  }

  renderQuestion(item);
}

elStart.addEventListener("click", startOrRestart);

elNext.addEventListener("click", () => {
  const type = elType.value;
  if(questionPool.length === 0) return;
  if(!canBuild4Options(type)) return;

  const item = pickNextQuestion();
  if(!item){
    questionBag = shuffle([...questionPool]);
    const retry = pickNextQuestion();
    if(!retry){
      elPrompt.textContent = "Sem questões disponíveis. Verifique o pool.";
      return;
    }
    renderQuestion(retry);
    return;
  }
  renderQuestion(item);
});

elLevel.addEventListener("change", () => {
  updateTypeOptions();
  resetToNeedStart("Mudou o nível. Clique em <code>Começar</code>.");
});

elType.addEventListener("change", () => {
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
