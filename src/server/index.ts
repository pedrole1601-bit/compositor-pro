import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { validateMagicBytes } from './validators.js';
import { videoStreamHandler } from './streaming.js';
import { exec } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ port: 3001 });

// ── Configurações ──
const HTTP_PORT = 3000;
const PIN = process.env.APP_PIN || '1234';

// ── Estado em memória ──
interface AppState {
  cenas: any[];
  cenaAtivaId: string;
  resolucao: { width: number; height: number };
  transicao: { tipo: string; duracao: number };
  holyrics: {
    ip: string;
    port: number;
    token: string;
    connected: boolean;
  };
  triggers: TriggerRule[];
}

interface TriggerRule {
  id: string;
  nome: string;
  ativo: boolean;
  condicao: {
    tipo: 'slide_description' | 'song_title' | 'song_artist' | 'media_name' | 'custom';
    operador: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex';
    valor: string;
  };
  acao: {
    tipo: 'trocar_cena' | 'visibilidade_frame';
    cenaId?: string;
    cenaNome?: string;
    frameId?: string;
    visivel?: boolean;
  };
}

const state: AppState = {
  cenas: [
    {
      id: 'cena-inicial',
      nome: 'Cena Inicial',
      frames: [],
    },
  ],
  cenaAtivaId: 'cena-inicial',
  resolucao: { width: 1920, height: 1080 },
  transicao: { tipo: 'fade', duracao: 500 },
  holyrics: {
    ip: '172.17.2.124',
    port: 8091,
    token: 'WBDrjqrZmflyekpw',
    connected: false,
  },
  triggers: [],
};

// ── Persistência de triggers ──
const triggersFile = path.resolve('compositor-triggers.json');
const configFile = path.resolve('compositor-config.json');

function loadPersistedData(): void {
  try {
    if (fs.existsSync(triggersFile)) {
      const data = JSON.parse(fs.readFileSync(triggersFile, 'utf-8'));
      if (Array.isArray(data)) state.triggers = data;
      console.log(`[Config] ${state.triggers.length} trigger(s) carregado(s)`);
    }
  } catch { }
  try {
    if (fs.existsSync(configFile)) {
      const data = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      if (data.holyrics) Object.assign(state.holyrics, data.holyrics);
      console.log(`[Config] Holyrics: ${state.holyrics.ip}:${state.holyrics.port}`);
    }
  } catch { }
}

function saveTriggers(): void {
  try { fs.writeFileSync(triggersFile, JSON.stringify(state.triggers, null, 2)); } catch { }
}

function saveConfig(): void {
  try {
    fs.writeFileSync(configFile, JSON.stringify({
      holyrics: state.holyrics,
    }, null, 2));
  } catch { }
}

loadPersistedData();

// ── Helpers ──
function getCenaAtiva() {
  return state.cenas.find((c) => c.id === state.cenaAtivaId) || state.cenas[0];
}

function findCenaByName(nome: string): any | undefined {
  return state.cenas.find((c) => c.nome.toLowerCase().trim() === nome.toLowerCase().trim());
}

function findCenaById(id: string): any | undefined {
  return state.cenas.find((c) => c.id === id);
}

function uid(): string {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

// ── Uploads ──
const uploadsDir = path.resolve('uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

// ── Middlewares ──
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));


// Auth middleware
app.use((req, res, next) => {
  const publicPaths = ['/api/health', '/api/compositor/', '/uploads/', '/assets/', '/video/'];
  const isPublic =
    publicPaths.some((p) => req.path.startsWith(p)) ||
    req.path === '/' ||
    req.path === '/painel' ||
    req.path === '/painel.html' ||
    req.path.endsWith('.html') ||
    req.path.endsWith('.js') ||
    req.path.endsWith('.css') ||
    req.path.endsWith('.ico') ||
    req.path.endsWith('.png') ||
    req.path.endsWith('.svg') ||
    req.path.endsWith('.woff2');

  if (isPublic) return next();

  if (req.path.startsWith('/api/')) {
    const pin = req.headers['x-auth-pin'] as string;
    if (pin !== PIN) {
      return res.status(401).json({ error: 'PIN inválido' });
    }
  }
  next();
});

