import React from 'react';
import { Spinner, Alert, Button, ProgressBar } from 'react-bootstrap';

/**
 * Contextual Loading Indicators for SAS FSM Portal
 * Provides specific loading states with context about what's being fetched
 */

// Base Loading Spinner with Context
export const ContextualSpinner = ({ 
  message = 'Loading...', 
  size = 'md', 
  variant = 'primary',
  showIcon = true 
}) => {
  const sizeMap = {
    sm: { width: '1rem', height: '1rem' },
    md: { width: '2rem', height: '2rem' },
    lg: { width: '3rem', height: '3rem' }
  };

  return (
    <div className="d-flex flex-column align-items-center justify-content-center py-4">
      <Spinner 
        animation="border" 
        variant={variant}
        style={sizeMap[size]}
        className="mb-2"
      />
      <div className="text-muted text-center">
        {showIcon && <i className="fas fa-clock me-2"></i>}
        {message}
      </div>
    </div>
  );
};

// Customer Data Loading States
export const CustomerLoadingStates = {
  // Loading customer list
  CustomerList: ({ count = 'customers' }) => (
    <ContextualSpinner 
      message={`Fetching ${count}...`}
      variant="primary"
      size="md"
    />
  ),

  // Loading individual customer details
  CustomerDetails: ({ customerName = 'customer details' }) => (
    <ContextualSpinner 
      message={`Loading ${customerName}...`}
      variant="info"
      size="lg"
    />
  ),

  // Loading customer search results
  CustomerSearch: ({ searchTerm }) => (
    <ContextualSpinner 
      message={searchTerm ? `Searching for "${searchTerm}"...` : 'Searching customers...'}
      variant="secondary"
      size="md"
    />
  )
};

// Service Call Loading States
export const ServiceCallLoadingStates = {
  // Loading service calls for a customer
  ServiceCalls: ({ customerName }) => (
    <ContextualSpinner 
      message={customerName ? `Loading service calls for ${customerName}...` : 'Loading service calls...'}
      variant="warning"
      size="md"
    />
  ),

  // Loading individual service call details
  ServiceCallDetails: ({ serviceCallId }) => (
    <ContextualSpinner 
      message={serviceCallId ? `Loading service call #${serviceCallId}...` : 'Loading service call details...'}
      variant="info"
      size="md"
    />
  )
};

// Sales Order Loading States
export const SalesOrderLoadingStates = {
  // Loading sales orders
  SalesOrders: ({ customerName, serviceCallId }) => {
    let message = 'Loading sales orders...';
    if (customerName && serviceCallId) {
      message = `Loading sales orders for ${customerName} (Service Call #${serviceCallId})...`;
    } else if (customerName) {
      message = `Loading sales orders for ${customerName}...`;
    } else if (serviceCallId) {
      message = `Loading sales orders for Service Call #${serviceCallId}...`;
    }
    
    return (
      <ContextualSpinner 
        message={message}
        variant="success"
        size="md"
      />
    );
  },

  // Loading sales order details
  SalesOrderDetails: ({ orderNumber }) => (
    <ContextualSpinner 
      message={orderNumber ? `Loading sales order #${orderNumber}...` : 'Loading sales order details...'}
      variant="primary"
      size="md"
    />
  )
};

// Equipment Loading States
export const EquipmentLoadingStates = {
  // Loading equipment list
  EquipmentList: ({ customerName }) => (
    <ContextualSpinner 
      message={customerName ? `Loading equipment for ${customerName}...` : 'Loading equipment...'}
      variant="dark"
      size="md"
    />
  )
};

// Progress Loading Indicator for Long Operations
export const ProgressLoadingIndicator = ({ 
  progress = 0, 
  message = 'Processing...', 
  steps = [],
  currentStep = 0 
}) => {
  return (
    <div className="progress-loading-container p-4">
      <div className="text-center mb-3">
        <h6 className="mb-2">{message}</h6>
        {steps.length > 0 && (
          <small className="text-muted">
            Step {currentStep + 1} of {steps.length}: {steps[currentStep]}
          </small>
        )}
      </div>
      
      <ProgressBar 
        now={progress} 
        label={`${Math.round(progress)}%`}
        variant={progress < 50 ? 'info' : progress < 80 ? 'warning' : 'success'}
        animated
        className="mb-2"
      />
      
      <div className="d-flex justify-content-center">
        <Spinner animation="border" size="sm" className="me-2" />
        <small className="text-muted">Please wait...</small>
      </div>
    </div>
  );
};

