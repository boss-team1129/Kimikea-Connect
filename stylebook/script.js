const STORAGE_KEY = 'kimikea_stylebook_recipes_v2';
const STYLEBOOK_API_URL = '';

const sampleRecipes = [
  {
    id: 'sample-001',
    status: 'published',
    photo: '',
    name: 'ホワイトベージュイヤリング',
    treatmentType: 'イヤリングカラー',
    baseColor: 'ベージュブラウン',
    baseLevel: '9レベル',
    comment: '顔まわりに白っぽい透明感を出し、派手すぎず上品に見せるレシピ。',
    tags: ['初めて向け', '透明感', '職場OK'],
    difficulty: 2,
    salon: 'Kimikea Sample Salon',
    stylist: 'Mika',
    ownerId: 'sample',
    registeredAt: '2026-07-10',
    colors: [
      { category: 'ライトカラー', name: '18番', pieces: 6, swatch: '#e8dcc5' },
      { category: '原色', name: 'WHITE', pieces: 2, swatch: '#f9f8f2' }
    ],
    visual: {
      toneA: '#f3eadb',
      toneB: '#d8c5aa',
      hairBase: '#9f785b',
      accentOne: '#eee6d8',
      accentTwo: '#f9f8f2'
    }
  },
  {
    id: 'sample-002',
    status: 'published',
    photo: '',
    name: 'ナチュラルダーク長さ出し',
    treatmentType: '長さ出し',
    baseColor: 'ダークブラウン',
    baseLevel: '5レベル',
    comment: '地毛になじませて自然に長さを出す、初回提案にも使いやすいレシピ。',
    tags: ['自然仕上げ', '職場OK'],
    difficulty: 3,
    salon: 'Exteland Fuji',
    stylist: 'Kana',
    ownerId: 'sample',
    registeredAt: '2026-07-09',
    colors: [
      { category: 'ダークカラー', name: '4GB', pieces: 40, swatch: '#3a271f' }
    ],
    visual: {
      toneA: '#e9ded0',
      toneB: '#b8c9cf',
      hairBase: '#33251f',
      accentOne: '#4d382c',
      accentTwo: '#2b201b'
    }
  }
];

const state = {
  recipes: [],
  type: '',
  pieces: '',
  sort: 'new',
  search: '',
  currentPhoto: '',
  saveMode: 'published',
  currentUserRole: 'admin',
  currentUserId: 'local-user'
};

const recipeForm = document.getElementById('recipeForm');
const recipeId = document.getElementById('recipeId');
const recipeName = document.getElementById('recipeName');
const treatmentType = document.getElementById('treatmentType');
const baseColor = document.getElementById('baseColor');
const baseLevel = document.getElementById('baseLevel');
const salonName = document.getElementById('salonName');
const stylistName = document.getElementById('stylistName');
const comment = document.getElementById('comment');
const tagsInput = document.getElementById('tagsInput');
const difficulty = document.getElementById('difficulty');
const registeredAt = document.getElementById('registeredAt');
const photoInput = document.getElementById('photoInput');
const imagePreview = document.getElementById('imagePreview');
const colorRows = document.getElementById('colorRows');
const addColorButton = document.getElementById('addColorButton');
const totalPiecesPreview = document.getElementById('totalPiecesPreview');
const cancelEditButton = document.getElementById('cancelEditButton');
const formTitle = document.getElementById('formTitle');
const messageBox = document.getElementById('messageBox');
const draftButton = document.getElementById('draftButton');
const publishButton = document.getElementById('publishButton');
const recipeGrid = document.getElementById('recipeGrid');
const draftGrid = document.getElementById('draftGrid');
const resultCount = document.getElementById('resultCount');
const draftCount = document.getElementById('draftCount');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const resetButton = document.getElementById('resetButton');
const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));

function today() {
  return new Date().toISOString().slice(0, 10);
}