// ══════════════════════════════════════════════════════════════
// ── ROTAS API — Compositor Pro (chamadas pelo Holyrics) ──
// ══════════════════════════════════════════════════════════════

// --- Launch: Holyrics chama para iniciar o Compositor ---
app.post('/api/compositor/launch', (_req, res) => {
  console.log('[Compositor] Launch solicitado pelo Holyrics');

  // Abrir painel no navegador padrão
  const painelUrl = `http://localhost:${HTTP_PORT}/painel`;
  const telaoUrl = `http://localhost:${HTTP_PORT}/`;

  // Detecta o sistema operacional e abre o navegador
  const openCmd = process.platform === 'win32' ? 'start'
    : process.platform === 'darwin' ? 'open'
      : 'xdg-open';

  exec(`${openCmd} ${painelUrl}`);
  setTimeout(() => {
    exec(`${openCmd} ${telaoUrl}`);
  }, 1500);

  // O servidor já está rodando, então retorna as URLs
  const hostname = _req.hostname === 'localhost' ? getLocalIP() : _req.hostname;
  res.json({
    status: 'ok',
    painel: `http://${hostname}:${HTTP_PORT}/painel`,
    telao: `http://${hostname}:${HTTP_PORT}/`,
    websocket: `ws://${hostname}:3001`,
    message: 'Compositor Pro iniciado. Abra o painel e o telão nas URLs acima.',
  });
});

// --- Status ---
app.get('/api/compositor/status', (_req, res) => {
  res.json({
    status: 'ok',
    cenaAtiva: getCenaAtiva()?.nome ?? null,
    cenaAtivaId: state.cenaAtivaId,
    totalCenas: state.cenas.length,
    clientes: wss.clients.size,
    resolucao: state.resolucao,
    transicao: state.transicao,
  });
});

// --- Listar cenas (para configurar triggers no Holyrics) ---
app.get('/api/compositor/scenes', (_req, res) => {
  res.json({
    status: 'ok',
    data: state.cenas.map((c) => ({
      id: c.id,
      nome: c.nome,
      frames: c.frames.length,
    })),
  });
});

// --- Trocar cena (chamado pelo Holyrics via trigger/API Item) ---
app.post('/api/compositor/scene', (req, res) => {
  const { id, name, nome, scene, transition } = req.body;

  let cena: any = null;

  if (id) {
    cena = findCenaById(id);
  }
  if (!cena && (name || nome || scene)) {
    cena = findCenaByName(name || nome || scene);
  }

  if (!cena) {
    console.log(`[Compositor] Cena não encontrada: id=${id}, nome=${name || nome}`);
    return res.status(404).json({ status: 'error', error: 'Cena não encontrada' });
  }

  const previousId = state.cenaAtivaId;
  state.cenaAtivaId = cena.id;

  // Broadcast com transição
  const transConfig = transition || state.transicao;
  broadcast({
    tipo: 'cena',
    payload: {
      ...cena,
      _transicao: transConfig,
      _previousCenaId: previousId,
    },
  });

  console.log(`[Compositor] Cena trocada: "${cena.nome}" (via Holyrics)`);
  res.json({ status: 'ok', cena: cena.nome, id: cena.id });
});

// --- Visibilidade do telão ---
app.post('/api/compositor/visibility', (req, res) => {
  const { visible } = req.body;
  broadcast({
    tipo: 'telao_visibility',
    payload: { visible: !!visible },
  });
  console.log(`[Compositor] Telão ${visible ? 'visível' : 'oculto'} (via Holyrics)`);
  res.json({ status: 'ok' });
});

// ══════════════════════════════════════════════════════════════
// ── ROTAS API — Triggers ──
// ══════════════════════════════════════════════════════════════

app.get('/api/triggers', (_req, res) => {
  res.json({ status: 'ok', data: state.triggers });
});

