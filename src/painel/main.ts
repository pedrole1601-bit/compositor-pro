// ============================================================
// Compositor Pro v2 — Painel de Controle (main.ts)
// Part 2: Camera Selection, Scene Transitions
// ============================================================

import type {
    Frame,
    Scene,
    Resolution,
    TransitionConfig,
    TransitionType,
    WebSocketMessage,
} from '../shared/types.js';

// ---------- Utilities ----------

const uid = (): string => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);

const ICON_MAP: Record<string, string> = {
    holyrics: 'monitor', video: 'play-circle', imagem: 'image', camera: 'camera',
    cor: 'palette', relogio: 'clock', contador: 'timer', texto: 'type', url: 'globe',
};

const RES_PRESETS: { label: string; w: number; h: number }[] = [
    { label: '1920×1080', w: 1920, h: 1080 },
    { label: '1280×720', w: 1280, h: 720 },
    { label: '1080×1920', w: 1080, h: 1920 },
    { label: '1080×1080', w: 1080, h: 1080 },
    { label: '3840×2160', w: 3840, h: 2160 },
    { label: '2560×1440', w: 2560, h: 1440 },
    { label: '1920×1200', w: 1920, h: 1200 },
    { label: '1024×768', w: 1024, h: 768 },
];

const TRANSITIONS: { id: TransitionType; label: string }[] = [
    { id: 'fade', label: 'Fade' },
    { id: 'slide-left', label: 'Slide ←' },
    { id: 'slide-right', label: 'Slide →' },
    { id: 'slide-up', label: 'Slide ↑' },
    { id: 'slide-down', label: 'Slide ↓' },
    { id: 'zoom', label: 'Zoom' },
    { id: 'blur', label: 'Blur' },
    { id: 'wipe', label: 'Wipe' },
    { id: 'none', label: 'Nenhuma' },
];