// Inline Loading Indicator (for buttons, etc.)
export const InlineLoadingIndicator = ({ 
  message = 'Loading...', 
  size = 'sm',
  className = '' 
}) => (
  <span className={`d-inline-flex align-items-center ${className}`}>
    <Spinner 
      animation="border" 
      size={size} 
      className="me-2" 
    />
    {message}
  </span>
);

// Table Loading Overlay
export const TableLoadingOverlay = ({ 
  colSpan = 5, 
  message = 'Loading data...',
  showRetry = false,
  onRetry = null 
}) => (
  <tr>
    <td colSpan={colSpan} className="text-center py-5">
      <div className="d-flex flex-column align-items-center">
        <Spinner animation="border" variant="primary" className="mb-3" />
        <div className="text-muted mb-2">{message}</div>
        {showRetry && onRetry && (
          <Button 
            variant="outline-primary" 
            size="sm" 
            onClick={onRetry}
            className="mt-2"
          >
            <i className="fas fa-redo me-2"></i>
            Retry
          </Button>
        )}
      </div>
    </td>
  </tr>
);

// Card Loading Overlay
export const CardLoadingOverlay = ({ 
  message = 'Loading...', 
  height = '200px',
  showRetry = false,
  onRetry = null 
}) => (
  <div 
    className="d-flex flex-column align-items-center justify-content-center border rounded"
    style={{ height, backgroundColor: '#f8f9fa' }}
  >
    <Spinner animation="border" variant="primary" className="mb-3" />
    <div className="text-muted mb-2">{message}</div>
    {showRetry && onRetry && (
      <Button 
        variant="outline-primary" 
        size="sm" 
        onClick={onRetry}
      >
        <i className="fas fa-redo me-2"></i>
        Retry
      </Button>
    )}
  </div>
);

// Full Page Loading Overlay
export const FullPageLoadingOverlay = ({ 
  message = 'Loading...', 
  subMessage = null,
  progress = null 
}) => (
  <div 
    className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center"
    style={{ 
      backgroundColor: 'rgba(255, 255, 255, 0.95)', 
      zIndex: 9999 
    }}
  >
    <div className="text-center">
      <Spinner 
        animation="border" 
        variant="primary" 
        style={{ width: '3rem', height: '3rem' }}
        className="mb-3"
      />
      <h5 className="mb-2">{message}</h5>
      {subMessage && (
        <p className="text-muted mb-3">{subMessage}</p>
      )}
      {progress !== null && (
        <ProgressBar 
          now={progress} 
          label={`${Math.round(progress)}%`}
          style={{ width: '300px' }}
          className="mx-auto"
        />
      )}
    </div>
  </div>
);

// Loading State with Timeout Warning
export const TimeoutWarningLoader = ({ 
  message = 'Loading...', 
  timeoutSeconds = 30,
  onTimeout = null,
  showTimeRemaining = true 
}) => {
  const [timeRemaining, setTimeRemaining] = React.useState(timeoutSeconds);
  const [hasTimedOut, setHasTimedOut] = React.useState(false);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          setHasTimedOut(true);
          if (onTimeout) onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onTimeout]);

  if (hasTimedOut) {
    return (
      <Alert variant="warning" className="text-center">
        <Alert.Heading>Taking longer than expected</Alert.Heading>
        <p>The request is taking longer than usual. This might be due to high server load or network issues.</p>
        <Button variant="outline-warning" onClick={() => window.location.reload()}>
          <i className="fas fa-redo me-2"></i>
          Refresh Page
        </Button>
      </Alert>
    );
  }

  return (
    <div className="text-center py-4">
      <Spinner animation="border" variant="primary" className="mb-3" />
      <div className="text-muted">{message}</div>
      {showTimeRemaining && timeRemaining <= 10 && (
        <small className="text-warning d-block mt-2">
          <i className="fas fa-clock me-1"></i>
          Timeout in {timeRemaining}s
        </small>
      )}
    </div>
  );
};

const LoadingIndicators = {
  ContextualSpinner,
  CustomerLoadingStates,
  ServiceCallLoadingStates,
  SalesOrderLoadingStates,
  EquipmentLoadingStates,
  ProgressLoadingIndicator,
  InlineLoadingIndicator,
  TableLoadingOverlay,
  CardLoadingOverlay,
  FullPageLoadingOverlay,
  TimeoutWarningLoader
};

export default LoadingIndicators;