app.post('/api/triggers', (req, res) => {
  const trigger: TriggerRule = {
    id: uid(),
    nome: req.body.nome || 'Novo Trigger',
    ativo: req.body.ativo ?? true,
    condicao: req.body.condicao || { tipo: 'slide_description', operador: 'contains', valor: '' },
    acao: req.body.acao || { tipo: 'trocar_cena', cenaId: '' },
  };
  state.triggers.push(trigger);
  saveTriggers();
  broadcast({ tipo: 'triggers_updated', payload: { triggers: state.triggers } });
  res.json({ status: 'ok', trigger });
});

app.put('/api/triggers/:id', (req, res) => {
  const idx = state.triggers.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ status: 'error', error: 'Trigger não encontrado' });
  Object.assign(state.triggers[idx], req.body);
  saveTriggers();
  broadcast({ tipo: 'triggers_updated', payload: { triggers: state.triggers } });
  res.json({ status: 'ok', trigger: state.triggers[idx] });
});

app.delete('/api/triggers/:id', (req, res) => {
  const idx = state.triggers.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ status: 'error', error: 'Trigger não encontrado' });
  state.triggers.splice(idx, 1);
  saveTriggers();
  broadcast({ tipo: 'triggers_updated', payload: { triggers: state.triggers } });
  res.json({ status: 'ok' });
});

// --- Testar trigger manualmente ---
app.post('/api/triggers/test', (req, res) => {
  const { triggerId, simulatedValue } = req.body;
  const trigger = state.triggers.find((t) => t.id === triggerId);
  if (!trigger) return res.status(404).json({ status: 'error', error: 'Trigger não encontrado' });
  const match = evaluateCondition(trigger.condicao, simulatedValue || '');
  res.json({ status: 'ok', match, trigger: trigger.nome });
});

// ══════════════════════════════════════════════════════════════
// ── ROTAS API — Holyrics Config ──
// ══════════════════════════════════════════════════════════════

app.get('/api/holyrics/config', (_req, res) => {
  res.json({
    status: 'ok',
    data: {
      ip: state.holyrics.ip,
      port: state.holyrics.port,
      token: state.holyrics.token,
      connected: state.holyrics.connected,
    },
  });
});

app.post('/api/holyrics/config', (req, res) => {
  const { ip, port, token } = req.body;
  if (ip) state.holyrics.ip = ip;
  if (port) state.holyrics.port = port;
  if (token) state.holyrics.token = token;
  saveConfig();
  res.json({ status: 'ok' });
});

