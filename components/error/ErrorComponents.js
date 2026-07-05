/**
 * User-Friendly Error Components for SAS FSM Portal
 * Provides consistent error display components with retry functionality
 */

import React from 'react';
import { Alert, Button, Card, Modal, Spinner } from 'react-bootstrap';
import { ERROR_TYPES, ERROR_SEVERITY } from '../../lib/utils/errorHandler';

/**
 * Generic Error Alert Component
 */
export const ErrorAlert = ({ 
  error, 
  onRetry = null, 
  onDismiss = null,
  showDetails = false,
  className = ''
}) => {
  const getVariant = (severity) => {
    switch (severity) {
      case ERROR_SEVERITY.LOW:
        return 'info';
      case ERROR_SEVERITY.MEDIUM:
        return 'warning';
      case ERROR_SEVERITY.HIGH:
      case ERROR_SEVERITY.CRITICAL:
        return 'danger';
      default:
        return 'warning';
    }
  };

  const getIcon = (type) => {
    const icons = {
      [ERROR_TYPES.NETWORK_ERROR]: 'fas fa-wifi',
      [ERROR_TYPES.TIMEOUT_ERROR]: 'fas fa-clock',
      [ERROR_TYPES.CONNECTION_ERROR]: 'fas fa-unlink',
      [ERROR_TYPES.AUTH_ERROR]: 'fas fa-lock',
      [ERROR_TYPES.SESSION_EXPIRED]: 'fas fa-hourglass-end',
      [ERROR_TYPES.UNAUTHORIZED]: 'fas fa-ban',
      [ERROR_TYPES.VALIDATION_ERROR]: 'fas fa-exclamation-triangle',
      [ERROR_TYPES.NOT_FOUND]: 'fas fa-search',
      [ERROR_TYPES.SERVER_ERROR]: 'fas fa-server',
      [ERROR_TYPES.SAP_CONNECTION_ERROR]: 'fas fa-database',
      [ERROR_TYPES.SAP_SERVICE_ERROR]: 'fas fa-cogs',
      [ERROR_TYPES.SAP_DATA_ERROR]: 'fas fa-file-excel',
      [ERROR_TYPES.DATA_PROCESSING_ERROR]: 'fas fa-microchip',
      [ERROR_TYPES.CACHE_ERROR]: 'fas fa-memory',
      [ERROR_TYPES.UNKNOWN_ERROR]: 'fas fa-question-circle'
    };
    return icons[type] || 'fas fa-exclamation-circle';
  };

  return (
    <Alert 
      variant={getVariant(error.severity)} 
      dismissible={!!onDismiss}
      onClose={onDismiss}
      className={className}
    >
      <div className="d-flex align-items-start">
        <i className={`${getIcon(error.type)} me-3 mt-1`}></i>
        <div className="flex-grow-1">
          <Alert.Heading className="h6 mb-2">
            {error.userMessage || error.message}
          </Alert.Heading>
          
          {showDetails && (
            <div className="small text-muted mb-2">
              <strong>Error Type:</strong> {error.type}<br/>
              <strong>Time:</strong> {new Date(error.timestamp).toLocaleString()}
              {error.code && (
                <>
                  <br/><strong>Code:</strong> {error.code}
                </>
              )}
            </div>
          )}

          <div className="d-flex gap-2 mt-2">
            {onRetry && error.retryable && (
              <Button variant="outline-primary" size="sm" onClick={onRetry}>
                <i className="fas fa-redo me-2"></i>
                Try Again
              </Button>
            )}
            
            {error.type === ERROR_TYPES.SESSION_EXPIRED && (
              <Button 
                variant="primary" 
                size="sm" 
                onClick={() => window.location.href = '/sign-in'}
              >
                <i className="fas fa-sign-in-alt me-2"></i>
                Sign In
              </Button>
            )}
          </div>
        </div>
      </div>
    </Alert>
  );
};

/**
 * Error Boundary Component
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Report error if handler is available
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error);
      }

      return (
        <ErrorCard
          title="Something went wrong"
          message="An unexpected error occurred. Please refresh the page or try again later."
          onRetry={() => window.location.reload()}
          showRetry={true}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Error Card Component
 */
export const ErrorCard = ({ 
  title = "Error", 
  message, 
  error = null,
  onRetry = null,
  showRetry = false,
  showDetails = false,
  className = ''
}) => (
  <Card className={`text-center ${className}`}>
    <Card.Body className="py-5">
      <div className="mb-4">
        <i className="fas fa-exclamation-triangle text-warning" style={{ fontSize: '3rem' }}></i>
      </div>
      
      <Card.Title className="h4 mb-3">{title}</Card.Title>
      <Card.Text className="text-muted mb-4">
        {message || (error?.userMessage || error?.message) || 'An unexpected error occurred.'}
      </Card.Text>

      {showDetails && error && (
        <div className="small text-muted mb-4 text-start">
          <strong>Error Details:</strong><br/>
          Type: {error.type}<br/>
          Time: {new Date(error.timestamp).toLocaleString()}
          {error.code && <><br/>Code: {error.code}</>}
        </div>
      )}

      <div className="d-flex justify-content-center gap-2">
        {showRetry && onRetry && (
          <Button variant="primary" onClick={onRetry}>
            <i className="fas fa-redo me-2"></i>
            Try Again
          </Button>
        )}
        
        <Button 
          variant="outline-secondary" 
          onClick={() => window.location.reload()}
        >
          <i className="fas fa-refresh me-2"></i>
          Refresh Page
        </Button>
      </div>
    </Card.Body>
  </Card>
);

