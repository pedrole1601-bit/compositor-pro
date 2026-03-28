// ============================================================
// Compositor Pro v2 — Telão (main.ts)
// Part 2 FIX v2: Transições funcionando + Camera
// ============================================================

import type {
    Frame,
    Scene,
    Resolution,
    TransitionConfig,
    TransitionType,
    WebSocketMessage,
} from '../shared/types.js';

function clearEl(el: HTMLElement): void {
    while (el.firstChild) el.removeChild(el.firstChild);
}

class TelaoEngine {
    private root: HTMLElement;
    private ws: WebSocket | null = null;
    private wsReconnectDelay = 1000;
    private wsManualClose = false;

    private state = {
        cenas: [] as Scene[],
        cenaAtivaId: '',
        resolucao: { width: 1920, height: 1080 } as Resolution,
        transicao: { tipo: 'fade' as TransitionType, duracao: 500 } as TransitionConfig,
    };

    private scale = 1;
    private pin = '1234';

    private frameElements = new Map<string, HTMLElement>();
    private intervals = new Map<string, ReturnType<typeof setInterval>>();
    private videoElements = new Map<string, HTMLVideoElement>();
    private cameraStreams = new Map<string, MediaStream>();

    private isTransitioning = false;
    private transitionCleanup: (() => void) | null = null;
    private debug = false;