app.post('/api/holyrics/test', async (req, res) => {
  const ip = req.body.ip || state.holyrics.ip;
  const port = req.body.port || state.holyrics.port;
  const token = req.body.token || state.holyrics.token;

  try {
    const response = await fetch(`http://${ip}:${port}/api/GetCPInfo?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    if (data.status === 'ok') {
      state.holyrics.connected = true;
      state.holyrics.ip = ip;
      state.holyrics.port = port;
      state.holyrics.token = token;
      saveConfig();
      res.json({ status: 'ok', message: 'Conectado ao Holyrics', data: data.data });
    } else {
      state.holyrics.connected = false;
      res.json({ status: 'error', error: data.error || 'Resposta inválida' });
    }
  } catch (err: any) {
    state.holyrics.connected = false;
    res.json({ status: 'error', error: `Não foi possível conectar: ${err.message}` });
  }
});

// --- Proxy para Holyrics API (painel usa para buscar dados) ---
app.post('/api/holyrics/proxy/:action', async (req, res) => {
  const { action } = req.params;
  const { ip, port, token } = state.holyrics;

  if (!ip || !token) {
    return res.status(400).json({ status: 'error', error: 'Holyrics não configurado' });
  }

  try {
    const response = await fetch(`http://${ip}:${port}/api/${action}?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.json({ status: 'error', error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// ── ROTAS API — Holyrics Webhook (Holyrics chama aqui) ──
// ══════════════════════════════════════════════════════════════

// O Holyrics pode enviar webhooks/API calls quando eventos acontecem.
// Esse endpoint recebe notificações e avalia triggers.
app.post('/api/compositor/webhook', (req, res) => {
  const { event, data } = req.body;
  console.log(`[Webhook] Evento recebido: ${event}`, data);

  if (event === 'presentation_changed' || event === 'slide_changed') {
    evaluateTriggersForEvent(data);
  }

  if (event === 'change_scene') {
    // Chamada direta do Holyrics API Item para trocar cena
    const { scene_name, scene_id } = data || {};
    let cena: any = null;
    if (scene_id) cena = findCenaById(scene_id);
    if (!cena && scene_name) cena = findCenaByName(scene_name);
    if (cena) {
      const previousId = state.cenaAtivaId;
      state.cenaAtivaId = cena.id;
      broadcast({
        tipo: 'cena',
        payload: { ...cena, _transicao: state.transicao, _previousCenaId: previousId },
      });
      console.log(`[Webhook] Cena trocada: "${cena.nome}"`);
    }
  }

  res.json({ status: 'ok' });
});

// Endpoint simplificado — Holyrics API Item chama com nome da cena na URL
// Exemplo: POST http://ip:3000/api/compositor/scene/Apresentador%201
app.post('/api/compositor/scene/:sceneName', (req, res) => {
  const sceneName = decodeURIComponent(req.params.sceneName);
  const cena = findCenaByName(sceneName);

  if (!cena) {
    console.log(`[Compositor] Cena não encontrada pelo nome: "${sceneName}"`);
    return res.status(404).json({ status: 'error', error: `Cena "${sceneName}" não encontrada` });
  }

  const previousId = state.cenaAtivaId;
  state.cenaAtivaId = cena.id;

  broadcast({
    tipo: 'cena',
    payload: { ...cena, _transicao: state.transicao, _previousCenaId: previousId },
  });

  console.log(`[Compositor] Cena trocada: "${cena.nome}" (via URL direta)`);
  res.json({ status: 'ok', cena: cena.nome, id: cena.id });
});

// ══════════════════════════════════════════════════════════════
// ── ROTAS API — Originais ──
// ══════════════════════════════════════════════════════════════

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    clientes: wss.clients.size,
    cenas: state.cenas.length,
  });
});

app.get('/api/estado', (_req, res) => {
  res.json(state);
});

app.post('/api/cena', (req, res) => {
  const { cenaId } = req.body;
  const cena = state.cenas.find((c) => c.id === cenaId);
  if (cena) {
    state.cenaAtivaId = cenaId;
    broadcast({ tipo: 'cena', payload: cena });
    res.json({ sucesso: true, cenaAtivaId: cenaId });
  } else {
    res.status(404).json({ error: 'Cena não encontrada' });
  }
});

app.post('/api/cenas', (req, res) => {
  const { cenas } = req.body;
  if (Array.isArray(cenas) && cenas.length > 0) {
    state.cenas = cenas;
    state.cenaAtivaId = cenas[0].id;
    broadcast({ tipo: 'init', payload: { ...state } });
    res.json({ sucesso: true });
  } else {
    res.status(400).json({ error: 'Formato inválido' });
  }
});

app.post('/api/frame', (req, res) => {
  const { frameId, ...dados } = req.body;
  const cena = getCenaAtiva();
  if (cena) {
    const frame = cena.frames.find((f: any) => f.id === frameId);
    if (frame) {
      Object.assign(frame, dados);
      broadcast({ tipo: 'frame', payload: { frameId, dados: frame } });
      return res.json({ sucesso: true });
    }
  }
  res.status(404).json({ error: 'Frame não encontrado' });
});

app.post('/api/frame/visibilidade', (req, res) => {
  const { frameId, visivel } = req.body;
  const cena = getCenaAtiva();
  if (cena) {
    const frame = cena.frames.find((f: any) => f.id === frameId);
    if (frame) {
      frame.visivel = visivel;
      broadcast({ tipo: 'frame', payload: { frameId, dados: frame } });
      return res.json({ sucesso: true });
    }
  }
  res.status(404).json({ error: 'Frame não encontrado' });
});

