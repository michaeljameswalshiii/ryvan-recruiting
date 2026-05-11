/**
 * TanStack Query Hooks for Dashboard Stats
 * Aggregates data for the main dashboard view
 * 
 * @clientOnly
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useClients } from './query-client';
import { useLeads } from './query-lead';
import { usePipeline } from './query-pipeline';

/**
 * Dashboard stats from all data sources
 */
export interface DashboardStats {
  contacts: number;
  companies: number;
  openJobs: number;
  placements: number;
}

/**
 * Get dashboard statistics
 * Combines counts from clients, leads, and pipeline
 */
export function useDashboardStats() {
  const { data: clients = [], isLoading: loadingClients } = useClients();
  const { data: leads = [], isLoading: loadingLeads } = useLeads();
  const { data: pipeline = [], isLoading: loadingPipeline } = usePipeline();

  const stats: DashboardStats = {
    contacts: leads.length,
    companies: clients.length,
    openJobs: pipeline.filter((item: any) => item.stage === 'interviewing').length,
    placements: pipeline.filter((item: any) => item.stage === 'hired').length,
  };

  const isLoading = loadingClients || loadingLeads || loadingPipeline;

  return {
    stats,
    isLoading,
    error: null,
  };
}

/**
 * Recent activity from all data sources
 * Combines leads and pipeline for activity feed
 */
export function useRecentActivity() {
  const { data: leads = [], isLoading: loadingLeads } = useLeads();
  const { data: pipeline = [], isLoading: loadingPipeline } = usePipeline();

  // Combine and sort by most recent
  const activity = [
    ...leads.slice(0, 5).map((lead: any) => ({
      id: lead.id,
      type: 'lead' as const,
      name: lead.name,
      company: lead.company,
      action: 'added',
      date: lead.created_at || lead.createdAt,
    })),
    ...pipeline.slice(0, 5).map((item: any) => ({
      id: item.id,
      type: 'pipeline' as const,
      name: item.name,
      company: item.company,
      action: item.stage,
      date: item.updated_at || item.updatedAt,
    })),
  ].sort((a, b) => {
    const dateA = new Date(a.date || 0).getTime();
    const dateB = new Date(b.date || 0).getTime();
    return dateB - dateA;
  }).slice(0, 10);

  const isLoading = loadingLeads || loadingPipeline;

  return {
    activity,
    isLoading,
  };
}
