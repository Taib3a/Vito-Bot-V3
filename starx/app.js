const TOOLS = [
  { id:'generate', name:'توليد الصور', icon:'spark',
    hint:'اكتب وصفاً واضحاً، وسيقوم STAR X AI بإنشاء الصورة.',
    placeholder:'مثال: صورة منتج عطر على حجر رخامي، إضاءة ناعمة من الجانب، خلفية داكنة.',
    needImage:false },
  { id:'extract-mask', name:'استخراج قناع الصورة', icon:'mask',
    hint:'ارفع صورة لاستخراج القناع (الموضوع معزولاً عن الخلفية).',
    placeholder:'اختياري: ما الذي تريد عزله؟ مثال: الشخص فقط دون الخلفية.',
    needImage:true },
  { id:'change-background', name:'تغيير الخلفية', icon:'image',
    hint:'ارفع صورة واكتب الخلفية المطلوبة.',
    placeholder:'مثال: خلفية رملية ذهبية مع ظل ناعم.',
    needImage:true },
  { id:'lighting', name:'تحسين الإضاءة', icon:'sun',
    hint:'ارفع صورة لتحسين الإضاءة وتوزيعها.',
    placeholder:'مثال: إضاءة استوديو دافئة من اليمين.',
    needImage:true },
  { id:'shadows', name:'تحسين الظلال', icon:'moon',
    hint:'ارفع صورة لتقوية الظلال وضبط عمقها.',
    placeholder:'مثال: ظل ناعم أسفل المنتج يزيد العمق.',
    needImage:true },
  { id:'ironing', name:'إزالة تجاعيد الملابس', icon:'shirt',
    hint:'ارفع صورة الملابس لإزالة التجاعيد.',
    placeholder:'مثال: ملابس مكوية وناعمة تماماً.',
    needImage:true },
  { id:'scene-edit', name:'تعديل المشهد', icon:'layers',
    hint:'ارفع صورة واكتب التعديل المطلوب على المشهد.',
    placeholder:'مثال: استبدل الخلفية بشارع ليلي مع أضواء بوكيه.',
    needImage:true }
];

const ICONS = {
  spark:'M12 2.5l2.1 6.1 6.2 2-6.2 2.1L12 18.9l-2.1-6.2-6.2-2.1 6.2-2z',
  mask:'M4 5h16v10H4zM9 19h6',
  image:'M4 5h16v14H4zM4 15l4.5-4.5 3 3L15 10l5 5',
  sun:'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4',
  moon:'M20 14.5A8 8 0 0 1 9.5 4a8.2 8.2 0 1 0 10.5 10.5z',
  shirt:'M8 4l4 2 4-2 4 4-3 2v10H7V10L4 8z',
  layers:'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5'
};

const RATIOS = [
  { key:'1:1', label:'مربع 1:1', size:'1024x1024' },
  { key:'4:5', label:'عمودي 4:5', size:'1024x1536' },
  { key:'16:9', label:'عريض 16:9', size:'1536x1024' }
];

const SUGGESTIONS = [
  'عطر فاخر على رخام أسود، إضاءة جانبية',
  'قهوة مختصة بخلفية خشبية دافئة',
  'حذاء رياضي يقفز في الهواء',
  'صورة شخصية بإضاءة سينمائية'
];

const $ = (id) => document.getElementById(id);
const state = { tool: TOOLS[0], ratio: RATIOS[0], count: 1, image: null, busy: false };
const HISTORY_KEY = 'starx.history.v1';

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function toast(text, isError) {
  const t = $('toast');
  t.textContent = text;
  t.className = 'toast show' + (isError ? ' err' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

/* ---------- navigation ---------- */
function renderNav() {
  const nav = $('toolNav');
  nav.innerHTML = '';
  for (const tool of TOOLS) {
    const a = el('a', '', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[tool.icon]}"/></svg><span>${tool.name}</span>`);
    a.href = tool.id === 'generate' ? '#/' : '#/tools/' + tool.id;
    a.dataset.tool = tool.id;
    nav.append(a);
  }
}

function route() {
  const m = location.hash.match(/^#\/tools\/([\w-]+)$/);
  const tool = m ? TOOLS.find((t) => t.id === m[1]) : TOOLS[0];
  state.tool = tool || TOOLS[0];
  document.querySelectorAll('#toolNav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tool === state.tool.id);
  });
  $('eyebrow').textContent = state.tool.id === 'generate' ? 'IMAGE STUDIO' : 'TOOL';
  $('title').textContent = state.tool.id === 'generate' ? 'حوّل فكرتك إلى صورة' : state.tool.name;
  $('hint').textContent = state.tool.hint;
  $('drop').hidden = !state.tool.needImage;
  $('prompt').placeholder = state.tool.placeholder;
  $('run').querySelector('.run-label').textContent = state.tool.id === 'generate' ? 'توليد' : 'تشغيل';
}

/* ---------- controls ---------- */
function renderChips() {
  const ratios = $('ratios');
  ratios.innerHTML = '';
  RATIOS.forEach((r) => {
    const b = el('button', 'chip' + (r.key === state.ratio.key ? ' on' : ''), r.label);
    b.type = 'button';
    b.onclick = () => { state.ratio = r; renderChips(); };
    ratios.append(b);
  });

  const counts = $('counts');
  counts.innerHTML = '';
  [1, 2, 4].forEach((n) => {
    const b = el('button', 'chip' + (n === state.count ? ' on' : ''), String(n));
    b.type = 'button';
    b.onclick = () => { state.count = n; renderChips(); };
    counts.append(b);
  });
}

/* ---------- upload ---------- */
function bindUpload() {
  const drop = $('drop'), input = $('file'), preview = $('preview');
  const empty = $('dropEmpty'), clear = $('dropClear');

  function setImage(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('اختر ملف صورة', true);
    if (file.size > 10 * 1024 * 1024) return toast('الصورة أكبر من 10 ميجابايت', true);
    const reader = new FileReader();
    reader.onload = () => {
      state.image = reader.result;
      preview.src = state.image;
      preview.hidden = false;
      empty.hidden = true;
      clear.hidden = false;
    };
    reader.readAsDataURL(file);
  }

  input.onchange = () => setImage(input.files[0]);
  clear.onclick = (e) => {
    e.preventDefault();
    state.image = null;
    input.value = '';
    preview.hidden = true;
    preview.removeAttribute('src');
    empty.hidden = false;
    clear.hidden = true;
  };
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove('over');
  }));
  drop.addEventListener('drop', (e) => setImage(e.dataTransfer.files[0]));
}

