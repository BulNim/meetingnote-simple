// 회의록 정리기 - 심플 바이브 (Node 기본 모듈만)
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

// .env 읽기
const env = {};
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  });
} catch (e) {}
const KEY = env.GEMINI_API_KEY;
const MODEL = env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

const DATA = path.join(__dirname, 'data', 'notes.json');
function load() { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (e) { return []; } }
function save(x) { fs.writeFileSync(DATA, JSON.stringify(x, null, 2), 'utf8'); }
if (!fs.existsSync(DATA)) save([]);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Gemini 호출 - 실패하면 좀 기다렸다 다시 한다
function callGemini(parts) {
  const body = JSON.stringify({ contents: [{ parts }] });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`${res.statusCode} ${d.slice(0, 300)}`));
        try {
          const j = JSON.parse(d);
          resolve(j.candidates[0].content.parts.map(p => p.text || '').join(''));
        } catch (e) { reject(new Error('파싱 실패: ' + d.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
async function geminiRetry(parts, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await callGemini(parts); }
    catch (e) { last = e; console.error(`[gemini] 실패 ${i + 1}/${tries}: ${e.message}`); await sleep(2000 * (i + 1)); }
  }
  throw last;
}

// 멀티파트 파싱 (파일 1개만)
function parseMultipart(buf, boundary) {
  const b = Buffer.from('--' + boundary);
  let i = buf.indexOf(b);
  while (i !== -1) {
    const headEnd = buf.indexOf('\r\n\r\n', i);
    if (headEnd === -1) break;
    const head = buf.slice(i, headEnd).toString('utf8');
    const next = buf.indexOf(b, headEnd);
    if (next === -1) break;
    const content = buf.slice(headEnd + 4, next - 2);
    const fn = head.match(/filename="([^"]*)"/);
    if (fn && fn[1]) return { filename: fn[1], data: content };
    i = next;
  }
  return null;
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  // --- API ---
  if (p === '/api/notes' && req.method === 'GET') return json(res, 200, load());

  if (p === '/api/notes' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const inp = JSON.parse(body);
        const text = (inp.body || '').trim();
        if (!text) return json(res, 400, { error: '본문이 비었습니다' });
        const prompt = `아래 회의 내용을 읽고 JSON 으로만 답하라. 형식:
{"summary":"회의 전체를 3~5줄로","decisions":["합의가 끝난 것만"],"todos":["내용 | 담당자 | 기한"]}
없는 사실을 보태지 말 것. 담당자가 없으면 미정.
<회의>
${text}
</회의>`;
        const out = await geminiRetry([{ text: prompt }]);
        let parsed;
        try { parsed = JSON.parse(out.replace(/```json|```/g, '').trim()); }
        catch (e) { parsed = { summary: out, decisions: [], todos: [] }; }
        const notes = load();
        const note = {
          id: notes.length ? Math.max(...notes.map(n => n.id)) + 1 : 1,
          title: inp.title || '제목 없음',
          met_at: inp.met_at || new Date().toISOString(),
          attendees: inp.attendees || '',
          body: text,
          summary: parsed.summary || '',
          decisions: parsed.decisions || [],
          todos: parsed.todos || []
        };
        notes.push(note); save(notes);
        json(res, 201, note);
      } catch (e) { json(res, 500, { error: e.message }); }
    });
    return;
  }

  let m = p.match(/^\/api\/notes\/(\d+)$/);
  if (m) {
    const id = Number(m[1]); const notes = load();
    const i = notes.findIndex(n => n.id === id);
    if (req.method === 'GET') return i === -1 ? json(res, 404, { error: '없음' }) : json(res, 200, notes[i]);
    if (req.method === 'DELETE') {
      if (i === -1) return json(res, 404, { error: '없음' });
      notes.splice(i, 1); save(notes);
      res.writeHead(204); return res.end();
    }
  }

  if (p === '/api/upload' && req.method === 'POST') {
    const ct = req.headers['content-type'] || '';
    const bm = ct.match(/boundary=(.+)$/);
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        if (!bm) return json(res, 400, { error: 'boundary 없음' });
        const f = parseMultipart(Buffer.concat(chunks), bm[1]);
        if (!f) return json(res, 400, { error: '파일 없음' });
        const ext = path.extname(f.filename).toLowerCase();
        const mime = ext === '.mp3' ? 'audio/mp3' : ext === '.wav' ? 'audio/wav' : null;
        if (!mime) return json(res, 415, { error: 'mp3 · wav 만' });
        const text = await geminiRetry([
          { text: '이 한국어 회의 녹음을 그대로 받아써라. 받아쓴 글만 출력하라.' },
          { inline_data: { mime_type: mime, data: f.data.toString('base64') } }
        ]);
        json(res, 200, { text: text.trim() });
      } catch (e) { json(res, 500, { error: e.message }); }
    });
    return;
  }

  // --- 정적 파일 ---
  let fp = p === '/' ? '/index.html' : p;
  const full = path.join(__dirname, 'public', fp);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(full)] || 'text/plain';
    res.writeHead(200, { 'Content-Type': t + '; charset=utf-8' });
    return res.end(fs.readFileSync(full));
  }
  res.writeHead(404); res.end('not found');
});

const PORT = process.env.PORT || 8100;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
