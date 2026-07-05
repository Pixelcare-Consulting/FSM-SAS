import React, { useState, useEffect, useCallback } from 'react';
import { Card, Form, Button, Row, Col, Alert, Spinner } from 'react-bootstrap';
import { getSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

const SETTINGS_ID = 'notificationSettings';

const defaultPrefs = {
  smsEnabled: false,
  pushEnabled: true,
  notifyJobAssigned: true,
  notifyJobReminder: true,
  notifyCustomerUpdates: false,
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioFromNumber: '',
};

const NotificationsSettingsPanel = () => {
  const [prefs, setPrefs] = useState(defaultPrefs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [twilioTokenStored, setTwilioTokenStored] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase client not available');

      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('id', SETTINGS_ID)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      const v = data?.value || {};
      setTwilioTokenStored(!!(v.twilioAuthToken && String(v.twilioAuthToken).length > 0));
      setPrefs({
        ...defaultPrefs,
        ...v,
        twilioAuthToken: '',
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (field, value) => {
    setPrefs((p) => ({ ...p, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase client not available');

      const { data: existing } = await supabase
        .from('settings')
        .select('value')
        .eq('id', SETTINGS_ID)
        .single();

      const prev = existing?.value || {};
      const merged = {
        ...defaultPrefs,
        ...prev,
        ...prefs,
        twilioAuthToken:
          prefs.twilioAuthToken.trim() !== ''
            ? prefs.twilioAuthToken.trim()
            : prev.twilioAuthToken || '',
      };

      const { error } = await supabase
        .from('settings')
        .upsert(
          {
            id: SETTINGS_ID,
            value: merged,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      if (error) throw error;

      setTwilioTokenStored(!!(merged.twilioAuthToken && String(merged.twilioAuthToken).length > 0));
      setPrefs((p) => ({ ...p, twilioAuthToken: '' }));
      toast.success('Notification settings saved');
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="shadow-sm border-0">
        <Card.Body className="d-flex justify-content-center py-5">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading notification settings…
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="d-flex flex-column gap-4">
      <Alert variant="light" className="border mb-0">
        <small className="text-muted">
          Toggle channels and event types for technician and customer messaging. SMS requires a Twilio
          (or compatible) configuration. Push delivery depends on your mobile app and Firebase setup.
        </small>
      </Alert>

      <Card className="shadow-sm border-0">
        <Card.Header className="bg-light fw-semibold">Channels</Card.Header>
        <Card.Body>
          <Form>
            <Row className="g-3">
              <Col md={6}>
                <Form.Check
                  type="switch"
                  id="push-enabled"
                  label="In-app / push notifications"
                  checked={prefs.pushEnabled}
                  onChange={(e) => update('pushEnabled', e.target.checked)}
                />
                <Form.Text muted>Alerts inside the dashboard and compatible worker apps.</Form.Text>
              </Col>
              <Col md={6}>
                <Form.Check
                  type="switch"
                  id="sms-enabled"
                  label="SMS (Twilio)"
                  checked={prefs.smsEnabled}
                  onChange={(e) => update('smsEnabled', e.target.checked)}
                />
                <Form.Text muted>Send text messages for selected events.</Form.Text>
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>

      <Card className="shadow-sm border-0">
        <Card.Header className="bg-light fw-semibold">Events</Card.Header>
        <Card.Body>
          <Form>
            <Row className="g-3">
              <Col md={4}>
                <Form.Check
                  type="switch"
                  id="ev-assigned"
                  label="Job assigned to technician"
                  checked={prefs.notifyJobAssigned}
                  onChange={(e) => update('notifyJobAssigned', e.target.checked)}
                />
              </Col>
              <Col md={4}>
                <Form.Check
                  type="switch"
                  id="ev-reminder"
                  label="Job reminders"
                  checked={prefs.notifyJobReminder}
                  onChange={(e) => update('notifyJobReminder', e.target.checked)}
                />
              </Col>
              <Col md={4}>
                <Form.Check
                  type="switch"
                  id="ev-customer"
                  label="Customer status updates"
                  checked={prefs.notifyCustomerUpdates}
                  onChange={(e) => update('notifyCustomerUpdates', e.target.checked)}
                />
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>

      {prefs.smsEnabled && (
        <Card className="shadow-sm border-0">
          <Card.Header className="bg-light fw-semibold">SMS provider (Twilio)</Card.Header>
          <Card.Body>
            <Alert variant="warning" className="py-2 small mb-3">
              Store API credentials only if your Supabase <code>settings</code> row is protected by RLS
              appropriate for your security requirements.
            </Alert>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Account SID</Form.Label>
                  <Form.Control
                    type="text"
                    autoComplete="off"
                    value={prefs.twilioAccountSid}
                    onChange={(e) => update('twilioAccountSid', e.target.value)}
                    placeholder="ACxxxxxxxx…"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Auth token</Form.Label>
                  <Form.Control
                    type="password"
                    autoComplete="new-password"
                    value={prefs.twilioAuthToken}
                    onChange={(e) => update('twilioAuthToken', e.target.value)}
                    placeholder={twilioTokenStored ? '•••••••• (enter new to replace)' : 'Your auth token'}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>From number (E.164)</Form.Label>
                  <Form.Control
                    type="text"
                    value={prefs.twilioFromNumber}
                    onChange={(e) => update('twilioFromNumber', e.target.value)}
                    placeholder="+6512345678"
                  />
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      )}

      <div>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Saving…
            </>
          ) : (
            'Save notification settings'
          )}
        </Button>
      </div>
    </div>
  );
};

export default NotificationsSettingsPanel;