/* ---------- results ---------- */
function card(item) {
  const c = el('div', 'card');
  c.innerHTML = `
    <img src="${item.src}" alt="${escapeHtml(item.prompt).slice(0, 80)}" loading="lazy" />
    <div class="meta">
      <div>${escapeHtml(item.prompt).slice(0, 120) || 'بدون وصف'}</div>
      <div class="acts">
        <button data-act="save">تحميل</button>
        <button data-act="copy">نسخ الوصف</button>
        <button data-act="again">إعادة</button>
      </div>
    </div>`;
  c.querySelector('[data-act="save"]').onclick = () => download(item);
  c.querySelector('[data-act="copy"]').onclick = async () => {
    try { await navigator.clipboard.writeText(item.prompt || ''); toast('تم نسخ الوصف'); }
    catch { toast('تعذّر النسخ', true); }
  };
  c.querySelector('[data-act="again"]').onclick = () => {
    $('prompt').value = item.prompt || '';
    updateCount();
    run();
  };
  return c;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function download(item) {
  const a = document.createElement('a');
  a.href = item.src;
  a.download = 'starx-' + Date.now() + (item.src.startsWith('data:image/svg') ? '.svg' : '.png');
  document.body.append(a);
  a.click();
  a.remove();
}

function addResults(items, { persist = true } = {}) {
  const box = $('results');
  for (const item of items) box.prepend(card(item));
  $('empty').hidden = box.children.length > 0;
  $('clearAll').hidden = box.children.length === 0;
  if (persist) saveHistory(items);
}

function saveHistory(items) {
  try {
    const prev = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    localStorage.setItem(HISTORY_KEY, JSON.stringify([...items, ...prev].slice(0, 24)));
  } catch {}
}

function restoreHistory() {
  try {
    const items = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (items.length) addResults(items, { persist: false });
  } catch {}
}

/* ---------- run ---------- */
function updateCount() {
  $('count').textContent = String($('prompt').value.length);
}

async function run() {
  if (state.busy) return;
  const prompt = $('prompt').value.trim();
  if (state.tool.needImage && !state.image) return toast('ارفع صورة أولاً', true);
  if (!prompt && !state.image) return toast('اكتب وصفاً أو ارفع صورة', true);

  state.busy = true;
  const btn = $('run');
  btn.disabled = true;
  btn.classList.add('busy');

  const box = $('results');
  const skeletons = [];
  for (let i = 0; i < state.count; i++) {
    const s = el('div', 'card skel');
    box.prepend(s);
    skeletons.push(s);
  }
  $('empty').hidden = true;

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: state.tool.id,
        prompt,
        size: state.ratio.size,
        n: state.count,
        image: state.image
      })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'فشل التوليد');

    skeletons.forEach((s) => s.remove());
    const items = data.images.map((src) => ({ src, prompt, tool: state.tool.id, ts: Date.now() }));
    addResults(items);
    if (data.mode === 'demo') toast('نتيجة تجريبية — أضف مفتاح API للتوليد الحقيقي');
    else toast('تم التوليد');
  } catch (err) {
    skeletons.forEach((s) => s.remove());
    toast(err.message || 'حدث خطأ', true);
  } finally {
    state.busy = false;
    btn.disabled = false;
    btn.classList.remove('busy');
  }
}

/* ---------- boot ---------- */
async function health() {
  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    const live = d.mode === 'live';
    $('status').className = 'status ' + (live ? 'online' : 'demo');
    $('statusText').textContent = live ? 'متصل' : 'وضع تجريبي';
    $('modeBadge').textContent = live ? 'متصل بـ API' : 'تجريبي';
    $('modeBadge').className = 'badge' + (live ? ' live' : '');
  } catch {
    $('statusText').textContent = 'غير متصل';
  }
}

function bindSuggestions() {
  const box = $('suggest');
  SUGGESTIONS.forEach((s) => {
    const b = el('button', '', s);
    b.type = 'button';
    b.onclick = () => { $('prompt').value = s; updateCount(); $('prompt').focus(); };
    box.append(b);
  });
}

renderNav();
renderChips();
bindUpload();
bindSuggestions();
route();
restoreHistory();
health();
updateCount();

$('prompt').addEventListener('input', updateCount);
$('prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
});
$('run').onclick = run;
$('clearAll').onclick = () => {
  $('results').innerHTML = '';
  localStorage.removeItem(HISTORY_KEY);
  $('empty').hidden = false;
  $('clearAll').hidden = true;
};
window.addEventListener('hashchange', route);