    constructor() {
        this.root = document.getElementById('compositor-root')!;

        if (location.search.includes('debug')) {
            this.debug = true;
            const overlay = document.getElementById('debug-overlay');
            if (overlay) overlay.classList.add('visible');
        }

        const urlParams = new URLSearchParams(location.search);
        if (urlParams.has('pin')) this.pin = urlParams.get('pin')!;

        this.updateScale();
        window.addEventListener('resize', () => this.updateScale());

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !this.ws) this.connectWS();
        });

        this.connectWS();
    }

    // ===== SCALE =====

    private updateScale(): void {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const sw = w / this.state.resolucao.width;
        const sh = h / this.state.resolucao.height;
        this.scale = Math.min(sw, sh);

        this.root.style.width = this.state.resolucao.width + 'px';
        this.root.style.height = this.state.resolucao.height + 'px';
        this.root.style.transform = `scale(${this.scale})`;

        const left = (w - this.state.resolucao.width * this.scale) / 2;
        const top = (h - this.state.resolucao.height * this.scale) / 2;
        this.root.style.left = left + 'px';
        this.root.style.top = top + 'px';

        this.dbg('scale', this.scale.toFixed(3));
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
            this.dbg('status', 'Conectado');
        });

        this.ws.addEventListener('message', (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                console.log('[Telão] MSG:', msg.tipo);
                this.onMessage(msg);
            } catch (e) {
                console.error('[Telão] Erro parse:', e);
            }
        });

        this.ws.addEventListener('close', () => {
            this.dbg('status', 'Desconectado');
            this.ws = null;
            if (!this.wsManualClose && document.visibilityState !== 'hidden') {
                setTimeout(() => this.connectWS(), this.wsReconnectDelay);
                this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 2, 30000);
            }
        });

        this.ws.addEventListener('error', () => { });
    }

    private send(msg: Record<string, unknown>): void {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    }

    // ===== MESSAGE HANDLER =====

    private onMessage(msg: WebSocketMessage): void {
        switch (msg.tipo) {
            case 'ping':
                this.send({ tipo: 'pong', payload: {} });
                break;

            case 'auth':
                if (msg.payload?.sucesso) {
                    console.log('[Telão] Autenticado');
                } else {
                    console.error('[Telão] PIN inválido');
                }
                break;

            case 'init': {
                this.state.cenas = msg.payload.cenas ?? [];
                this.state.cenaAtivaId = msg.payload.cenaAtivaId ?? '';
                if (msg.payload.resolucao) {
                    this.state.resolucao = msg.payload.resolucao;
                    this.updateScale();
                }
                if (msg.payload.transicao) {
                    this.state.transicao = msg.payload.transicao;
                }
                this.renderSceneDirect(this.activeScene());
                break;
            }

            case 'cena': {
                const payload = msg.payload;
                if (!payload?.id) return;

                const previousCenaId = this.state.cenaAtivaId;

                // Atualizar lista de cenas (sem campos temporários)
                const cleanScene = { ...payload };
                delete cleanScene._transicao;
                delete cleanScene._previousCenaId;

                const idx = this.state.cenas.findIndex(c => c.id === cleanScene.id);
                if (idx !== -1) this.state.cenas[idx] = cleanScene;
                else this.state.cenas.push(cleanScene);

                // Extrair transição embutida
                if (payload._transicao) {
                    this.state.transicao = payload._transicao;
                    this.dbg('transition', `${this.state.transicao.tipo} ${this.state.transicao.duracao}ms`);
                }

                this.state.cenaAtivaId = payload.id;
                const newScene = this.activeScene();

                const isSceneChange = previousCenaId !== payload.id && previousCenaId !== '';

                console.log('[Telão] Cena:', isSceneChange ? 'MUDOU' : 'mesma', '| de:', previousCenaId.slice(0, 8), '→', payload.id.slice(0, 8));

                if (isSceneChange && this.state.transicao.tipo !== 'none') {
                    this.performTransition(newScene);
                } else if (!this.isTransitioning) {
                    // Só faz render direto se NÃO estiver no meio de uma transição
                    this.renderSceneDirect(newScene);
                }
                // Se estiver em transição e a cena é a mesma, ignorar
                break;
            }

            case 'frame': {
                if (this.isTransitioning) return; // Ignorar updates durante transição
                const { frameId, dados } = msg.payload ?? {};
                if (!frameId || !dados) return;
                const scene = this.activeScene();
                if (scene) {
                    const f = scene.frames.find(fr => fr.id === frameId);
                    if (f) Object.assign(f, dados);
                }
                this.updateFrameElement(frameId, dados);
                break;
            }

            case 'frame_delete': {
                const { frameId } = msg.payload ?? {};
                if (!frameId) return;
                this.removeFrameElement(frameId);
                const scene = this.activeScene();
                if (scene) scene.frames = scene.frames.filter(f => f.id !== frameId);
                break;
            }

            case 'resolucao': {
                if (msg.payload?.resolucao) {
                    this.state.resolucao = msg.payload.resolucao;
                    this.updateScale();
                }
                break;
            }

            case 'transicao': {
                if (msg.payload?.transicao) {
                    this.state.transicao = msg.payload.transicao;
                    console.log('[Telão] Transição config:', this.state.transicao);
                    this.dbg('transition', `${this.state.transicao.tipo} ${this.state.transicao.duracao}ms`);
                }
                break;
            }
        }
    }

    private activeScene(): Scene | undefined {
        return this.state.cenas.find(c => c.id === this.state.cenaAtivaId);
    }

    // ===== RENDER DIRETO (sem transição) =====

    private renderSceneDirect(scene: Scene | undefined): void {
        // Se há uma transição em andamento, forçar limpeza
        if (this.transitionCleanup) {
            this.transitionCleanup();
            this.transitionCleanup = null;
        }

        this.cleanupAll();
        clearEl(this.root);
        this.frameElements.clear();

        if (!scene) {
            this.dbg('scene', '—');
            this.dbg('frames', '0');
            return;
        }

        this.dbg('scene', scene.nome);
        this.dbg('frames', String(scene.frames.length));

        for (const frame of scene.frames) {
            const el = this.buildFrameElement(frame);
            this.root.appendChild(el);
            this.frameElements.set(frame.id, el);
        }
    }

    // ===== TRANSIÇÃO ANIMADA =====

    private performTransition(newScene: Scene | undefined): void {
        if (!newScene) {
            this.renderSceneDirect(newScene);
            return;
        }

        // Se já está em transição, forçar cleanup e render direto
        if (this.isTransitioning) {
            if (this.transitionCleanup) {
                this.transitionCleanup();
                this.transitionCleanup = null;
            }
            this.renderSceneDirect(newScene);
            return;
        }

        const type = this.state.transicao.tipo || 'fade';
        const dur = this.state.transicao.duracao || 500;

        console.log('[Telão] ▶ TRANSIÇÃO:', type, dur + 'ms');
        this.isTransitioning = true;

        // 1) Salvar referências dos recursos antigos para limpeza posterior
        const oldIntervals = new Map(this.intervals);
        const oldVideos = new Map(this.videoElements);
        const oldCameraStreams = new Map(this.cameraStreams);
        this.intervals.clear();
        this.videoElements.clear();
        this.cameraStreams.clear();
        this.frameElements.clear();

        // 2) Mover conteúdo atual para container "old"
        const oldContainer = document.createElement('div');
        oldContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;z-index:1;';
        while (this.root.firstChild) {
            oldContainer.appendChild(this.root.firstChild);
        }

        // 3) Criar container "new" e construir frames
        const newContainer = document.createElement('div');
        newContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;z-index:2;';

        for (const frame of newScene.frames) {
            const el = this.buildFrameElement(frame);
            newContainer.appendChild(el);
            this.frameElements.set(frame.id, el);
        }

        this.root.appendChild(oldContainer);
        this.root.appendChild(newContainer);

        this.dbg('scene', newScene.nome);
        this.dbg('frames', String(newScene.frames.length));

        // 4) Aplicar animação via Web Animations API (mais confiável que CSS animation)
        const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';

        const oldKeyframes = this.getOutKeyframes(type);
        const newKeyframes = this.getInKeyframes(type);

        const oldAnim = oldContainer.animate(oldKeyframes, {
            duration: dur,
            easing,
            fill: 'forwards',
        });

        const newAnim = newContainer.animate(newKeyframes, {
            duration: dur,
            easing,
            fill: 'forwards',
        });

        // 5) Cleanup quando terminar
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;

            console.log('[Telão] ✓ Transição concluída');

            // Cancelar animações
            try { oldAnim.cancel(); } catch { }
            try { newAnim.cancel(); } catch { }

            // Mover filhos do newContainer para o root
            while (newContainer.firstChild) {
                this.root.appendChild(newContainer.firstChild);
            }

            // Limpar recursos antigos
            for (const [, interval] of oldIntervals) clearInterval(interval);
            for (const [, vid] of oldVideos) { vid.pause(); vid.src = ''; vid.load(); }
            for (const [, stream] of oldCameraStreams) { stream.getTracks().forEach(t => t.stop()); }

            // Remover containers
            oldContainer.remove();
            newContainer.remove();

            this.isTransitioning = false;
            this.transitionCleanup = null;
        };

        this.transitionCleanup = cleanup;

        // Esperar a animação de entrada terminar
        newAnim.finished.then(() => {
            cleanup();
        }).catch(() => {
            // cancelled — cleanup já foi chamado
        });

        // Safety timeout
        setTimeout(() => {
            if (!cleaned) {
                console.warn('[Telão] ⚠ Safety timeout');
                cleanup();
            }
        }, dur + 300);
    }

    // ===== KEYFRAMES PARA TRANSIÇÕES =====

    private getOutKeyframes(type: TransitionType): Keyframe[] {
        switch (type) {
            case 'fade':
                return [{ opacity: 1 }, { opacity: 0 }];
            case 'slide-left':
                return [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }];
            case 'slide-right':
                return [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }];
            case 'slide-up':
                return [{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }];
            case 'slide-down':
                return [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }];
            case 'zoom':
                return [
                    { transform: 'scale(1)', opacity: 1 },
                    { transform: 'scale(1.5)', opacity: 0 },
                ];
            case 'blur':
                return [
                    { filter: 'blur(0px)', opacity: 1 },
                    { filter: 'blur(30px)', opacity: 0 },
                ];
            case 'wipe':
                return [
                    { clipPath: 'inset(0 0 0 0)' },
                    { clipPath: 'inset(0 0 0 100%)' },
                ];
            default:
                return [{ opacity: 1 }, { opacity: 0 }];
        }
    }

    private getInKeyframes(type: TransitionType): Keyframe[] {
        switch (type) {
            case 'fade':
                return [{ opacity: 0 }, { opacity: 1 }];
            case 'slide-left':
                return [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }];
            case 'slide-right':
                return [{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }];
            case 'slide-up':
                return [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }];
            case 'slide-down':
                return [{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }];
            case 'zoom':
                return [
                    { transform: 'scale(0.5)', opacity: 0 },
                    { transform: 'scale(1)', opacity: 1 },
                ];
            case 'blur':
                return [
                    { filter: 'blur(30px)', opacity: 0 },
                    { filter: 'blur(0px)', opacity: 1 },
                ];
            case 'wipe':
                return [
                    { clipPath: 'inset(0 100% 0 0)' },
                    { clipPath: 'inset(0 0 0 0)' },
                ];
            default:
                return [{ opacity: 0 }, { opacity: 1 }];
        }
    }

    // ===== BUILD FRAME =====

    private buildFrameElement(frame: Frame): HTMLElement {
        const div = document.createElement('div');
        div.id = `frame-${frame.id}`;
        div.className = 'frame';
        this.applyFrameStyles(div, frame);
        this.buildFrameContent(div, frame);
        return div;
    }

    private applyFrameStyles(div: HTMLElement, frame: Frame): void {
        const cfg = (frame.config || {}) as any;
        const radius = (cfg.borderRadius ?? 0) + 'px';
        const bw = cfg.borderWidth ?? 0;
        const bc = cfg.borderColor ?? 'transparent';

        div.style.left = frame.posicao.x + 'px';
        div.style.top = frame.posicao.y + 'px';
        div.style.width = frame.posicao.largura + 'px';
        div.style.height = frame.posicao.altura + 'px';
        div.style.zIndex = String(frame.camada);
        div.style.display = frame.visivel ? 'block' : 'none';
        div.style.opacity = String(cfg.opacity ?? 1);
        div.style.borderRadius = radius;
        div.style.overflow = 'hidden';

        if (bw > 0) {
            div.style.border = `${bw}px solid ${bc}`;
        } else {
            div.style.border = 'none';
        }
    }

    private buildFrameContent(container: HTMLElement, frame: Frame): void {
        const cfg = (frame.config || {}) as any;

        switch (frame.tipo) {
            case 'cor':
                container.style.backgroundColor = frame.fonte || '#000';
                break;

            case 'imagem':
                if (frame.fonte) {
                    const img = document.createElement('img');
                    img.src = this.resolveUrl(frame.fonte);
                    img.style.objectFit = cfg.ajuste || 'cover';
                    img.draggable = false;
                    img.alt = '';
                    container.appendChild(img);
                }
                break;

            case 'video':
                if (frame.fonte) {
                    const video = document.createElement('video');
                    video.src = this.resolveUrl(frame.fonte);
                    video.style.objectFit = cfg.ajuste || 'cover';
                    video.loop = cfg.loop !== false;
                    video.muted = cfg.mudo !== false;
                    video.autoplay = true;
                    video.playsInline = true;
                    video.setAttribute('playsinline', '');
                    container.appendChild(video);
                    this.videoElements.set(frame.id, video);
                    video.play().catch(() => {
                        video.muted = true;
                        video.play().catch(() => { });
                    });
                }
                break;

            case 'holyrics': {
                const url = frame.fonte;
                if (url) {
                    const iframe = document.createElement('iframe');
                    iframe.src = url;
                    iframe.allow = 'autoplay';
                    iframe.setAttribute('loading', 'eager');
                    container.appendChild(iframe);
                } else {
                    this.showMessage(container, 'Configure a URL do Holyrics');
                }
                break;
            }

            case 'texto': {
                const txt = document.createElement('div');
                txt.className = 'frame-text';
                txt.style.fontSize = (cfg.fontSize || 24) + 'px';
                txt.style.color = cfg.corTexto || '#ffffff';
                txt.style.backgroundColor = cfg.corFundo || 'transparent';
                txt.style.fontWeight = cfg.negrito ? '700' : '400';
                txt.style.fontStyle = cfg.italico ? 'italic' : 'normal';
                txt.style.justifyContent = cfg.alinhamento === 'left' ? 'flex-start'
                    : cfg.alinhamento === 'right' ? 'flex-end' : 'center';
                txt.style.textAlign = cfg.alinhamento || 'center';
                txt.style.padding = '12px';
                txt.textContent = cfg.conteudo || '';
                container.appendChild(txt);
                break;
            }

            case 'relogio': {
                const clockEl = document.createElement('div');
                clockEl.className = 'frame-clock';
                clockEl.style.fontSize = (cfg.fontSize || 48) + 'px';
                clockEl.style.color = cfg.corTexto || '#ffffff';
                clockEl.style.fontWeight = '700';
                container.appendChild(clockEl);
                const formato24 = cfg.formato24h !== false;
                const update = () => {
                    const now = new Date();
                    let h = now.getHours();
                    const m = String(now.getMinutes()).padStart(2, '0');
                    const s = String(now.getSeconds()).padStart(2, '0');
                    if (!formato24) h = h % 12 || 12;
                    clockEl.textContent = `${String(h).padStart(2, '0')}:${m}:${s}`;
                };
                update();
                this.intervals.set(frame.id, setInterval(update, 1000));
                break;
            }

            case 'contador': {
                const cntEl = document.createElement('div');
                cntEl.className = 'frame-counter';
                cntEl.style.fontSize = (cfg.fontSize || 48) + 'px';
                cntEl.style.color = cfg.corTexto || '#ffffff';
                cntEl.style.fontWeight = '700';
                container.appendChild(cntEl);
                const update = () => {
                    const alvo = cfg.horaAlvo;
                    if (alvo) {
                        const diff = Math.max(0, new Date(alvo).getTime() - Date.now());
                        const h = Math.floor(diff / 3600000);
                        const m = Math.floor((diff % 3600000) / 60000);
                        const s = Math.floor((diff % 60000) / 1000);
                        cntEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                        cntEl.style.color = (diff < 60000 && diff > 0) ? '#ef4444' : (cfg.corTexto || '#ffffff');
                    } else {
                        cntEl.textContent = '--:--:--';
                    }
                };
                update();
                this.intervals.set(frame.id, setInterval(update, 1000));
                break;
            }

            case 'camera': {
                const video = document.createElement('video');
                video.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                video.autoplay = true;
                video.playsInline = true;
                video.muted = true;
                container.appendChild(video);

                const deviceId = cfg.deviceId || frame.fonte;
                const constraints: MediaStreamConstraints = {
                    video: deviceId && deviceId !== 'auto' && deviceId !== ''
                        ? { deviceId: { exact: deviceId } }
                        : true,
                };

                navigator.mediaDevices.getUserMedia(constraints)
                    .then(stream => {
                        video.srcObject = stream;
                        this.cameraStreams.set(frame.id, stream);
                    })
                    .catch(err => {
                        console.error('[Telão] Câmera erro:', err);
                        if (deviceId && deviceId !== 'auto') {
                            navigator.mediaDevices.getUserMedia({ video: true })
                                .then(stream => {
                                    video.srcObject = stream;
                                    this.cameraStreams.set(frame.id, stream);
                                })
                                .catch(() => this.showCameraError(container));
                        } else {
                            this.showCameraError(container);
                        }
                    });
                break;
            }

            case 'url': {
                if (frame.fonte) {
                    const iframe = document.createElement('iframe');
                    iframe.src = frame.fonte;
                    iframe.allow = 'autoplay; fullscreen';
                    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
                    container.appendChild(iframe);
                } else {
                    this.showMessage(container, 'Configure a URL nas propriedades');
                }
                break;
            }
        }
    }

    private showMessage(container: HTMLElement, text: string): void {
        const msg = document.createElement('div');
        msg.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#666;font-size:16px;background:#111;';
        msg.textContent = text;
        container.appendChild(msg);
    }

    private showCameraError(container: HTMLElement): void {
        container.style.backgroundColor = '#111';
        const msg = document.createElement('div');
        msg.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#666;font-size:14px;';
        msg.textContent = 'Câmera indisponível';
        container.appendChild(msg);
    }

    // ===== UPDATE FRAME =====

    private updateFrameElement(frameId: string, dados: any): void {
        let el = this.frameElements.get(frameId);

        if (!el) {
            const scene = this.activeScene();
            const frame = scene?.frames.find(f => f.id === frameId);
            if (frame) {
                el = this.buildFrameElement(frame);
                this.root.appendChild(el);
                this.frameElements.set(frameId, el);
            }
            return;
        }

        const scene = this.activeScene();
        const frame = scene?.frames.find(f => f.id === frameId);
        if (!frame) return;

        this.applyFrameStyles(el, frame);
        this.cleanupFrame(frameId);
        clearEl(el);
        this.buildFrameContent(el, frame);
    }

    // ===== REMOVE =====

    private removeFrameElement(frameId: string): void {
        this.cleanupFrame(frameId);
        const el = this.frameElements.get(frameId);
        if (el) { el.remove(); this.frameElements.delete(frameId); }
    }

    // ===== CLEANUP =====

    private cleanupFrame(frameId: string): void {
        if (this.intervals.has(frameId)) {
            clearInterval(this.intervals.get(frameId)!);
            this.intervals.delete(frameId);
        }
        if (this.videoElements.has(frameId)) {
            const v = this.videoElements.get(frameId)!;
            v.pause(); v.src = ''; v.load();
            this.videoElements.delete(frameId);
        }
        if (this.cameraStreams.has(frameId)) {
            const stream = this.cameraStreams.get(frameId)!;
            stream.getTracks().forEach(t => t.stop());
            this.cameraStreams.delete(frameId);
        }
    }

    private cleanupAll(): void {
        for (const [id] of this.intervals) clearInterval(this.intervals.get(id)!);
        this.intervals.clear();
        for (const [, v] of this.videoElements) { v.pause(); v.src = ''; v.load(); }
        this.videoElements.clear();
        for (const [, stream] of this.cameraStreams) {
            stream.getTracks().forEach(t => t.stop());
        }
        this.cameraStreams.clear();
        this.frameElements.clear();
    }

    // ===== URL =====

    private resolveUrl(url: string): string {
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
        return url;
    }

    // ===== DEBUG =====

    private dbg(key: string, value: string): void {
        if (!this.debug) return;
        const el = document.getElementById(`dbg-${key}`);
        if (el) el.textContent = value;
    }
}

new TelaoEngine();
