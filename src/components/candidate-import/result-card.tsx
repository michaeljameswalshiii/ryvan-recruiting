/**
 * AI Search Result Card with Import Button
 * Example card component showing how to use the SaveCandidateButton
 * 
 * @clientComponent
 */

"use client";

import { useState } from "react";
import { Building2, Mail, Phone, MapPin, Linkedin, ExternalLink, CheckSquare, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SaveCandidateButton } from "./save-button";

interface AIRawResult {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  skills?: string[];
  [key: string]: any;
}

interface ResultCardProps {
  result: AIRawResult;
  source?: string;
  searchQuery?: string;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  onSuccess?: (candidateId: string) => void;
}

/**
 * Single Result Card - Uses basic divs
 */
export function AIResultCard({
  result,
  source = "apollo",
  searchQuery,
  selectable = false,
  selected = false,
  onSelect,
  onSuccess,
}: ResultCardProps) {
  const displayName = result.name || `${result.first_name || ''} ${result.last_name || ''}`.trim() || 'Unknown';
  const location = result.city || result.state ? `${result.city || ''}, ${result.state || ''}` : '';

  return (
    <div className="relative border rounded-lg p-4 hover:shadow-md transition-shadow bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {selectable && (
            <button
              onClick={() => onSelect?.(!selected)}
              className="absolute top-4 left-4 p-0 bg-transparent border-none cursor-pointer"
            >
              {selected ? (
                <CheckSquare className="h-5 w-5 text-primary" />
              ) : (
                <Square className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
          )}
          <h3 className="text-lg font-semibold truncate">
            {displayName}
          </h3>
          {result.title && (
            <p className="text-sm text-muted-foreground truncate">
              {result.title}
            </p>
          )}
        </div>
        
        {/* Save as Candidate Button */}
        <div className="flex-shrink-0">
          <SaveCandidateButton
            result={result}
            source={source}
            searchQuery={searchQuery}
            onSuccess={onSuccess}
            variant="outline"
            size="sm"
            showLabel={false}
          />
        </div>
      </div>
      
      <div className="mt-3 space-y-2">
        {/* Company */}
        {result.company && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{result.company}</span>
          </div>
        )}
        
        {/* Location */}
        {location && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{location}</span>
          </div>
        )}
        
        {/* Email */}
        {result.email && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4 flex-shrink-0" />
            <a href={`mailto:${result.email}`} className="truncate hover:underline">
              {result.email}
            </a>
          </div>
        )}
        
        {/* Phone */}
        {result.phone && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-4 w-4 flex-shrink-0" />
            <a href={`tel:${result.phone}`} className="truncate hover:underline">
              {result.phone}
            </a>
          </div>
        )}
        
        {/* LinkedIn */}
        {result.linkedin_url && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Linkedin className="h-4 w-4 flex-shrink-0" />
            <a 
              href={result.linkedin_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="truncate hover:underline flex items-center gap-1"
            >
              Profile
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
        
        {/* Skills Tags */}
        {result.skills && result.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2">
            {result.skills.slice(0, 5).map((skill, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {skill}
              </Badge>
            ))}
            {result.skills.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{result.skills.length - 5}
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Results List with Bulk Selection
 */
interface ResultsListProps {
  results: AIRawResult[];
  source?: string;
  searchQuery?: string;
  onSuccess?: (candidateId: string) => void;
}

export function AIResultsList({
  results,
  source = "apollo",
  searchQuery,
  onSuccess,
}: ResultsListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map(r => r.id || r.email || `${r.first_name}-${r.last_name}`)));
    }
    setSelectAll(!selectAll);
  };

  return (
    <div className="space-y-4">
      {/* Selection Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selectAll}
            onChange={toggleSelectAll}
            className="h-4 w-4"
          />
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} of {results.length} selected
          </span>
        </div>
        
        {selectedIds.size > 0 && (
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              // Handle bulk import
              const selectedResults = results.filter(r => {
                const id = r.id || r.email || `${r.first_name}-${r.last_name}`;
                return selectedIds.has(id);
              });
              // TODO: Call bulk import here
              console.log('Bulk import:', selectedResults);
            }}
          >
            Add {selectedIds.size} to Candidates
          </Button>
        )}
      </div>
      
      {/* Results Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.map((result, index) => {
          const id = result.id || result.email || `${result.first_name}-${result.last_name}-${index}`;
          return (
            <AIResultCard
              key={id}
              result={result}
              source={source}
              searchQuery={searchQuery}
              selectable
              selected={selectedIds.has(id)}
              onSelect={(s) => toggleSelect(id)}
              onSuccess={onSuccess}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Usage Example - How to import and use in a page:
 * 
 * import { SaveCandidateButton, AIResultCard, AIResultsList } from '@/components/candidate-import';
 * 
 * // For single result:
 * <AIResultCard 
 *   result={apolloResult} 
 *   source="apollo" 
 *   searchQuery="Python developer Miami"
 *   onSuccess={(candidateId) => router.push(`/candidates/${candidateId}`)}
 * />
 * 
 * // For results list:
 * <AIResultsList 
 *   results={apolloResults}
 *   source="apollo"
 *   searchQuery="Python developer Miami"
 *   onSuccess={(candidateId) => router.push(`/candidates/${candidateId}`)}
 * />
 */
