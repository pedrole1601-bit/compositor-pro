import { Scene, Resolution } from '../shared/types.js';

/**
 * Estado global do servidor (em memória).
 * Em uma implementação futura, isso pode ser persistido em arquivo JSON.
 */
export class ServerState {
  private cenas: Scene[] = [
    {
      id: 'default',
      nome: 'Cena Inicial',
      frames: []
    }
  ];
  private cenaAtivaId: string = 'default';
  private resolucao: Resolution = { width: 1920, height: 1080 };

  getCenas() {
    return this.cenas;
  }

  setCenas(novasCenas: Scene[]) {
    this.cenas = novasCenas;
  }

  getCenaAtivaId() {
    return this.cenaAtivaId;
  }

  setCenaAtivaId(id: string) {
    if (this.cenas.find(c => c.id === id)) {
      this.cenaAtivaId = id;
      return true;
    }
    return false;
  }

  getCenaAtiva() {
    return this.cenas.find(c => c.id === this.cenaAtivaId);
  }

  getResolucao() {
    return this.resolucao;
  }

  setResolucao(res: Resolution) {
    this.resolucao = res;
  }

  getState() {
    return {
      cenas: this.cenas,
      cenaAtivaId: this.cenaAtivaId,
      resolucao: this.resolucao
    };
  }
}

export const state = new ServerState();