/**
 * Loading Error Component (for failed data loading)
 */
export const LoadingError = ({ 
  message = "Failed to load data", 
  onRetry = null,
  isRetrying = false 
}) => (
  <div className="text-center py-4">
    <div className="mb-3">
      <i className="fas fa-exclamation-circle text-danger" style={{ fontSize: '2rem' }}></i>
    </div>
    
    <h6 className="mb-2">{message}</h6>
    <p className="text-muted small mb-3">
      Please check your connection and try again.
    </p>

    {onRetry && (
      <Button 
        variant="outline-primary" 
        size="sm" 
        onClick={onRetry}
        disabled={isRetrying}
      >
        {isRetrying ? (
          <>
            <Spinner animation="border" size="sm" className="me-2" />
            Retrying...
          </>
        ) : (
          <>
            <i className="fas fa-redo me-2"></i>
            Try Again
          </>
        )}
      </Button>
    )}
  </div>
);

/**
 * Network Error Component
 */
export const NetworkError = ({ onRetry = null }) => (
  <div className="text-center py-5">
    <div className="mb-4">
      <i className="fas fa-wifi text-muted" style={{ fontSize: '4rem' }}></i>
      <div className="position-relative d-inline-block">
        <i className="fas fa-times text-danger position-absolute" 
           style={{ fontSize: '1.5rem', top: '-10px', right: '-10px' }}></i>
      </div>
    </div>
    
    <h4 className="mb-3">Connection Problem</h4>
    <p className="text-muted mb-4">
      Unable to connect to the server. Please check your internet connection and try again.
    </p>

    <div className="d-flex justify-content-center gap-2">
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          <i className="fas fa-redo me-2"></i>
          Try Again
        </Button>
      )}
      
      <Button 
        variant="outline-secondary" 
        onClick={() => window.location.reload()}
      >
        <i className="fas fa-refresh me-2"></i>
        Refresh
      </Button>
    </div>
  </div>
);

/**
 * SAP Connection Error Component
 */
export const SapConnectionError = ({ onRetry = null, limitedMode = false }) => (
  <Alert variant="warning" className="mb-4">
    <div className="d-flex align-items-start">
      <i className="fas fa-database me-3 mt-1"></i>
      <div className="flex-grow-1">
        <Alert.Heading className="h6 mb-2">
          SAP Connection Issue
        </Alert.Heading>
        
        <p className="mb-2">
          {limitedMode 
            ? "SAP system is temporarily unavailable. You can continue with limited functionality."
            : "Unable to connect to SAP system. Some features may not be available."
          }
        </p>

        <div className="d-flex gap-2">
          {onRetry && (
            <Button variant="outline-warning" size="sm" onClick={onRetry}>
              <i className="fas fa-redo me-2"></i>
              Retry Connection
            </Button>
          )}
          
          {limitedMode && (
            <Button variant="warning" size="sm">
              <i className="fas fa-info-circle me-2"></i>
              Continue in Limited Mode
            </Button>
          )}
        </div>
      </div>
    </div>
  </Alert>
);

/**
 * Error Modal Component
 */
export const ErrorModal = ({ 
  show, 
  onHide, 
  error, 
  title = "Error",
  onRetry = null 
}) => (
  <Modal show={show} onHide={onHide} centered>
    <Modal.Header closeButton>
      <Modal.Title>
        <i className="fas fa-exclamation-triangle text-warning me-2"></i>
        {title}
      </Modal.Title>
    </Modal.Header>
    
    <Modal.Body>
      <p>{error?.userMessage || error?.message || 'An unexpected error occurred.'}</p>
      
      {error && (
        <div className="small text-muted">
          <strong>Error Type:</strong> {error.type}<br/>
          <strong>Time:</strong> {new Date(error.timestamp).toLocaleString()}
          {error.code && (
            <>
              <br/><strong>Code:</strong> {error.code}
            </>
          )}
        </div>
      )}
    </Modal.Body>
    
    <Modal.Footer>
      <Button variant="secondary" onClick={onHide}>
        Close
      </Button>
      
      {onRetry && error?.retryable && (
        <Button variant="primary" onClick={onRetry}>
          <i className="fas fa-redo me-2"></i>
          Try Again
        </Button>
      )}
    </Modal.Footer>
  </Modal>
);

/**
 * Inline Error Component (for form fields, etc.)
 */
export const InlineError = ({ 
  message, 
  className = '',
  icon = 'fas fa-exclamation-circle' 
}) => (
  <div className={`text-danger small mt-1 ${className}`}>
    <i className={`${icon} me-1`}></i>
    {message}
  </div>
);

export default {
  ErrorAlert,
  ErrorBoundary,
  ErrorCard,
  LoadingError,
  NetworkError,
  SapConnectionError,
  ErrorModal,
  InlineError
};
