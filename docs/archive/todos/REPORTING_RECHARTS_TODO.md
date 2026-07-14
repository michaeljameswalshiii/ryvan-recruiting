# Reporting Dashboard Recharts Implementation TODO

## Implementation Status: IN PROGRESS

## Task Breakdown
- [ ] Step 1: Update src/lib/aws/reporting.ts with complete data functions
  - [ ] getReportingStats() - main function
  - [ ] getPipelineStats() - candidates by stage
  - [ ] getCandidatesOverTime() - time series
  - [ ] getSources() - source breakdown
  - [ ] getRecentEvents() - activity feed
- [ ] Step 2: Create src/app/dashboard/reporting/charts.tsx
  - [ ] KPICards
  - [ ] PipelineOverviewTab
  - [ ] PipelineFunnelChart
  - [ ] CandidatesOverTimeChart
  - [ ] StageDistributionChart
  - [ ] SourceBreakdownChart
  - [ ] RecentActivityTable
- [ ] Step 3: Test and verify

## Data Assumptions
- Leads table: status, source, created_at fields
- Events table: eventType, createdAt, candidateId fields
- Period filter: 30 days default

## Files to Create/Modify
1. src/lib/aws/reporting.ts - REPLACE with complete functions
2. src/app/dashboard/reporting/charts.tsx - CREATE NEW
