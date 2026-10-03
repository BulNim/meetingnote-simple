const $ = s => document.querySelector(s);
const msg = t => $('#msg').textContent = t;

async function refresh() {
  const r = await fetch('/api/notes');
  const notes = await r.json();
  $('#list').innerHTML = notes.map(n =>
    `<li data-id="${n.id}"><b>${n.title}</b> <span class="meta">${(n.met_at||'').slice(0,16).replace('T',' ')} · ${n.attendees||''}</span></li>`
  ).join('') || '<li class="meta">아직 없습니다</li>';
  document.querySelectorAll('#list li[data-id]').forEach(li =>
    li.onclick = () => open(li.dataset.id));
}

async function open(id) {
  const r = await fetch('/api/notes/' + id);
  if (!r.ok) return msg('없는 회의록입니다');
  const n = await r.json();
  $('#detail').hidden = false;
  $('#dTitle').textContent = n.title;
  $('#dMeta').textContent = `${(n.met_at||'').slice(0,16).replace('T',' ')} · ${n.attendees||''}`;
  $('#dSummary').textContent = n.summary;
  $('#dDecisions').innerHTML = (n.decisions||[]).map(d => `<li>${d}</li>`).join('');
  $('#dTodos').innerHTML = (n.todos||[]).map(d => `<li>${d}</li>`).join('');
  $('#btnDel').onclick = async () => {
    await fetch('/api/notes/' + id, { method: 'DELETE' });
    $('#detail').hidden = true; msg('삭제했습니다'); refresh();
  };
}

$('#btnUp').onclick = async () => {
  const f = $('#file').files[0];
  if (!f) return msg('파일을 고르세요');
  msg('받아쓰는 중...');
  const fd = new FormData(); fd.append('file', f);
  const r = await fetch('/api/upload', { method: 'POST', body: fd });
  const j = await r.json();
  if (!r.ok) return msg('받아쓰기 실패: ' + j.error);
  $('#body').value = j.text; msg('받아쓰기 완료');
};

$('#btnSave').onclick = async () => {
  msg('정리하는 중...');
  const r = await fetch('/api/notes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: $('#title').value, met_at: $('#met_at').value,
      attendees: $('#attendees').value, body: $('#body').value })
  });
  const j = await r.json();
  if (!r.ok) return msg('실패: ' + j.error);
  msg('저장했습니다'); refresh(); open(j.id);
};

refresh();