function showMessage(messages, type = 'error') {
  const list = Array.isArray(messages) ? messages : [messages];
  messageBox.innerHTML = list.map(message => `<p>${message}</p>`).join('');
  messageBox.dataset.type = type;
  messageBox.hidden = false;
  messageBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideMessage() {
  messageBox.hidden = true;
  messageBox.innerHTML = '';
}

async function loadRecipes() {
  if (STYLEBOOK_API_URL) {
    try {
      const response = await fetch(`${STYLEBOOK_API_URL}?action=list`);
      const data = await response.json();
      state.recipes = data.recipes || [];
      return;
    } catch (error) {
      showMessage('オンライン保存先に接続できませんでした。端末内のデータを表示します。');
    }
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  state.recipes = saved ? JSON.parse(saved) : sampleRecipes;
}

async function persistRecipe(recipe) {
  if (STYLEBOOK_API_URL) {
    const response = await fetch(STYLEBOOK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'save', recipe })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || '保存できませんでした');
    recipe.id = data.id || recipe.id;
  }

  const index = state.recipes.findIndex(item => item.id === recipe.id);
  if (index >= 0) state.recipes[index] = recipe;
  else state.recipes.unshift(recipe);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.recipes));
}

async function persistDelete(id) {
  if (STYLEBOOK_API_URL) {
    const response = await fetch(STYLEBOOK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'delete', id })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || '削除できませんでした');
  }
  state.recipes = state.recipes.filter(item => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.recipes));
}

function getTotalPieces(recipe) {
  return recipe.colors.reduce((total, color) => total + Number(color.pieces || 0), 0);
}

function matchPieceRange(total, range) {
  if (!range) return true;
  if (range === '1-4') return total >= 1 && total <= 4;
  if (range === '5-10') return total >= 5 && total <= 10;
  if (range === '11-20') return total >= 11 && total <= 20;
  if (range === '21+') return total >= 21;
  return true;
}

function recipeMatchesSearch(recipe, search) {
  if (!search) return true;
  const normalized = search.toLowerCase();
  const totalPieces = getTotalPieces(recipe);
  const text = [
    recipe.name,
    recipe.treatmentType,
    recipe.baseColor,
    recipe.baseLevel,
    recipe.comment,
    recipe.salon,
    recipe.stylist,
    `${totalPieces}本`,
    ...(recipe.tags || []),
    ...recipe.colors.flatMap(color => [color.category, color.name, `${color.pieces}本`])
  ].join(' ').toLowerCase();
  return text.includes(normalized);
}

function getPublishedRecipes() {
  const filtered = state.recipes.filter(recipe => (
    recipe.status === 'published' &&
    (!state.type || recipe.treatmentType === state.type) &&
    matchPieceRange(getTotalPieces(recipe), state.pieces) &&
    recipeMatchesSearch(recipe, state.search)
  ));

  return filtered.sort((a, b) => {
    if (state.sort === 'piecesAsc') return getTotalPieces(a) - getTotalPieces(b);
    if (state.sort === 'piecesDesc') return getTotalPieces(b) - getTotalPieces(a);
    return new Date(b.registeredAt) - new Date(a.registeredAt);
  });
}

function getDraftRecipes() {
  return state.recipes
    .filter(recipe => recipe.status === 'draft')
    .sort((a, b) => new Date(b.updatedAt || b.registeredAt) - new Date(a.updatedAt || a.registeredAt));
}

function makeVisualFromColors(colors) {
  const first = colors[0]?.swatch || '#d8c5aa';
  const second = colors[1]?.swatch || first;
  return {
    toneA: '#f3eadb',
    toneB: '#d9e6e9',
    hairBase: first,
    accentOne: second,
    accentTwo: colors[2]?.swatch || second
  };
}

function renderPhoto(recipe) {
  if (recipe.photo || recipe.photoUrl) {
    return `<img src="${recipe.photo || recipe.photoUrl}" alt="${recipe.name || '施術写真'}">`;
  }
  const visual = recipe.visual || makeVisualFromColors(recipe.colors || []);
  return `
    <div
      class="recipe-photo-illustration"
      style="--tone-a: ${visual.toneA}; --tone-b: ${visual.toneB}; --hair-base: ${visual.hairBase}; --accent-one: ${visual.accentOne}; --accent-two: ${visual.accentTwo};"
      aria-label="仮画像"
    >
      <div class="hair-shape" aria-hidden="true"></div>
      <div class="face-shape" aria-hidden="true"></div>
    </div>
  `;
}

