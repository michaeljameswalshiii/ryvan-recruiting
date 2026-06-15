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

// Dashboard query keys for explicit invalidation
export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: ['dashboard-stats'] as const,
  activity: ['dashboard-activity'] as const,
};

/**
 * Get dashboard statistics
 * Combines counts from clients, leads, and pipeline
 * Includes debug logging for troubleshooting
 */
export function useDashboardStats() {
  const { data: clients = [], isLoading: loadingClients, error: clientsError } = useClients();
  const { data: leads = [], isLoading: loadingLeads, error: leadsError } = useLeads();
  const { data: pipeline = [], isLoading: loadingPipeline } = usePipeline();

// Debug logging with null safety and error details
  console.log("Dashboard Data:", {
    clientsCount: clients?.length || 0, 
    leadsCount: leads?.length || 0, 
    pipelineCount: pipeline?.length || 0,
    clientsError: clientsError?.message || null,
    leadsError: leadsError?.message || null,
    clientsLoaded: !!clients,
    leadsLoaded: !!leads
  });

// More robust stats calculation with null safety and multiple property names
  const openJobsPipeline = pipeline || [];
  const contactsCount = leads?.length || 0;
  const companiesCount = clients?.length || 0;
  
  // Count open jobs from pipeline - check stage, status, or pipeline_stage properties
  const openJobs = openJobsPipeline.filter((item: any) => {
    const stage = item.stage || item.status || item.pipeline_stage || '';
    return ['interviewing', 'interview', 'new', 'contacted', 'qualified'].includes(
      stage.toLowerCase()
    );
  }).length;
  
  // Count placements - check for hired, closed_won, placement, etc.
  const placements = openJobsPipeline.filter((item: any) => {
    const stage = item.stage || item.status || item.pipeline_stage || '';
    return ['hired', 'closed_won', 'placement', 'placed'].includes(stage.toLowerCase());
  }).length;

  const stats: DashboardStats = {
    contacts: contactsCount,
    companies: companiesCount,
    openJobs: openJobs || 0,
    placements: placements || 0,
  };

  const isLoading = loadingClients || loadingLeads || loadingPipeline;

  return {
    stats,
    isLoading,
    error: clientsError || leadsError || null,
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
