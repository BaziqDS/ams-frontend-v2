"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export type CapabilityLevel = "view" | "manage" | "full";
export type ModuleDependencies = Record<string, Partial<Record<CapabilityLevel, string[]>>>;

export interface InspectionStagesData {
  available: string[];
  held: string[];
}

export interface CapabilitiesResponse {
  modules: Record<string, CapabilityLevel | null>;
  is_superuser: boolean;
  manifest: Record<string, CapabilityLevel[]>;
  dependencies?: ModuleDependencies;
  inspection_stages?: InspectionStagesData;
}

interface CapabilitiesContextValue {
  modules: Record<string, CapabilityLevel | null>;
  manifest: Record<string, CapabilityLevel[]>;
  dependencies: ModuleDependencies;
  inspectionStages: InspectionStagesData;
  isSuperuser: boolean;
  isLoading: boolean;
  can: (module: string, level?: CapabilityLevel) => boolean;
  hasInspectionStage: (stage: string) => boolean;
  refresh: () => Promise<void>;
}

const LEVEL_RANK: Record<CapabilityLevel, number> = { view: 1, manage: 2, full: 3 };

const CapabilitiesContext = createContext<CapabilitiesContextValue | null>(null);

const EMPTY_STAGES: InspectionStagesData = { available: [], held: [] };

export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [modules, setModules] = useState<Record<string, CapabilityLevel | null>>({});
  const [manifest, setManifest] = useState<Record<string, CapabilityLevel[]>>({});
  const [dependencies, setDependencies] = useState<ModuleDependencies>({});
  const [inspectionStages, setInspectionStages] = useState<InspectionStagesData>(EMPTY_STAGES);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<CapabilitiesResponse>("/auth/capabilities/");
      setModules(res.modules ?? {});
      setManifest(res.manifest ?? {});
      setDependencies(res.dependencies ?? {});
      setInspectionStages(res.inspection_stages ?? EMPTY_STAGES);
      setIsSuperuser(!!res.is_superuser);
    } catch {
      setModules({});
      setManifest({});
      setDependencies({});
      setInspectionStages(EMPTY_STAGES);
      setIsSuperuser(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setModules({});
      setManifest({});
      setDependencies({});
      setInspectionStages(EMPTY_STAGES);
      setIsSuperuser(false);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    load();
  }, [isAuthenticated, load]);

  const can = useCallback(
    (module: string, level: CapabilityLevel = "view") => {
      if (isSuperuser) return true;
      const held = modules[module];
      if (!held) return false;
      return LEVEL_RANK[held] >= LEVEL_RANK[level];
    },
    [modules, isSuperuser],
  );

  const hasInspectionStage = useCallback(
    (stage: string) => {
      if (isSuperuser) return true;
      return inspectionStages.held.includes(stage);
    },
    [inspectionStages, isSuperuser],
  );

  const value = useMemo<CapabilitiesContextValue>(
    () => ({ modules, manifest, dependencies, inspectionStages, isSuperuser, isLoading, can, hasInspectionStage, refresh: load }),
    [modules, manifest, dependencies, inspectionStages, isSuperuser, isLoading, can, hasInspectionStage, load],
  );

  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities() {
  const ctx = useContext(CapabilitiesContext);
  if (!ctx) throw new Error("useCapabilities must be used inside <CapabilitiesProvider>");
  return ctx;
}

export function useCan(module: string, level: CapabilityLevel = "view") {
  const { can } = useCapabilities();
  return can(module, level);
}