app.get('/api/midias', (_req, res) => {
  const files = fs.readdirSync(uploadsDir);
  const midias = files
    .filter((f) => !f.startsWith('.'))
    .map((file) => {
      const ext = path.extname(file).toLowerCase();
      const isVideo = ['.mp4', '.webm', '.mov', '.avi'].includes(ext);
      return {
        nome: file,
        url: `/uploads/${file}`,
        tipo: isVideo ? 'video' : 'image',
      };
    });
  res.json(midias);
});

app.delete('/api/midias/:nome', (req, res) => {
  const filename = path.basename(req.params.nome as string);
  const filePath = path.join(uploadsDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ sucesso: true });
  } else {
    res.status(404).json({ error: 'Arquivo não encontrado' });
  }
});

app.post('/api/upload', upload.single('file'), (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const validation = validateMagicBytes(req.file.buffer);
  if (!validation.success) {
    return res.status(400).json({ error: 'Tipo de arquivo não suportado' });
  }

  const originalName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${Date.now()}-${originalName}.${validation.ext}`;
  const filePath = path.join(uploadsDir, filename);

  fs.writeFileSync(filePath, req.file.buffer);

  res.json({
    sucesso: true,
    url: `/uploads/${filename}`,
    nome: filename,
    tipo: validation.mime,
    tamanho: req.file.size,
  });
});

app.get('/video/:filename', videoStreamHandler);

// ── Arquivos estáticos ──
const publicPath = path.resolve(__dirname, '../../public');

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(publicPath));

app.get('/painel', (_req, res) => {
  const p = path.join(publicPath, 'src/painel/painel.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  res.status(404).send('Execute npm run build primeiro');
});

app.get('/painel.html', (_req, res) => res.redirect('/painel'));

app.get('/{*path}', (_req, res) => {
  const t = path.join(publicPath, 'index.html');
  if (fs.existsSync(t)) return res.sendFile(t);
  res.status(404).send('Execute npm run build primeiro');
});

// ── Servidor HTTP ──
httpServer.listen(HTTP_PORT, () => {
  const ip = getLocalIP();
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║        COMPOSITOR PRO v2 — Servidor          ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║  HTTP:      http://${ip}:${HTTP_PORT}`.padEnd(49) + '║');
  console.log(`  ║  Painel:    http://${ip}:${HTTP_PORT}/painel`.padEnd(49) + '║');
  console.log(`  ║  Telão:     http://${ip}:${HTTP_PORT}/`.padEnd(49) + '║');
  console.log(`  ║  WebSocket: ws://${ip}:3001`.padEnd(49) + '║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log('  ║  Holyrics API Endpoints:                     ║');
  console.log(`  ║  POST /api/compositor/launch`.padEnd(49) + '║');
  console.log(`  ║  POST /api/compositor/scene`.padEnd(49) + '║');
  console.log(`  ║  POST /api/compositor/scene/:nome`.padEnd(49) + '║');
  console.log(`  ║  GET  /api/compositor/scenes`.padEnd(49) + '║');
  console.log(`  ║  GET  /api/compositor/status`.padEnd(49) + '║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});

// ── WebSocket ──
interface WsClient extends WebSocket {
  isAlive?: boolean;
  authenticated?: boolean;
  clientType?: string;
}

wss.on('connection', (ws: WsClient) => {
  ws.isAlive = true;
  ws.authenticated = false;

  console.log('[WS] Novo cliente conectado');

  const heartbeat = setInterval(() => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ tipo: 'ping', payload: {} }));
    }
  }, 30000);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.tipo === 'pong') {
        ws.isAlive = true;
        return;
      }

      if (!ws.authenticated) {
        if (msg.tipo === 'auth' && msg.payload?.pin === PIN) {
          ws.authenticated = true;
          ws.clientType = msg.payload?.clientType || 'unknown';
          ws.send(JSON.stringify({ tipo: 'auth', payload: { sucesso: true } }));
          ws.send(JSON.stringify({ tipo: 'init', payload: { ...state } }));
          console.log(`[WS] Cliente autenticado (${ws.clientType})`);
        } else {
          ws.send(JSON.stringify({ tipo: 'auth', payload: { sucesso: false, erro: 'PIN inválido' } }));
          ws.terminate();
        }
        return;
      }

      handleWsMessage(ws, msg);
    } catch (e) {
      console.error('[WS] Erro:', e);
    }
  });

  ws.on('close', () => {
    clearInterval(heartbeat);
    console.log('[WS] Cliente desconectado');
  });

  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