function canManage(recipe) {
  return state.currentUserRole === 'admin' || recipe.ownerId === state.currentUserId;
}

function renderRecipe(recipe) {
  const totalPieces = getTotalPieces(recipe);
  const title = recipe.name || `${recipe.treatmentType || '未選択'} レシピ`;
  const colorRowsHtml = (recipe.colors || []).map(color => `
    <div class="color-row">
      <span class="swatch" style="--swatch: ${color.swatch || '#d8c5aa'};" aria-hidden="true"></span>
      <span class="color-name">
        <strong>${color.category || 'カテゴリー未選択'} ${color.name || '色未入力'}</strong>
        <span>使用本数</span>
      </span>
      <span class="piece-count">${color.pieces || 0}本</span>
    </div>
  `).join('');
  const actionButtons = canManage(recipe) ? `
    <div class="card-actions">
      <button type="button" data-action="edit" data-id="${recipe.id}">編集</button>
      <button type="button" data-action="delete" data-id="${recipe.id}">削除</button>
    </div>
  ` : '';

  return `
    <article class="recipe-card ${recipe.status === 'draft' ? 'is-draft' : ''}">
      <div class="recipe-photo">
        <span class="type-badge">${recipe.status === 'draft' ? '下書き' : recipe.treatmentType}</span>
        ${renderPhoto(recipe)}
      </div>

      <div class="recipe-body">
        <div class="recipe-title-row">
          <div>
            <p class="recipe-id">${recipe.id}</p>
            <h3>${title}</h3>
          </div>
          <span class="total-pieces">合計 ${totalPieces}本</span>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <span>施術タイプ</span>
            <strong>${recipe.treatmentType || '未入力'}</strong>
          </div>
          <div class="meta-item">
            <span>ベースレベル</span>
            <strong>${recipe.baseLevel || '未入力'}</strong>
          </div>
        </div>

        <div class="color-list" aria-label="使用カラーと本数">
          ${colorRowsHtml || '<p class="impression">使用カラー未入力</p>'}
        </div>

        <p class="impression">${recipe.comment || 'コメント未入力'}</p>

        <div class="staff-row">
          <span>担当サロン：<strong>${recipe.salon || '未入力'}</strong></span>
          <span>担当者：<strong>${recipe.stylist || '未入力'}</strong></span>
          <span>登録日：<strong>${recipe.registeredAt || '未入力'}</strong></span>
        </div>

        ${actionButtons}
      </div>
    </article>
  `;
}

function render() {
  const published = getPublishedRecipes();
  const drafts = getDraftRecipes();
  resultCount.textContent = `${published.length}件`;
  draftCount.textContent = `${drafts.length}件`;
  recipeGrid.innerHTML = published.length
    ? published.map(renderRecipe).join('')
    : '<div class="empty-state">公開済みレシピはまだありません。「投稿する」で公開できます。</div>';
  draftGrid.innerHTML = drafts.length
    ? drafts.map(renderRecipe).join('')
    : '<div class="empty-state">下書きはありません。</div>';
}

function updateButtonStates() {
  filterButtons.forEach(button => {
    const key = button.dataset.filter;
    button.classList.toggle('is-selected', state[key] === button.dataset.value);
  });
}

function updateImagePreview() {
  if (!state.currentPhoto) {
    imagePreview.innerHTML = '<span>写真プレビュー</span>';
    imagePreview.classList.remove('has-image');
    return;
  }
  imagePreview.innerHTML = `<img src="${state.currentPhoto}" alt="選択した施術写真">`;
  imagePreview.classList.add('has-image');
}

