/**
 * @file types.ts
 * @description Única fonte de verdade para o formato dos dados do Compositor Pro v2.
 */

export type FrameType =
  | 'holyrics'
  | 'video'
  | 'imagem'
  | 'camera'
  | 'cor'
  | 'relogio'
  | 'contador'
  | 'texto'
  | 'url';

export type TransitionType = 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom' | 'blur' | 'wipe' | 'none';

export interface Posicao {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface Resolution {
  width: number;
  height: number;
}

export interface TransitionConfig {
  tipo: TransitionType;
  duracao: number; // ms
}

export interface BaseConfig {
  borderRadius?: number;
  opacity?: number;
  borderColor?: string;
  borderWidth?: number;
}

export interface HolyricsConfig extends BaseConfig {
  endpoint: 'widescreen' | 'text' | 'standard';
}

export interface VideoConfig extends BaseConfig {
  loop: boolean;
  mudo: boolean;
  autoplay: boolean;
  ajuste?: string;
}

export interface ImagemConfig extends BaseConfig {
  fitMode: 'cover' | 'contain' | 'fill';
  ajuste?: string;
}

export interface CameraConfig extends BaseConfig {
  deviceId?: string;       // id do dispositivo selecionado
  deviceLabel?: string;    // label para exibição
}

export interface RelogioConfig extends BaseConfig {
  formato: 'HH:mm:ss' | 'HH:mm';
  formato24h?: boolean;
  fontSize?: number;
  corTexto: string;
  corFundo?: string;
}

export interface ContadorConfig extends BaseConfig {
  modo: 'regressivo' | 'progressivo';
  minutosIniciais: number;
  rodando: boolean;
  horaAlvo?: string;
  fontSize?: number;
  corTexto: string;
  corFundo?: string;
}

export interface TextoConfig extends BaseConfig {
  conteudo: string;
  cor: string;
  corTexto?: string;
  corFundo?: string;
  fontSize: number;
  fontFamily: string;
  textAlign: 'left' | 'center' | 'right';
  alinhamento?: string;
  negrito?: boolean;
  italico?: boolean;
}

export type FrameConfig =
  | HolyricsConfig
  | VideoConfig
  | ImagemConfig
  | CameraConfig
  | RelogioConfig
  | ContadorConfig
  | TextoConfig
  | BaseConfig;

export interface Frame {
  id: string;
  tipo: FrameType;
  nome: string;
  fonte: string;
  posicao: Posicao;
  camada: number;
  visivel: boolean;
  bloqueado?: boolean;
  config: FrameConfig;
}

export interface Scene {
  id: string;
  nome: string;
  frames: Frame[];
  transicao?: TransitionConfig;
}

export interface Project {
  nome: string;
  data: string;
  resolucao: Resolution;
  cenas: Scene[];
  midias: string[];
  transicaoPadrao?: TransitionConfig;
}

export type WebSocketMessageType =
  | 'init'
  | 'cena'
  | 'frame'
  | 'frame_delete'
  | 'visibilidade'
  | 'layout'
  | 'resolucao'
  | 'transicao'
  | 'ping'
  | 'pong'
  | 'auth'
  | 'error';

export interface WebSocketMessage {
  tipo: WebSocketMessageType;
  payload: any;
  timestamp?: number;
}

export interface AuthMessage extends WebSocketMessage {
  tipo: 'auth';
  payload: { pin: string };
}

export interface InitMessage extends WebSocketMessage {
  tipo: 'init';
  payload: { cenas: Scene[]; cenaAtivaId: string; resolucao: Resolution; transicao?: TransitionConfig };
}

export interface CenaMessage extends WebSocketMessage {
  tipo: 'cena';
  payload: Scene;
}

export interface FrameUpdateMessage extends WebSocketMessage {
  tipo: 'frame';
  payload: { frameId: string; dados: Partial<Frame> };
}

export interface VisibilidadeMessage extends WebSocketMessage {
  tipo: 'visibilidade';
  payload: { frameId: string; visivel: boolean };
}
