import axios from 'axios';
import type { ProjectionInput, ProjectionResult, GameListResponse } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getAvailableGames = async (): Promise<GameListResponse> => {
  const response = await api.get('/games');
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

export const getGameData = async (metric: string, gameName: string) => {
  const response = await api.get(`/games/${metric}/${gameName}`);
  return response.data;
};

export const getRawData = async () => {
  const response = await api.get('/raw-data');
  return response.data;
};

export const getGamesMetadata = async (): Promise<Record<string, {
  release_date: string;
  genre: string;
  platform: string;
  publisher: string;
  region: string;
}>> => {
  const response = await api.get('/games/metadata');
  return response.data;
};

// AI Insight APIs
export const getAIInsight = async (
  projectionSummary: any, 
  analysisType: string = 'general'
): Promise<{ status: string; analysis_type: string; insight: string; ai_model: string }> => {
  const response = await api.post('/ai/insight', {
    projection_summary: projectionSummary,
    analysis_type: analysisType
  });
  return response.data;
};

export const getAIStatus = async (): Promise<{ enabled: boolean; model: string; available_types: string[] }> => {
  const response = await api.get('/ai/status');
  return response.data;
};

export default api;
