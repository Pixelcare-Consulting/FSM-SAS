import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  fetchSettingsBundleFromApi,
  invalidateSettingsBundleCache,
} from '../utils/settingsBundleCache';
import {
  parseFollowUpStatuses,
  parseFollowUpTypes,
  parseJobStatusLegendItems,
  parseJobStatusTypes,
} from '../lib/settings/settingsBundleHelpers';

const SettingsContext = createContext();

const INITIAL_STATE = {
  isLoading: true,
  companyInfo: null,
  followUp: null,
  jobStatuses: null,
  error: null,
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(INITIAL_STATE);

  const applyBundle = useCallback((bundle) => {
    setSettings({
      isLoading: false,
      companyInfo: bundle?.companyInfo ?? null,
      followUp: bundle?.followUp ?? null,
      jobStatuses: bundle?.jobStatuses ?? null,
      error: null,
    });
  }, []);

  const loadSettings = useCallback(async ({ force = false } = {}) => {
    try {
      setSettings((prev) => ({ ...prev, isLoading: prev.companyInfo == null && prev.followUp == null, error: null }));
      const bundle = await fetchSettingsBundleFromApi({ force });
      applyBundle(bundle);
    } catch (error) {
      console.error('Error fetching settings bundle:', error);
      setSettings((prev) => ({
        ...prev,
        isLoading: false,
        error: error?.message || 'Failed to load settings',
      }));
    }
  }, [applyBundle]);

  const refreshSettings = useCallback(async () => {
    invalidateSettingsBundleCache();
    await loadSettings({ force: true });
  }, [loadSettings]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const derived = useMemo(
    () => ({
      followUpTypes: parseFollowUpTypes(settings.followUp),
      followUpStatuses: parseFollowUpStatuses(settings.followUp),
      jobStatusTypes: parseJobStatusTypes(settings.jobStatuses),
      jobStatusLegendItems: parseJobStatusLegendItems(settings.jobStatuses),
    }),
    [settings.followUp, settings.jobStatuses]
  );

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      refreshSettings,
      ...derived,
    }),
    [settings, refreshSettings, derived]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
