/**
 * Events Index Barrel File
 * 
 * Central export point for all event-related modules
 * 
 * @serverOnly
 */

// Core types (no 'use server' needed for types)
export * from './types';

// Server functions (these have 'use server' internally)
export * from './candidate-events';
export * from './company-events';