function addColorRow(color = {}) {
  const row = document.createElement('div');
  row.className = 'color-input-row';
  row.innerHTML = `
    <label>
      <span>カテゴリー</span>
      <select class="color-category">
        <option value="">選択</option>
        <option ${color.category === 'ダークカラー' ? 'selected' : ''}>ダークカラー</option>
        <option ${color.category === 'ライトカラー' ? 'selected' : ''}>ライトカラー</option>
        <option ${color.category === '原色' ? 'selected' : ''}>原色</option>
      </select>
    </label>
    <label>
      <span>カラー名・番号</span>
      <input class="color-name-input" type="text" value="${color.name || ''}" placeholder="例：18番 / WHITE">
    </label>
    <label>
      <span>本数</span>
      <input class="color-pieces-input" type="number" min="1" step="1" value="${color.pieces || ''}" placeholder="6">
    </label>
    <label>
      <span>色見本</span>
      <input class="color-swatch-input" type="color" value="${color.swatch || '#d8c5aa'}">
    </label>
    <button class="remove-color-button" type="button">削除</button>
  `;
  row.querySelector('.remove-color-button').addEventListener('click', () => {
    row.remove();
    updateTotalPreview();
  });
  row.querySelectorAll('input, select').forEach(input => {
    input.addEventListener('input', updateTotalPreview);
    input.addEventListener('change', updateTotalPreview);
  });
  colorRows.appendChild(row);
  updateTotalPreview();
}

function getFormColors() {
  return Array.from(colorRows.querySelectorAll('.color-input-row')).map(row => ({
    category: row.querySelector('.color-category').value,
    name: row.querySelector('.color-name-input').value.trim(),
    pieces: Number(row.querySelector('.color-pieces-input').value || 0),
    swatch: row.querySelector('.color-swatch-input').value
  })).filter(color => color.category || color.name || color.pieces > 0);
}

function getCompleteColors() {
  return getFormColors().filter(color => color.category && color.name && color.pieces > 0);
}

function updateTotalPreview() {
  const total = getFormColors().reduce((sum, color) => sum + Number(color.pieces || 0), 0);
  totalPiecesPreview.textContent = `${total}本`;
}