function handleWsMessage(sender: WsClient, msg: any) {
  console.log('[WS] Msg:', msg.tipo);

  switch (msg.tipo) {
    case 'resolucao': {
      if (msg.payload?.resolucao) {
        state.resolucao = msg.payload.resolucao;
        broadcast({ tipo: 'resolucao', payload: { resolucao: state.resolucao } });
      }
      break;
    }

    case 'transicao': {
      if (msg.payload?.transicao) {
        state.transicao = msg.payload.transicao;
        broadcast({ tipo: 'transicao', payload: { transicao: state.transicao } });
      }
      break;
    }

    case 'cena': {
      const payload = msg.payload;
      if (!payload || !payload.id) return;

      const idx = state.cenas.findIndex((c) => c.id === payload.id);
      if (idx !== -1) {
        const clean = { ...payload };
        delete clean._transicao;
        delete clean._previousCenaId;
        state.cenas[idx] = clean;
      } else {
        const clean = { ...payload };
        delete clean._transicao;
        delete clean._previousCenaId;
        state.cenas.push(clean);
      }
      state.cenaAtivaId = payload.id;

      broadcastExcept(sender, { tipo: 'cena', payload });
      break;
    }

    case 'frame': {
      const { frameId, dados } = msg.payload || {};
      if (!frameId) return;

      const cena = getCenaAtiva();
      if (cena) {
        const frame = cena.frames.find((f: any) => f.id === frameId);
        if (frame && dados) {
          Object.assign(frame, dados);
        }
      }

      broadcastExcept(sender, msg);
      break;
    }

    case 'frame_delete': {
      const { frameId } = msg.payload || {};
      if (!frameId) return;

      const cena = getCenaAtiva();
      if (cena) {
        cena.frames = cena.frames.filter((f: any) => f.id !== frameId);
      }

      broadcastExcept(sender, msg);
      break;
    }

    default:
      broadcastExcept(sender, msg);
  }
}

// ══════════════════════════════════════════════════════════════
// ── Trigger Engine ──
// ══════════════════════════════════════════════════════════════

function evaluateCondition(condicao: TriggerRule['condicao'], value: string): boolean {
  const v = value.toLowerCase().trim();
  const target = condicao.valor.toLowerCase().trim();

  switch (condicao.operador) {
    case 'equals': return v === target;
    case 'contains': return v.includes(target);
    case 'starts_with': return v.startsWith(target);
    case 'ends_with': return v.endsWith(target);
    case 'regex':
      try { return new RegExp(condicao.valor, 'i').test(value); }
      catch { return false; }
    default: return false;
  }
}

function evaluateTriggersForEvent(data: any): void {
  const activeTriggers = state.triggers.filter((t) => t.ativo);
  if (activeTriggers.length === 0) return;

  for (const trigger of activeTriggers) {
    let valueToTest = '';

    switch (trigger.condicao.tipo) {
      case 'slide_description':
        valueToTest = data?.slide_description || data?.text || data?.title || '';
        break;
      case 'song_title':
        valueToTest = data?.song_title || data?.title || '';
        break;
      case 'song_artist':
        valueToTest = data?.song_artist || data?.artist || '';
        break;
      case 'media_name':
        valueToTest = data?.media_name || data?.file || data?.name || '';
        break;
      case 'custom':
        valueToTest = JSON.stringify(data);
        break;
    }

    if (evaluateCondition(trigger.condicao, valueToTest)) {
      console.log(`[Trigger] Match: "${trigger.nome}" → valor="${valueToTest}"`);
      executeTriggerAction(trigger);
    }
  }
}

