import { state } from './state.js';

interface HolyricsConfig {
    url: string;
    token: string;
    habilitado: boolean;
    intervaloPolling: number;
}

/**
 * Cliente para integração com a API Server do Holyrics.
 */
export class HolyricsClient {
    private config: HolyricsConfig;
    private timer: NodeJS.Timeout | null = null;
    private triggers: Record<string, string> = {
        '*.pptx': 'pregacao',
        '*.ppt': 'pregacao'
    };

    constructor(config: HolyricsConfig) {
        this.config = config;
        if (this.config.habilitado) {
            this.startPolling();
        }
    }

    private startPolling() {
        this.timer = setInterval(() => this.poll(), this.config.intervaloPolling);
    }

    private async poll() {
        try {
            // Exemplo de chamada: GetCurrentPresentation
            // const response = await fetch(`${this.config.url}/api/presentation/current`, {
            //     headers: { 'Authorization': `Bearer ${this.config.token}` }
            // });
            // const data = await response.json();
            // this.checkTriggers(data.name);
        } catch (e) {
            console.error('[Holyrics] Erro no polling:', e);
        }
    }

    private checkTriggers(contentName: string) {
        if (!contentName) return;

        for (const [pattern, sceneId] of Object.entries(this.triggers)) {
            const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i');
            if (regex.test(contentName)) {
                console.log(`[Holyrics] Gatilho ativado: ${contentName} -> Cena ${sceneId}`);
                state.setCenaAtivaId(sceneId);
                // Notificar via broadcast... (precisa de acesso à função ou evento)
            }
        }
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
    }
}