function clearForm() {
  recipeForm.reset();
  recipeId.value = '';
  registeredAt.value = today();
  state.currentPhoto = '';
  colorRows.innerHTML = '';
  addColorRow();
  updateImagePreview();
  formTitle.textContent = '新規レシピ';
  cancelEditButton.hidden = true;
  hideMessage();
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1200;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getTags() {
  return tagsInput.value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

function validatePublish() {
  const errors = [];
  const colors = getCompleteColors();
  if (!state.currentPhoto) errors.push('施術写真を選択してください。');
  if (!treatmentType.value) errors.push('施術タイプを選択してください。');
  if (!colors.length) errors.push('使用カラーと本数を1色以上入力してください。');
  if (getFormColors().length !== colors.length) errors.push('使用カラーは、カテゴリー・カラー名・本数をすべて入力してください。');
  if (!salonName.value.trim()) errors.push('担当サロン名を入力してください。');
  if (!stylistName.value.trim()) errors.push('担当者名を入力してください。');
  return errors;
}

function buildRecipe(status) {
  const colors = status === 'published' ? getCompleteColors() : getFormColors();
  const id = recipeId.value || `recipe-${Date.now()}`;
  return {
    id,
    status,
    photo: state.currentPhoto,
    name: recipeName.value.trim(),
    treatmentType: treatmentType.value,
    baseColor: baseColor.value.trim(),
    baseLevel: baseLevel.value.trim(),
    comment: comment.value.trim(),
    tags: getTags(),
    difficulty: difficulty.value ? Number(difficulty.value) : '',
    salon: salonName.value.trim(),
    stylist: stylistName.value.trim(),
    ownerId: state.currentUserId,
    registeredAt: registeredAt.value || today(),
    updatedAt: new Date().toISOString(),
    colors,
    visual: makeVisualFromColors(colors)
  };
}

async function saveCurrentRecipe(status) {
  hideMessage();
  if (status === 'published') {
    const errors = validatePublish();
    if (errors.length) {
      showMessage(errors);
      return;
    }
  } else {
    const hasAnyInput =
      state.currentPhoto ||
      treatmentType.value ||
      recipeName.value.trim() ||
      salonName.value.trim() ||
      stylistName.value.trim() ||
      getFormColors().length;
    if (!hasAnyInput) {
      showMessage('下書き保存する内容がありません。写真だけでも選択すると保存できます。');
      return;
    }
  }

  const recipe = buildRecipe(status);
  try {
    await persistRecipe(recipe);
    clearForm();
    render();
    showMessage(status === 'published' ? '投稿しました。一覧に反映しました。' : '下書き保存しました。', 'success');
  } catch (error) {
    showMessage(error.message || '保存できませんでした。');
  }
}

function editRecipe(id) {
  const recipe = state.recipes.find(item => item.id === id);
  if (!recipe || !canManage(recipe)) return;
  recipeId.value = recipe.id;
  recipeName.value = recipe.name || '';
  treatmentType.value = recipe.treatmentType || '';
  baseColor.value = recipe.baseColor || '';
  baseLevel.value = recipe.baseLevel || '';
  salonName.value = recipe.salon || '';
  stylistName.value = recipe.stylist || '';
  comment.value = recipe.comment || '';
  tagsInput.value = (recipe.tags || []).join(', ');
  difficulty.value = recipe.difficulty || '';
  registeredAt.value = recipe.registeredAt || today();
  state.currentPhoto = recipe.photo || recipe.photoUrl || '';
  colorRows.innerHTML = '';
  (recipe.colors || []).forEach(color => addColorRow(color));
  if (!recipe.colors?.length) addColorRow();
  updateImagePreview();
  formTitle.textContent = recipe.status === 'draft' ? '下書き編集' : '公開レシピ編集';
  cancelEditButton.hidden = false;
  hideMessage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteRecipe(id) {
  const recipe = state.recipes.find(item => item.id === id);
  if (!recipe || !canManage(recipe)) return;
  const ok = window.confirm(`「${recipe.name || '未命名レシピ'}」を削除しますか？`);
  if (!ok) return;
  try {
    await persistDelete(id);
    render();
  } catch (error) {
    showMessage(error.message || '削除できませんでした。');
  }
}

function showMessage(messages, type = 'error') {
  const list = Array.isArray(messages) ? messages : [messages];
  messageBox.innerHTML = list.map(message => `<p>${message}</p>`).join('');
  messageBox.dataset.type = type;
  messageBox.hidden = false;
  messageBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideMessage() {
  messageBox.hidden = true;
  messageBox.innerHTML = '';
}

async function init() {
  registeredAt.value = today();
  addColorRow();
  await loadRecipes();
  render();
}

photoInput.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    state.currentPhoto = await resizeImage(file);
    updateImagePreview();
  } catch (error) {
    showMessage('画像を読み込めませんでした。別の写真を選択してください。');
  }
});

addColorButton.addEventListener('click', () => addColorRow());
cancelEditButton.addEventListener('click', clearForm);
draftButton.addEventListener('click', () => saveCurrentRecipe('draft'));
publishButton.addEventListener('click', () => {
  state.saveMode = 'published';
});
recipeForm.addEventListener('submit', event => {
  event.preventDefault();
  saveCurrentRecipe('published');
});

filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    const key = button.dataset.filter;
    const value = button.dataset.value;
    state[key] = state[key] === value ? '' : value;
    updateButtonStates();
    render();
  });
});

searchInput.addEventListener('input', event => {
  state.search = event.target.value.trim();
  render();
});

sortSelect.addEventListener('change', event => {
  state.sort = event.target.value;
  render();
});

resetButton.addEventListener('click', () => {
  state.type = '';
  state.pieces = '';
  state.sort = 'new';
  state.search = '';
  searchInput.value = '';
  sortSelect.value = 'new';
  updateButtonStates();
  render();
});

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'edit') editRecipe(button.dataset.id);
  if (button.dataset.action === 'delete') deleteRecipe(button.dataset.id);
});

init();
