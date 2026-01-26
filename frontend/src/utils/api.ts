import axios from 'axios';
import type { ProjectionInput, ProjectionResult, GameListResponse, RawGameData } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getAvailableGames = async (): Promise<GameListResponse> => {
  const response = await api.get('/games');
  return response.data;
};

export const getGameData = async (metric: string, gameName: string) => {
  const response = await api.get(`/games/${metric}/${encodeURIComponent(gameName)}`);
  return response.data;
};

export const getDefaultConfig = async () => {
  const response = await api.get('/config');
  return response.data;
};

export const calculateProjection = async (input: ProjectionInput): Promise<ProjectionResult> => {
  const response = await api.post('/projection', input);
  return response.data;
};

export const getRawData = async (): Promise<RawGameData> => {
  const response = await api.get('/raw-data');
  return response.data;
};

export const uploadGameData = async (file: File, metric: string) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/raw-data/upload?metric=${metric}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const deleteGameData = async (metric: string, gameName: string) => {
  const response = await api.delete(`/raw-data/${metric}/${encodeURIComponent(gameName)}`);
  return response.data;
};

export default api;
