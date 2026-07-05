/**
 * SAP Sync Button Component
 * Reusable button component for syncing customers to SAP
 */

import React, { useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';

const SAPSyncButton = ({
  customerId,
  customerCode,
  customerName,
  variant = 'outline-primary',
  size = 'sm',
  showLabel = true,
  onSyncComplete,
  isAlreadySynced = false,
  needsResync = false,
}) => {
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  const treatAsSynced = isAlreadySynced && !needsResync;

  const handleSync = async () => {
    if (!customerId && !customerCode) {
      toast.error('Customer ID or Code is required for sync');
      return;
    }

    setSyncing(true);
    setSyncStatus(null);

    try {
      const response = await fetch('/api/customers/sync-to-sap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          customer_id: customerId,
          customer_code: customerCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Sync failed');
      }

      if (data.action === 'existing') {
        setSyncStatus('existing');
        toast.info(`Customer "${customerName || customerCode}" already exists in SAP`);
      } else if (data.action === 'linked') {
        setSyncStatus('success');
        toast.success(`Customer "${customerName || customerCode}" linked to existing SAP record`);
      } else if (data.action === 'created') {
        setSyncStatus('success');
        toast.success(`Customer "${customerName || customerCode}" synced to SAP successfully!`);
      } else {
        setSyncStatus('success');
        toast.success(`Customer "${customerName || customerCode}" synced successfully!`);
      }

      if (onSyncComplete) {
        onSyncComplete(data);
      }
    } catch (error) {
      console.error('SAP sync error:', error);
      setSyncStatus('error');
      toast.error(error.message || 'Failed to sync customer to SAP', { autoClose: 5000 });
    } finally {
      setSyncing(false);
    }
  };

  const getButtonContent = () => {
    if (syncing) {
      return (
        <>
          <Spinner animation="border" size="sm" className="me-2" />
          {showLabel && (needsResync ? 'Re-syncing...' : 'Syncing...')}
        </>
      );
    }

    if (needsResync) {
      return (
        <>
          <RefreshCw size={16} className="me-2" />
          {showLabel && 'Re-sync to SAP'}
        </>
      );
    }

    if (syncStatus === 'success' || treatAsSynced) {
      return (
        <>
          <CheckCircle size={16} className="me-2" />
          {showLabel && 'Synced'}
        </>
      );
    }

    if (syncStatus === 'existing') {
      return (
        <>
          <AlertCircle size={16} className="me-2" />
          {showLabel && 'Exists in SAP'}
        </>
      );
    }

    if (syncStatus === 'error') {
      return (
        <>
          <XCircle size={16} className="me-2" />
          {showLabel && 'Sync Failed'}
        </>
      );
    }

    return (
      <>
        <RefreshCw size={16} className="me-2" />
        {showLabel && 'Sync to SAP'}
      </>
    );
  };

  const getButtonVariant = () => {
    if (needsResync) return 'outline-warning';
    if (syncStatus === 'success' || treatAsSynced) return 'outline-success';
    if (syncStatus === 'existing') return 'outline-info';
    if (syncStatus === 'error') return 'outline-danger';
    return variant;
  };

  const isDisabled =
    syncing ||
    (treatAsSynced && syncStatus !== 'error') ||
    syncStatus === 'success' ||
    syncStatus === 'existing' ||
    (!customerId && !customerCode);

  return (
    <Button
      variant={getButtonVariant()}
      size={size}
      onClick={handleSync}
      disabled={isDisabled}
      className="d-inline-flex align-items-center"
      title={
        needsResync
          ? 'Customer was synced to a different SAP database — re-sync to Live'
          : treatAsSynced || syncStatus === 'success' || syncStatus === 'existing'
            ? 'Already synced to SAP'
            : customerId
              ? `Sync customer ${customerId} to SAP`
              : `Sync customer ${customerCode} to SAP`
      }
    >
      {getButtonContent()}
    </Button>
  );
};

export default SAPSyncButton;