function executeTriggerAction(trigger: TriggerRule): void {
  switch (trigger.acao.tipo) {
    case 'trocar_cena': {
      let cena: any = null;
      if (trigger.acao.cenaId) cena = findCenaById(trigger.acao.cenaId);
      if (!cena && trigger.acao.cenaNome) cena = findCenaByName(trigger.acao.cenaNome);
      if (cena) {
        const previousId = state.cenaAtivaId;
        state.cenaAtivaId = cena.id;
        broadcast({
          tipo: 'cena',
          payload: { ...cena, _transicao: state.transicao, _previousCenaId: previousId },
        });
        console.log(`[Trigger] Cena trocada: "${cena.nome}"`);
      } else {
        console.log(`[Trigger] Cena não encontrada para: ${trigger.acao.cenaId || trigger.acao.cenaNome}`);
      }
      break;
    }
    case 'visibilidade_frame': {
      const cena = getCenaAtiva();
      if (cena && trigger.acao.frameId) {
        const frame = cena.frames.find((f: any) => f.id === trigger.acao.frameId);
        if (frame) {
          frame.visivel = trigger.acao.visivel ?? !frame.visivel;
          broadcast({ tipo: 'frame', payload: { frameId: frame.id, dados: frame } });
        }
      }
      break;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// ── Holyrics Polling (monitora apresentação atual) ──
// ══════════════════════════════════════════════════════════════

let lastPresentationData: string = '';
let holyricsPollingInterval: ReturnType<typeof setInterval> | null = null;

function startHolyricsPolling(): void {
  if (holyricsPollingInterval) return;

  holyricsPollingInterval = setInterval(async () => {
    if (state.triggers.filter((t) => t.ativo).length === 0) return;
    if (!state.holyrics.ip || !state.holyrics.token) return;

    try {
      const { ip, port, token } = state.holyrics;
      const response = await fetch(`http://${ip}:${port}/api/GetCurrentPresentation?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(3000),
      });
      const result = await response.json();

      if (result.status === 'ok' && result.data) {
        const dataStr = JSON.stringify(result.data);
        if (dataStr !== lastPresentationData) {
          lastPresentationData = dataStr;
          state.holyrics.connected = true;

          // Extrair info útil
          const eventData = {
            slide_description: result.data?.slide_description || '',
            title: result.data?.title || result.data?.name || '',
            song_title: result.data?.title || '',
            song_artist: result.data?.artist || '',
            media_name: result.data?.name || '',
            text: result.data?.text || '',
            type: result.data?.type || '',
            slide_index: result.data?.slide_number ?? result.data?.index ?? 0,
          };

          console.log(`[Holyrics] Apresentação mudou: "${eventData.title}" slide="${eventData.slide_description}"`);
          evaluateTriggersForEvent(eventData);

          // Notificar paineis
          broadcast({
            tipo: 'holyrics_presentation',
            payload: eventData,
          });
        }
      }
    } catch {
      state.holyrics.connected = false;
    }
  }, 1000); // Poll a cada 1 segundo

  console.log('[Holyrics] Polling iniciado');
}

function stopHolyricsPolling(): void {
  if (holyricsPollingInterval) {
    clearInterval(holyricsPollingInterval);
    holyricsPollingInterval = null;
    console.log('[Holyrics] Polling parado');
  }
}

// Inicia o polling automaticamente
startHolyricsPolling();

// ── Helpers ──

function broadcast(msg: any) {
  const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
  wss.clients.forEach((client: WsClient) => {
    if (client.readyState === WebSocket.OPEN && client.authenticated) {
      client.send(data);
    }
  });
}

function broadcastExcept(sender: WsClient, msg: any) {
  const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
  wss.clients.forEach((client: WsClient) => {
    if (client !== sender && client.readyState === WebSocket.OPEN && client.authenticated) {
      client.send(data);
    }
  });
}

function getLocalIP(): string {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      const iface = nets[name];
      if (!iface) continue;
      for (const net of iface) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch { }
  return 'localhost';
}
