/**
 * Loading Components Index
 * Centralized exports for all loading-related components
 */

// Skeleton Loaders
export {
  CustomerListSkeleton,
  CustomerDetailsSkeleton,
  ServiceCallsSkeleton,
  SalesOrdersSkeleton,
  CardSkeleton,
  EquipmentListSkeleton
} from './SkeletonLoaders';

// Loading Indicators
export {
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
} from './LoadingIndicators';

// Customer List Loading Indicator
export { default as CustomerListLoadingIndicator } from './CustomerListLoadingIndicator';

// Default exports for convenience
export { default as SkeletonLoaders } from './SkeletonLoaders';
export { default as LoadingIndicators } from './LoadingIndicators';
