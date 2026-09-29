(() => {
  const STORAGE_KEY = 'moa-focus-app-v1';
  const modes = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
  const statusLabels = { todo: '해야 할 일', doing: '진행 중', done: '완료' };
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
  document.getElementById('todayLabel').textContent = today;

  const dateKey = () => new Date().toLocaleDateString('en-CA');
  const defaultState = () => ({ tasks: [], activeTaskId: null, today: dateKey(), focusSessions: 0, focusMinutes: 0, completedToday: 0, streak: 0, lastActiveDate: null });
  const loadState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved.tasks)) return defaultState();
      const state = { ...defaultState(), ...saved };
      if (state.today !== dateKey()) {
        state.today = dateKey(); state.focusSessions = 0; state.focusMinutes = 0; state.completedToday = 0;
      }
      state.tasks = state.tasks.map((task) => ({
        ...task,
        status: task.status || (task.done ? 'done' : task.id === state.activeTaskId ? 'doing' : 'todo'),
      }));
      return state;
    } catch { return defaultState(); }
  };
  let state = loadState();
  let taskFilter = 'todo';
  let mode = 'focus';
  let remaining = modes[mode];
  let focusProgress = 0;
  let interval = null;
  let toastTimeout;

  const $ = (selector) => document.querySelector(selector);
  const escapeHTML = (value) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  function renderTasks() {
    const list = $('#taskList');
    const counts = {
      todo: state.tasks.filter((task) => task.status === 'todo').length,
      doing: state.tasks.filter((task) => task.status === 'doing').length,
      done: state.tasks.filter((task) => task.status === 'done').length,
    };
    $('#taskCount').textContent = counts.todo + counts.doing;
    $('#todoCount').textContent = counts.todo;
    $('#doingCount').textContent = counts.doing;
    $('#completedCount').textContent = counts.done;
    $('#remainingLabel').textContent = counts.todo + counts.doing
      ? `해야 할 일 ${counts.todo}개 · 진행 중 ${counts.doing}개`
      : state.tasks.length ? '모든 할 일을 완료했어요!' : '할 일을 추가해 보세요';
    const filteredTasks = state.tasks.filter((task) => task.status === taskFilter);
    if (!filteredTasks.length) {
      const emptyMessages = {
        todo: ['새로운 할 일을 추가해 보세요', '아직 시작 전인 할 일이 없어요.'],
        doing: ['진행 중인 일이 없어요', '해야 할 일에서 시작할 일을 골라보세요.'],
        done: ['완료한 일이 여기에 모여요', '할 일을 끝내면 이곳에서 확인할 수 있어요.'],
      };
      const [title, message] = emptyMessages[taskFilter];
      list.innerHTML = `<div class="empty-state"><strong>${title}</strong>${message}</div>`;
      return;
    }
    list.innerHTML = filteredTasks.map((task) => `
      <div class="task-row${task.status === 'done' ? ' done' : ''}${task.status === 'doing' && task.id === state.activeTaskId ? ' active' : ''}" data-id="${task.id}">
        <button class="check-button" type="button" data-action="toggle" aria-label="${task.status === 'done' ? '해야 할 일로 되돌리기' : '완료로 표시'}" aria-pressed="${task.status === 'done'}">${task.status === 'done' ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="m3.5 8 3 3 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</button>
        <span class="task-name">${escapeHTML(task.text)}</span>
        ${task.id === state.activeTaskId && task.status === 'doing' ? '<span class="task-tag">집중 중</span>' : ''}
        <button class="task-status-button${task.status === 'doing' ? ' complete' : ''}" type="button" data-action="advance">${task.status === 'todo' ? '시작하기' : task.status === 'doing' ? '완료' : '다시 하기'}</button>
        <div class="task-actions">
          <button class="icon-button delete" type="button" data-action="delete" aria-label="할 일 삭제" title="삭제"><svg viewBox="0 0 24 24" fill="none"><path d="M4.5 7h15M10 11v6m4-6v6M6.5 7l.8 13h9.4l.8-13M9 7V4h6v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>`).join('');
  }

  function renderStats() {
    const total = state.tasks.length;
    const done = state.tasks.filter((task) => task.status === 'done').length;
    const percent = total ? Math.round(done / total * 100) : 0;
    $('#doneCount').textContent = state.completedToday;
    $('#focusCount').textContent = state.focusSessions;
    $('#focusMinutes').textContent = state.focusMinutes;
    $('#progressPercent').textContent = `${percent}%`;
    $('#progressBar').style.width = `${percent}%`;
    $('#progressNote').textContent = total ? (percent === 100 ? '멋져요! 오늘 할 일을 모두 마쳤어요.' : `할 일 ${total}개 중 ${done}개를 완료했어요.`) : '첫 번째 할 일을 추가해 볼까요?';
    $('#streakLabel').textContent = `${state.streak}일 연속`;
  }

  function renderTimer() {
    const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
    const secs = (remaining % 60).toString().padStart(2, '0');
    if (mode === 'focus') focusProgress = ((modes.focus - remaining) / modes.focus) * 100;
    const progress = (Math.round(focusProgress * 10) / 10).toFixed(1);
    $('#timerDisplay').textContent = `${mins}:${secs}`;
    $('#timerProgressBar').style.width = `${progress}%`;
    $('#timerProgressBar').setAttribute('aria-valuenow', progress);
    $('#timerProgressValue').textContent = `${progress}%`;
    $('#sessionLabel').textContent = mode === 'focus' ? `FOCUS ${String(state.focusSessions + 1).padStart(2, '0')}` : 'BREAK TIME';
    $('#timerCaption').innerHTML = mode === 'focus' ? '지금은 <span>나만의 집중 시간</span>' : '잠시 쉬며 <span>에너지를 채워요</span>';
    const start = $('#startButton');
    start.querySelector('span').textContent = interval ? '잠시 멈춤' : remaining < modes[mode] ? '계속하기' : mode === 'focus' ? '집중 시작' : '휴식 시작';
    start.querySelector('svg').innerHTML = interval ? '<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>' : '<path d="M8 5.8c0-.8.9-1.3 1.6-.9l9.1 5.3c.7.4.7 1.3 0 1.7l-9.1 5.3c-.7.4-1.6-.1-1.6-.9V5.8Z"/>';
    document.title = interval ? `${mins}:${secs} · 오늘의 집중` : '오늘의 집중';
  }

  function render() { renderTasks(); renderStats(); renderTimer(); }
  function selectTaskFilter(filter) {
    taskFilter = filter;
    document.querySelectorAll('.task-tab').forEach((tab) => {
      const selected = tab.dataset.filter === filter;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-selected', selected);
    });
    renderTasks();
  }
  function notify(message) {
    const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove('show'), 2600);
  }
  function stopTimer() { if (interval) clearInterval(interval); interval = null; }
  function finishTimer() {
    stopTimer();
    if (mode === 'focus') {
      state.focusSessions += 1; state.focusMinutes += 25;
      focusProgress = 100;
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = yesterday.toLocaleDateString('en-CA');
      if (state.lastActiveDate !== dateKey()) state.streak = state.lastActiveDate === yesterdayKey ? state.streak + 1 : 1;
      state.lastActiveDate = dateKey(); save();
      notify('집중 세션 완료! 잠깐 쉬어가도 좋아요.');
      mode = state.focusSessions % 4 === 0 ? 'long' : 'short'; remaining = modes[mode];
      document.querySelectorAll('.mode-button').forEach((button) => button.classList.toggle('selected', button.dataset.mode === mode));
    } else {
      notify('휴식이 끝났어요. 다시 시작해 볼까요?'); mode = 'focus'; remaining = modes.focus; focusProgress = 0;
      document.querySelectorAll('.mode-button').forEach((button) => button.classList.toggle('selected', button.dataset.mode === mode));
    }
    save(); render();
  }

  $('#taskForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#taskInput'); const text = input.value.trim();
    if (!text) { input.focus(); return; }
    const task = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, status: 'todo', done: false };
    state.tasks.push(task);
    selectTaskFilter('todo');
    input.value = ''; save(); render(); input.focus();
  });

  $('#taskList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const row = button.closest('.task-row'); const task = state.tasks.find((item) => item.id === row.dataset.id); if (!task) return;
    if (button.dataset.action === 'toggle') {
      task.status = task.status === 'done' ? 'todo' : 'done';
      task.done = task.status === 'done';
      if (task.done) state.completedToday += 1;
      else state.completedToday = Math.max(0, state.completedToday - 1);
      if (task.done && state.activeTaskId === task.id) state.activeTaskId = state.tasks.find((item) => item.status === 'doing' && item.id !== task.id)?.id || null;
    } else if (button.dataset.action === 'advance') {
      const previousStatus = task.status;
      task.status = task.status === 'todo' ? 'doing' : task.status === 'doing' ? 'done' : 'todo';
      task.done = task.status === 'done';
      if (task.status === 'doing') state.activeTaskId = task.id;
      if (task.status === 'done') {
        state.completedToday += 1;
        if (state.activeTaskId === task.id) state.activeTaskId = state.tasks.find((item) => item.status === 'doing' && item.id !== task.id)?.id || null;
      }
      if (previousStatus === 'done') state.completedToday = Math.max(0, state.completedToday - 1);
    }
    else if (button.dataset.action === 'delete') {
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      if (state.activeTaskId === task.id) state.activeTaskId = state.tasks.find((item) => item.status === 'doing')?.id || null;
    }
    if (button.dataset.action === 'toggle' || button.dataset.action === 'advance') selectTaskFilter(task.status);
    save(); render();
  });

  $('#clearCompleted').addEventListener('click', () => {
    state.tasks = state.tasks.filter((task) => task.status !== 'done'); save(); render();
  });

  document.querySelectorAll('.task-tab').forEach((button) => button.addEventListener('click', () => {
    selectTaskFilter(button.dataset.filter);
  }));

  document.querySelectorAll('.mode-button').forEach((button) => button.addEventListener('click', () => {
    stopTimer(); mode = button.dataset.mode; remaining = modes[mode];
    if (mode === 'focus') focusProgress = 0;
    document.querySelectorAll('.mode-button').forEach((tab) => tab.classList.toggle('selected', tab === button)); renderTimer();
  }));

  $('#startButton').addEventListener('click', () => {
    if (interval) { stopTimer(); renderTimer(); return; }
    interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) { remaining = 0; finishTimer(); }
      else renderTimer();
    }, 1000);
    renderTimer();
  });
  $('#resetButton').addEventListener('click', () => {
    stopTimer(); remaining = modes[mode];
    if (mode === 'focus') focusProgress = 0;
    renderTimer();
  });

  render();
})();
