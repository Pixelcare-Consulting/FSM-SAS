import React, { Fragment, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { Row, Col, Card } from 'react-bootstrap';
import { GeeksSEO } from "widgets";
import Link from 'next/link';
import { GKTippy } from "widgets";
import { globalQuickSearch } from '../../utils/searchUtils';
import { useSettings } from '../../contexts/SettingsContext';
import { ChevronRight, Mail, Search, WifiOff } from 'lucide-react';
import { DashboardHeader } from 'sub-components';

const SearchPage = () => {
  const router = useRouter();
  const { q: searchQuery } = router.query;
  const [searchResults, setSearchResults] = useState({ results: [], totalCount: 0, counts: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const { jobStatusLegendItems: legendItems } = useSettings();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const categoryConfig = {
    customer: {
      color: '#3B82F6',
      bgColor: '#EFF6FF',
      highlightBg: '#DBEAFE',
      highlightText: '#2563EB',
      icon: 'fe-user',
      label: 'Customers'
    },
    lead: {
      color: '#7C3AED',
      bgColor: '#F5F3FF',
      highlightBg: '#EDE9FE',
      highlightText: '#6D28D9',
      icon: 'fe-user-plus',
      label: 'Leads (masterlist)'
    },
    worker: {
      color: '#10B981',
      bgColor: '#ECFDF5',
      highlightBg: '#D1FAE5',
      highlightText: '#059669',
      icon: 'fe-briefcase',
      label: 'Workers'
    },
    job: {
      color: '#F59E0B',
      bgColor: '#FFFBEB',
      highlightBg: '#FEF3C7',
      highlightText: '#D97706',
      icon: 'fe-clipboard',
      label: 'Jobs'
    },
    followUp: {
      color: '#EF4444',
      bgColor: '#FEF2F2',
      highlightBg: '#FEE2E2',
      highlightText: '#DC2626',
      icon: 'fe-bell',
      label: 'Follow Ups'
    }
  };

   // Helper function to get category config safely
   const getCategoryConfig = (type) => {
    return categoryConfig[type] || {
      color: '#6b7280',
      bgColor: '#f3f4f6',
      highlightBg: '#f9fafb',
      highlightText: '#374151',
      icon: 'fe-file'
    };
  };

  const getTypeLabel = (type) => {
    return categoryConfig[type]?.label || type;
  };

  const getStatusTag = (status) => {
    // Find matching legend item (case-insensitive)
    const legendItem = legendItems.find(item => 
      item.status.toLowerCase() === status.toLowerCase()
    );
    
    // Use legend color if found, otherwise use default colors
    const style = legendItem ? {
      backgroundColor: legendItem.color,
      color: '#FFFFFF'
    } : {
      backgroundColor: '#9e9e9e',
      color: '#FFFFFF'
    };

    return (
      <span
        className="ms-2 px-2 py-1 rounded-pill"
        style={{
          ...style,
          fontSize: '0.75rem',
          fontWeight: '500'
        }}
      >
        {status}
      </span>
    );
  };

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(!navigator.onLine); // Set initial state

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const fetchSearchResults = async () => {
      setIsOffline(false);
      setCurrentPage(1); // Reset to first page on new search
      
      if (!searchQuery?.trim()) {
        setSearchResults({ results: [], totalCount: 0, counts: {} });
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        
        // Try to get cached results first
        const cachedQuery = localStorage.getItem('searchQuery');
        const cachedResults = localStorage.getItem('searchResults');
        
        if (cachedQuery === searchQuery && cachedResults) {
          setSearchResults(JSON.parse(cachedResults));
          setIsLoading(false);
          
          // Refresh results in background
          const freshResults = await globalQuickSearch(null, searchQuery, false);
          setSearchResults(freshResults);
          localStorage.setItem('searchResults', JSON.stringify(freshResults));
        } else {
          const results = await globalQuickSearch(null, searchQuery, false);
          setSearchResults(results);
          localStorage.setItem('searchResults', JSON.stringify(results));
          localStorage.setItem('searchQuery', searchQuery);
        }
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults({ results: [], totalCount: 0, counts: {} });
        if (!navigator.onLine) {
          setIsOffline(true);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchSearchResults();
  }, [searchQuery]);

  const renderHighlightedText = (text) => {
    if (!text) return '';
    
    // Clean up any remaining [[HIGHLIGHT]] tags
    text = text.replace(/\[\[HIGHLIGHT\]\]|\[\[\/HIGHLIGHT\]\]/g, '');
    
    return (
      <span dangerouslySetInnerHTML={{ __html: text }} />
    );
  };

  const Pagination = ({ totalItems, itemsPerPage, currentPage, onPageChange }) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    if (totalPages <= 1) return null;

    return (
      <div className="d-flex justify-content-between align-items-center p-3 border-top">
        <div className="text-muted small">
          Showing {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} to{' '}
          {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} results
        </div>
        <div className="d-flex gap-2">
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(page => {
              // Show first page, last page, current page, and pages around current
              return (
                page === 1 ||
                page === totalPages ||
                Math.abs(currentPage - page) <= 1
              );
            })
            .map((page, index, array) => (
              <React.Fragment key={page}>
                {index > 0 && array[index - 1] !== page - 1 && (
                  <span className="btn btn-sm disabled">...</span>
                )}
                <button
                  className={`btn btn-sm ${
                    currentPage === page
                      ? 'btn-primary'
                      : 'btn-outline-primary'
                  }`}
                  onClick={() => onPageChange(page)}
                >
                  {page}
                </button>
              </React.Fragment>
            ))}
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  // Calculate current items to display
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = searchResults.results.slice(indexOfFirstItem, indexOfLastItem);

  // Handle page change
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    window.scrollTo(0, 0); // Scroll to top when page changes
  };

  // Prepare stats for DashboardHeader
  const stats = Object.entries(searchResults.counts || {})
    .filter(([type, count]) => count > 0)
    .map(([type, count]) => {
      const normalizedType = type.toLowerCase().replace(/s$/, '');
      const label = getTypeLabel(normalizedType);
      return {
        label,
        value: count,
        tooltip: `Total ${label} found in search results`
      };
    });

  // Prepare badges for DashboardHeader
  const badges = Object.entries(searchResults.counts || {})
    .filter(([type, count]) => count > 0)
    .map(([type, count]) => {
      const normalizedType = type.toLowerCase().replace(/s$/, '');
      const categoryStyle = categoryConfig[normalizedType] || {
        icon: 'fe-file'
      };
      const label = getTypeLabel(normalizedType);
      return {
        label: `${count} ${label}`,
        icon: categoryStyle.icon
      };
    });

  return (
    <Fragment>
      <GeeksSEO title={`Search Results for "${searchQuery}" | SAS&ME - SAP B1 | Portal`} />

      <Row>
        <Col lg={12} md={12} sm={12}>
          {/* Dashboard Header Banner */}
          <DashboardHeader
            title="Search"
            subtitle={
              searchQuery
                ? `Search results for "${searchQuery}"`
                : 'Search portal masterlist customers, leads, and form leads'
            }
            infoText={
              searchResults?.results?.length > 0
                ? `Found ${searchResults.totalCount} result${searchResults.totalCount !== 1 ? 's' : ''} matching your search`
                : !isLoading && searchQuery
                  ? 'No results found for this search term. Try a different name, card code, phone, or email.'
                  : 'Full search uses the same Supabase masterlist as the Customers and Leads list pages (customer, sap_lead, and portal form leads). Results stay consistent with those screens — no live SAP Service Layer list calls for this search.'
            }
            stats={stats}
            badges={badges}
            breadcrumbs={[
              { label: 'Dashboard', href: '/dashboard', icon: 'fe fe-home' },
              { label: 'Search', icon: 'fe fe-search' }
            ]}
          />

          {/* Results */}
          <Card className="border-0 shadow-sm">
            <Card.Body className="p-0">
          {isOffline ? (
            <div className="text-center p-5">
              <WifiOff size={48} className="text-muted mb-3" />
              <h4>You&apos;re currently offline</h4>
              <p className="text-muted mb-0">
                Please check your internet connection and try again
              </p>
            </div>
          ) : isLoading ? (
            <div className="text-center p-4">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="text-muted mb-0">
                Searching masterlist customers and leads for &quot;{searchQuery}&quot;…
              </p>
            </div>
          ) : (
            <>
              {currentItems.map((result, index) => {
                const normalizedType = result.type.toLowerCase().replace(/s$/, '');
                const config = categoryConfig[normalizedType] || {
                  color: '#6b7280',
                  bgColor: '#f3f4f6',
                  icon: 'fe-file'
                };
                
                return (
                  <Fragment key={result.id}>
                    <div 
                      className="p-4 cursor-pointer search-result-item"
                      onClick={() => router.push(result.link)}
                      style={{ 
                        borderLeft: `4px solid ${config.color}`,
                        transition: 'all 0.2s ease',
                        backgroundColor: '#FFFFFF'
                      }}
                    >
                      <div className="d-flex">
                        {/* Replace Square icon with category icon */}
                        <div className="me-3">
                          <div 
                            className="rounded-circle d-flex align-items-center justify-content-center"
                            style={{ 
                              backgroundColor: config.bgColor,
                              width: '40px',
                              height: '40px',
                            }}
                          >
                            <i 
                              className={`fe ${config.icon}`}
                              style={{ color: config.color }}
                            />
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-grow-1">
                          <div className="d-flex align-items-center">
                            <h5 className="mb-1">
                              {typeof result.title === 'string' ? result.title : 'Untitled'}
                            </h5>
                            {result.type === 'job' && result.status && getStatusTag(result.status)}
                          </div>
                          <div className="text-muted mb-2">
                            {result.subtitle}
                          </div>
                          {(result.type === 'customer' || result.type === 'lead') && (
                            <>
                              {result.bpCode && (
                                <div className="small text-muted">
                                  <i className="fe fe-hash me-2"></i>
                                  <span>BP Code: {result.bpCode}</span>
                                </div>
                              )}
                              {result.tel && (
                                <div className="small text-muted">
                                  <i className="fe fe-phone me-2"></i>
                                  <span>Tel: {result.tel}</span>
                                </div>
                              )}
                              {result.email && (
                                <div className="small text-muted">
                                  <Mail size={16} className="me-2" />
                                  <span>Email: {result.email}</span>
                                </div>
                              )}
                              {result.address && (
                                <div className="small text-muted mt-1">
                                  <i className="fe fe-map-pin me-2"></i>
                                  <span>Address: {result.address}</span>
                                </div>
                              )}
                              {result.ContactPerson && result.type === 'lead' && (
                                <div className="small text-muted mt-1">
                                  <i className="fe fe-user me-2"></i>
                                  <span>Contact: {result.ContactPerson}</span>
                                </div>
                              )}
                            </>
                          )}
                          {result.type === 'job' && (
                            <>
                              {result.jobNumber && (
                                <div className="small text-muted">
                                  <i className="fe fe-hash me-2"></i>
                                  <span>Job Number: {result.jobNumber}</span>
                                </div>
                              )}
                              {result.address && (
                                <div className="small text-muted">
                                  <i className="fe fe-map-pin me-2"></i>
                                  <span>Address: {result.address}</span>
                                </div>
                              )}
                              {result.appointmentDateTime && (
                                <div className="small text-muted">
                                  <i className="fe fe-calendar me-2"></i>
                                  <span>Appointment: {result.appointmentDateTime}</span>
                                </div>
                              )}
                            </>
                          )}
                          {result.type !== 'customer' && result.type !== 'lead' && result.type !== 'job' && result.email && (
                            <div className="small text-muted">
                              <Mail size={16} className="me-2" />
                              <span>{result.email}</span>
                            </div>
                          )}
                          {result.type !== 'customer' && result.type !== 'lead' && result.type !== 'job' && result.address && (
                            <div className="small text-muted mt-1">
                              <i className="fe fe-map-pin me-2"></i>
                              <span>{result.address}</span>
                            </div>
                          )}
                        </div>

                        {/* Arrow */}
                        <div className="ms-3">
                          <ChevronRight size={20} className="text-muted" />
                        </div>
                      </div>
                    </div>
                    {index < currentItems.length - 1 && (
                      <div style={{ borderBottom: '1px solid #E5E7EB' }}></div>
                    )}
                  </Fragment>
                );
              })}

              <Pagination
                totalItems={searchResults.results.length}
                itemsPerPage={itemsPerPage}
                currentPage={currentPage}
                onPageChange={handlePageChange}
              />

              {searchResults.results.length === 0 && (
                <div className="text-center p-5">
                  <Search size={48} className="text-muted mb-3" />
                  <h4>No results found for &quot;{searchQuery}&quot;</h4>
                  <p className="text-muted mb-0">
                    Try adjusting your search terms or browse categories instead
                  </p>
                </div>
              )}
            </>
          )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <style jsx global>{`
        .search-result-item {
          transition: all 0.2s ease;
        }
        
        .search-result-item:hover {
          background-color: #f8f9fa !important;
          transform: translateX(4px);
        }
        
        .search-result-item:active {
          background-color: #e9ecef !important;
        }
      `}</style>
    </Fragment>
  );
};

export default SearchPage;