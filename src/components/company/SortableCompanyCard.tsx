/**
 * Sortable Company Card Component
 * Drag-and-drop enabled card for Kanban view
 * Includes Edit and Delete actions
 */

"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { Building2, MapPin, Users, Globe, Linkedin, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Company {
  id: string;
  name: string;
  domain?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  employee_count?: number;
  industry?: string;
  revenue?: string;
  description?: string;
  status?: string;
}

interface SortableCompanyCardProps {
  company: Company;
  onEdit: (company: Company) => void;
  onDelete: (companyId: string) => void;
}

// Pipeline stages for label lookup
const pipelineStages = [
  { id: "identification", label: "Identification" },
  { id: "outreach", label: "Attempted Outreach" },
  { id: "conversation", label: "Conversation" },
  { id: "presented", label: "Candidate Presented" },
  { id: "interview", label: "Interview" },
  { id: "accept", label: "Accept" },
  { id: "rejected", label: "Rejected" },
];

export default function SortableCompanyCard({
  company,
  onEdit,
  onDelete,
}: SortableCompanyCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: company.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Get stage label from status
  const stageLabel =
    pipelineStages.find((s) => s.id === company.status)?.label || company.status || "New";

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${company.name}"?`)) {
      onDelete(company.id);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit(company);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 rounded-lg border border-border bg-background hover:border-primary transition-colors ${
        isDragging ? "opacity-50 ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Link 
            href={`/dashboard/companies/${company.id}`}
            className="font-medium text-sm truncate hover:text-primary transition-colors"
          >
            {company.name}
          </Link>
          {company.industry && (
            <p className="text-xs text-muted-foreground truncate">
              {company.industry}
            </p>
          )}
          {(company.city || company.state) && (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {company.city}{company.state ? `, ${company.state}` : ''}
            </p>
          )}
        </div>
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
          title="Drag to move"
        >
          <Building2 className="h-4 w-4" />
        </button>
      </div>

      {/* Status Badge */}
      <Badge
        variant="outline"
        className="mt-2 text-xs capitalize"
      >
        {stageLabel}
      </Badge>

      {/* Action buttons row */}
      <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border">
        {/* Edit button */}
        <button
          onClick={handleEditClick}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          title="Edit Company"
        >
          <Pencil className="h-3 w-3" />
          <span>Edit</span>
        </button>

        {/* Delete button */}
        <button
          onClick={handleDeleteClick}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          title="Delete Company"
        >
          <Trash2 className="h-3 w-3" />
          <span>Delete</span>
        </button>

        {/* Links */}
        {company.linkedin_url && (
          <a
            href={company.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            <Linkedin className="h-3 w-3" />
          </a>
        )}
        {company.domain && (
          <a
            href={`https://${company.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            <Globe className="h-3 w-3" />
          </a>
        )}
        {company.employee_count && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {company.employee_count}
          </span>
        )}
        {company.revenue && (
          <span className="text-xs text-primary">
            {company.revenue}
          </span>
        )}
      </div>
    </div>
  );
}
