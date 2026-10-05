"use server";

import { db } from "@/lib/db";
import { resourceTypeConfigs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { RESOURCE_TYPES, type ResourceType } from "@/lib/constants";

// Ensure RESOURCE_TYPES is re-exported (it's a const, so typeof gives the type).
// The `type ResourceType` import above is the typeof RESOURCE_TYPES[number].

/** A resource type definition merged from DB override (if present) with the
 *  constants fallback. Admins can override label/fieldLabel/color/icon per
 *  type; missing types fall back to RESOURCE_TYPES. */
export interface MergedResourceType extends Omit<ResourceType, "color"> {
  color: string;
  icon: string;
}

/** All active resource type definitions, in display order. DB rows override
 *  the constants for matching `value`s; constants provide the full fallback
 *  set so the upload form always has every type even before any admin row
 *  exists. DB rows with isActive = false are dropped (soft-delete). */
export async function getAllResourceTypes(): Promise<MergedResourceType[]> {
  const dbRows = await db
    .select()
    .from(resourceTypeConfigs)
    .where(eq(resourceTypeConfigs.isActive, true))
    .orderBy(desc(resourceTypeConfigs.sortOrder), desc(resourceTypeConfigs.createdAt));

  const dbMap = new Map(dbRows.map((r) => [r.value, r]));

  return RESOURCE_TYPES.map((def) => {
    const override = dbMap.get(def.value);
    return {
      value: def.value,
      label: override?.label ?? def.label,
      fieldLabel: override?.fieldLabel ?? def.fieldLabel,
      color: override?.color ?? def.color,
      icon: override?.icon ?? def.icon,
    };
  });
}

/** The merged config for a single type. Falls back to the constants default
 *  when no admin row exists for that value. */
export async function getTypeConfig(type: string): Promise<MergedResourceType> {
  const dbRow = await db.query.resourceTypeConfigs.findFirst({
    where: eq(resourceTypeConfigs.value, type),
  });
  const fallback = RESOURCE_TYPES.find((t) => t.value === type);
  if (!fallback) {
    // Unknown type — fall back to "other".
    const other = RESOURCE_TYPES.find((t) => t.value === "other")!;
    return {
      value: type,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      fieldLabel: other.fieldLabel,
      color: dbRow?.color ?? other.color,
      icon: dbRow?.icon ?? other.icon,
    };
  }
  return {
    value: fallback.value,
    label: dbRow?.label ?? fallback.label,
    fieldLabel: dbRow?.fieldLabel ?? fallback.fieldLabel,
    color: dbRow?.color ?? fallback.color,
    icon: dbRow?.icon ?? fallback.icon,
  };
}

/** Ordered list of all type values (for <select options>). */
export async function getAllTypeValues(): Promise<string[]> {
  const types = await getAllResourceTypes();
  return types.map((t) => t.value);
}