function clearChildren(el: HTMLElement): void {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function lucideIcon(name: string, size = 16): HTMLElement {
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    i.style.width = size + 'px';
    i.style.height = size + 'px';
    return i;
}

function refreshIcons(): void {
    (window as any).lucide?.createIcons();
}

// ---------- Engine ----------

class PainelEngine {
    private state = {
        cenas: [] as Scene[],
        cenaAtivaId: '',
        resolucao: { width: 1920, height: 1080 } as Resolution,
        transicao: { tipo: 'fade', duracao: 500 } as TransitionConfig,
    };

    private selectedFrameId: string | null = null;
    private pin = '1234';

    private ws: WebSocket | null = null;
    private wsReconnectDelay = 1000;
    private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private wsManualClose = false;

    private canvasScale = 1;
    private frameElements = new Map<string, HTMLElement>();
    private clockIntervals = new Map<string, ReturnType<typeof setInterval>>();

    // Camera
    private cameraDevices: MediaDeviceInfo[] = [];
    private cameraStreams = new Map<string, MediaStream>(); // frameId → stream (for panel preview)

    // Layer drag state
    private layerDragSourceId: string | null = null;

    // DOM refs
    private readonly canvasEl: HTMLElement;
    private readonly propPanel: HTMLElement;
    private readonly sceneTabs: HTMLElement;
    private readonly layersList: HTMLElement;
    private readonly mediaList: HTMLElement;
    private readonly statusDot: HTMLElement;
    private readonly statusText: HTMLElement;
    private readonly toastContainer: HTMLElement;

    constructor() {
        this.canvasEl = document.getElementById('preview-canvas')!;
        this.propPanel = document.getElementById('properties-panel')!;
        this.sceneTabs = document.getElementById('scene-tabs')!;
        this.layersList = document.getElementById('layers-list')!;
        this.mediaList = document.getElementById('media-list')!;
        this.statusDot = document.getElementById('status-dot')!;
        this.statusText = document.getElementById('status-text')!;
        this.toastContainer = document.getElementById('toast-container')!;

        this.readPin();
        this.bindUI();
        this.bindKeyboard();
        this.bindResolutionModal();
        this.buildTransitionBar();
        this.enumerateCameras();
        this.connectWS();
        this.computeScale();
        window.addEventListener('resize', () => { this.computeScale(); this.renderCanvas(); });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !this.ws) this.connectWS();
        });
    }

    // ===== CAMERA ENUMERATION =====
    private async enumerateCameras(): Promise<void> {
        try {
            // Need to request permission first to get labels
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
            tempStream.getTracks().forEach(t => t.stop());

            const devices = await navigator.mediaDevices.enumerateDevices();
            this.cameraDevices = devices.filter(d => d.kind === 'videoinput');
            console.log(`[Painel] ${this.cameraDevices.length} câmera(s) encontrada(s)`);
        } catch (err) {
            console.warn('[Painel] Não foi possível enumerar câmeras:', err);
            this.cameraDevices = [];
        }
    }

    private async startCameraPreview(frameId: string, deviceId?: string): Promise<MediaStream | null> {
        // Stop existing stream for this frame
        this.stopCameraPreview(frameId);

        try {
            const constraints: MediaStreamConstraints = {
                video: deviceId && deviceId !== 'auto'
                    ? { deviceId: { exact: deviceId } }
                    : true,
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.cameraStreams.set(frameId, stream);
            return stream;
        } catch (err) {
            console.warn('[Painel] Erro ao iniciar preview câmera:', err);
            return null;
        }
    }

    private stopCameraPreview(frameId: string): void {
        const existing = this.cameraStreams.get(frameId);
        if (existing) {
            existing.getTracks().forEach(t => t.stop());
            this.cameraStreams.delete(frameId);
        }
    }

    // ===== TRANSITION BAR =====
    private buildTransitionBar(): void {
        const selector = document.getElementById('transition-selector')!;
        const durationInput = document.getElementById('trans-duration') as HTMLInputElement;
        if (!selector || !durationInput) return;

        clearChildren(selector);

        for (const t of TRANSITIONS) {
            const btn = document.createElement('button');
            btn.className = `trans-btn${t.id === this.state.transicao.tipo ? ' active' : ''}`;
            btn.setAttribute('data-trans', t.id);

            const icon = document.createElement('div');
            icon.className = 'trans-icon';
            btn.appendChild(icon);

            const label = document.createTextNode(t.label);
            btn.appendChild(label);

            btn.addEventListener('click', () => {
                this.state.transicao.tipo = t.id;
                for (const b of selector.querySelectorAll('.trans-btn')) b.classList.remove('active');
                btn.classList.add('active');
                this.sendTransitionConfig();
            });

            selector.appendChild(btn);
        }

        durationInput.value = String(this.state.transicao.duracao);
        durationInput.addEventListener('change', () => {
            const v = Math.max(100, Math.min(3000, parseInt(durationInput.value) || 500));
            durationInput.value = String(v);
            this.state.transicao.duracao = v;
            this.sendTransitionConfig();
        });
    }

    private updateTransitionBar(): void {
        const selector = document.getElementById('transition-selector');
        const durationInput = document.getElementById('trans-duration') as HTMLInputElement;
        if (!selector || !durationInput) return;

        for (const btn of selector.querySelectorAll('.trans-btn')) {
            const id = btn.getAttribute('data-trans');
            btn.classList.toggle('active', id === this.state.transicao.tipo);
        }
        durationInput.value = String(this.state.transicao.duracao);
    }

    private sendTransitionConfig(): void {
        this.send({ tipo: 'transicao', payload: { transicao: this.state.transicao } });
    }

    // ===== SCALE =====
    private computeScale(): void {
        const rect = this.canvasEl.getBoundingClientRect();
        this.canvasScale = rect.width / this.state.resolucao.width;
    }
    private toScreen(px: number): number { return px * this.canvasScale; }
    private toLogical(screenPx: number): number { return screenPx / this.canvasScale; }

    // ===== RESOLUTION MODAL =====
    private bindResolutionModal(): void {
        const overlay = document.getElementById('res-modal-overlay')!;
        const presetsEl = document.getElementById('res-presets')!;
        const wInput = document.getElementById('res-width') as HTMLInputElement;
        const hInput = document.getElementById('res-height') as HTMLInputElement;
        const previewShape = document.getElementById('res-preview-shape')!;
        const previewRatio = document.getElementById('res-preview-ratio')!;

        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);

        const updatePreview = (w: number, h: number) => {
            const maxDim = 80;
            const scale = Math.min(maxDim / w, maxDim / h);
            previewShape.style.width = Math.round(w * scale) + 'px';
            previewShape.style.height = Math.round(h * scale) + 'px';
            const g = gcd(w, h);
            previewRatio.textContent = `${w / g}:${h / g}`;
        };

        for (const p of RES_PRESETS) {
            const btn = document.createElement('button');
            btn.className = 'res-preset-btn';
            const shape = document.createElement('div');
            shape.className = 'res-preset-shape';
            const miniMax = 16;
            const miniScale = Math.min(miniMax / p.w, miniMax / p.h);
            shape.style.width = Math.max(4, Math.round(p.w * miniScale)) + 'px';
            shape.style.height = Math.max(4, Math.round(p.h * miniScale)) + 'px';
            btn.appendChild(shape);
            btn.appendChild(document.createTextNode(p.label));
            btn.addEventListener('click', () => {
                wInput.value = String(p.w);
                hInput.value = String(p.h);
                for (const b of presetsEl.querySelectorAll('.res-preset-btn')) b.classList.remove('active');
                btn.classList.add('active');
                updatePreview(p.w, p.h);
            });
            presetsEl.appendChild(btn);
        }

        const onInputChange = () => {
            const w = parseInt(wInput.value) || 1920;
            const h = parseInt(hInput.value) || 1080;
            updatePreview(w, h);
            for (const b of presetsEl.querySelectorAll('.res-preset-btn')) b.classList.remove('active');
            for (const b of presetsEl.querySelectorAll('.res-preset-btn')) {
                if (b.textContent?.includes(`${w}×${h}`)) b.classList.add('active');
            }
        };
        wInput.addEventListener('input', onInputChange);
        hInput.addEventListener('input', onInputChange);

        document.getElementById('header-res')!.addEventListener('click', () => {
            wInput.value = String(this.state.resolucao.width);
            hInput.value = String(this.state.resolucao.height);
            updatePreview(this.state.resolucao.width, this.state.resolucao.height);
            for (const b of presetsEl.querySelectorAll('.res-preset-btn')) {
                b.classList.remove('active');
                if (b.textContent?.includes(`${this.state.resolucao.width}×${this.state.resolucao.height}`)) {
                    b.classList.add('active');
                }
            }
            overlay.classList.add('open');
        });

        document.getElementById('res-cancel')!.addEventListener('click', () => overlay.classList.remove('open'));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });

        document.getElementById('res-apply')!.addEventListener('click', () => {
            const w = Math.max(320, Math.min(7680, parseInt(wInput.value) || 1920));
            const h = Math.max(240, Math.min(4320, parseInt(hInput.value) || 1080));
            this.state.resolucao = { width: w, height: h };
            this.canvasEl.style.aspectRatio = `${w}/${h}`;
            this.computeScale();
            this.renderCanvas();
            this.renderStatusBar();
            this.send({ tipo: 'resolucao', payload: { resolucao: this.state.resolucao } });
            overlay.classList.remove('open');
            this.toast('Resolução', `${w}×${h}`, 'success');
        });
    }

    // ===== PIN =====
    private readPin(): void {
        const inp = document.getElementById('pin-input') as HTMLInputElement;
        this.pin = inp.value || '1234';
        inp.addEventListener('change', () => { this.pin = inp.value; this.connectWS(); });
    }

    // ===== WEBSOCKET =====
    private connectWS(): void {
        if (this.ws) { this.wsManualClose = true; this.ws.close(); }
        this.wsManualClose = false;
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${proto}//${location.hostname}:3001`);

        this.ws.addEventListener('open', () => {
            this.wsReconnectDelay = 1000;
            this.send({ tipo: 'auth', payload: { pin: this.pin } });
            this.setStatus(true);
        });

        this.ws.addEventListener('message', (ev) => {
            try { this.onMessage(JSON.parse(ev.data) as WebSocketMessage); } catch { }
        });

        this.ws.addEventListener('close', () => {
            this.setStatus(false);
            this.ws = null;
            if (!this.wsManualClose && document.visibilityState !== 'hidden') {
                if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
                this.wsReconnectTimer = setTimeout(() => this.connectWS(), this.wsReconnectDelay);
                this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 2, 30000);
            }
        });

        this.ws.addEventListener('error', () => { });
    }

    private send(msg: Record<string, unknown>): void {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    }

    private setStatus(connected: boolean): void {
        this.statusDot.className = connected ? 'led-dot on' : 'led-dot off';
        this.statusText.textContent = connected ? 'ONLINE' : 'OFFLINE';
        const footer = document.getElementById('footer-status')!;
        footer.textContent = connected ? '● ONLINE' : '● OFFLINE';
        footer.className = connected ? 'status-connected-text' : 'status-disconnected-text';
    }

    private onMessage(msg: WebSocketMessage): void {
        switch (msg.tipo) {
            case 'auth':
                if (!msg.payload?.sucesso) this.toast('Erro', 'PIN inválido', 'error');
                break;
            case 'init':
                this.state.cenas = msg.payload.cenas ?? [];
                this.state.cenaAtivaId = msg.payload.cenaAtivaId ?? this.state.cenas[0]?.id ?? '';
                if (msg.payload.resolucao) {
                    this.state.resolucao = msg.payload.resolucao;
                    this.canvasEl.style.aspectRatio = `${this.state.resolucao.width}/${this.state.resolucao.height}`;
                }
                if (msg.payload.transicao) {
                    this.state.transicao = msg.payload.transicao;
                    this.updateTransitionBar();
                }
                this.clearCanvasElements();
                this.computeScale();
                this.renderAll();
                break;
            case 'cena': {
                const idx = this.state.cenas.findIndex(c => c.id === msg.payload.id);
                if (idx !== -1) this.state.cenas[idx] = msg.payload;
                else this.state.cenas.push(msg.payload);
                if (msg.payload.id) this.state.cenaAtivaId = msg.payload.id;
                this.clearCanvasElements();
                this.renderAll();
                break;
            }
            case 'frame': {
                const scene = this.activeScene();
                if (!scene) return;
                const f = scene.frames.find(fr => fr.id === msg.payload.frameId);
                if (f && msg.payload.dados) Object.assign(f, msg.payload.dados);
                this.renderCanvas();
                this.renderLayersList();
                if (this.selectedFrameId === msg.payload.frameId) this.renderProperties();
                break;
            }
            case 'frame_delete': {
                const scene = this.activeScene();
                if (!scene) return;
                const delId = msg.payload.frameId;
                scene.frames = scene.frames.filter(f => f.id !== delId);
                this.stopCameraPreview(delId);
                this.removeFrameElement(delId);
                if (this.selectedFrameId === delId) this.selectedFrameId = null;
                this.renderCanvas();
                this.renderLayersList();
                this.renderProperties();
                break;
            }
            case 'transicao': {
                if (msg.payload?.transicao) {
                    this.state.transicao = msg.payload.transicao;
                    this.updateTransitionBar();
                }
                break;
            }
            case 'ping':
                this.send({ tipo: 'pong', payload: {} });
                break;
            case 'layout':
                if (msg.payload?.cena) {
                    const idx = this.state.cenas.findIndex(c => c.id === msg.payload.cena.id);
                    if (idx !== -1) this.state.cenas[idx] = msg.payload.cena;
                    this.renderAll();
                }
                break;
        }
    }

    private clearCanvasElements(): void {
        for (const [id, elem] of this.frameElements) {
            this.stopCameraPreview(id);
            elem.remove();
        }
        this.frameElements.clear();
        for (const [, interval] of this.clockIntervals) clearInterval(interval);
        this.clockIntervals.clear();
    }

    private removeFrameElement(id: string): void {
        this.stopCameraPreview(id);
        const el = this.frameElements.get(id);
        if (el) { el.remove(); this.frameElements.delete(id); }
        if (this.clockIntervals.has(id)) {
            clearInterval(this.clockIntervals.get(id)!);
            this.clockIntervals.delete(id);
        }
    }

    // ===== BINDING =====
    private bindUI(): void {
        document.getElementById('sources-grid')!.addEventListener('click', (e) => {
            const card = (e.target as HTMLElement).closest('.source-card') as HTMLElement | null;
            if (card?.dataset.tipo) this.addFrame(card.dataset.tipo);
        });

        const dz = document.getElementById('drop-zone')!;
        const fi = document.getElementById('file-input') as HTMLInputElement;
        dz.addEventListener('click', () => fi.click());
        dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('active'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('active'));
        dz.addEventListener('drop', (e) => {
            e.preventDefault(); dz.classList.remove('active');
            if (e.dataTransfer?.files) Array.from(e.dataTransfer.files).forEach(f => this.uploadFile(f));
        });
        fi.addEventListener('change', () => {
            if (fi.files) Array.from(fi.files).forEach(f => this.uploadFile(f));
            fi.value = '';
        });

        document.getElementById('btn-duplicate')!.addEventListener('click', () => this.duplicateSelected());
        document.getElementById('btn-delete')!.addEventListener('click', () => this.deleteSelected());
        document.getElementById('btn-save')!.addEventListener('click', () => this.saveProject());
        document.getElementById('btn-load')!.addEventListener('click', () => this.loadProject());
        document.getElementById('btn-add-scene')!.addEventListener('click', () => this.addScene());
        document.getElementById('main-open-telao')!.addEventListener('click', () => window.open('/', '_blank'));
        document.getElementById('btn-open-external')!.addEventListener('click', () => window.open('/', '_blank'));

        this.canvasEl.addEventListener('mousedown', (e) => {
            if (e.target === this.canvasEl) {
                this.selectedFrameId = null;
                this.renderCanvas(); this.renderLayersList(); this.renderProperties();
            }
        });
    }

    private bindKeyboard(): void {
        document.addEventListener('keydown', (e) => {
            const tag = (document.activeElement?.tagName ?? '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelected(); }
            if (e.key === 'd' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.duplicateSelected(); }
            if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.saveProject(); }
            if (e.key === 'Escape') {
                this.selectedFrameId = null;
                this.renderCanvas(); this.renderLayersList(); this.renderProperties();
            }
            if (e.key === 'l' || e.key === 'L') {
                const frame = this.selectedFrame();
                if (frame) {
                    frame.bloqueado = !frame.bloqueado;
                    this.pushFrame(frame);
                    this.renderCanvas(); this.renderLayersList(); this.renderProperties();
                    this.toast(frame.bloqueado ? 'Bloqueado' : 'Desbloqueado', frame.nome, 'info');
                }
            }

            const frame = this.selectedFrame();
            if (frame && !frame.bloqueado && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                if (e.key === 'ArrowLeft') frame.posicao.x -= step;
                if (e.key === 'ArrowRight') frame.posicao.x += step;
                if (e.key === 'ArrowUp') frame.posicao.y -= step;
                if (e.key === 'ArrowDown') frame.posicao.y += step;
                this.renderCanvas(); this.renderProperties(); this.pushFrame(frame);
            }
        });
    }

    // ===== HELPERS =====
    private activeScene(): Scene | undefined {
        return this.state.cenas.find(c => c.id === this.state.cenaAtivaId);
    }
    private selectedFrame(): Frame | undefined {
        return this.activeScene()?.frames.find(f => f.id === this.selectedFrameId);
    }
    private sortedFrames(scene: Scene): Frame[] {
        return [...scene.frames].sort((a, b) => b.camada - a.camada);
    }

    // ===== RENDER ALL =====
    private renderAll(): void {
        this.renderSceneTabs();
        this.renderCanvas();
        this.renderLayersList();
        this.renderProperties();
        this.renderMediaLibrary();
        this.renderStatusBar();
    }

    // ===== SCENE TABS =====
    private renderSceneTabs(): void {
        clearChildren(this.sceneTabs);
        for (const scene of this.state.cenas) {
            const btn = document.createElement('button');
            btn.className = `scene-tab${scene.id === this.state.cenaAtivaId ? ' active' : ''}`;
            btn.textContent = scene.nome;
            btn.addEventListener('click', () => this.activateScene(scene.id));
            btn.addEventListener('dblclick', () => this.renameScene(scene.id));
            this.sceneTabs.appendChild(btn);
        }
    }

    // ===== CANVAS =====
    private renderCanvas(): void {
        const scene = this.activeScene();
        const currentIds = new Set<string>();

        for (const [fid, interval] of this.clockIntervals) {
            if (!scene?.frames.some(f => f.id === fid)) {
                clearInterval(interval); this.clockIntervals.delete(fid);
            }
        }

        if (scene) {
            for (const frame of scene.frames) {
                currentIds.add(frame.id);
                let wrapper = this.frameElements.get(frame.id);

                if (!wrapper) {
                    wrapper = document.createElement('div');
                    wrapper.className = 'frame-preview';
                    wrapper.setAttribute('data-frame-id', frame.id);

                    for (const pos of ['nw', 'ne', 'sw', 'se']) {
                        const h = document.createElement('div');
                        h.className = `resize-handle handle-${pos}`;
                        h.setAttribute('data-handle', pos);
                        wrapper.appendChild(h);
                    }

                    const label = document.createElement('div');
                    label.className = 'frame-label';
                    wrapper.appendChild(label);

                    const inner = document.createElement('div');
                    inner.className = 'frame-inner';
                    wrapper.appendChild(inner);

                    wrapper.addEventListener('mousedown', (e) => {
                        if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
                        this.selectFrame(frame.id);
                        if (!frame.bloqueado) this.startDrag(e, frame);
                    });

                    for (const h of wrapper.querySelectorAll<HTMLElement>('.resize-handle')) {
                        h.addEventListener('mousedown', (e) => {
                            e.stopPropagation();
                            this.selectFrame(frame.id);
                            if (!frame.bloqueado) this.startResize(e, frame, h.dataset.handle!);
                        });
                    }

                    this.canvasEl.appendChild(wrapper);
                    this.frameElements.set(frame.id, wrapper);
                }

                // Position & size
                wrapper.style.left = this.toScreen(frame.posicao.x) + 'px';
                wrapper.style.top = this.toScreen(frame.posicao.y) + 'px';
                wrapper.style.width = this.toScreen(frame.posicao.largura) + 'px';
                wrapper.style.height = this.toScreen(frame.posicao.altura) + 'px';
                wrapper.style.zIndex = String(frame.camada);
                wrapper.style.display = frame.visivel ? 'block' : 'none';
                wrapper.style.opacity = String(frame.config?.opacity ?? 1);
                wrapper.style.borderRadius = (frame.config?.borderRadius ?? 0) + 'px';

                // Border
                const bw = (frame.config as any)?.borderWidth ?? 0;
                const bc = (frame.config as any)?.borderColor ?? 'transparent';
                if (bw > 0) {
                    wrapper.style.border = `${bw}px solid ${bc}`;
                } else {
                    wrapper.style.border = frame.id === this.selectedFrameId
                        ? `1px solid var(--accent)` : '1px solid transparent';
                }
                wrapper.style.overflow = 'hidden';

                // Lock state
                if (frame.bloqueado) {
                    wrapper.classList.add('locked');
                } else {
                    wrapper.classList.remove('locked');
                }

                // Selected
                if (frame.id === this.selectedFrameId) {
                    wrapper.classList.add('selected');
                } else {
                    wrapper.classList.remove('selected');
                }

                // Label
                const labelEl = wrapper.querySelector('.frame-label') as HTMLElement;
                if (labelEl) {
                    clearChildren(labelEl);
                    if (frame.bloqueado) {
                        const lockIcon = lucideIcon('lock', 8);
                        lockIcon.classList.add('frame-lock-icon');
                        labelEl.appendChild(lockIcon);
                    }
                    labelEl.appendChild(document.createTextNode(frame.nome || frame.tipo));
                }

                // Content
                const innerEl = wrapper.querySelector('.frame-inner') as HTMLElement;
                if (innerEl) this.renderFrameContent(innerEl, frame);
            }
        }

        // Remove stale
        for (const [fid, elem] of this.frameElements) {
            if (!currentIds.has(fid)) {
                this.stopCameraPreview(fid);
                elem.remove(); this.frameElements.delete(fid);
                if (this.clockIntervals.has(fid)) {
                    clearInterval(this.clockIntervals.get(fid)!); this.clockIntervals.delete(fid);
                }
            }
        }
        refreshIcons();
    }

    private renderFrameContent(container: HTMLElement, frame: Frame): void {
        const cfg = (frame.config || {}) as any;

        switch (frame.tipo) {
            case 'cor':
                container.style.backgroundColor = frame.fonte || '#22c55e';
                clearChildren(container);
                break;
            case 'imagem': {
                container.style.backgroundColor = '';
                let img = container.querySelector('img');
                if (frame.fonte) {
                    if (!img) { img = document.createElement('img'); container.appendChild(img); }
                    if (img.src !== frame.fonte) img.src = frame.fonte;
                    img.style.cssText = `width:100%;height:100%;object-fit:${cfg.ajuste || 'cover'};display:block;`;
                    img.draggable = false;
                    const ind = container.querySelector('.frame-type-indicator');
                    if (ind) ind.remove();
                } else { this.setPlaceholder(container, 'image', 'Imagem'); }
                break;
            }
            case 'video': {
                container.style.backgroundColor = '';
                let vid = container.querySelector('video');
                if (frame.fonte) {
                    if (!vid) {
                        vid = document.createElement('video');
                        vid.muted = true; vid.autoplay = false;
                        vid.style.cssText = `width:100%;height:100%;object-fit:${cfg.ajuste || 'cover'};display:block;`;
                        container.appendChild(vid);
                    }
                    if (vid.src !== frame.fonte) vid.src = frame.fonte;
                    vid.loop = !!cfg.loop; vid.muted = cfg.mudo !== false;
                    const ind = container.querySelector('.frame-type-indicator');
                    if (ind) ind.remove();
                } else { this.setPlaceholder(container, 'play-circle', 'Vídeo'); }
                break;
            }
            case 'texto': {
                container.style.backgroundColor = cfg.corFundo || 'transparent';
                clearChildren(container);
                const txt = document.createElement('div');
                const scaledFont = Math.round((cfg.fontSize || 24) * this.canvasScale);
                const scaledPad = Math.round(8 * this.canvasScale);
                txt.style.cssText = `
                    width:100%;height:100%;display:flex;align-items:center;
                    justify-content:${cfg.alinhamento || 'center'};padding:${scaledPad}px;
                    font-size:${scaledFont}px;color:${cfg.corTexto || '#ffffff'};
                    font-weight:${cfg.negrito ? '700' : '400'};
                    font-style:${cfg.italico ? 'italic' : 'normal'};
                    word-break:break-word;overflow:hidden;
                `;
                txt.textContent = cfg.conteudo || 'Texto';
                container.appendChild(txt);
                break;
            }
            case 'relogio': {
                container.style.backgroundColor = 'transparent';
                let clockEl = container.querySelector('.clock-display') as HTMLElement;
                if (!clockEl) {
                    clearChildren(container);
                    clockEl = document.createElement('div');
                    clockEl.className = 'clock-display';
                    container.appendChild(clockEl);
                }
                const cf = Math.round((cfg.fontSize || 48) * this.canvasScale);
                clockEl.style.cssText = `
                    width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                    font-family:var(--font-mono);font-size:${cf}px;color:${cfg.corTexto || '#ffffff'};
                    font-weight:700;font-variant-numeric:tabular-nums;
                `;
                const updateClock = () => {
                    const now = new Date();
                    const h24 = cfg.formato24h !== false;
                    let h = now.getHours();
                    const m = String(now.getMinutes()).padStart(2, '0');
                    const s = String(now.getSeconds()).padStart(2, '0');
                    if (!h24) h = h % 12 || 12;
                    clockEl.textContent = `${String(h).padStart(2, '0')}:${m}:${s}`;
                };
                updateClock();
                if (!this.clockIntervals.has(frame.id)) {
                    this.clockIntervals.set(frame.id, setInterval(updateClock, 1000));
                }
                break;
            }
            case 'contador': {
                container.style.backgroundColor = 'transparent';
                clearChildren(container);
                const cnt = document.createElement('div');
                const cf2 = Math.round((cfg.fontSize || 48) * this.canvasScale);
                cnt.style.cssText = `
                    width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                    font-family:var(--font-mono);font-size:${cf2}px;color:${cfg.corTexto || '#ffffff'};
                    font-weight:700;font-variant-numeric:tabular-nums;
                `;
                if (cfg.horaAlvo) {
                    const diff = Math.max(0, new Date(cfg.horaAlvo).getTime() - Date.now());
                    const h = Math.floor(diff / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    const s = Math.floor((diff % 60000) / 1000);
                    cnt.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                } else {
                    cnt.textContent = '--:--:--';
                }
                container.appendChild(cnt);
                if (!this.clockIntervals.has(frame.id)) {
                    this.clockIntervals.set(frame.id, setInterval(() => this.renderCanvas(), 1000));
                }
                break;
            }
            case 'holyrics':
                container.style.backgroundColor = '';
                this.setPlaceholder(container, 'monitor', frame.fonte ? 'Holyrics' : 'Config. URL');
                break;
            case 'camera': {
                container.style.backgroundColor = '#111';
                // Show live camera preview in panel
                let vid = container.querySelector('video.camera-preview-video') as HTMLVideoElement;
                if (!vid) {
                    clearChildren(container);
                    vid = document.createElement('video');
                    vid.className = 'camera-preview-video';
                    vid.autoplay = true;
                    vid.playsInline = true;
                    vid.muted = true;
                    vid.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                    container.appendChild(vid);

                    // Start preview
                    const deviceId = cfg.deviceId || frame.fonte || 'auto';
                    this.startCameraPreview(frame.id, deviceId).then(stream => {
                        if (stream && vid) vid.srcObject = stream;
                    });
                }

                // Check if device changed
                const currentDeviceId = cfg.deviceId || frame.fonte || 'auto';
                const existingStream = this.cameraStreams.get(frame.id);
                if (existingStream) {
                    const trackSettings = existingStream.getVideoTracks()[0]?.getSettings();
                    if (trackSettings?.deviceId !== currentDeviceId && currentDeviceId !== 'auto') {
                        this.startCameraPreview(frame.id, currentDeviceId).then(stream => {
                            if (stream && vid) vid.srcObject = stream;
                        });
                    }
                }
                break;
            }
            case 'url':
                container.style.backgroundColor = '';
                this.setPlaceholder(container, 'globe', frame.fonte ? 'URL' : 'Config. URL');
                break;
            default:
                this.setPlaceholder(container, 'box', frame.tipo);
        }
    }

    private setPlaceholder(container: HTMLElement, icon: string, label: string): void {
        let ind = container.querySelector('.frame-type-indicator') as HTMLElement;
        if (!ind) {
            const hasMedia = container.querySelector('img, video');
            if (!hasMedia) clearChildren(container);
            ind = document.createElement('div');
            ind.className = 'frame-type-indicator';
            ind.appendChild(lucideIcon(icon, 24));
            const sp = document.createElement('span');
            sp.textContent = label;
            ind.appendChild(sp);
            container.appendChild(ind);
            refreshIcons();
        } else {
            const sp = ind.querySelector('span');
            if (sp && sp.textContent !== label) sp.textContent = label;
        }
    }

    // ===== LAYERS LIST (draggable) =====
    private renderLayersList(): void {
        clearChildren(this.layersList);
        const scene = this.activeScene();
        if (!scene || scene.frames.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:10px;font-size:11px;color:var(--text-muted);text-align:center;font-family:var(--font-mono);';
            empty.textContent = 'Nenhum frame';
            this.layersList.appendChild(empty);
            return;
        }

        const sorted = this.sortedFrames(scene);

        for (const frame of sorted) {
            const item = document.createElement('div');
            item.className = `layer-item${frame.id === this.selectedFrameId ? ' selected' : ''}`;
            item.setAttribute('data-frame-id', frame.id);

            const handle = document.createElement('div');
            handle.className = 'layer-drag-handle';
            handle.appendChild(lucideIcon('grip-vertical', 12));
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.startLayerDrag(e, frame.id, item);
            });
            item.appendChild(handle);

            const icon = lucideIcon(ICON_MAP[frame.tipo] || 'box', 14);
            icon.classList.add('layer-icon');
            item.appendChild(icon);

            const name = document.createElement('span');
            name.className = 'layer-name';
            name.textContent = frame.nome || frame.tipo;
            item.appendChild(name);

            const actions = document.createElement('div');
            actions.className = 'layer-actions';

            const lockBtn = document.createElement('button');
            lockBtn.className = `layer-btn${frame.bloqueado ? ' active-icon' : ''}`;
            lockBtn.appendChild(lucideIcon(frame.bloqueado ? 'lock' : 'unlock', 12));
            lockBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                frame.bloqueado = !frame.bloqueado;
                this.pushFrame(frame);
                this.renderCanvas(); this.renderLayersList();
                if (this.selectedFrameId === frame.id) this.renderProperties();
            });
            actions.appendChild(lockBtn);

            const visBtn = document.createElement('button');
            visBtn.className = 'layer-btn';
            visBtn.appendChild(lucideIcon(frame.visivel ? 'eye' : 'eye-off', 12));
            visBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                frame.visivel = !frame.visivel;
                this.pushFrame(frame);
                this.renderCanvas(); this.renderLayersList();
                if (this.selectedFrameId === frame.id) this.renderProperties();
            });
            actions.appendChild(visBtn);

            item.appendChild(actions);
            item.addEventListener('click', () => this.selectFrame(frame.id));
            this.layersList.appendChild(item);
        }
        refreshIcons();
    }

    // ===== LAYER DRAG REORDER =====
    private startLayerDrag(e: MouseEvent, frameId: string, itemEl: HTMLElement): void {
        e.preventDefault();
        this.layerDragSourceId = frameId;
        itemEl.classList.add('dragging');

        let currentOverId: string | null = null;
        let insertBefore = true;

        const onMove = (me: MouseEvent) => {
            const els = this.layersList.querySelectorAll<HTMLElement>('.layer-item');
            let found = false;
            for (const el of els) {
                const rect = el.getBoundingClientRect();
                if (me.clientY >= rect.top && me.clientY <= rect.bottom) {
                    const mid = rect.top + rect.height / 2;
                    const overId = el.getAttribute('data-frame-id');
                    if (overId && overId !== frameId) {
                        for (const e2 of els) { e2.classList.remove('drag-over-top', 'drag-over-bottom'); }
                        if (me.clientY < mid) {
                            el.classList.add('drag-over-top');
                            insertBefore = true;
                        } else {
                            el.classList.add('drag-over-bottom');
                            insertBefore = false;
                        }
                        currentOverId = overId;
                        found = true;
                    }
                    break;
                }
            }
            if (!found) {
                for (const e2 of els) { e2.classList.remove('drag-over-top', 'drag-over-bottom'); }
                currentOverId = null;
            }
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            itemEl.classList.remove('dragging');
            for (const el of this.layersList.querySelectorAll<HTMLElement>('.layer-item')) {
                el.classList.remove('drag-over-top', 'drag-over-bottom');
            }
            if (currentOverId && currentOverId !== frameId) {
                this.reorderLayer(frameId, currentOverId, insertBefore);
            }
            this.layerDragSourceId = null;
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    private reorderLayer(movedId: string, targetId: string, above: boolean): void {
        const scene = this.activeScene();
        if (!scene) return;
        const sorted = this.sortedFrames(scene);
        const ids = sorted.map(f => f.id);
        const movedIdx = ids.indexOf(movedId);
        if (movedIdx === -1) return;
        ids.splice(movedIdx, 1);
        let targetIdx = ids.indexOf(targetId);
        if (targetIdx === -1) return;
        if (above) { ids.splice(targetIdx, 0, movedId); }
        else { ids.splice(targetIdx + 1, 0, movedId); }
        const total = ids.length;
        for (let i = 0; i < total; i++) {
            const frame = scene.frames.find(f => f.id === ids[i]);
            if (frame) frame.camada = total - i;
        }
        this.send({ tipo: 'cena', payload: scene });
        this.renderCanvas();
        this.renderLayersList();
        this.renderProperties();
    }

    // ===== PROPERTIES =====
    private renderProperties(): void {
        clearChildren(this.propPanel);
        const frame = this.selectedFrame();

        if (!frame) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.appendChild(lucideIcon('mouse-pointer-2', 28));
            const p = document.createElement('p');
            p.textContent = 'Selecione um frame para editar propriedades';
            empty.appendChild(p);
            this.propPanel.appendChild(empty);
            refreshIcons();
            return;
        }

        // --- Frame info ---
        const infoSection = this.createPropSection('Frame');
        infoSection.appendChild(this.createTextInput('Nome', frame.nome || '', (v) => {
            frame.nome = v; this.renderCanvas(); this.renderLayersList(); this.pushFrame(frame);
        }));

        const badgeRow = document.createElement('div');
        badgeRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
        const badge = document.createElement('span');
        badge.className = `badge-type type-${frame.tipo}`;
        badge.textContent = frame.tipo.toUpperCase();
        badgeRow.appendChild(badge);
        const idSpan = document.createElement('span');
        idSpan.style.cssText = 'font-size:10px;color:var(--text-disabled);font-family:var(--font-mono);cursor:pointer;';
        idSpan.textContent = frame.id.slice(0, 8);
        idSpan.title = 'Copiar ID';
        idSpan.addEventListener('click', () => { navigator.clipboard?.writeText(frame.id); this.toast('Copiado', 'ID copiado', 'info'); });
        badgeRow.appendChild(idSpan);
        infoSection.appendChild(badgeRow);

        infoSection.appendChild(this.createToggle(
            'Bloqueado', frame.bloqueado ?? false,
            (v) => { frame.bloqueado = v; this.pushFrame(frame); this.renderCanvas(); this.renderLayersList(); },
            'lock'
        ));
        this.propPanel.appendChild(infoSection);

        // --- Position ---
        const posSection = this.createPropSection('Posição');
        const grid = document.createElement('div');
        grid.className = 'input-grid';
        grid.appendChild(this.createNumberInput('X', frame.posicao.x, 'px', (v) => { frame.posicao.x = v; this.renderCanvas(); this.pushFrame(frame); }));
        grid.appendChild(this.createNumberInput('Y', frame.posicao.y, 'px', (v) => { frame.posicao.y = v; this.renderCanvas(); this.pushFrame(frame); }));
        grid.appendChild(this.createNumberInput('W', frame.posicao.largura, 'px', (v) => { frame.posicao.largura = v; this.renderCanvas(); this.pushFrame(frame); }));
        grid.appendChild(this.createNumberInput('H', frame.posicao.altura, 'px', (v) => { frame.posicao.altura = v; this.renderCanvas(); this.pushFrame(frame); }));
        posSection.appendChild(grid);
        this.propPanel.appendChild(posSection);

        // --- Visibility ---
        const visSection = this.createPropSection('Visibilidade');
        visSection.appendChild(this.createToggle('Visível', frame.visivel, (v) => {
            frame.visivel = v; this.renderCanvas(); this.renderLayersList(); this.pushFrame(frame);
        }));
        this.propPanel.appendChild(visSection);

        // --- Aparência ---
        const appearSection = this.createPropSection('Aparência');
        appearSection.appendChild(this.createRangeInput('Opacidade', frame.config?.opacity ?? 1, 0, 1, 0.05, (v) => {
            if (!frame.config) frame.config = {} as any;
            (frame.config as any).opacity = v; this.renderCanvas(); this.pushFrame(frame);
        }));
        appearSection.appendChild(this.createNumberInput('Raio', frame.config?.borderRadius ?? 0, 'px', (v) => {
            if (!frame.config) frame.config = {} as any;
            (frame.config as any).borderRadius = v; this.renderCanvas(); this.pushFrame(frame);
        }));
        this.propPanel.appendChild(appearSection);

        // --- Borda ---
        const borderSection = this.createPropSection('Borda');
        borderSection.appendChild(this.createNumberInput('Espessura', (frame.config as any)?.borderWidth ?? 0, 'px', (v) => {
            if (!frame.config) frame.config = {} as any;
            (frame.config as any).borderWidth = Math.max(0, v);
            this.renderCanvas(); this.pushFrame(frame);
        }));
        borderSection.appendChild(this.createColorPicker('Cor da Borda', (frame.config as any)?.borderColor ?? '#ffffff', (v) => {
            if (!frame.config) frame.config = {} as any;
            (frame.config as any).borderColor = v;
            this.renderCanvas(); this.pushFrame(frame);
        }));
        this.propPanel.appendChild(borderSection);

        // --- Type-specific ---
        this.renderTypeSpecificProps(frame);

        // --- Quick actions ---
        const actSection = this.createPropSection('Ações');
        const actGrid = document.createElement('div');
        actGrid.className = 'quick-actions';
        actGrid.appendChild(this.createSmallButton('maximize-2', 'Tela Cheia', () => {
            frame.posicao = { x: 0, y: 0, largura: this.state.resolucao.width, altura: this.state.resolucao.height };
            this.renderCanvas(); this.renderProperties(); this.pushFrame(frame);
        }));
        actGrid.appendChild(this.createSmallButton('align-center', 'Centralizar', () => {
            frame.posicao.x = Math.round((this.state.resolucao.width - frame.posicao.largura) / 2);
            frame.posicao.y = Math.round((this.state.resolucao.height - frame.posicao.altura) / 2);
            this.renderCanvas(); this.renderProperties(); this.pushFrame(frame);
        }));
        actGrid.appendChild(this.createSmallButton('copy', 'Duplicar', () => this.duplicateSelected()));
        actSection.appendChild(actGrid);
        this.propPanel.appendChild(actSection);

        refreshIcons();
    }

    private renderTypeSpecificProps(frame: Frame): void {
        const cfg = (frame.config || {}) as any;

        switch (frame.tipo) {
            case 'holyrics': {
                const s = this.createPropSection('Holyrics');
                s.appendChild(this.createTextInput('Endpoint URL', frame.fonte || '', (v) => {
                    frame.fonte = v; this.pushFrame(frame);
                }, 'http://192.168.1.x:7777/text'));
                this.propPanel.appendChild(s);
                break;
            }
            case 'video': {
                const s = this.createPropSection('Vídeo');
                s.appendChild(this.createSegmented('Ajuste', ['contain', 'cover', 'fill'], cfg.ajuste || 'cover', (v) => {
                    (frame.config as any).ajuste = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                s.appendChild(this.createToggle('Loop', cfg.loop ?? true, (v) => {
                    (frame.config as any).loop = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                s.appendChild(this.createToggle('Mudo', cfg.mudo ?? true, (v) => {
                    (frame.config as any).mudo = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                this.propPanel.appendChild(s);
                break;
            }
            case 'imagem': {
                const s = this.createPropSection('Imagem');
                s.appendChild(this.createSegmented('Ajuste', ['contain', 'cover', 'fill'], cfg.ajuste || 'cover', (v) => {
                    (frame.config as any).ajuste = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                this.propPanel.appendChild(s);
                break;
            }
            case 'cor': {
                const s = this.createPropSection('Cor');
                s.appendChild(this.createColorPicker('Cor de Fundo', frame.fonte || '#22c55e', (v) => {
                    frame.fonte = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                this.propPanel.appendChild(s);
                break;
            }
            case 'texto': {
                const s = this.createPropSection('Texto');
                s.appendChild(this.createTextareaInput('Conteúdo', cfg.conteudo || '', (v) => {
                    (frame.config as any).conteudo = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                s.appendChild(this.createNumberInput('Fonte (px)', cfg.fontSize || 24, '', (v) => {
                    (frame.config as any).fontSize = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                s.appendChild(this.createColorPicker('Cor Texto', cfg.corTexto || '#ffffff', (v) => {
                    (frame.config as any).corTexto = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                s.appendChild(this.createColorPicker('Cor Fundo', cfg.corFundo || 'transparent', (v) => {
                    (frame.config as any).corFundo = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                s.appendChild(this.createSegmented('Alinhar', ['left', 'center', 'right'], cfg.alinhamento || 'center', (v) => {
                    (frame.config as any).alinhamento = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                s.appendChild(this.createToggle('Negrito', cfg.negrito ?? false, (v) => {
                    (frame.config as any).negrito = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                s.appendChild(this.createToggle('Itálico', cfg.italico ?? false, (v) => {
                    (frame.config as any).italico = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                this.propPanel.appendChild(s);
                break;
            }
            case 'relogio': {
                const s = this.createPropSection('Relógio');
                s.appendChild(this.createSegmented('Formato', ['24h', '12h'], cfg.formato24h !== false ? '24h' : '12h', (v) => {
                    (frame.config as any).formato24h = v === '24h'; this.renderCanvas(); this.pushFrame(frame);
                }));
                s.appendChild(this.createColorPicker('Cor', cfg.corTexto || '#ffffff', (v) => {
                    (frame.config as any).corTexto = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                s.appendChild(this.createNumberInput('Fonte (px)', cfg.fontSize || 48, '', (v) => {
                    (frame.config as any).fontSize = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                this.propPanel.appendChild(s);
                break;
            }
            case 'contador': {
                const s = this.createPropSection('Contador');
                s.appendChild(this.createDatetimeInput('Hora Alvo', cfg.horaAlvo || '', (v) => {
                    (frame.config as any).horaAlvo = v; this.pushFrame(frame);
                }));
                s.appendChild(this.createColorPicker('Cor', cfg.corTexto || '#ffffff', (v) => {
                    (frame.config as any).corTexto = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                s.appendChild(this.createNumberInput('Fonte (px)', cfg.fontSize || 48, '', (v) => {
                    (frame.config as any).fontSize = v; this.renderCanvas(); this.pushFrame(frame);
                }));
                this.propPanel.appendChild(s);
                break;
            }
            case 'camera': {
                const s = this.createPropSection('Câmera');

                // Camera device selector
                const selectWrapper = document.createElement('div');
                selectWrapper.className = 'camera-select-wrapper';

                const select = document.createElement('select');
                select.className = 'camera-select';
                select.setAttribute('aria-label', 'Selecionar câmera');

                // Auto option
                const autoOpt = document.createElement('option');
                autoOpt.value = 'auto';
                autoOpt.textContent = 'Automático (padrão)';
                select.appendChild(autoOpt);

                const currentDeviceId = cfg.deviceId || frame.fonte || 'auto';

                for (const dev of this.cameraDevices) {
                    const opt = document.createElement('option');
                    opt.value = dev.deviceId;
                    opt.textContent = dev.label || `Câmera ${dev.deviceId.slice(0, 8)}...`;
                    if (dev.deviceId === currentDeviceId) opt.selected = true;
                    select.appendChild(opt);
                }

                if (currentDeviceId === 'auto') autoOpt.selected = true;

                select.addEventListener('change', () => {
                    const devId = select.value;
                    if (!frame.config) frame.config = {} as any;
                    (frame.config as any).deviceId = devId === 'auto' ? undefined : devId;
                    frame.fonte = devId === 'auto' ? '' : devId;
                    this.pushFrame(frame);

                    // Restart preview with new device
                    this.startCameraPreview(frame.id, devId).then(stream => {
                        const previewVid = miniPreview.querySelector('video');
                        if (stream && previewVid) (previewVid as HTMLVideoElement).srcObject = stream;
                    });

                    // Also update the canvas preview
                    this.renderCanvas();
                    this.toast('Câmera', devId === 'auto' ? 'Automático' : (select.options[select.selectedIndex]?.text || devId), 'info');
                });

                selectWrapper.appendChild(select);
                s.appendChild(this.createPropLabel('Dispositivo'));
                s.appendChild(selectWrapper);

                // Refresh cameras button
                const refreshBtn = document.createElement('button');
                refreshBtn.className = 'camera-refresh-btn';
                refreshBtn.appendChild(lucideIcon('refresh-cw', 10));
                refreshBtn.appendChild(document.createTextNode(' Atualizar lista'));
                refreshBtn.addEventListener('click', async () => {
                    await this.enumerateCameras();
                    this.renderProperties(); // rebuild the select
                    this.toast('Câmeras', `${this.cameraDevices.length} dispositivo(s)`, 'info');
                });
                s.appendChild(refreshBtn);

                // Mini preview
                const miniPreview = document.createElement('div');
                miniPreview.className = 'camera-preview-mini';
                const prevVid = document.createElement('video');
                prevVid.autoplay = true;
                prevVid.playsInline = true;
                prevVid.muted = true;
                miniPreview.appendChild(prevVid);

                // Connect existing stream or start new one
                const existingStream = this.cameraStreams.get(frame.id);
                if (existingStream) {
                    prevVid.srcObject = existingStream;
                } else {
                    this.startCameraPreview(frame.id, currentDeviceId).then(stream => {
                        if (stream) prevVid.srcObject = stream;
                    });
                }

                s.appendChild(miniPreview);

                const note = document.createElement('div');
                note.style.cssText = 'font-size:10px;color:var(--text-muted);padding:6px 10px;background:var(--bg-surface);border-radius:var(--radius-xs);border:1px solid var(--border-subtle);line-height:1.5;margin-top:6px;';
                note.textContent = 'A câmera selecionada será usada no telão via WebRTC. O preview acima mostra a captura local.';
                s.appendChild(note);

                this.propPanel.appendChild(s);
                break;
            }
            case 'url': {
                const s = this.createPropSection('URL');
                s.appendChild(this.createTextInput('URL', frame.fonte || '', (v) => {
                    frame.fonte = v; this.renderCanvas(); this.pushFrame(frame);
                }, 'https://exemplo.com'));
                const note = document.createElement('div');
                note.style.cssText = 'font-size:10px;color:var(--text-muted);padding:6px 10px;background:var(--bg-surface);border-radius:var(--radius-xs);border:1px solid var(--border-subtle);line-height:1.5;';
                note.textContent = 'Alguns sites bloqueiam exibição em iframe.';
                s.appendChild(note);

                const sugGrid = document.createElement('div');
                sugGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;';
                for (const sug of [
                    { label: 'Bíblia', url: 'https://www.bibliaonline.com.br/' },
                    { label: 'Clima', url: 'https://wttr.in/?lang=pt-br&format=3' },
                    { label: 'Relógio', url: 'https://time.is/' },
                ]) {
                    const btn = document.createElement('button');
                    btn.className = 'btn-sm';
                    btn.textContent = sug.label;
                    btn.addEventListener('click', () => {
                        frame.fonte = sug.url;
                        this.renderCanvas(); this.renderProperties(); this.pushFrame(frame);
                    });
                    sugGrid.appendChild(btn);
                }
                s.appendChild(sugGrid);
                this.propPanel.appendChild(s);
                break;
            }
        }
    }

    // ===== PROP BUILDERS =====

    private createPropSection(title: string): HTMLElement {
        const div = document.createElement('div');
        div.className = 'prop-section';
        const label = document.createElement('div');
        label.className = 'label-section';
        label.textContent = title;
        div.appendChild(label);
        return div;
    }

    private createPropLabel(text: string): HTMLElement {
        const lbl = document.createElement('span');
        lbl.className = 'field-label';
        lbl.textContent = text;
        lbl.style.marginBottom = '4px';
        lbl.style.display = 'block';
        return lbl;
    }

    private createNumberInput(label: string, value: number, suffix: string, onChange: (v: number) => void): HTMLElement {
        const group = document.createElement('div');
        group.className = 'prop-group';
        const lbl = document.createElement('span');
        lbl.className = 'field-label';
        lbl.textContent = label;
        group.appendChild(lbl);
        const wrapper = document.createElement('div');
        wrapper.className = 'input-wrapper';
        const input = document.createElement('input');
        input.type = 'number';
        input.value = String(Math.round(value));
        input.setAttribute('aria-label', label);
        input.addEventListener('change', () => onChange(Number(input.value)));
        wrapper.appendChild(input);
        if (suffix) {
            const suf = document.createElement('span');
            suf.className = 'suffix';
            suf.textContent = suffix;
            wrapper.appendChild(suf);
        }
        group.appendChild(wrapper);
        return group;
    }

    private createTextInput(label: string, value: string, onChange: (v: string) => void, placeholder = ''): HTMLElement {
        const group = document.createElement('div');
        group.className = 'prop-group';
        const lbl = document.createElement('span');
        lbl.className = 'field-label';
        lbl.textContent = label;
        group.appendChild(lbl);
        const wrapper = document.createElement('div');
        wrapper.className = 'input-wrapper';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.placeholder = placeholder;
        input.setAttribute('aria-label', label);
        input.addEventListener('change', () => onChange(input.value));
        wrapper.appendChild(input);
        group.appendChild(wrapper);
        return group;
    }

    private createTextareaInput(label: string, value: string, onChange: (v: string) => void): HTMLElement {
        const group = document.createElement('div');
        group.className = 'prop-group';
        const lbl = document.createElement('span');
        lbl.className = 'field-label';
        lbl.textContent = label;
        group.appendChild(lbl);
        const wrapper = document.createElement('div');
        wrapper.className = 'input-wrapper';
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.rows = 3;
        ta.style.resize = 'vertical';
        ta.setAttribute('aria-label', label);
        ta.addEventListener('change', () => onChange(ta.value));
        wrapper.appendChild(ta);
        group.appendChild(wrapper);
        return group;
    }

    private createDatetimeInput(label: string, value: string, onChange: (v: string) => void): HTMLElement {
        const group = document.createElement('div');
        group.className = 'prop-group';
        const lbl = document.createElement('span');
        lbl.className = 'field-label';
        lbl.textContent = label;
        group.appendChild(lbl);
        const wrapper = document.createElement('div');
        wrapper.className = 'input-wrapper';
        const input = document.createElement('input');
        input.type = 'datetime-local';
        input.value = value;
        input.setAttribute('aria-label', label);
        input.addEventListener('change', () => onChange(input.value));
        wrapper.appendChild(input);
        group.appendChild(wrapper);
        return group;
    }

    private createToggle(label: string, checked: boolean, onChange: (v: boolean) => void, _icon?: string): HTMLElement {
        const div = document.createElement('div');
        div.className = 'toggle-container';
        const span = document.createElement('span');
        span.className = 'toggle-label';
        span.textContent = label;
        div.appendChild(span);
        const sw = document.createElement('label');
        sw.className = 'switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.setAttribute('aria-label', label);
        input.addEventListener('change', () => onChange(input.checked));
        const slider = document.createElement('span');
        slider.className = 'slider-toggle';
        sw.appendChild(input);
        sw.appendChild(slider);
        div.appendChild(sw);
        return div;
    }

    private createRangeInput(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
        const group = document.createElement('div');
        group.className = 'prop-group';
        const lbl = document.createElement('span');
        lbl.className = 'field-label';
        lbl.textContent = label;
        group.appendChild(lbl);
        const row = document.createElement('div');
        row.className = 'range-group';
        const range = document.createElement('input');
        range.type = 'range';
        range.min = String(min); range.max = String(max); range.step = String(step); range.value = String(value);
        range.setAttribute('aria-label', label);
        const valSpan = document.createElement('span');
        valSpan.className = 'range-value';
        valSpan.textContent = String(value);
        range.addEventListener('input', () => {
            valSpan.textContent = parseFloat(range.value).toFixed(2);
            onChange(parseFloat(range.value));
        });
        row.appendChild(range); row.appendChild(valSpan);
        group.appendChild(row);
        return group;
    }

    private createSegmented(label: string, options: string[], active: string, onChange: (v: string) => void): HTMLElement {
        const group = document.createElement('div');
        group.className = 'prop-group';
        const lbl = document.createElement('span');
        lbl.className = 'field-label';
        lbl.textContent = label;
        group.appendChild(lbl);
        const seg = document.createElement('div');
        seg.className = 'segmented-group';
        for (const opt of options) {
            const btn = document.createElement('button');
            btn.className = `segmented-btn${opt === active ? ' active' : ''}`;
            btn.textContent = opt;
            btn.addEventListener('click', () => {
                for (const b of seg.querySelectorAll('.segmented-btn')) b.classList.remove('active');
                btn.classList.add('active');
                onChange(opt);
            });
            seg.appendChild(btn);
        }
        group.appendChild(seg);
        return group;
    }

    private createColorPicker(label: string, value: string, onChange: (v: string) => void): HTMLElement {
        const group = document.createElement('div');
        group.className = 'prop-group';
        const lbl = document.createElement('span');
        lbl.className = 'field-label';
        lbl.textContent = label;
        group.appendChild(lbl);
        const row = document.createElement('div');
        row.className = 'color-picker-wrapper';
        const preview = document.createElement('div');
        preview.className = 'color-preview';
        preview.style.backgroundColor = value;
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = value.startsWith('#') ? value : '#ffffff';
        colorInput.setAttribute('aria-label', label);
        preview.appendChild(colorInput);
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'color-hex';
        hexInput.value = value;
        hexInput.setAttribute('aria-label', label + ' hex');
        colorInput.addEventListener('input', () => {
            preview.style.backgroundColor = colorInput.value;
            hexInput.value = colorInput.value;
            onChange(colorInput.value);
        });
        hexInput.addEventListener('change', () => {
            preview.style.backgroundColor = hexInput.value;
            colorInput.value = hexInput.value;
            onChange(hexInput.value);
        });
        row.appendChild(preview); row.appendChild(hexInput);
        group.appendChild(row);
        return group;
    }

    private createSmallButton(icon: string, label: string, onClick: () => void): HTMLElement {
        const btn = document.createElement('button');
        btn.className = 'btn-sm';
        btn.appendChild(lucideIcon(icon, 12));
        const sp = document.createElement('span');
        sp.textContent = label;
        btn.appendChild(sp);
        btn.addEventListener('click', onClick);
        return btn;
    }

    // ===== MEDIA =====
    private async renderMediaLibrary(): Promise<void> {
        try {
            const resp = await fetch('/api/midias', { headers: { 'X-Auth-Pin': this.pin } });
            if (!resp.ok) return;
            const midias: { nome: string; url: string; tipo: string }[] = await resp.json();
            clearChildren(this.mediaList);
            if (midias.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:10px;font-size:10px;color:var(--text-muted);text-align:center;font-family:var(--font-mono);';
                empty.textContent = 'Nenhuma mídia';
                this.mediaList.appendChild(empty);
                return;
            }
            for (const m of midias) {
                const item = document.createElement('div');
                item.className = 'media-item';
                const thumb = document.createElement('div');
                thumb.className = 'media-thumb';
                if (m.tipo === 'video' || m.nome.match(/\.(mp4|webm|mov)$/i)) {
                    thumb.appendChild(lucideIcon('play', 14));
                } else {
                    const img = document.createElement('img');
                    img.src = m.url; img.alt = m.nome; img.loading = 'lazy';
                    thumb.appendChild(img);
                }
                const info = document.createElement('div');
                info.className = 'media-info';
                const name = document.createElement('div');
                name.className = 'media-name';
                name.textContent = m.nome;
                info.appendChild(name);
                const delBtn = document.createElement('button');
                delBtn.className = 'media-delete';
                delBtn.setAttribute('aria-label', 'Excluir ' + m.nome);
                delBtn.appendChild(lucideIcon('trash-2', 12));
                delBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteMedia(m.nome); });
                item.addEventListener('click', () => {
                    const tipo = m.nome.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'imagem';
                    this.addFrame(tipo, m.url);
                });
                item.appendChild(thumb); item.appendChild(info); item.appendChild(delBtn);
                this.mediaList.appendChild(item);
            }
            refreshIcons();
        } catch { }
    }

    // ===== STATUS BAR =====
    private renderStatusBar(): void {
        const scene = this.activeScene();
        const connected = this.ws?.readyState === WebSocket.OPEN;
        const footerStatus = document.getElementById('footer-status')!;
        footerStatus.textContent = connected ? '● ONLINE' : '● OFFLINE';
        footerStatus.className = connected ? 'status-connected-text' : 'status-disconnected-text';
        document.getElementById('footer-scene')!.textContent = `Cena: ${scene?.nome || '—'}`;
        document.getElementById('footer-frames')!.textContent = `${scene?.frames.length || 0} frames`;
        document.getElementById('header-res')!.textContent = `${this.state.resolucao.width}×${this.state.resolucao.height}`;
        document.getElementById('footer-res')!.textContent = `${this.state.resolucao.width}×${this.state.resolucao.height}`;
    }

    // ===== DRAG & RESIZE =====
    private startDrag(e: MouseEvent, frame: Frame): void {
        e.preventDefault();
        let lastX = e.clientX, lastY = e.clientY;
        const onMove = (me: MouseEvent) => {
            frame.posicao.x = Math.round(frame.posicao.x + this.toLogical(me.clientX - lastX));
            frame.posicao.y = Math.round(frame.posicao.y + this.toLogical(me.clientY - lastY));
            lastX = me.clientX; lastY = me.clientY;
            this.renderCanvas();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            this.renderProperties(); this.pushFrame(frame);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    private startResize(e: MouseEvent, frame: Frame, handle: string): void {
        e.preventDefault();
        let lastX = e.clientX, lastY = e.clientY;
        const onMove = (me: MouseEvent) => {
            const dx = this.toLogical(me.clientX - lastX);
            const dy = this.toLogical(me.clientY - lastY);
            if (handle.includes('e')) frame.posicao.largura = Math.max(20, Math.round(frame.posicao.largura + dx));
            if (handle.includes('s')) frame.posicao.altura = Math.max(20, Math.round(frame.posicao.altura + dy));
            if (handle.includes('w')) { frame.posicao.x = Math.round(frame.posicao.x + dx); frame.posicao.largura = Math.max(20, Math.round(frame.posicao.largura - dx)); }
            if (handle.includes('n')) { frame.posicao.y = Math.round(frame.posicao.y + dy); frame.posicao.altura = Math.max(20, Math.round(frame.posicao.altura - dy)); }
            lastX = me.clientX; lastY = me.clientY;
            this.renderCanvas();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            this.renderProperties(); this.pushFrame(frame);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // ===== ACTIONS =====
    public addFrame(tipo: string, fonte?: string): void {
        const scene = this.activeScene();
        if (!scene) { this.toast('Erro', 'Crie uma cena primeiro', 'error'); return; }

        const defaults: Record<string, any> = {
            cor: { fonte: '#22c55e', config: { opacity: 1, borderRadius: 0, borderWidth: 0, borderColor: '#ffffff' } },
            texto: { config: { opacity: 1, borderRadius: 0, borderWidth: 0, borderColor: '#ffffff', conteudo: 'Texto', fontSize: 24, corTexto: '#ffffff', corFundo: 'transparent', alinhamento: 'center', negrito: false, italico: false } },
            relogio: { config: { opacity: 1, borderRadius: 0, borderWidth: 0, borderColor: '#ffffff', formato24h: true, corTexto: '#ffffff', fontSize: 48 } },
            contador: { config: { opacity: 1, borderRadius: 0, borderWidth: 0, borderColor: '#ffffff', horaAlvo: '', corTexto: '#ffffff', fontSize: 48 } },
            video: { config: { opacity: 1, borderRadius: 0, borderWidth: 0, borderColor: '#ffffff', ajuste: 'cover', loop: true, mudo: true } },
            imagem: { config: { opacity: 1, borderRadius: 0, borderWidth: 0, borderColor: '#ffffff', ajuste: 'cover' } },
            holyrics: { fonte: '', config: { opacity: 1, borderRadius: 0, borderWidth: 0, borderColor: '#ffffff' } },
            camera: { config: { opacity: 1, borderRadius: 0, borderWidth: 0, borderColor: '#ffffff', deviceId: undefined } },
            url: { fonte: '', config: { opacity: 1, borderRadius: 0, borderWidth: 0, borderColor: '#ffffff' } },
        };

        const d = defaults[tipo] || {};
        const newFrame: Frame = {
            id: uid(),
            tipo: tipo as any,
            nome: `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} ${scene.frames.length + 1}`,
            fonte: fonte ?? d.fonte ?? '',
            posicao: { x: 100, y: 100, largura: 480, altura: 270 },
            camada: scene.frames.length + 1,
            visivel: true,
            bloqueado: false,
            config: d.config ?? { opacity: 1, borderRadius: 0, borderWidth: 0, borderColor: '#ffffff' },
        };

        scene.frames.push(newFrame);
        this.selectedFrameId = newFrame.id;
        this.send({ tipo: 'cena', payload: scene });
        this.renderCanvas(); this.renderLayersList(); this.renderProperties(); this.renderStatusBar();
        this.toast('Frame adicionado', newFrame.nome, 'success');
    }

    private selectFrame(id: string): void {
        this.selectedFrameId = id;
        this.renderCanvas(); this.renderLayersList(); this.renderProperties();
    }

    private duplicateSelected(): void {
        const frame = this.selectedFrame();
        const scene = this.activeScene();
        if (!frame || !scene) return;
        const copy: Frame = JSON.parse(JSON.stringify(frame));
        copy.id = uid();
        copy.nome = frame.nome + ' (cópia)';
        copy.posicao.x += 30; copy.posicao.y += 30;
        copy.camada = scene.frames.length + 1;
        scene.frames.push(copy);
        this.selectedFrameId = copy.id;
        this.send({ tipo: 'cena', payload: scene });
        this.renderCanvas(); this.renderLayersList(); this.renderProperties(); this.renderStatusBar();
        this.toast('Duplicado', copy.nome, 'info');
    }

    private deleteSelected(): void {
        const scene = this.activeScene();
        if (!scene || !this.selectedFrameId) return;
        const name = scene.frames.find(f => f.id === this.selectedFrameId)?.nome;
        this.stopCameraPreview(this.selectedFrameId);
        scene.frames = scene.frames.filter(f => f.id !== this.selectedFrameId);
        this.removeFrameElement(this.selectedFrameId);
        this.selectedFrameId = null;
        this.send({ tipo: 'cena', payload: scene });
        this.renderCanvas(); this.renderLayersList(); this.renderProperties(); this.renderStatusBar();
        this.toast('Removido', name || 'Frame', 'info');
    }

    private pushFrame(frame: Frame): void {
        this.send({ tipo: 'frame', payload: { frameId: frame.id, dados: frame } });
    }

    // ===== SCENES =====
    private addScene(): void {
        const nome = prompt('Nome da nova cena:', `Cena ${this.state.cenas.length + 1}`);
        if (!nome) return;
        const scene: Scene = { id: uid(), nome, frames: [] };
        this.state.cenas.push(scene);
        this.state.cenaAtivaId = scene.id;
        this.selectedFrameId = null;
        this.send({ tipo: 'cena', payload: scene });
        this.renderAll();
        this.toast('Cena criada', nome, 'success');
    }

    private activateScene(id: string): void {
        if (id === this.state.cenaAtivaId) return;

        const previousId = this.state.cenaAtivaId;
        this.state.cenaAtivaId = id;
        this.selectedFrameId = null;
        this.clearCanvasElements();

        const scene = this.activeScene();
        if (!scene) return;

        // Envia UMA ÚNICA mensagem com a transição embutida
        // NÃO chamar /api/cena separadamente — senão chega duplicado no telão
        this.send({
            tipo: 'cena',
            payload: {
                ...scene,
                _transicao: this.state.transicao,
                _previousCenaId: previousId,
            },
        });

        this.renderAll();
    }


    private renameScene(id: string): void {
        const scene = this.state.cenas.find(c => c.id === id);
        if (!scene) return;
        const nome = prompt('Novo nome:', scene.nome);
        if (nome) {
            scene.nome = nome;
            this.send({ tipo: 'cena', payload: scene });
            this.renderSceneTabs(); this.renderStatusBar();
        }
    }

    // ===== UPLOAD =====
    private async uploadFile(file: File): Promise<void> {
        this.toast('Upload', `Enviando ${file.name}...`, 'info');
        const form = new FormData();
        form.append('file', file);
        try {
            const resp = await fetch('/api/upload', { method: 'POST', headers: { 'X-Auth-Pin': this.pin }, body: form });
            if (resp.ok) { this.toast('Sucesso', `${file.name} enviado`, 'success'); this.renderMediaLibrary(); }
            else { const d = await resp.json().catch(() => ({})); this.toast('Erro', (d as any).error || 'Falha', 'error'); }
        } catch { this.toast('Erro', 'Erro de rede', 'error'); }
    }

    private async deleteMedia(nome: string): Promise<void> {
        try {
            await fetch(`/api/midias/${encodeURIComponent(nome)}`, { method: 'DELETE', headers: { 'X-Auth-Pin': this.pin } });
            this.renderMediaLibrary();
            this.toast('Removido', nome, 'info');
        } catch { }
    }

    // ===== SAVE/LOAD =====
    private saveProject(): void {
        const data = {
            nome: 'Compositor Pro Project',
            data: new Date().toISOString(),
            resolucao: this.state.resolucao,
            cenas: this.state.cenas,
            transicaoPadrao: this.state.transicao,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `compositor-pro-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        fetch('/api/cenas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Pin': this.pin },
            body: JSON.stringify({ cenas: this.state.cenas }),
        }).catch(() => { });
        this.toast('Salvo', 'Projeto exportado', 'success');
    }

    private loadProject(): void {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result as string);
                    if (data.cenas && Array.isArray(data.cenas)) {
                        this.state.cenas = data.cenas;
                        this.state.cenaAtivaId = data.cenas[0]?.id || '';
                        if (data.resolucao) {
                            this.state.resolucao = data.resolucao;
                            this.canvasEl.style.aspectRatio = `${data.resolucao.width}/${data.resolucao.height}`;
                        }
                        if (data.transicaoPadrao) {
                            this.state.transicao = data.transicaoPadrao;
                            this.updateTransitionBar();
                        }
                        this.selectedFrameId = null;
                        this.clearCanvasElements();
                        fetch('/api/cenas', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-Auth-Pin': this.pin },
                            body: JSON.stringify({ cenas: this.state.cenas }),
                        }).catch(() => { });
                        this.computeScale(); this.renderAll();
                        this.toast('Carregado', `${data.cenas.length} cena(s)`, 'success');
                    } else { this.toast('Erro', 'JSON inválido', 'error'); }
                } catch { this.toast('Erro', 'Arquivo ilegível', 'error'); }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    // ===== TOASTS =====
    private toast(title: string, msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const titleEl = document.createElement('div');
        titleEl.className = 'toast-title';
        titleEl.textContent = title;
        toast.appendChild(titleEl);
        const msgEl = document.createElement('div');
        msgEl.className = 'toast-msg';
        msgEl.textContent = msg;
        toast.appendChild(msgEl);
        const progress = document.createElement('div');
        progress.className = 'toast-progress';
        const bar = document.createElement('div');
        bar.className = 'toast-progress-bar';
        progress.appendChild(bar);
        toast.appendChild(progress);
        this.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 250);
        }, 4000);
    }
}

new PainelEngine();